import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { buildCase, checkInput, openRound, openRoomsIn, scriptFor } from "./engine/build";
import { secure, seeded, shuffle } from "./engine/rng";
import { FAKE_GUESTS, LETTERS } from "./engine/fake";
import type { CaseFile, CaseInput } from "./engine/types";
import { randomCode, registrationIsOpen, requireHost, requireTv } from "./lib";
import { seal, unseal } from "./seal";
import { ensureAllCards, markerForCode } from "./cards";
import { ACCUSE_MAX_MINUTES, INTRO_MS, MAX_CARDS, REVEAL } from "./shared";
import { scheduleRecording } from "./voice";
import { ensureRoomCode } from "./join";
import { anyFreeFigure, fakeGuestPool, takenFigures } from "./figures";
import { clipMatches, levelsOf, narratorOf, rollWanted, startWanted, voiceOf, type Wanted } from "./voiceLines";
import { rollLineFor } from "./narration";

// ---------- shared helpers ----------

async function playerByToken(ctx: QueryCtx, token: string) {
  if (!token) return null;
  return await ctx.db
    .query("players")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
}

async function requirePlayer(ctx: QueryCtx, token: string) {
  const player = await playerByToken(ctx, token);
  if (!player) throw new ConvexError("That link doesn't match a guest.");
  const game = (await ctx.db.get(player.gameId))!;
  return { player, game };
}

async function caseFor(ctx: QueryCtx, game: Doc<"games">): Promise<CaseFile | null> {
  const box = await ctx.db
    .query("sealed")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .unique();
  return box ? await unseal<CaseFile>(box) : null;
}

async function playersOf(ctx: QueryCtx, gameId: Id<"games">) {
  return await ctx.db
    .query("players")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
}

/** Builds the engine's input from who actually showed up. */
async function caseInput(ctx: QueryCtx, game: Doc<"games">): Promise<CaseInput> {
  const before = game.status === "registration" || game.status === "lobby";
  // Before the draw: everyone checked in except the MC. After: exactly who was in the draw.
  const mc = game.mode === "mc" ? game.mcPlayerId : undefined;
  const players = (await playersOf(ctx, game._id)).filter((p) => (before ? p.checkedIn && p._id !== mc : p.inGame));
  const weapons = await ctx.db
    .query("weapons")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  const markers = await ctx.db
    .query("markers")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  const byId = new Map(players.map((p) => [p._id, p]));
  return {
    suspects: players.map((p) => ({ id: p._id, name: p.charName, signature: p.signature, who: p.who, killerOk: p.killerOk })),
    exhibits: weapons
      .filter((w) => {
        const p = byId.get(w.playerId);
        return p && p.weaponIn && p.exhibitLetter;
      })
      .map((w) => ({
        id: w._id,
        letter: byId.get(w.playerId)!.exhibitLetter!,
        name: w.name,
        description: w.description,
        ownerId: w.playerId,
      }))
      .sort((a, b) => a.letter.localeCompare(b.letter)),
    rooms: game.rooms.map((r) => ({ key: r.key, label: r.label })),
    // Drawn at Start; afterwards it's on the game for everyone to see.
    bodyRoomKey: before ? undefined : game.bodyRoomKey,
    roomOrder: before ? undefined : game.roomOrder,
    search: game.search ?? "all",
    markers: markers.map((m) => ({ number: m.number, roomKey: m.roomKey })),
    tone: game.tone ?? "classic",
    playerMotives: Object.fromEntries(players.map((p) => [p._id, { motive: p.motive, secret: p.secret }])),
  };
}

/** Deals a random unused exhibit letter, so letters can't reveal arrival order. */
async function dealLetter(ctx: MutationCtx, game: Doc<"games">): Promise<string> {
  const players = await playersOf(ctx, game._id);
  const used = new Set(players.map((p) => p.exhibitLetter).filter(Boolean));
  const size = Math.max(players.length, used.size + 1);
  let pool = LETTERS.slice(0, size).filter((l) => !used.has(l));
  if (!pool.length) pool = LETTERS.filter((l) => !used.has(l));
  return shuffle(secure(), pool)[0];
}

const isPlaying = (g: Doc<"games">) => g.status === "playing";

/** Guests who are playing: in the draw, and not the MC (who may have taken over mid-game). */
const playingOf = (g: Doc<"games">, players: Doc<"players">[]) => players.filter((p) => p.inGame && p._id !== g.mcPlayerId);

/** A marker's room opens in this round (Round 1 unless searching in waves). */
function markerOpensIn(game: Doc<"games">, roomKey: string) {
  return openRound(roomKey, game.roomOrder ?? game.rooms.map((r) => r.key), game.search ?? "all");
}

async function scheduleTimer(ctx: MutationCtx, gameId: Id<"games">, round: number, endsAt: number | undefined) {
  if (endsAt) await ctx.scheduler.runAt(endsAt, internal.game.timerTick, { gameId, round });
}

/** Moves the game on one step: Round 1 -> 2 -> 3 -> accusations -> reveal. */
async function advance(ctx: MutationCtx, game: Doc<"games">) {
  if (!isPlaying(game)) return;
  const round = game.round ?? 1;
  if (round >= 4) {
    await ctx.db.patch(game._id, { status: "reveal", roundEndsAt: undefined, paused: false, tvShowAll: false, revealAt: Date.now() });
    return;
  }
  const next = round + 1;
  const timed = game.pacing.mode === "timer";
  const minutes = next === 4 ? Math.min(game.pacing.roundMinutes, ACCUSE_MAX_MINUTES) : game.pacing.roundMinutes;
  const endsAt = timed ? Date.now() + minutes * 60_000 : undefined;
  // Skipping ahead also cuts the intro short.
  await ctx.db.patch(game._id, { round: next, roundStartedAt: Date.now(), roundEndsAt: endsAt, paused: false, introEndsAt: Math.min(game.introEndsAt ?? 0, Date.now()) });
  await scheduleTimer(ctx, game._id, next, endsAt);
}

/** Ready votes: once most guests in the game are ready, the next round starts. */
async function maybeAdvanceOnReady(ctx: MutationCtx, game: Doc<"games">) {
  if (game.pacing.mode !== "ready" || game.paused || !game.round || game.round > 3) return;
  const inGame = playingOf(game, await playersOf(ctx, game._id));
  const ready = inGame.filter((p) => p.readyRound === game.round).length;
  if (inGame.length && ready > inGame.length / 2) await advance(ctx, game);
}

/** Accusations: once everyone in the game has accused, the reveal starts. */
async function maybeRevealOnAccusations(ctx: MutationCtx, game: Doc<"games">) {
  if (!isPlaying(game) || (game.round ?? 0) < 4 || game.paused) return;
  const inGame = playingOf(game, await playersOf(ctx, game._id));
  const acc = await ctx.db
    .query("accusations")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  const accused = new Set(acc.map((a) => a.playerId));
  if (inGame.length && inGame.every((p) => accused.has(p._id))) await advance(ctx, game);
}

/** Scores every accusation once the answer is public. */
async function scoreGame(ctx: QueryCtx, game: Doc<"games">, cf: CaseFile) {
  const players = await playersOf(ctx, game._id);
  const accs = await ctx.db
    .query("accusations")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  const sol = cf.solution;
  const scores = accs.map((a) => {
    const score = Number(a.suspectId === sol.killerId) + Number(a.exhibitId === sol.exhibitId) + Number(a.roomKey === sol.roomKey);
    return { playerId: a.playerId, score, ace: score === 3, gotKiller: a.suspectId === sol.killerId, at: a.at };
  });
  // The MC isn't a detective: if someone took over mid-game, their guess doesn't count.
  const innocentScores = scores.filter((s) => s.playerId !== sol.killerId && s.playerId !== game.mcPlayerId);
  const named = innocentScores.filter((s) => s.gotKiller).length;
  // The killer wins if most guests accuse someone else. Exactly half is a win for the detectives.
  const killerWins = innocentScores.length > 0 && innocentScores.length - named > innocentScores.length / 2;
  const best = [...innocentScores].sort((a, b) => b.score - a.score || a.at - b.at)[0];
  const name = (id: string) => players.find((p) => p._id === id)?.charName ?? "";
  return { scores, killerWins, named, accusers: innocentScores.length, bestDetective: best && best.score > 0 ? { playerId: best.playerId, name: name(best.playerId), score: best.score } : null };
}

// ---------- party night: guests ----------

/** Party night: a guest checks in on their phone and gets the letter for their bagged weapon. */
export const checkIn = mutation({
  args: { token: v.string(), weaponIn: v.boolean() },
  handler: async (ctx, { token, weaponIn }) => {
    const { player, game } = await requirePlayer(ctx, token);
    if (game.status !== "registration" && game.status !== "lobby") {
      throw new ConvexError("The game has already started, so new check-ins can't join.");
    }
    const letter = player.exhibitLetter ?? (weaponIn ? await dealLetter(ctx, game) : undefined);
    // Checking in claims the name too, so nobody else can join as this guest with the room code.
    await ctx.db.patch(player._id, { checkedIn: true, weaponIn: weaponIn || !!player.weaponIn, exhibitLetter: letter, claimedAt: player.claimedAt ?? Date.now() });
    return { exhibitLetter: letter ?? null };
  },
});

export const setReady = mutation({
  args: { token: v.string(), ready: v.boolean() },
  handler: async (ctx, { token, ready }) => {
    const { player, game } = await requirePlayer(ctx, token);
    if (!isPlaying(game) || !player.inGame || player._id === game.mcPlayerId || !game.round || game.round > 3) return { ok: false };
    await ctx.db.patch(player._id, { readyRound: ready ? game.round : 0 });
    await maybeAdvanceOnReady(ctx, (await ctx.db.get(game._id))!);
    return { ok: true };
  },
});

/** A guest scans a marker card (QR or typed code). Records it and returns the clue. */
export const scanMarker = mutation({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const { player, game } = await requirePlayer(ctx, token);
    const { marker, cardNumber } = await markerForCode(ctx, game._id, code);
    if (!marker && cardNumber !== null) throw new ConvexError(`Card ${cardNumber} isn't in play tonight. Keep looking.`);
    if (!marker) throw new ConvexError("That code isn't one of tonight's markers. Check it and try again.");
    if (!marker.roomKey) throw new ConvexError(`Marker ${marker.number} isn't in play tonight. Keep looking.`);
    if (game.status === "registration" || game.status === "lobby") throw new ConvexError("Nothing here yet. Markers come alive when the game starts.");
    if (!player.inGame) throw new ConvexError("Only guests who were checked in before the draw can read markers.");
    const opens = markerOpensIn(game, marker.roomKey);
    if (isPlaying(game) && (game.round ?? 1) < opens) {
      const room = game.rooms.find((r) => r.key === marker.roomKey)?.label ?? "This room";
      throw new ConvexError(`${room} is sealed until Round ${opens}. Come back then.`);
    }
    const cf = await caseFor(ctx, game);
    const clue = cf?.clues.find((c) => c.channel === "marker" && c.markerNumber === marker.number);
    const seen = await ctx.db
      .query("scans")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .collect();
    if (!seen.some((s) => s.markerNumber === marker.number)) {
      await ctx.db.insert("scans", { gameId: game._id, playerId: player._id, markerNumber: marker.number, at: Date.now() });
    }
    const room = game.rooms.find((r) => r.key === marker.roomKey);
    return { number: marker.number, room: room?.label ?? "", text: clue?.text ?? "Nothing useful here." };
  },
});

export const saveNotebook = mutation({
  args: { token: v.string(), crossed: v.array(v.string()) },
  handler: async (ctx, { token, crossed }) => {
    const { player } = await requirePlayer(ctx, token);
    await ctx.db.patch(player._id, { notebook: crossed.slice(0, 200) });
    return { ok: true };
  },
});

export const accuse = mutation({
  args: { token: v.string(), suspectId: v.string(), exhibitId: v.string(), roomKey: v.string() },
  handler: async (ctx, { token, suspectId, exhibitId, roomKey }) => {
    const { player, game } = await requirePlayer(ctx, token);
    if (!isPlaying(game) || (game.round ?? 0) < 4) throw new ConvexError("Accusations open after the last evidence drop.");
    if (!player.inGame) throw new ConvexError("Only guests in the game can accuse.");
    if (player._id === game.mcPlayerId) throw new ConvexError("You're the MC tonight, so you don't accuse.");
    if (suspectId === player._id) throw new ConvexError("You can't accuse yourself. Nice try.");
    const input = await caseInput(ctx, game);
    if (!input.suspects.some((s) => s.id === suspectId)) throw new ConvexError("Pick a suspect from the list.");
    if (!input.exhibits.some((e) => e.id === exhibitId)) throw new ConvexError("Pick an exhibit from the list.");
    if (!input.rooms.some((r) => r.key === roomKey)) throw new ConvexError("Pick a room from the list.");
    const existing = await ctx.db
      .query("accusations")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { suspectId, exhibitId, roomKey, at: Date.now() });
    else await ctx.db.insert("accusations", { gameId: game._id, playerId: player._id, suspectId, exhibitId, roomKey, at: Date.now() });
    await maybeRevealOnAccusations(ctx, game);
    return { ok: true };
  },
});

export const vote = mutation({
  args: { token: v.string(), dressed: v.optional(v.id("players")), liar: v.optional(v.id("players")) },
  handler: async (ctx, { token, dressed, liar }) => {
    const { player, game } = await requirePlayer(ctx, token);
    if (game.status !== "reveal") throw new ConvexError("Voting opens after the reveal.");
    for (const pick of [dressed, liar]) {
      if (!pick) continue;
      if (pick === player._id) throw new ConvexError("You can't vote for yourself.");
      const p = await ctx.db.get(pick);
      if (!p || p.gameId !== game._id) throw new ConvexError("Pick someone from tonight's guests.");
    }
    const existing = await ctx.db
      .query("votes")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { dressed, liar });
    else await ctx.db.insert("votes", { gameId: game._id, playerId: player._id, dressed, liar });
    return { ok: true };
  },
});

/** Everything one guest's phone shows on party night, and nothing it shouldn't. */
export const phone = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const player = await playerByToken(ctx, token);
    if (!player) return null;
    const game = (await ctx.db.get(player.gameId))!;
    const all = await playersOf(ctx, game._id);
    const photo = async (p: Doc<"players">) => (p.photoId ? await ctx.storage.getUrl(p.photoId) : null);
    const started = game.status !== "registration" && game.status !== "lobby";
    const cf = started ? await caseFor(ctx, game) : null;
    const S = scriptFor({ tone: game.tone ?? "classic" } as CaseInput);
    const brief = cf?.briefings.find((b) => b.playerId === player._id);
    const tip = cf?.tips.find((t) => t.playerId === player._id);
    const scans = await ctx.db
      .query("scans")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .collect();
    const markers = await ctx.db
      .query("markers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    const inGame = playingOf(game, all);
    const round = game.round ?? 0;
    const roomLabel = (key?: string) => game.rooms.find((r) => r.key === key)?.label ?? "";
    const accs = started
      ? await ctx.db
          .query("accusations")
          .withIndex("by_game", (q) => q.eq("gameId", game._id))
          .collect()
      : [];
    const myAcc = accs.find((a) => a.playerId === player._id);
    const input = started ? await caseInput(ctx, game) : null;
    const revealed = game.status === "reveal" || game.status === "done";
    const scored = revealed && cf ? await scoreGame(ctx, game, cf) : null;
    const myVote = revealed
      ? await ctx.db
          .query("votes")
          .withIndex("by_player", (q) => q.eq("playerId", player._id))
          .unique()
      : null;

    return {
      game: {
        slug: game.slug,
        title: game.title,
        isTest: game.isTest,
        status: game.status,
        round: game.round ?? 0,
        paused: !!game.paused,
        pacing: game.pacing,
        roundEndsAt: game.roundEndsAt ?? null,
        tone: game.tone ?? "classic",
        open: registrationIsOpen(game, Date.now()),
        deadlineLabel: game.deadlineLabel,
        bodyRoom: started ? roomLabel(game.bodyRoomKey) : "",
        markerCount: markers.length,
        search: game.search ?? "all",
        // Rooms open for searching right now (all of them unless searching in waves).
        openRooms: started && game.roomOrder ? openRoomsIn(round, game.roomOrder, game.search).map(roomLabel) : [],
        wifi: game.wifi?.name ? game.wifi : null,
        mode: game.mode ?? "play",
        introEndsAt: game.introEndsAt ?? null,
        revealAt: game.revealAt ?? null,
        nextSlug: game.nextSlug ?? null, // the host started another game: sign up for it
      },
      me: {
        id: player._id,
        charName: player.charName,
        who: player.who,
        signature: player.signature,
        photoUrl: await photo(player),
        figure: player.figure ?? null,
        checkedIn: player.checkedIn,
        inGame: !!player.inGame,
        weaponIn: !!player.weaponIn,
        exhibitLetter: player.exhibitLetter ?? null,
        isMC: game.mcPlayerId === player._id,
        ready: !!game.round && player.readyRound === game.round,
        notebook: player.notebook ?? [],
      },
      lobby: await Promise.all(
        all
          .sort((a, b) => a.charName.localeCompare(b.charName))
          .map(async (p) => ({ id: p._id, charName: p.charName, photoUrl: await photo(p), figure: p.figure ?? null, checkedIn: p.checkedIn })),
      ),
      counts: {
        checkedIn: all.filter((p) => p.checkedIn).length,
        registered: all.length,
        inGame: inGame.length,
        ready: game.round ? inGame.filter((p) => p.readyRound === game.round).length : 0,
        accused: accs.filter((a) => a.playerId !== game.mcPlayerId).length,
      },
      briefing:
        brief && cf
          ? { role: brief.role, motive: brief.motive, secret: brief.secret, lines: brief.lines, tip: tip?.text ?? null, tipLabel: S.tipLabel }
          : null,
      scans: cf
        ? scans
            .sort((a, b) => a.at - b.at)
            .map((s) => {
              const m = markers.find((x) => x.number === s.markerNumber);
              return {
                number: s.markerNumber,
                room: game.rooms.find((r) => r.key === m?.roomKey)?.label ?? "",
                text: cf.clues.find((c) => c.channel === "marker" && c.markerNumber === s.markerNumber)?.text ?? "",
              };
            })
        : [],
      evidence: cf
        ? cf.clues
            .filter((c) => c.channel === "tv" && c.round <= (game.round ?? 0))
            .map((c) => ({ round: c.round, text: c.text, twist: c.kind === "twist" }))
        : [],
      board: input
        ? {
            suspects: await Promise.all(
              input.suspects.map(async (s) => ({ id: s.id, name: s.name, signature: s.signature, photoUrl: await photo(all.find((p) => p._id === s.id)!), figure: all.find((p) => p._id === s.id)?.figure ?? null })),
            ),
            exhibits: input.exhibits.map((e) => ({ id: e.id, letter: e.letter, name: e.name })),
            rooms: input.rooms,
          }
        : null,
      myAccusation: myAcc ? { suspectId: myAcc.suspectId, exhibitId: myAcc.exhibitId, roomKey: myAcc.roomKey } : null,
      results:
        scored && cf
          ? {
              killer: all.find((p) => p._id === cf.solution.killerId)?.charName ?? "",
              exhibit: (() => {
                const e = input?.exhibits.find((x) => x.id === cf.solution.exhibitId);
                return e ? { letter: e.letter, name: e.name } : null;
              })(),
              room: game.rooms.find((r) => r.key === cf.solution.roomKey)?.label ?? "",
              killerWins: scored.killerWins,
              mine: scored.scores.find((s) => s.playerId === player._id) ?? null,
              iWasKiller: cf.solution.killerId === player._id,
              myVote: myVote ? { dressed: myVote.dressed ?? null, liar: myVote.liar ?? null } : null,
            }
          : null,
    };
  },
});

/** The QR card page: shows the clue for a marker, if this phone may read it. */
export const readMarker = query({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const player = await playerByToken(ctx, token);
    if (!player) return { error: "Open your personal link first, then scan again." };
    const { marker, cardNumber } = await markerForCode(ctx, player.gameId, code);
    if (!marker && cardNumber !== null) return { error: `Card ${cardNumber} isn't in play tonight. Keep looking.` };
    if (!marker || !marker.roomKey) return { error: "That card isn't part of this game." };
    const game = (await ctx.db.get(player.gameId))!;
    if (game.status === "registration" || game.status === "lobby") return { error: "Nothing here yet. The game hasn't started." };
    if (!player.inGame) return { error: "Only guests who were checked in before the draw can read markers." };
    const room = game.rooms.find((r) => r.key === marker.roomKey);
    const opens = markerOpensIn(game, marker.roomKey);
    if (isPlaying(game) && (game.round ?? 1) < opens) return { error: `${room?.label ?? "This room"} is sealed until Round ${opens}. Come back then.` };
    const cf = await caseFor(ctx, game);
    const clue = cf?.clues.find((c) => c.channel === "marker" && c.markerNumber === marker.number);
    return { number: marker.number, room: room?.label ?? "", text: clue?.text ?? "Nothing useful here." };
  },
});

/** Evidence released to everyone on the TV so far. Public by design. */
export const evidence = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!game || !game.round || game.round < 2) return [];
    const cf = await caseFor(ctx, game);
    if (!cf) return [];
    return cf.clues
      .filter((c) => c.channel === "tv" && c.round <= game.round!)
      .map((c) => ({ round: c.round, text: c.text, twist: c.kind === "twist" }));
  },
});

/** A guest's own private screen once the game is on: role, motive, secret, tip. */
export const myBriefing = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const player = await playerByToken(ctx, token);
    if (!player) return null;
    const game = (await ctx.db.get(player.gameId))!;
    if (game.status === "registration" || game.status === "lobby") return { started: false as const };
    const cf = await caseFor(ctx, game);
    if (!cf) return { started: false as const };
    const b = cf.briefings.find((x) => x.playerId === player._id);
    if (!b) return { started: true as const, inGame: false as const };
    const tip = cf.tips.find((t) => t.playerId === player._id);
    return {
      started: true as const,
      inGame: true as const,
      role: b.role,
      motive: b.motive,
      secret: b.secret,
      lines: b.lines,
      tip: tip?.text ?? null,
      exhibitLetter: player.exhibitLetter ?? null,
    };
  },
});

// ---------- party night: host ----------

/** Host: log the numbered markers and the room each one is in. Codes stay stable per number. */
export const saveMarkers = mutation({
  args: {
    slug: v.string(),
    hostKey: v.string(),
    markers: v.array(v.object({ number: v.number(), roomKey: v.string() })),
  },
  handler: async (ctx, { slug, hostKey, markers }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (game.status !== "registration" && game.status !== "lobby") throw new ConvexError("The game has started, so markers are locked.");
    const rooms = new Set(game.rooms.map((r) => r.key));
    const numbers = new Set<number>();
    if (markers.length > MAX_CARDS) throw new ConvexError(`The printed sheet has ${MAX_CARDS} cards, so use ${MAX_CARDS} markers at most.`);
    for (const m of markers) {
      if (!Number.isInteger(m.number) || m.number < 1 || m.number > MAX_CARDS) throw new ConvexError(`Markers are numbered 1 to ${MAX_CARDS}.`);
      // "" means not placed yet: the game won't start until every marker has a room.
      if (m.roomKey !== "" && !rooms.has(m.roomKey)) throw new ConvexError(`Marker ${m.number} is in a room that isn't in play.`);
      if (numbers.has(m.number)) throw new ConvexError(`Marker ${m.number} is listed twice.`);
      numbers.add(m.number);
    }
    const existing = await ctx.db
      .query("markers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    const byNumber = new Map(existing.map((m) => [m.number, m]));
    const codes = await ensureAllCards(ctx); // card N's code is the same in every game
    for (const m of existing) if (!numbers.has(m.number)) await ctx.db.delete(m._id);
    for (const m of markers) {
      const old = byNumber.get(m.number);
      const code = codes.get(m.number)!;
      if (old) await ctx.db.patch(old._id, { roomKey: m.roomKey, code });
      else await ctx.db.insert("markers", { gameId: game._id, number: m.number, roomKey: m.roomKey, code });
    }
    return { ok: true };
  },
});

/** Host: party night begins. Guests can check in. */
export const openDoors = mutation({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (game.status !== "registration") throw new ConvexError("The doors are already open.");
    await ctx.db.patch(game._id, { status: "lobby", doorsAt: Date.now() });
    await ensureRoomCode(ctx, game);
    return { ok: true };
  },
});

/** Host: the secret draw. Builds and seals the case. Returns counts only, never the answer. */
export const startGame = mutation({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (game.status !== "registration" && game.status !== "lobby") throw new ConvexError("This game has already started.");
    const input = await caseInput(ctx, game);
    const problems = checkInput(input);
    if (problems.length) throw new ConvexError(problems.join(" "));
    let cf: CaseFile;
    try {
      cf = buildCase(input, secure());
    } catch (err) {
      // The engine's reasons can name guests from the discarded draw, so they stay in the server log.
      console.error("draw failed", (err as Error).message);
      throw new ConvexError("The draw couldn't build a fair case this time. Press Start again.");
    }
    const { validation: _v, ...file } = cf as CaseFile & { validation?: unknown };
    await ctx.db.insert("sealed", { gameId: game._id, ...(await seal(file)) });
    for (const p of await playersOf(ctx, game._id)) {
      await ctx.db.patch(p._id, { inGame: p.checkedIn && !(game.mode === "mc" && p._id === game.mcPlayerId), readyRound: 0 });
    }
    // The intro plays on the TV first; Round 1's clock starts when it ends.
    const now = Date.now();
    const introEndsAt = now + INTRO_MS;
    const timed = game.pacing.mode === "timer";
    const endsAt = timed ? introEndsAt + game.pacing.roundMinutes * 60_000 : undefined;
    await ctx.db.patch(game._id, {
      status: "playing",
      round: 1,
      startedAt: now,
      introEndsAt,
      registrationOpen: false,
      roundEndsAt: endsAt,
      paused: false,
      // Public from now on: where the body turned up, and the order rooms open in.
      bodyRoomKey: file.bodyRoomKey,
      roomOrder: file.roomOrder,
      rulesAt: undefined,
      rollCallAt: undefined,
    });
    await scheduleTimer(ctx, game._id, 1, endsAt);
    await ensureRoomCode(ctx, game); // started straight from sign-ups: late guests still need the code
    // The names for the intro, the waves and the reveal: one clip for every guest, exhibit and room.
    await scheduleRecording(ctx, game._id, "start");
    return { suspects: input.suspects.length, exhibits: input.exhibits.length, markers: input.markers.length };
  },
});

/** Host: skip to the next round (or from accusations to the reveal). */
export const advanceRound = mutation({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (!isPlaying(game)) throw new ConvexError("The game isn't running.");
    await advance(ctx, game);
    return { ok: true };
  },
});

/** Host: cut the intro short and start Round 1 now. */
export const skipIntro = mutation({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (!isPlaying(game) || game.round !== 1 || !game.introEndsAt || game.introEndsAt <= Date.now()) return { ok: true };
    const timed = game.pacing.mode === "timer" && !game.paused;
    const endsAt = timed ? Date.now() + game.pacing.roundMinutes * 60_000 : game.roundEndsAt;
    await ctx.db.patch(game._id, { introEndsAt: Date.now(), roundEndsAt: endsAt });
    if (timed) await scheduleTimer(ctx, game._id, 1, endsAt);
    return { ok: true };
  },
});

/** Host: pause or resume. A paused timer keeps its remaining time. */
export const setPaused = mutation({
  args: { slug: v.string(), hostKey: v.string(), paused: v.boolean() },
  handler: async (ctx, { slug, hostKey, paused }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (!isPlaying(game)) throw new ConvexError("The game isn't running.");
    if (paused === !!game.paused) return { ok: true };
    if (paused) {
      const left = game.roundEndsAt ? Math.max(0, game.roundEndsAt - Date.now()) : undefined;
      // store the remaining time in roundEndsAt as a negative number while paused
      await ctx.db.patch(game._id, { paused: true, pausedAt: Date.now(), roundEndsAt: left !== undefined ? -left : undefined });
    } else {
      const endsAt = game.roundEndsAt !== undefined && game.roundEndsAt <= 0 ? Date.now() - game.roundEndsAt : undefined;
      await ctx.db.patch(game._id, { paused: false, resumedAt: Date.now(), roundEndsAt: endsAt });
      await scheduleTimer(ctx, game._id, game.round ?? 1, endsAt);
      await maybeAdvanceOnReady(ctx, (await ctx.db.get(game._id))!);
      await maybeRevealOnAccusations(ctx, (await ctx.db.get(game._id))!);
    }
    return { ok: true };
  },
});

/** Host: close the voting and show the awards. */
export const finish = mutation({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (game.status !== "reveal") throw new ConvexError("Finish after the reveal.");
    await ctx.db.patch(game._id, { status: "done", doneAt: Date.now(), tvShowAll: false });
    return { ok: true };
  },
});

/** Host: the night is over. The TV shows its closing card. */
export const endNight = mutation({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (game.status !== "done") throw new ConvexError("Show the awards first.");
    await ctx.db.patch(game._id, { endedAt: Date.now() });
    return { ok: true };
  },
});

/** Host: the TV shows every piece of evidence released so far (or goes back). */
export const setTvShowAll = mutation({
  args: { slug: v.string(), hostKey: v.string(), show: v.boolean() },
  handler: async (ctx, { slug, hostKey, show }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (show && !isPlaying(game)) throw new ConvexError("Evidence shows once the game is running.");
    await ctx.db.patch(game._id, { tvShowAll: show });
    return { ok: true };
  },
});

/** Host: the TV plays a test sound. */
export const soundCheck = mutation({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    await ctx.db.patch(game._id, { soundCheckAt: Date.now() });
    return { ok: true };
  },
});

/**
 * Host, mid-game: switch to Self MC. Whoever takes over sees the answer on the laptop,
 * so they stop playing: their ready taps and guesses no longer count.
 */
export const switchToSelfMC = mutation({
  args: { slug: v.string(), hostKey: v.string(), confirm: v.literal("SWITCH"), mcPlayerId: v.union(v.id("players"), v.null()) },
  handler: async (ctx, { slug, hostKey, mcPlayerId }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (!isPlaying(game)) throw new ConvexError("Switch to Self MC while the game is running, or pick it in the game menu before you start.");
    if ((game.mode ?? "play") === "mc") return { ok: true };
    if (mcPlayerId) {
      const p = await ctx.db.get(mcPlayerId);
      if (!p || p.gameId !== game._id) throw new ConvexError("Pick the MC from the guest list.");
      const acc = await ctx.db
        .query("accusations")
        .withIndex("by_player", (q) => q.eq("playerId", mcPlayerId))
        .unique();
      if (acc) await ctx.db.delete(acc._id);
    }
    await ctx.db.patch(game._id, { mode: "mc", mcPlayerId: mcPlayerId ?? undefined });
    const fresh = (await ctx.db.get(game._id))!;
    await maybeAdvanceOnReady(ctx, fresh);
    await maybeRevealOnAccusations(ctx, fresh);
    return { ok: true };
  },
});

export const timerTick = internalMutation({
  args: { gameId: v.id("games"), round: v.number() },
  handler: async (ctx, { gameId, round }) => {
    const game = await ctx.db.get(gameId);
    if (!game || !isPlaying(game) || game.paused || game.round !== round) return;
    if (!game.roundEndsAt || game.roundEndsAt > Date.now() + 500) return; // rescheduled or resumed
    await advance(ctx, game);
  },
});

/** Public results once the reveal starts: the answer, scores and (when finished) awards. */
export const results = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!game || (game.status !== "reveal" && game.status !== "done")) return null;
    const cf = await caseFor(ctx, game);
    if (!cf) return null;
    const input = await caseInput(ctx, game);
    const scored = await scoreGame(ctx, game, cf);
    const name = (id: string) => input.suspects.find((s) => s.id === id)?.name ?? "";
    let awards = null;
    if (game.status === "done") {
      const votes = await ctx.db
        .query("votes")
        .withIndex("by_game", (q) => q.eq("gameId", game._id))
        .collect();
      const tally = (key: "dressed" | "liar") => {
        const c = new Map<string, number>();
        for (const vt of votes) if (vt[key]) c.set(vt[key]!, (c.get(vt[key]!) ?? 0) + 1);
        const top = Math.max(0, ...c.values());
        return top ? [...c.entries()].filter(([, n]) => n === top).map(([id]) => ({ name: name(id), votes: top })) : [];
      };
      awards = { bestDressed: tally("dressed"), bestLiar: tally("liar"), bestDetective: scored.bestDetective };
    }
    const exhibit = input.exhibits.find((e) => e.id === cf.solution.exhibitId);
    return {
      killer: name(cf.solution.killerId),
      exhibit: exhibit ? { letter: exhibit.letter, name: exhibit.name } : null,
      room: input.rooms.find((r) => r.key === cf.solution.roomKey)?.label ?? "",
      killerWins: scored.killerWins,
      named: scored.named,
      accusers: scored.accusers,
      aces: scored.scores.filter((s) => s.ace).map((s) => name(s.playerId)),
      awards,
    };
  },
});

// ---------- the TV ----------

type Clip = { url: string; caption: string; seconds: number } | null;

/**
 * The party's own recorded lines the TV may play right now. The roll call before the game; the body
 * room and the waves after Start; the killer, exhibit and room only once the reveal starts; the
 * winners only at the awards. A clip that no longer matches its line is left out (the TV falls back).
 */
async function tvVoice(ctx: QueryCtx, game: Doc<"games">, all: Doc<"players">[], input: CaseInput | null, cf: CaseFile | null) {
  const rows = await ctx.db
    .query("clips")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  const byPurpose = new Map(rows.map((r) => [r.purpose, r]));
  const clip = async (w: Wanted | undefined): Promise<Clip> => {
    if (!w) return null;
    const row = byPurpose.get(w.purpose);
    if (!clipMatches(row, w) || !row!.storageId) return null;
    const url = await ctx.storage.getUrl(row!.storageId);
    return url ? { url, caption: w.caption, seconds: row!.seconds ?? 0 } : null;
  };
  const tone = game.tone ?? "classic";
  const n = narratorOf(game);
  const beforeStart = game.status === "registration" || game.status === "lobby";
  let rollCall = null;
  if (beforeStart && game.rollCallAt && game.rollCallOrder) {
    const byId = new Map(all.map((p) => [p._id as string, p]));
    const items = [];
    for (const id of game.rollCallOrder) {
      const p = byId.get(id);
      if (!p) continue;
      const w = rollWanted(tone, n, { id: p._id, charName: p.charName, sayAs: p.sayAs, realName: p.realName, rumor: p.rumor, rollLine: p.rollLine, who: p.who });
      items.push({
        id: p._id,
        charName: p.charName,
        realName: p.realName,
        photoUrl: p.photoId ? await ctx.storage.getUrl(p.photoId) : null,
        figure: p.figure ?? null,
        line: rollLineFor(p),
        clip: await clip(w),
      });
    }
    rollCall = { at: game.rollCallAt, items };
  }
  if (beforeStart || !input) return { voice: voiceOf(n), rollCall, body: null, rooms: {} as Record<string, Clip>, reveal: null, winners: null };
  const wanted = startWanted(tone, n, {
    players: all.filter((p) => p.inGame).map((p) => ({ id: p._id, charName: p.charName, sayAs: p.sayAs })),
    exhibits: input.exhibits.map((e) => ({ id: e.id, letter: e.letter, name: e.name })),
    rooms: game.rooms,
    bodyRoomKey: game.bodyRoomKey,
    roomOrder: game.roomOrder,
    search: game.search ?? "all",
  });
  const get = (purpose: string) => clip(wanted.find((w) => w.purpose === purpose));
  const rooms: Record<string, Clip> = {};
  for (const r of [1, 2, 3]) if (r <= (game.round ?? 0)) rooms[r] = await get(`rooms:${r}`);
  let reveal = null;
  let winners = null;
  if ((game.status === "reveal" || game.status === "done") && cf) {
    reveal = { killer: await get(`killer:${cf.solution.killerId}`), exhibit: await get(`exhibit:${cf.solution.exhibitId}`), room: await get(`room:${cf.solution.roomKey}`) };
  }
  if (game.status === "done" && cf) {
    const scored = await scoreGame(ctx, game, cf);
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    const top = (key: "dressed" | "liar") => {
      const c = new Map<string, number>();
      for (const vt of votes) if (vt[key]) c.set(vt[key]!, (c.get(vt[key]!) ?? 0) + 1);
      const best = Math.max(0, ...c.values());
      return best ? [...c.entries()].find(([, k]) => k === best)![0] : null;
    };
    const det = scored.bestDetective?.playerId ?? null;
    const dressed = top("dressed");
    const liar = top("liar");
    winners = {
      detective: det ? await get(`winner:${det}`) : null,
      dressed: dressed ? await get(`winner:${dressed}`) : null,
      liar: liar ? await get(`winner:${liar}`) : null,
    };
  }
  return { voice: voiceOf(n), rollCall, body: await get("body"), rooms, reveal, winners };
}

/**
 * Everything the TV shows, and only what the whole room may see: guests, counts,
 * evidence released so far, where the body turned up, open rooms, and the answer
 * only once the reveal starts. Needs the host key, since the TV opens from the host laptop.
 */
export const tv = query({
  args: { slug: v.string(), tvKey: v.string() },
  handler: async (ctx, { slug, tvKey }) => {
    const game = await requireTv(ctx, slug, tvKey);
    const all = await playersOf(ctx, game._id);
    const started = game.status !== "registration" && game.status !== "lobby";
    const round = game.round ?? 0;
    const label = (key?: string) => game.rooms.find((r) => r.key === key)?.label ?? "";
    const photo = async (p: Doc<"players">) => (p.photoId ? await ctx.storage.getUrl(p.photoId) : null);
    const accs = started
      ? await ctx.db
          .query("accusations")
          .withIndex("by_game", (q) => q.eq("gameId", game._id))
          .collect()
      : [];
    const accused = new Set(accs.map((a) => a.playerId));
    const shown = started ? playingOf(game, all) : all.filter((p) => p._id !== game.mcPlayerId);
    const cf = started ? await caseFor(ctx, game) : null;
    const input = started ? await caseInput(ctx, game) : null;
    const revealed = game.status === "reveal" || game.status === "done";
    let results = null;
    if (revealed && cf && input) {
      const scored = await scoreGame(ctx, game, cf);
      const name = (id: string) => all.find((p) => p._id === id)?.charName ?? "";
      const killer = all.find((p) => p._id === cf.solution.killerId);
      const exhibit = input.exhibits.find((e) => e.id === cf.solution.exhibitId);
      let awards = null;
      if (game.status === "done") {
        const votes = await ctx.db
          .query("votes")
          .withIndex("by_game", (q) => q.eq("gameId", game._id))
          .collect();
        const tally = (key: "dressed" | "liar") => {
          const c = new Map<string, number>();
          for (const vt of votes) if (vt[key]) c.set(vt[key]!, (c.get(vt[key]!) ?? 0) + 1);
          const top = Math.max(0, ...c.values());
          return top ? [...c.entries()].filter(([, n]) => n === top).map(([id]) => ({ name: name(id), votes: top })) : [];
        };
        awards = { bestDressed: tally("dressed"), bestLiar: tally("liar"), bestDetective: scored.bestDetective ? { name: scored.bestDetective.name, score: scored.bestDetective.score } : null };
      }
      results = {
        killer: killer?.charName ?? "",
        killerPhoto: killer ? await photo(killer) : null,
        killerFigure: killer?.figure ?? null,
        exhibit: exhibit ? { letter: exhibit.letter, name: exhibit.name } : null,
        room: label(cf.solution.roomKey),
        killerWins: scored.killerWins,
        named: scored.named,
        accusers: scored.accusers,
        aces: scored.scores.filter((s) => s.ace && s.playerId !== game.mcPlayerId).map((s) => name(s.playerId)),
        awards,
      };
    }
    return {
      now: Date.now(),
      game: {
        title: game.title,
        isTest: game.isTest,
        status: game.status,
        round,
        paused: !!game.paused,
        pacing: game.pacing,
        roundEndsAt: game.roundEndsAt ?? null,
        startedAt: game.startedAt ?? null,
        introEndsAt: game.introEndsAt ?? null,
        revealAt: game.revealAt ?? null,
        endedAt: game.endedAt ?? null,
        nextSlug: game.nextSlug ?? null, // the TV follows the host into the next game
        slug: game.slug,
        gameNumber: game.gameNumber ?? 1,
        doorsAt: game.doorsAt ?? null,
        roundStartedAt: game.roundStartedAt ?? null,
        pausedAt: game.pausedAt ?? null,
        resumedAt: game.resumedAt ?? null,
        doneAt: game.doneAt ?? null,
        rulesAt: started ? null : game.rulesAt ?? null,
        tone: game.tone ?? "classic",
        narrator: narratorOf(game),
        levels: levelsOf(game),
        mode: game.mode ?? "play",
        search: game.search ?? "all",
        wifi: game.wifi?.name ? game.wifi : null,
        tvShowAll: !!game.tvShowAll,
        soundCheckAt: game.soundCheckAt ?? null,
        lastRescue: game.lastRescue ?? null,
        lastJoin: game.lastJoin ?? null,
        roomCode: game.status !== "registration" && !game.endedAt ? game.roomCode ?? null : null,
        bodyRoom: started ? label(game.bodyRoomKey) : "",
        rooms: game.rooms.map((r) => r.label),
        openRooms: started && game.roomOrder ? openRoomsIn(round, game.roomOrder, game.search).map(label) : game.rooms.map((r) => r.label),
      },
      guests: await Promise.all(
        shown
          .sort((a, b) => a.charName.localeCompare(b.charName))
          .map(async (p) => ({
            id: p._id,
            charName: p.charName,
            photoUrl: await photo(p),
            figure: p.figure ?? null,
            here: p.checkedIn,
            ready: !!round && p.readyRound === round,
            accused: accused.has(p._id),
          })),
      ),
      counts: {
        registered: all.filter((p) => p._id !== game.mcPlayerId).length,
        here: all.filter((p) => p.checkedIn && p._id !== game.mcPlayerId).length,
        playing: shown.length,
        ready: started ? shown.filter((p) => p.readyRound === round).length : 0,
        accused: shown.filter((p) => accused.has(p._id)).length,
      },
      exhibits: input ? input.exhibits.map((e) => e.letter) : [],
      evidence: cf
        ? cf.clues
            .filter((c) => c.channel === "tv" && c.round <= Math.min(round, 3))
            .map((c) => ({ round: c.round, text: c.text, twist: c.kind === "twist" }))
        : [],
      results,
      reveal: REVEAL,
      voice: await tvVoice(ctx, game, all, input, cf),
      map: await tvMap(ctx, game),
    };
  },
});

/**
 * The house map on the TV while guests search: every room with the round it opens in, and every
 * marker in play with whether anyone has found it yet. Only marker numbers and rooms, never clues.
 */
async function tvMap(ctx: QueryCtx, game: Doc<"games">) {
  const markers = (
    await ctx.db
      .query("markers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect()
  ).filter((m) => m.roomKey && game.rooms.some((r) => r.key === m.roomKey));
  const started = game.status !== "registration" && game.status !== "lobby";
  const found = new Map<number, number>();
  if (started) {
    const scans = await ctx.db
      .query("scans")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    for (const s of scans) if (!found.has(s.markerNumber) || s.at < found.get(s.markerNumber)!) found.set(s.markerNumber, s.at);
  }
  return {
    rooms: game.rooms.map((r) => ({ key: r.key, label: r.label, opensIn: started ? markerOpensIn(game, r.key) : 1 })),
    markers: markers
      .sort((a, b) => a.number - b.number)
      .map((m) => ({ number: m.number, room: m.roomKey, foundAt: found.get(m.number) ?? null })),
  };
}

/** The TV window checks in, so the host laptop can show "TV connected" and whether sound is on. */
export const tvPing = mutation({
  args: { slug: v.string(), tvKey: v.string(), sound: v.boolean(), media: v.optional(v.boolean()) },
  handler: async (ctx, { slug, tvKey, sound, media }) => {
    const game = await requireTv(ctx, slug, tvKey);
    const now = Date.now();
    // Games whose doors opened before room codes existed get one as soon as the TV is up.
    if (!game.roomCode && game.status !== "registration" && !game.endedAt) await ensureRoomCode(ctx, game);
    if (game.tvSound === sound && !!game.tvMedia === !!media && game.tvSeenAt && now - game.tvSeenAt < 15_000) return { ok: true };
    await ctx.db.patch(game._id, { tvSeenAt: now, tvSound: sound, tvMedia: !!media });
    return { ok: true };
  },
});

// ---------- test mode (internal: CLI or dashboard only) ----------

/** Fills a TEST game with fake guests, checks them in, and logs markers. */
export const seedFakeCast = internalMutation({
  args: { slug: v.string(), guests: v.number(), markers: v.number(), seed: v.optional(v.number()), checkIn: v.optional(v.boolean()) },
  handler: async (ctx, { slug, guests, markers, seed, checkIn }) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!game) throw new ConvexError("No such game.");
    if (!game.isTest) throw new ConvexError("Fake guests only go in test games.");
    const rng = seed ? seeded(seed) : secure();
    const now = Date.now();
    const taken = new Set((await playersOf(ctx, game._id)).map((p) => p.charKey));
    for (const g of shuffle(rng, FAKE_GUESTS).filter((g) => !taken.has(g.name.toLowerCase().replace(/[^a-z0-9]+/g, ""))).slice(0, guests)) {
      const figure = anyFreeFigure(await takenFigures(ctx, game._id), rng, fakeGuestPool(!!game.lookalikes));
      const playerId = await ctx.db.insert("players", {
        figure,
        gameId: game._id,
        token: randomCode(10),
        realName: `Test ${g.name.split(" ")[0]}`,
        charName: g.name,
        charKey: g.name.toLowerCase().replace(/[^a-z0-9]+/g, ""),
        who: g.who,
        signature: g.signature,
        killerOk: rng() < 0.8,
        checkedIn: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("weapons", { gameId: game._id, playerId, name: g.weapon, description: g.weaponDesc });
    }
    const players = await playersOf(ctx, game._id);
    if (checkIn !== false) {
      const used = new Set(players.map((p) => p.exhibitLetter).filter(Boolean));
      const free = shuffle(rng, LETTERS.slice(0, players.length + used.size).filter((l) => !used.has(l)));
      let i = 0;
      for (const p of players) {
        if (p.checkedIn) continue;
        await ctx.db.patch(p._id, { checkedIn: true, weaponIn: true, exhibitLetter: p.exhibitLetter ?? free[i++], claimedAt: p.claimedAt ?? now });
      }
    }
    const old = await ctx.db
      .query("markers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    if (markers > 0 || old.length === 0) {
      const codes = await ensureAllCards(ctx);
      for (const m of old) await ctx.db.delete(m._id);
      for (let n = 1; n <= Math.min(markers, MAX_CARDS); n++) {
        await ctx.db.insert("markers", { gameId: game._id, number: n, roomKey: game.rooms[(n - 1) % game.rooms.length].key, code: codes.get(n)! });
      }
    }
    return { players: players.length, markers };
  },
});

/** Puts a TEST game back before the draw so it can be played again. */
export const resetTestGame = internalMutation({
  args: { slug: v.string(), status: v.optional(v.union(v.literal("registration"), v.literal("lobby"))) },
  handler: async (ctx, { slug, status }) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!game || !game.isTest) throw new ConvexError("Only test games can be reset.");
    for (const table of ["sealed", "accusations", "votes"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_game", (q) => q.eq("gameId", game._id))
        .collect();
      for (const r of rows) await ctx.db.delete(r._id);
    }
    for (const p of await playersOf(ctx, game._id)) {
      const scans = await ctx.db
        .query("scans")
        .withIndex("by_player", (q) => q.eq("playerId", p._id))
        .collect();
      for (const s of scans) await ctx.db.delete(s._id);
      await ctx.db.patch(p._id, { inGame: false, readyRound: 0, notebook: [] });
    }
    await ctx.db.patch(game._id, {
      status: status ?? "registration",
      round: undefined,
      startedAt: undefined,
      roundEndsAt: undefined,
      paused: false,
      registrationOpen: true,
      bodyRoomKey: undefined,
      roomOrder: undefined,
      introEndsAt: undefined,
      revealAt: undefined,
      tvShowAll: false,
      endedAt: undefined,
      doorsAt: status === "lobby" ? Date.now() : undefined,
      roundStartedAt: undefined,
      pausedAt: undefined,
      resumedAt: undefined,
      doneAt: undefined,
      rulesAt: undefined,
      rollCallAt: undefined,
      rollCallOrder: undefined,
      lastJoin: undefined,
    });
    if (status === "lobby") await ensureRoomCode(ctx, game);
    return { ok: true };
  },
});

/** Test mode: a fake guest takes an action, so a few real phones can play against a full table. */
export const fakeGuestsAct = internalMutation({
  args: { slug: v.string(), action: v.union(v.literal("ready"), v.literal("accuse")) },
  handler: async (ctx, { slug, action }) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!game || !game.isTest) throw new ConvexError("Test games only.");
    const fakes = (await playersOf(ctx, game._id)).filter((p) => p.inGame && p.realName.startsWith("Test "));
    if (action === "ready") {
      for (const p of fakes) await ctx.db.patch(p._id, { readyRound: game.round });
      await maybeAdvanceOnReady(ctx, (await ctx.db.get(game._id))!);
    } else {
      const input = await caseInput(ctx, game);
      const rng = secure();
      for (const p of fakes) {
        const others = input.suspects.filter((s) => s.id !== p._id);
        const pick = <T,>(xs: T[]) => xs[Math.floor(rng() * xs.length)];
        const existing = await ctx.db
          .query("accusations")
          .withIndex("by_player", (q) => q.eq("playerId", p._id))
          .unique();
        if (!existing) {
          await ctx.db.insert("accusations", { gameId: game._id, playerId: p._id, suspectId: pick(others).id, exhibitId: pick(input.exhibits).id, roomKey: pick(input.rooms).key, at: Date.now() });
        }
      }
      await maybeRevealOnAccusations(ctx, (await ctx.db.get(game._id))!);
    }
    return { fakes: fakes.length };
  },
});
