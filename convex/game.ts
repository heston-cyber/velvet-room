import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ACCOMPLICE_ON, buildCase, checkInput, MIN_ACCOMPLICE, openRound, openRoomsIn, scriptFor } from "./engine/build";
import { secure, seeded, shuffle } from "./engine/rng";
import { cardPlan } from "./engine/setup";
import { FAKE_GUESTS, LETTERS } from "./engine/fake";
import type { CaseFile, CaseInput, PlacedClue } from "./engine/types";
import { STASH } from "./engine/stories";
import { charKeyOf, randomCode, registrationIsOpen, requireHost, requireTv } from "./lib";
import { seal } from "./seal";
import { caseFor } from "./caseFile";
import { ensureAllCards, markerForCode } from "./cards";
import { LOCK_IN_MS, LOCKED_UP_MS, MAX_CARDS, hasJailVote, revealTimes, roundMinutesFor, VOTE, voteAfterRound } from "./shared";
import { SHOW, TWIST_CALL_MS, cueSecs, howAfterRoll, howCues, howLayout, introMs, revealLayout, rollFirst, rollLayout, showParts } from "./show";
import { inOrder, rollGuests, slotsFor } from "./rollCall";
import { heckleWanted } from "./heckles";
import { finalAnswer, finalParts, hasTie, RUNOFF_VOTE_MS, runoffVoteAt, tiedParts, type Tied } from "./lockin";
import { BET_AMOUNTS, killerTake, oddsFor, pot, settleBet } from "./book";
import { customCounts, pickLines, victimCue, type CueKey } from "./narration";
import { scheduleRecording } from "./voice";
import { ensureRoomCode } from "./join";
import { CAST, castMember, castName, fakeGuestPool, shortName, standIns, takenFigures } from "./figures";
import { deepVictim, pickVictim, type Victim } from "./victim";
import { MIN_WEAPONS, drawWeapons, gameWeapons, recommendedWeapons } from "./weapons";
import { heatNow, landTips, myTag, pickOpen, plantChoices, plantReveal, publicTips } from "./heat";
import { debtLines, heatShows } from "./engine/heat";
import { clipMatches, guestNames, laterWanted, levelsOf, narratorOf, scriptOf, startWanted, variantOf, voiceOf, type GameLines, type Wanted } from "./voiceLines";

// ---------- shared helpers ----------

async function playerByToken(ctx: QueryCtx, token: string) {
  if (!token) return null;
  return await ctx.db
    .query("players")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
}

export async function requirePlayer(ctx: QueryCtx, token: string) {
  const player = await playerByToken(ctx, token);
  if (!player) throw new ConvexError("That link doesn't match a guest.");
  const game = (await ctx.db.get(player.gameId))!;
  return { player, game };
}

export async function playersOf(ctx: QueryCtx, gameId: Id<"games">) {
  return await ctx.db
    .query("players")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
}

/** Builds the engine's input from who actually showed up. */
export async function caseInput(ctx: QueryCtx, game: Doc<"games">): Promise<CaseInput> {
  const before = game.status === "registration" || game.status === "lobby";
  // Before the draw: everyone checked in. After: exactly who was in the draw.
  const players = (await playersOf(ctx, game._id)).filter((p) => (before ? p.checkedIn : p.inGame));
  const weapons = await gameWeapons(ctx, game);
  const markers = await ctx.db
    .query("markers")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  return {
    // The evidence names guests by first name (shortName): clues stay short enough to read on the TV.
    suspects: players.map((p) => ({ id: p._id, name: shortName(p), signature: p.signature, who: p.who, killerOk: p.killerOk, sex: castMember(p.figure)?.sex })),
    // Oct 16: the night's weapons, drawn by the game (never tied to a guest).
    exhibits: weapons.map((w) => ({ id: w.id, letter: w.letter, name: w.name, description: "", kind: w.kind })),
    rooms: game.rooms.map((r) => ({ key: r.key, label: r.label })),
    // Drawn at Start; afterwards it's on the game for everyone to see.
    bodyRoomKey: before ? undefined : game.bodyRoomKey,
    roomOrder: before ? undefined : game.roomOrder,
    search: game.search ?? "all",
    markers: markers.map((m) => ({ number: m.number, roomKey: m.roomKey })),
    tone: game.tone ?? "classic",
    // Oct 17 (D9): the game writes every motive and secret (guests no longer write their own).
    // v2: before the draw, the host's setting (if there are enough players); after it, what Start decided.
    // Oct 16: the role is off (ACCOMPLICE_ON), so a new game never has one.
    accomplice: before ? ACCOMPLICE_ON && !!game.accomplice && players.length >= MIN_ACCOMPLICE : !!game.hasAccomplice,
  };
}

/** Deals a random unused exhibit letter, so letters can't reveal arrival order. */
export async function dealLetter(ctx: MutationCtx, game: Doc<"games">): Promise<string> {
  const players = await playersOf(ctx, game._id);
  const used = new Set(players.map((p) => p.exhibitLetter).filter(Boolean));
  const size = Math.max(players.length, used.size + 1);
  let pool = LETTERS.slice(0, size).filter((l) => !used.has(l));
  if (!pool.length) pool = LETTERS.filter((l) => !used.has(l));
  return shuffle(secure(), pool)[0];
}

export const isPlaying = (g: Doc<"games">) => g.status === "playing";

/** Guests who are playing: everyone in the draw. */
export const playingOf = (players: Doc<"players">[]) => players.filter((p) => p.inGame);

/** A marker's room opens in this round (Round 1 unless searching in waves). */
export function markerOpensIn(game: Doc<"games">, roomKey: string) {
  return openRound(roomKey, game.roomOrder ?? game.rooms.map((r) => r.key), game.search ?? "all");
}

async function scheduleTimer(ctx: MutationCtx, gameId: Id<"games">, round: number, endsAt: number | undefined) {
  if (endsAt) await ctx.scheduler.runAt(endsAt, internal.game.timerTick, { gameId, round });
}

/**
 * Moves the game on one step (the host's Next, a round's timer, or most guests tapping Ready). A round ends in its
 * vote, if it has one (voteAfterRound: Round 2 the jail vote, Round 3 the release vote if anyone's in jail); the next
 * step closes the open vote, the one after skips the verdict; then the next round (after Round 3, the lock-in); then
 * the reveal.
 */
async function advance(ctx: MutationCtx, gameNow: Doc<"games">) {
  let game = gameNow;
  if (!isPlaying(game)) return;
  const round = game.round ?? 1;
  // The runoff (Oct 21): the host's Next cuts the last words short and opens the vote; once it's open, closes it.
  const ro = game.runoff;
  if (round >= 4 && ro && !ro.closedAt && Date.now() < ro.voteAt) {
    const voteAt = Date.now();
    const endsAt = isTimed(game) ? voteAt + RUNOFF_VOTE_MS : undefined;
    await ctx.db.patch(game._id, { runoff: { ...ro, voteAt, endsAt } });
    if (endsAt) await ctx.scheduler.runAt(endsAt, internal.game.runoffTick, { gameId: game._id, at: ro.at });
    return;
  }
  if (round >= 4) return nextRound(ctx, game);
  const v = voteOf(game);
  if (!v) {
    // Phase 4 (Oct 21): Round 2 ends with the late tips (the killer's plant swapped in), then the jail vote.
    if (round === 2 && !game.lateTipsAt) {
      await landTips(ctx, game);
      game = (await ctx.db.get(game._id))!;
    }
    const playing = playingOf(await playersOf(ctx, game._id));
    // Oct 20: one jail vote, after Round 2; no release vote (jail lasts one round).
    const kind = voteAfterRound(round, playing.some((p) => p.jailed), playing.length);
    return kind ? startVote(ctx, game, kind) : nextRound(ctx, game);
  }
  if (!v.closedAt) return closeVote(ctx, game);
  return afterVoteNow(ctx, game);
}

/** The reveal's steps for this game: each waits for the line before it, from this game's recordings (Oct 16). */
async function revealPlanFor(ctx: QueryCtx, game: Doc<"games">) {
  const cf = await caseFor(ctx, game);
  const base = revealTimes(!!game.hasAccomplice, game.tone ?? "classic");
  if (!cf) return base;
  const rows = await ctx.db
    .query("clips")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  const secsOf = (purpose: string) => rows.find((r) => r.purpose === purpose && r.seconds)?.seconds ?? null;
  const sol = cf.solution;
  return revealLayout(
    base,
    showSecs(game),
    {
      killer: secsOf(`killer:${sol.killerId}`),
      exhibit: secsOf(`exhibit:${sol.exhibitId}`),
      room: secsOf(`room:${sol.roomKey}`),
      accomplice: sol.accompliceId ? secsOf(`accomplice:${sol.accompliceId}`) : null,
    },
    // Phase 6: the plant line, in games that had late tips.
    game.lateTipsAt ? ((game.lateTips ?? []).some((t) => t.plant) ? "plantReveal" : "noPlant") : null,
  );
}

/** Round 1 -> 2 -> 3 -> the lock-in -> the reveal. */
async function nextRound(ctx: MutationCtx, game: Doc<"games">) {
  if (!isPlaying(game)) return;
  const round = game.round ?? 1;
  if (round >= 4) {
    // The runoff (Oct 21): a tie for the most votes on who, the weapon or the room goes to a runoff first.
    if (!game.runoff) {
      const accs = await ctx.db
        .query("accusations")
        .withIndex("by_game", (q) => q.eq("gameId", game._id))
        .collect();
      const tied = tiedParts(accs);
      if (hasTie(tied)) return startRunoff(ctx, game, tied);
    } else if (!game.runoff.closedAt) {
      await ctx.db.patch(game._id, { runoff: { ...game.runoff, closedAt: Date.now() } });
    }
    const revealAt = Date.now();
    const revealPlan = await revealPlanFor(ctx, game);
    // Oct 17: the winners' lines for Prime Suspect and Best Detective, known now (Best Dressed and Best Liar at the
    // awards).
    const cfr = await caseFor(ctx, game);
    if (cfr) {
      const scored = await scoreGame(ctx, game, cfr);
      const dressed = (await awardsOf(ctx, game, cfr, await playersOf(ctx, game._id), scored)).find((a) => a.key === "dressed")?.winners ?? [];
      const ids = [...scored.primeSuspects.map((x) => `primeSuspect:${x.playerId}`), ...scored.bestDetectives.map((x) => `bestDetective:${x.playerId}`), ...dressed.map((w) => `bestDressed:${w.id}`)];
      if (ids.length) await scheduleRecording(ctx, game._id, "later", ids);
    }
    await ctx.db.patch(game._id, { status: "reveal", roundEndsAt: undefined, paused: false, tvShowAll: false, revealAt, revealPlan });
    // Oct 20: Best Dressed was voted in the lobby, so the awards follow the verdict on their own.
    await ctx.scheduler.runAt(revealAt + revealPlan.verdict + AWARDS_AFTER_VERDICT_MS, internal.game.autoFinish, { gameId: game._id, revealAt });
    return;
  }
  const next = round + 1;
  // Oct 20: only timed games have clocks in the rounds. Untimed, the host's Next covers a dead phone. Oct 29: the lock-in
  // always runs a 3-minute countdown (LOCK_IN_MS).
  const timed = isTimed(game);
  const endsAt = next === 4 ? Date.now() + LOCK_IN_MS : timed ? Date.now() + roundMinutesFor(game.pacing.roundMinutes, next) * 60_000 : undefined;
  // Oct 20 (Heston: jail lasts one round): the jailbird sat out Round 3's search and rejoins for the lock-in.
  if (next === 4) for (const p of (await playersOf(ctx, game._id)).filter((x) => x.jailed)) await ctx.db.patch(p._id, { jailed: false });
  // Skipping ahead also cuts the intro short.
  await ctx.db.patch(game._id, { round: next, roundStartedAt: Date.now(), roundEndsAt: endsAt, paused: false, introEndsAt: Math.min(game.introEndsAt ?? 0, Date.now()), rolesOut: true });
  await scheduleTimer(ctx, game._id, next, endsAt);
  // Oct 31: the Round 3 twist waits for every card to be scanned; a check once the round's opening has played, and
  // the 10-minute fallback.
  if (next === 3) {
    await ctx.scheduler.runAfter(TWIST_FIRST_CHECK_MS, internal.game.twistCheck, { gameId: game._id, force: false });
    await ctx.scheduler.runAfter(TWIST_FALLBACK_MS, internal.game.twistCheck, { gameId: game._id, force: true });
  }
  // Oct 17: the lock-in: the killer's lines for the reveal (caught, or the Got Away With It roast).
  if (next === 4) {
    const cfk = await caseFor(ctx, game);
    if (cfk) await scheduleRecording(ctx, game._id, "later", [`caught:${cfk.solution.killerId}`, `gotAway:${cfk.solution.killerId}`]);
  }
}

// ---------- the runoff (Oct 21) ----------

/** A tie at the lock-in: the TV says so, everyone tied on who gets last words (in a random order), then the vote. */
async function startRunoff(ctx: MutationCtx, game: Doc<"games">, tied: Tied) {
  const at = Date.now();
  const words = tied.who ? shuffle(secure(), tied.who) : [];
  const voteAt = runoffVoteAt(at, words.length);
  const endsAt = isTimed(game) ? voteAt + RUNOFF_VOTE_MS : undefined;
  await ctx.db.patch(game._id, { runoff: { at, ...tied, words, voteAt, endsAt }, roundEndsAt: undefined, paused: false });
  if (endsAt) await ctx.scheduler.runAt(endsAt, internal.game.runoffTick, { gameId: game._id, at });
}

/** Everyone who can vote in the runoff has: on to the reveal. */
export async function maybeRevealOnRunoff(ctx: MutationCtx, game: Doc<"games">) {
  const ro = game.runoff;
  if (!isPlaying(game) || !ro || ro.closedAt || game.paused) return;
  const voters = freeOf(await playersOf(ctx, game._id));
  const votes = await runoffVotesOf(ctx, game._id);
  const done = new Set<string>(votes.map((v) => v.playerId));
  if (voters.length && voters.every((p) => done.has(p._id))) await nextRound(ctx, game);
}

export const runoffVotesOf = (ctx: QueryCtx, gameId: Id<"games">) =>
  ctx.db
    .query("runoffVotes")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();

/** A guest's runoff vote: only the tied parts, only from what's tied, never yourself. Final once cast. */
export const runoffVote = mutation({
  args: { token: v.string(), who: v.optional(v.string()), weapon: v.optional(v.string()), room: v.optional(v.string()) },
  handler: async (ctx, { token, who, weapon, room }) => {
    const { player, game } = await requirePlayer(ctx, token);
    await castRunoffVote(ctx, game, player, { who, weapon, room });
    return { ok: true };
  },
});

export async function castRunoffVote(ctx: MutationCtx, game: Doc<"games">, player: Doc<"players">, pick: { who?: string; weapon?: string; room?: string }) {
  const ro = game.runoff;
  if (!isPlaying(game) || !ro || ro.closedAt) throw new ConvexError("There's no runoff right now.");
  if (Date.now() < ro.voteAt) throw new ConvexError("Last words first. The runoff vote opens after.");
  if (!player.inGame || player.jailed) throw new ConvexError("Only guests in the game vote in the runoff.");
  const mine = await ctx.db
    .query("runoffVotes")
    .withIndex("by_player", (q) => q.eq("playerId", player._id))
    .unique();
  if (mine) throw new ConvexError("You've already voted in the runoff.");
  if (ro.who && (!pick.who || !ro.who.includes(pick.who))) throw new ConvexError("Pick one of the guests in the runoff.");
  if (ro.who && pick.who === player._id) throw new ConvexError("You can't vote for yourself. Pick someone else in the runoff.");
  if (ro.weapon && (!pick.weapon || !ro.weapon.includes(pick.weapon))) throw new ConvexError("Pick one of the weapons in the runoff.");
  if (ro.room && (!pick.room || !ro.room.includes(pick.room))) throw new ConvexError("Pick one of the rooms in the runoff.");
  await ctx.db.insert("runoffVotes", {
    gameId: game._id,
    playerId: player._id,
    ...(ro.who ? { who: pick.who } : {}),
    ...(ro.weapon ? { weapon: pick.weapon } : {}),
    ...(ro.room ? { room: pick.room } : {}),
    at: Date.now(),
  });
  await maybeRevealOnRunoff(ctx, (await ctx.db.get(game._id))!);
}

/** A timed game's runoff vote ran out: on to the reveal with the votes in. */
export const runoffTick = internalMutation({
  args: { gameId: v.id("games"), at: v.number() },
  handler: async (ctx, { gameId, at }) => {
    const game = await ctx.db.get(gameId);
    if (!game || !isPlaying(game) || game.runoff?.at !== at || game.runoff.closedAt || game.paused) return;
    if (!game.runoff.endsAt || game.runoff.endsAt > Date.now() + 500) return; // the host opened the vote early: rescheduled
    await nextRound(ctx, game);
  },
});

/** What the TV and the phones show of the runoff: who and what is tied, the last words' order, and how many are in. */
async function runoffPublic(ctx: QueryCtx, game: Doc<"games">, all: Doc<"players">[], input: CaseInput | null) {
  const ro = game.runoff;
  if (!ro || !input) return null;
  const votes = await runoffVotesOf(ctx, game._id);
  const keyOf = await weaponKeys(ctx, game);
  const cf = game.isTest && game.bots ? await caseFor(ctx, game) : null;
  const person = async (id: string) => {
    const p = all.find((x) => x._id === id);
    return {
      id,
      name: p?.charName ?? "",
      short: p ? shortName(p) : "",
      figure: p?.figure ?? null,
      photoUrl: p?.photoId ? await ctx.storage.getUrl(p.photoId) : null,
      // Solo test mode: a bot's last words are its story.
      plea: p?.bot && cf ? cf.stories?.find((x) => x.playerId === id)?.told ?? null : null,
    };
  };
  return {
    at: ro.at,
    voteAt: ro.voteAt,
    endsAt: ro.endsAt ?? null,
    closedAt: ro.closedAt ?? null,
    words: ro.words,
    who: ro.who ? await Promise.all(ro.who.map(person)) : null,
    weapon: ro.weapon ? ro.weapon.map((id) => ({ id, name: input.exhibits.find((e) => e.id === id)?.name ?? "", key: keyOf.get(id) ?? null })) : null,
    room: ro.room ? ro.room.map((key) => ({ key, label: game.rooms.find((r) => r.key === key)?.label ?? "" })) : null,
    voted: votes.length,
    of: freeOf(all).length,
  };
}

// ---------- the book (Oct 21) ----------

export const betsOf = (ctx: QueryCtx, gameId: Id<"games">) =>
  ctx.db
    .query("bets")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();

/** The round's odds while the book is open: from the roles going out until the lock-in, never from jail. */
export function bookOdds(game: Doc<"games">) {
  if (!isPlaying(game) || !game.rolesOut) return null;
  return oddsFor(game.round ?? 1);
}

/** One bet, on who the killer is, $100 to $500. Locked once placed; the chips go on the TV stand. */
export const placeBet = mutation({
  args: { token: v.string(), suspectId: v.string(), amount: v.number() },
  handler: async (ctx, { token, suspectId, amount }) => {
    const { player, game } = await requirePlayer(ctx, token);
    await betFor(ctx, game, player, suspectId, amount);
    return { ok: true };
  },
});

export async function betFor(ctx: MutationCtx, game: Doc<"games">, player: Doc<"players">, suspectId: string, amount: number) {
  const odds = bookOdds(game);
  if (odds === null) throw new ConvexError((game.round ?? 0) >= 4 ? "The book closed when the lock-in started." : "The book opens once the roles are out.");
  if (!player.inGame) throw new ConvexError("Only guests in the game can bet.");
  if (player.jailed) throw new ConvexError("Jailbirds can't bet.");
  if (!(BET_AMOUNTS as readonly number[]).includes(amount)) throw new ConvexError("Bet $100 to $500.");
  if (suspectId === player._id) throw new ConvexError("You can't bet on yourself. Pick someone else.");
  const input = await caseInput(ctx, game);
  if (!input.suspects.some((s) => s.id === suspectId)) throw new ConvexError("Bet on someone in the game.");
  const mine = await ctx.db
    .query("bets")
    .withIndex("by_player", (q) => q.eq("playerId", player._id))
    .unique();
  if (mine) throw new ConvexError("One bet a game, and yours is down.");
  await ctx.db.insert("bets", { gameId: game._id, playerId: player._id, suspectId, amount, round: game.round ?? 1, odds, at: Date.now() });
}

/** The Betting tab: the odds now, the chips on the stand, this guest's bet, and after the reveal what it came to. */
async function bookFor(ctx: QueryCtx, game: Doc<"games">, player: Doc<"players">, all: Doc<"players">[], cf: CaseFile | null) {
  const bets = await betsOf(ctx, game._id);
  const mine = bets.find((b) => b.playerId === player._id);
  const name = (id: string) => all.find((p) => p._id === id)?.charName ?? "";
  const revealed = (game.status === "reveal" || game.status === "done") && !!cf;
  return {
    odds: bookOdds(game),
    pot: pot(bets),
    bets: bets.length,
    mine: mine ? { suspectId: mine.suspectId, name: name(mine.suspectId), amount: mine.amount, odds: mine.odds, round: mine.round } : null,
    // After the reveal: what this guest's bet came to, and (the killer's phone) the wrong bets they take.
    result: revealed && mine ? settleBet(mine, cf!.solution.killerId) : null,
    take: revealed && cf!.solution.killerId === player._id ? killerTake(bets, cf!.solution.killerId) : null,
  };
}

// ---------- votes (v2): jail and release, after every round ----------

/** Guests in the game who aren't in jail: they search, vote and lock in. */
export const freeOf = (players: Doc<"players">[]) => playingOf(players).filter((p) => !p.jailed);

/** This round's vote, open or showing its verdict. */
export const voteOf = (game: Doc<"games">) => (game.vote && game.vote.round === game.round ? game.vote : null);

export async function ballotsOf(ctx: QueryCtx, gameId: Id<"games">, voteAt: number) {
  return await ctx.db
    .query("ballots")
    .withIndex("by_game_vote", (q) => q.eq("gameId", gameId).eq("voteAt", voteAt))
    .collect();
}

/** Opens a vote. The voters are the free guests right now; more than half of them must agree. */
async function startVote(ctx: MutationCtx, game: Doc<"games">, kind: "jail" | "release", exclude?: Id<"players">) {
  const players = await playersOf(ctx, game._id);
  const free = freeOf(players);
  const candidates = kind === "jail" ? free.filter((p) => p._id !== exclude) : playingOf(players).filter((p) => p.jailed);
  const at = Date.now();
  // Oct 20: untimed games have no clock on the vote (endsAt 0): it closes when everyone has voted, or the host moves on.
  const endsAt = isTimed(game) ? at + VOTE.ms : 0;
  const vote = { kind, round: game.round ?? 1, at, endsAt, voters: free.map((p) => p._id), candidates: candidates.map((p) => p._id) };
  await ctx.db.patch(game._id, { vote, roundEndsAt: undefined, paused: false, ...(kind === "jail" ? { jailVoteAt: at } : {}) });
  // Nobody to vote, or nobody to vote for: it closes straight away with nobody.
  if (!vote.voters.length || !vote.candidates.length) return closeVote(ctx, (await ctx.db.get(game._id))!);
  if (endsAt) await ctx.scheduler.runAt(endsAt, internal.game.voteTick, { gameId: game._id, at });
}

/** Counts the ballots. More than half of the voters on one guest jails (or frees) them; anything less is nobody. */
export async function closeVote(ctx: MutationCtx, game: Doc<"games">) {
  const v = game.vote;
  if (!v || v.closedAt) return;
  const counts = new Map<string, number>();
  for (const b of await ballotsOf(ctx, game._id, v.at)) if (b.targetId) counts.set(b.targetId, (counts.get(b.targetId) ?? 0) + 1);
  let target: Id<"players"> | undefined;
  for (const [id, n] of counts) if (n > v.voters.length / 2) target = id as Id<"players">;
  const now = Date.now();
  if (target) await ctx.db.patch(target, v.kind === "jail" ? { jailed: true, jailedAt: now, readyRound: 0 } : { jailed: false });
  const outcome = !target ? ("nobody" as const) : v.kind === "jail" ? ("jailed" as const) : ("released" as const);
  // The next round waits for the verdict's line to finish (Oct 16: slides wait for the narrator). The TV says it
  // VOTE.verdictAtMs after the close: a name after the Locked Up! card, or "nobody" straight away.
  let verdictSecs: number;
  if (target) {
    const row = await ctx.db
      .query("clips")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect()
      .then((rows) => rows.find((r) => r.purpose === `${outcome === "jailed" ? "jailed" : "released"}:${target}` && r.seconds));
    verdictSecs = row?.seconds ?? 4;
  } else {
    const n = narratorOf(game);
    const cue = v.kind === "jail" ? "jailNobody" : "releaseNobody";
    verdictSecs = cueSecs(voiceOf(n), scriptOf(game), n.host, cue, variantOf(game, cue, `${v.round}`));
  }
  const saidAt = now + VOTE.verdictAtMs + (outcome === "jailed" ? LOCKED_UP_MS + 100 : 500);
  const nextAt = Math.max(now + VOTE.nextMs, saidAt + verdictSecs * 1000 + 1500);
  await ctx.db.patch(game._id, { vote: { ...v, left: undefined, closedAt: now, outcome, targetId: target, nextAt } });
  await ctx.scheduler.runAt(nextAt, internal.game.afterVote, { gameId: game._id, at: v.at });
}

/** After the verdict, the next round (after Round 3, the lock-in). Each round ends in one vote at most (Oct 16). */
async function afterVoteNow(ctx: MutationCtx, game: Doc<"games">) {
  const v = game.vote;
  if (!v || !v.closedAt) return;
  return nextRound(ctx, game);
}

export const voteTick = internalMutation({
  args: { gameId: v.id("games"), at: v.number() },
  handler: async (ctx, { gameId, at }) => {
    const game = await ctx.db.get(gameId);
    if (!game || !isPlaying(game) || game.vote?.at !== at || game.vote.closedAt) return;
    // F8 (Oct 17): a paused vote waits; resuming moves its clock on and schedules it again.
    if (game.paused || !game.vote.endsAt || game.vote.endsAt > Date.now() + 500) return;
    await closeVote(ctx, game);
  },
});

export const afterVote = internalMutation({
  args: { gameId: v.id("games"), at: v.number() },
  handler: async (ctx, { gameId, at }) => {
    const game = await ctx.db.get(gameId);
    if (!game || !isPlaying(game) || game.vote?.at !== at || !game.vote.closedAt || game.round !== game.vote.round) return;
    if (game.paused || (game.vote.nextAt ?? 0) > Date.now() + 500) return;
    await afterVoteNow(ctx, game);
  },
});

/** A free guest votes on their phone: someone on the list, or nobody (null). They can change it until it closes. */
export const castVote = mutation({
  args: { token: v.string(), targetId: v.union(v.id("players"), v.null()) },
  handler: async (ctx, { token, targetId }) => {
    const { player, game } = await requirePlayer(ctx, token);
    const vt = isPlaying(game) ? voteOf(game) : null;
    if (!vt || vt.closedAt) throw new ConvexError("The vote is closed.");
    if (game.paused) throw new ConvexError("The host paused the game. Vote when it starts again.");
    if (!vt.voters.includes(player._id)) throw new ConvexError(player.jailed ? "You're in jail, so you can't vote. You can still bribe someone who can." : "You're not in this vote.");
    if (targetId === player._id) throw new ConvexError("You can't vote for yourself.");
    if (targetId && !vt.candidates.includes(targetId)) throw new ConvexError("Pick someone from the list, or nobody.");
    const mine = (await ballotsOf(ctx, game._id, vt.at)).find((b) => b.voterId === player._id);
    if (mine) await ctx.db.patch(mine._id, { targetId, at: Date.now() });
    else await ctx.db.insert("ballots", { gameId: game._id, voteAt: vt.at, voterId: player._id, targetId, at: Date.now() });
    // Everyone's voted: count it now.
    if ((await ballotsOf(ctx, game._id, vt.at)).length >= vt.voters.length) await closeVote(ctx, (await ctx.db.get(game._id))!);
    return { ok: true };
  },
});

/** This guest's ballot in the open vote: undefined if they haven't voted, else who (null is nobody). */
async function myBallot(ctx: QueryCtx, game: Doc<"games">, playerId: Id<"players">) {
  const vt = voteOf(game);
  if (!vt) return null;
  const mine = (await ballotsOf(ctx, game._id, vt.at)).find((b) => b.voterId === playerId);
  return { canVote: vt.voters.includes(playerId), voted: !!mine, targetId: mine?.targetId ?? null };
}

/** The killer's role card (Oct 16): the weapon (with its picture), the room, and who the red herring points at. */
async function killerCard(ctx: QueryCtx, game: Doc<"games">, cf: CaseFile, all: Doc<"players">[]) {
  const w = (await gameWeapons(ctx, game)).find((x) => x.id === cf.solution.exhibitId);
  const herring = cf.clues.find((c) => c.kind === "herring" && c.pointsAt)?.pointsAt;
  const h = herring ? all.find((p) => p._id === herring) : undefined;
  return {
    weapon: { name: w?.name ?? "", key: w?.key ?? null },
    room: game.rooms.find((r) => r.key === cf.solution.roomKey)?.label ?? "",
    herring: h ? shortName(h) : null,
  };
}

/** Each weapon's pool key (for the art), by its id. */
async function weaponKeys(ctx: QueryCtx, game: Doc<"games">) {
  return new Map((await gameWeapons(ctx, game)).map((w) => [w.id, w.key]));
}

/** Oct 16: the game draws the night's weapons unless the host picked them in Options (at Play, else at Start). */
async function ensureWeapons(ctx: MutationCtx, game: Doc<"games">, guests: number): Promise<Doc<"games">> {
  if (game.weaponKeys?.length) return game;
  const weaponKeys = drawWeapons(recommendedWeapons(guests), secure());
  await ctx.db.patch(game._id, { weaponKeys });
  return { ...game, weaponKeys };
}

/** Who voted for whom, once a vote has closed (the TV and the phones show it). */
async function tallyOf(ctx: QueryCtx, game: Doc<"games">, all: Doc<"players">[]) {
  const vt = voteOf(game);
  if (!vt?.closedAt) return null;
  const ballots = await ballotsOf(ctx, game._id, vt.at);
  const p = (id: string) => all.find((x) => x._id === id);
  const columns: (Id<"players"> | null)[] = [...vt.candidates, null];
  return columns
    .map((target) => ({
      targetId: target,
      name: target ? (p(target) ? shortName(p(target)!) : "") : "Nobody",
      figure: target ? p(target)?.figure ?? null : null,
      voters: ballots.filter((b) => b.targetId === target).map((b) => ({ id: b.voterId, name: p(b.voterId) ? shortName(p(b.voterId)!) : "", figure: p(b.voterId)?.figure ?? null })),
    }))
    .filter((c) => c.voters.length || c.targetId);
}

/** The vote as the phones and the TV see it: never who voted for whom until it closes. */
async function publicVote(ctx: QueryCtx, game: Doc<"games">, all: Doc<"players">[]) {
  const vt = voteOf(game);
  if (!vt) return null;
  const ballots = await ballotsOf(ctx, game._id, vt.at);
  const p = (id: string) => all.find((x) => x._id === id);
  return {
    kind: vt.kind,
    round: vt.round,
    at: vt.at,
    endsAt: vt.endsAt,
    closedAt: vt.closedAt ?? null,
    nextAt: vt.nextAt ?? null,
    outcome: vt.outcome ?? null,
    auto: !!vt.auto,
    // While the game is paused: the vote's time left (F8).
    left: game.paused ? vt.left ?? null : null,
    target: vt.targetId ? { id: vt.targetId, name: p(vt.targetId)?.charName ?? "", figure: p(vt.targetId)?.figure ?? null } : null,
    candidates: vt.candidates.map((id) => ({ id, name: p(id) ? shortName(p(id)!) : "", full: p(id)?.charName ?? "", figure: p(id)?.figure ?? null, jailed: !!p(id)?.jailed })),
    voters: vt.voters.length,
    voted: ballots.length,
    tally: await tallyOf(ctx, game, all),
  };
}

/**
 * Oct 20 (Heston: "Either the game has timers in things or it's completely untimed", untimed by default): a round ends
 * when every free guest has tapped Ready (or the host moves it on, or a timed game's clock runs out). No last call:
 * nobody is still searching once everyone is ready.
 */
export async function maybeAdvanceOnReady(ctx: MutationCtx, game: Doc<"games">) {
  if (!isPlaying(game) || game.paused || !game.round || game.round > 3 || voteOf(game)) return;
  if ((game.introEndsAt ?? 0) > Date.now()) return;
  const inGame = freeOf(await playersOf(ctx, game._id));
  const ready = inGame.filter((p) => p.readyRound === game.round).length;
  if (!inGame.length || ready < inGame.length) return;
  await advance(ctx, game);
}

/** Oct 20: a timed game runs everything on a clock; an untimed one (the default) waits for everyone. */
export const isTimed = (g: Doc<"games">) => g.pacing.mode === "timer";

/** Accusations: once everyone in the game has accused, the reveal starts. */
export async function maybeRevealOnAccusations(ctx: MutationCtx, game: Doc<"games">) {
  // (Once a runoff is on, its own votes move it on: maybeRevealOnRunoff.)
  if (!isPlaying(game) || (game.round ?? 0) < 4 || game.paused || game.runoff) return;
  const inGame = freeOf(await playersOf(ctx, game._id));
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
  // The runoff (Oct 21): each guest's final answer is their runoff vote on the parts that tied.
  const tied = game.runoff;
  const rvotes = tied ? await runoffVotesOf(ctx, game._id) : [];
  const finals = accs.map((x) => ({ ...x, ...finalAnswer(x, rvotes.find((r) => r.playerId === x.playerId), tied) }));
  const scores = finals.map((a) => {
    const score = Number(a.suspectId === sol.killerId) + Number(a.exhibitId === sol.exhibitId) + Number(a.roomKey === sol.roomKey);
    const gotAccomplice = !!sol.accompliceId && a.accompliceId === sol.accompliceId;
    return { playerId: a.playerId, score, ace: score === 3, gotKiller: a.suspectId === sol.killerId, gotAccomplice, at: a.at };
  });
  // v2: every lock-in counts, the killer's too (their last sabotage).
  const n = scores.length;
  const named = scores.filter((s) => s.gotKiller).length;
  const byId = new Map(finals.map((a) => [a.playerId as string, a]));
  const rightWeapon = scores.filter((s) => byId.get(s.playerId)?.exhibitId === sol.exhibitId).length;
  const rightRoom = scores.filter((s) => byId.get(s.playerId)?.roomKey === sol.roomKey).length;
  // Oct 20 (Heston: "who what where each respectively gets the most votes each"): the group wins if the most-voted
  // killer, weapon and room are all right. A tie for the most is undecided (the runoff settles it; until then, or if it
  // ties again, the killer walks).
  const parts = finalParts(accs, rvotes, tied, sol);
  const groupWins = n > 0 && parts.who.won && parts.weapon.won && parts.room.won;
  const jailBallots = game.jailVoteAt ? await ballotsOf(ctx, game._id, game.jailVoteAt) : [];
  // Best Detective (Oct 17, D7: "most accurate guesses wins the award"): only guests who named the killer, never the
  // killer or the accomplice. Most right wins; a tie goes to whoever voted to jail the killer; otherwise it's shared.
  const jailedKiller = new Set<string>(jailBallots.filter((b) => b.targetId === sol.killerId).map((b) => b.voterId));
  const detectives = scores.filter((s) => s.gotKiller && s.playerId !== sol.killerId && s.playerId !== sol.accompliceId);
  const top = Math.max(0, ...detectives.map((s) => s.score));
  let best = detectives.filter((s) => s.score === top);
  if (best.length > 1 && best.some((s) => jailedKiller.has(s.playerId))) best = best.filter((s) => jailedKiller.has(s.playerId));
  // Prime Suspect (Oct 17, D11): the innocent the most lock-ins and jail votes pointed at.
  const blame = new Map<string, number>();
  const pointAt = (id: string | null | undefined) => {
    if (id && id !== sol.killerId && id !== sol.accompliceId) blame.set(id, (blame.get(id) ?? 0) + 1);
  };
  for (const a of finals) pointAt(a.suspectId);
  for (const b of jailBallots) pointAt(b.targetId);
  const most = Math.max(0, ...blame.values());
  const name = (id: string) => players.find((p) => p._id === id)?.charName ?? "";
  return {
    scores,
    killerWins: !groupWins,
    parts,
    named,
    rightWeapon,
    rightRoom,
    accusers: n,
    // Killer + accomplice games: how many of the innocent lock-ins guessed the accomplice.
    namedAccomplice: sol.accompliceId ? scores.filter((s) => s.playerId !== sol.killerId && s.playerId !== sol.accompliceId && s.gotAccomplice).length : null,
    guessers: sol.accompliceId ? scores.filter((s) => s.playerId !== sol.killerId && s.playerId !== sol.accompliceId && byId.get(s.playerId)?.accompliceId).length : null,
    bestDetectives: best.map((s) => ({ playerId: s.playerId, name: name(s.playerId), score: s.score })),
    primeSuspects: most ? [...blame.entries()].filter(([, k]) => k === most).map(([id]) => ({ playerId: id as Id<"players">, name: name(id), blamed: most })) : [],
  };
}

type Scored = Awaited<ReturnType<typeof scoreGame>>;

/** I1 (Oct 17): each guest named at the lock-in, and the faces of who named them, most named first. */
async function lockinTally(ctx: QueryCtx, game: Doc<"games">, all: Doc<"players">[]) {
  const accs = await ctx.db
    .query("accusations")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  const p = (id: string) => all.find((x) => x._id === id);
  const face = (id: string) => ({ id, name: p(id) ? shortName(p(id)!) : "", figure: p(id)?.figure ?? null });
  const by = new Map<string, string[]>();
  for (const a of accs.sort((x, y) => x.at - y.at)) by.set(a.suspectId, [...(by.get(a.suspectId) ?? []), a.playerId]);
  return [...by.entries()].sort((a, b) => b[1].length - a[1].length).map(([id, ids]) => ({ suspect: face(id), by: ids.map(face) }));
}

/** The runoff on who (Oct 21): each guest in it, and the faces of who voted for them, most first. */
async function runoffTally(ctx: QueryCtx, game: Doc<"games">, all: Doc<"players">[]) {
  const votes = await runoffVotesOf(ctx, game._id);
  const p = (id: string) => all.find((x) => x._id === id);
  const face = (id: string) => ({ id, name: p(id) ? shortName(p(id)!) : "", figure: p(id)?.figure ?? null });
  const by = new Map<string, string[]>((game.runoff?.who ?? []).map((id) => [id, []]));
  for (const v of votes.sort((x, y) => x.at - y.at)) if (v.who) by.set(v.who, [...(by.get(v.who) ?? []), v.playerId]);
  return [...by.entries()].sort((a, b) => b[1].length - a[1].length).map(([id, ids]) => ({ suspect: face(id), by: ids.map(face) }));
}

/** The awards, in the order the TV gives them. CUE: the narrator's line before the names. */
export const AWARDS = {
  detective: { title: "Best Detective", cue: "awardDetective" },
  prime: { title: "Prime Suspect", cue: "awardPrimeSuspect" },
  dressed: { title: "Best Dressed", cue: "awardDressed" },
  gotAway: { title: "Got Away With It", cue: "awardGotAway" },
} as const satisfies Record<string, { title: string; cue: CueKey }>;
export type AwardKey = keyof typeof AWARDS;

/**
 * The night's awards (Oct 17): only the ones someone won (Heston: "don't show awards at the end if no one won them").
 * Best Dressed is voted on the phones, for guests in the game only. Oct 18: no Best Liar (with no secrets, innocents
 * have nothing to lie about; Heston: "Drop it"). A tie is shared.
 */
async function awardsOf(ctx: QueryCtx, game: Doc<"games">, cf: CaseFile, all: Doc<"players">[], scored: Scored) {
  const votes = await ctx.db
    .query("votes")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  const sol = cf.solution;
  const p = (id: string) => all.find((x) => x._id === id);
  const inGame = new Set<string>(playingOf(all).map((x) => x._id));
  const who = (ids: string[]) => ids.filter((id) => p(id)).map((id) => ({ id: id as Id<"players">, name: p(id)!.charName, short: shortName(p(id)!), figure: p(id)!.figure ?? null }));
  const tally = (key: "dressed", ok: (id: string) => boolean) => {
    const c = new Map<string, number>();
    for (const vt of votes) {
      const pick = vt[key];
      if (pick && pick !== vt.playerId && ok(pick)) c.set(pick, (c.get(pick) ?? 0) + 1);
    }
    const most = Math.max(0, ...c.values());
    return { ids: most ? [...c.entries()].filter(([, k]) => k === most).map(([id]) => id) : [], votes: most };
  };
  const plural = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;
  const out: { key: AwardKey; title: string; cue: CueKey; winners: ReturnType<typeof who>; sub: string }[] = [];
  const add = (key: AwardKey, ids: string[], sub: string) => {
    const winners = who(ids);
    if (winners.length) out.push({ key, title: AWARDS[key].title, cue: AWARDS[key].cue, winners, sub });
  };
  const det = scored.bestDetectives;
  if (det.length) add("detective", det.map((d) => d.playerId), `${det[0].score} of 3 right`);
  const prime = scored.primeSuspects;
  if (prime.length) add("prime", prime.map((d) => d.playerId), `Innocent, and blamed ${prime[0].blamed === 1 ? "once" : `${prime[0].blamed} times`}`);
  const dressed = tally("dressed", (id) => inGame.has(id));
  add("dressed", dressed.ids, plural(dressed.votes, "vote"));
  if (scored.killerWins) add("gotAway", [sol.killerId, ...(sol.accompliceId ? [sol.accompliceId] : [])], "The killer walks");
  return out;
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
    if (!isPlaying(game) || !player.inGame || player.jailed || !game.round || game.round > 3) return { ok: false };
    // Oct 31: Round 3's Ready waits for the twist.
    if (ready && (await twistPending(ctx, game))) throw new ConvexError("Wait for the twist. It drops once every card is found.");
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
    if (!marker) throw new ConvexError("That code isn't one of tonight's evidence cards. Check it and try again.");
    return await scanFor(ctx, game, player, marker);
  },
});

/**
 * Solo test mode (Oct 20): in a test game the phone can "find" a card by its number, so a test needs no printed cards.
 * Exactly the same rules as scanning one.
 */
export const scanTestCard = mutation({
  args: { token: v.string(), number: v.number() },
  handler: async (ctx, { token, number }) => {
    const { player, game } = await requirePlayer(ctx, token);
    if (!game.isTest) throw new ConvexError("Only test games can find cards without scanning them.");
    const marker = (await ctx.db
      .query("markers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect()).find((m) => m.number === number);
    if (!marker) throw new ConvexError(`Card ${number} isn't in play tonight.`);
    return await scanFor(ctx, game, player, marker);
  },
});

/** Records a guest's scan of a card (once) and returns what it says, if they may read it now. */
/**
 * What a card says to this guest. Phase 3: the Don's stash pays the first phone to scan it; everyone after finds an
 * empty envelope.
 */
export function cardText(game: Doc<"games">, clue: PlacedClue | undefined, playerId: string): string {
  if (!clue) return "Nothing useful here.";
  if (clue.kind === "stash") return !game.stash || game.stash.playerId === playerId ? STASH.found : STASH.empty;
  return clue.text;
}

/** Phase 3: the first guest (or bot) to scan the stash card claims it. */
export async function claimStash(ctx: MutationCtx, game: Doc<"games">, clue: PlacedClue | undefined, playerId: Id<"players">) {
  if (clue?.kind !== "stash" || game.stash) return game;
  const stash = { playerId, at: Date.now() };
  await ctx.db.patch(game._id, { stash });
  return { ...game, stash };
}

/** The twist is public once it dropped, and after Round 3 in any case (older games had no wait). */
const twistOut = (game: Doc<"games">) => !!game.twistAt || (game.round ?? 0) >= 4 || game.status === "reveal" || game.status === "done";

export async function scanFor(ctx: MutationCtx, game: Doc<"games">, player: Doc<"players">, marker: Doc<"markers">) {
  if (!marker.roomKey) throw new ConvexError(`Card ${marker.number} isn't in play tonight. Keep looking.`);
  if (game.status === "registration" || game.status === "lobby") throw new ConvexError("Nothing here yet. The cards come alive when the game starts.");
  if (!player.inGame) throw new ConvexError("Only guests who were checked in before the game started can read the cards.");
  if (player.jailed) throw new ConvexError("You're in jail. You can talk and bribe, but you can't search.");
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
  const now = await claimStash(ctx, game, clue, player._id);
  // Oct 31: the last card found in Round 3 calls everyone back to the Lounge for the twist.
  if (isPlaying(game) && game.round === 3 && Date.now() >= (game.roundStartedAt ?? 0) + TWIST_FIRST_CHECK_MS) await maybeCallTwist(ctx, game, false);
  const room = game.rooms.find((r) => r.key === marker.roomKey);
  return { number: marker.number, room: room?.label ?? "", text: cardText(now, clue, player._id) };
}

// ---------- the Round 3 twist (Oct 31, Heston: "a wait on the twist in round 3 (wait till after all evidence is
// scanned.) Do a notification on all devices to return to the lounge for the twist once all evidence is scanned. then
// the twist drops, then players continue talking and guessing to ready for vote"; the host can drop it, and it drops on
// its own 10 minutes into Round 3) ----------

const TWIST_FIRST_CHECK_MS = 30_000;
const TWIST_FALLBACK_MS = 10 * 60_000;

const hasTwist = (cf: CaseFile | null) => !!cf?.clues.some((c) => c.kind === "twist");

/** True while Round 3's twist hasn't dropped yet (a game with one). */
export async function twistPending(ctx: QueryCtx, game: Doc<"games">) {
  return isPlaying(game) && game.round === 3 && !game.twistAt && hasTwist(await caseFor(ctx, game));
}

async function allCardsScanned(ctx: QueryCtx, game: Doc<"games">) {
  const markers = (await ctx.db.query("markers").withIndex("by_game", (q) => q.eq("gameId", game._id)).collect()).filter((m) => !!m.roomKey);
  if (!markers.length) return true;
  const scans = await ctx.db.query("scans").withIndex("by_game", (q) => q.eq("gameId", game._id)).collect();
  const found = new Set(scans.map((s) => s.markerNumber));
  return markers.every((m) => found.has(m.number));
}

/** Calls everyone back to the Lounge (force: whether or not every card is found); the twist drops TWIST_CALL_MS later. */
async function maybeCallTwist(ctx: MutationCtx, game: Doc<"games">, force: boolean) {
  if (game.twistCallAt || !(await twistPending(ctx, game))) return false;
  if (!force && !(await allCardsScanned(ctx, game))) return false;
  const now = Date.now();
  await ctx.db.patch(game._id, { twistCallAt: now });
  await ctx.scheduler.runAt(now + TWIST_CALL_MS, internal.game.twistDrop, { gameId: game._id });
  return true;
}

export const twistCheck = internalMutation({
  args: { gameId: v.id("games"), force: v.boolean() },
  handler: async (ctx, { gameId, force }) => {
    const game = await ctx.db.get(gameId);
    if (game) await maybeCallTwist(ctx, game, force);
  },
});

export const twistDrop = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.twistAt || !game.twistCallAt || !isPlaying(game) || game.round !== 3) return;
    await ctx.db.patch(game._id, { twistAt: Date.now() });
  },
});

/** Host: call everyone to the Lounge now (or, once they've been called, drop the twist now). */
export const dropTwist = mutation({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (!(await twistPending(ctx, game))) return { ok: true };
    if (!game.twistCallAt) await maybeCallTwist(ctx, game, true);
    else await ctx.db.patch(game._id, { twistAt: Date.now() });
    return { ok: true };
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
  args: { token: v.string(), suspectId: v.string(), exhibitId: v.string(), roomKey: v.string(), accompliceId: v.optional(v.string()) },
  handler: async (ctx, { token, suspectId, exhibitId, roomKey, accompliceId }) => {
    const { player, game } = await requirePlayer(ctx, token);
    if (!isPlaying(game) || (game.round ?? 0) < 4) throw new ConvexError("The lock-in opens after the last round.");
    if (!player.inGame) throw new ConvexError("Only guests in the game can lock in.");
    if (player.jailed) throw new ConvexError("You're in jail, so you can't lock in.");
    if (suspectId === player._id) throw new ConvexError("You can't name yourself. Nice try.");
    const input = await caseInput(ctx, game);
    if (!input.suspects.some((s) => s.id === suspectId)) throw new ConvexError("Pick a suspect from the list.");
    if (!input.exhibits.some((e) => e.id === exhibitId)) throw new ConvexError("Pick a weapon from the list.");
    if (!input.rooms.some((r) => r.key === roomKey)) throw new ConvexError("Pick a room from the list.");
    if (accompliceId && !game.hasAccomplice) throw new ConvexError("There's no accomplice tonight.");
    if (accompliceId && !input.suspects.some((s) => s.id === accompliceId)) throw new ConvexError("Pick an accomplice from the list, or leave it blank.");
    if (accompliceId && accompliceId === player._id) throw new ConvexError("You can't name yourself as the accomplice.");
    if (accompliceId && accompliceId === suspectId) throw new ConvexError("The killer can't be their own accomplice. Pick someone else, or leave it blank.");
    const existing = await ctx.db
      .query("accusations")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .unique();
    // v2: a lock-in is final.
    if (existing) throw new ConvexError("You've already locked in.");
    await ctx.db.insert("accusations", { gameId: game._id, playerId: player._id, suspectId, exhibitId, roomKey, accompliceId: accompliceId || undefined, at: Date.now() });
    // Oct 17: one guest left to lock in: their "hurry up" line.
    const all = await ctx.db
      .query("accusations")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    const done = new Set<string>(all.map((a) => a.playerId));
    const left = freeOf(await playersOf(ctx, game._id)).filter((p) => !done.has(p._id));
    if (left.length === 1) await scheduleRecording(ctx, game._id, "later", [`lastLockIn:${left[0]._id}`]);
    await maybeRevealOnAccusations(ctx, game);
    return { ok: true };
  },
});

/**
 * Best Dressed (Oct 20, Heston: "its a prompt in the lobby while people wait for the game to start"): guests vote on
 * their phones in the lobby, for anyone else who's checked in, and can change it until the game starts. Older pages may
 * still send liar; it's ignored.
 */
export const vote = mutation({
  args: { token: v.string(), dressed: v.optional(v.id("players")), liar: v.optional(v.id("players")) },
  handler: async (ctx, { token, dressed }) => {
    const { player, game } = await requirePlayer(ctx, token);
    if (game.status !== "lobby") throw new ConvexError(game.status === "registration" ? "Best Dressed opens when the doors open." : "Best Dressed closed when the game started.");
    if (!player.checkedIn) throw new ConvexError("Check in first, then vote.");
    if (dressed) {
      if (dressed === player._id) throw new ConvexError("You can't vote for yourself.");
      const p = await ctx.db.get(dressed);
      if (!p || p.gameId !== game._id || !p.checkedIn) throw new ConvexError("Pick someone who's here tonight.");
    }
    const existing = await ctx.db
      .query("votes")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { dressed });
    else await ctx.db.insert("votes", { gameId: game._id, playerId: player._id, dressed });
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
    // v2: roles reach the phones at "check your phones", after the roll call.
    const rolesOut = !game.show || !!game.rolesOut;
    const brief = rolesOut ? cf?.briefings.find((b) => b.playerId === player._id) : undefined;
    const scans = await ctx.db
      .query("scans")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .collect();
    const markers = await ctx.db
      .query("markers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    const inGame = playingOf(all);
    const free = freeOf(all);
    const round = game.round ?? 0;
    const roomLabel = (key?: string) => game.rooms.find((r) => r.key === key)?.label ?? "";
    const keyOf = await weaponKeys(ctx, game);
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
    const myVote = await ctx.db
      .query("votes")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .unique();

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
        // Oct 17 (D5): games with fewer than 5 guests in them have no jail vote.
        jailVote: started ? hasJailVote(inGame.length) : hasJailVote(all.length),
        // Rooms open for searching right now (all of them unless searching in waves).
        openRooms: started && game.roomOrder ? openRoomsIn(round, game.roomOrder, game.search).map(roomLabel) : [],
        wifi: game.wifi?.name ? game.wifi : null,
        introEndsAt: game.introEndsAt ?? null,
        // Oct 31: Round 3's twist (see the TV's).
        twistWait: await twistPending(ctx, game),
        // Oct 31: who dies tonight, once the game has started (null: the Don).
        victim: game.victim ?? null,
        twistCallAt: game.twistCallAt ?? null,
        twistAt: game.twistAt ?? null,
        // W4 (Oct 17): when the Don dies on screen; phones don't say he's dead before. (Named for the roll call, which
        // followed the murder until Oct 31; since then the murder comes after How to play.)
        rollAt: game.show ? (rollFirst(game.show) ? game.show.introAt ?? null : game.show.rollAt) : null,
        rolesOut,
        revealAt: game.revealAt ?? null,
        // v2: a killer + accomplice game (fixed at Start), and when the TV's reveal reaches the verdict.
        hasAccomplice: started && !!game.hasAccomplice,
        verdictMs: (game.revealPlan ?? revealTimes(started && !!game.hasAccomplice, game.tone ?? "classic")).verdict,
        nextSlug: game.nextSlug ?? null, // the host started another game: sign up for it
        // Solo test mode (Oct 20): a test game with bots. The phone can find cards by number and ask the bots.
        bots: game.isTest && !!game.bots,
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
        jailed: !!player.jailed,
        // Jailed when the lock-in opened (they sat it out), for the reveal (F15).
        satOut: !!player.jailed && (game.round ?? 0) >= 4,
        weaponIn: !!player.weaponIn,
        exhibitLetter: player.exhibitLetter ?? null,
        ready: !!game.round && player.readyRound === game.round,
        notebook: player.notebook ?? [],
        // Oct 20: their Best Dressed pick (voted in the lobby).
        dressed: myVote?.dressed ?? null,
      },
      lobby: await Promise.all(
        all
          .sort((a, b) => a.charName.localeCompare(b.charName))
          .map(async (p) => ({ id: p._id, charName: p.charName, photoUrl: await photo(p), figure: p.figure ?? null, checkedIn: p.checkedIn })),
      ),
      counts: {
        checkedIn: all.filter((p) => p.checkedIn).length,
        registered: all.length,
        // v2: the free guests (not in jail) are the ones who search, vote and lock in.
        inGame: free.length,
        jailed: inGame.length - free.length,
        ready: game.round ? free.filter((p) => p.readyRound === game.round).length : 0,
        accused: accs.length,
      },
      vote: started ? await publicVote(ctx, game, all) : null,
      myBallot: started ? await myBallot(ctx, game, player._id) : null,
      briefing:
        brief && cf
          ? {
              role: brief.role,
              motive: brief.motive,
              lines: brief.lines,
              // Oct 16: the role card is pictures and a few words. Only the killer's own phone gets the facts.
              card: brief.role === "killer" ? await killerCard(ctx, game, cf, all) : null,
            }
          : null,
      // Phase 3: where you were when the lights went out (the killer's cover reads exactly the same). Once the roles are out.
      story: brief && cf && rolesOut ? cf.stories?.find((s) => s.playerId === player._id)?.text ?? null : null,
      // Phase 4 (Oct 21): who owes whom (always true, the killer's too), the heat, Round 2's pick and the late tips.
      debts: brief && cf ? debtLines(cf.debts ?? [], player._id, (id) => {
        const p = all.find((x) => x._id === id);
        return p ? shortName(p) : "someone";
      }) : [],
      heat: (() => {
        const shows = started && heatShows(game.status, round) && rolesOut && !!player.inGame;
        const mine = shows ? myTag(game, player, cf) : { tag: null, dropped: false };
        return { shows, on: shows ? heatNow(game, all, cf).map((h) => h.id) : [], mine: mine.tag, dropped: mine.dropped };
      })(),
      pick:
        brief && cf && player.inGame && round === 2
          ? {
              open: pickOpen(game),
              answered: player.picked === 2,
              mine: (brief.role === "killer" ? game.frame?.targetId ?? null : player.tag ?? null) as string | null,
              locked: !!game.lateTipsAt,
            }
          : null,
      lateTips: started ? publicTips(game) : [],
      // Oct 31: the killer's three ready-made plants, at the bottom of their Notebook.
      plant:
        brief?.role === "killer" && cf && player.inGame && isPlaying(game)
          ? (() => {
              const options = plantChoices(game, cf, all);
              const f = game.frame;
              return {
                options: options.map((o) => ({ name: o.name, text: o.text })),
                chosen: f ? (f.targetId ? options.findIndex((o) => o.id === f.targetId && (!f.text || o.text === f.text)) : -1) : null,
                landed: !!game.lateTipsAt,
              };
            })()
          : null,
      scans: cf
        ? scans
            .sort((a, b) => a.at - b.at)
            .map((s) => {
              const m = markers.find((x) => x.number === s.markerNumber);
              return {
                number: s.markerNumber,
                room: game.rooms.find((r) => r.key === m?.roomKey)?.label ?? "",
                text: cardText(game, cf.clues.find((c) => c.channel === "marker" && c.markerNumber === s.markerNumber), player._id),
              };
            })
        : [],
      // Solo test mode (Oct 20): every card in play, by number and room, for finding one without scanning it.
      testCards:
        game.isTest && started
          ? markers
              .filter((m) => m.roomKey)
              .sort((a, b) => a.number - b.number)
              .map((m) => ({ number: m.number, room: roomLabel(m.roomKey), open: markerOpensIn(game, m.roomKey) <= round || round >= 4, found: scans.some((s) => s.markerNumber === m.number) }))
          : [],
      evidence: cf
        ? cf.clues
            .filter((c) => c.channel === "tv" && c.round <= (game.round ?? 0) && (c.kind !== "twist" || twistOut(game)))
            .map((c) => ({ round: c.round, text: c.text, twist: c.kind === "twist" }))
        : [],
      board: input
        ? {
            suspects: await Promise.all(
              input.suspects.map(async (s) => ({
                id: s.id,
                name: s.name,
                signature: s.signature,
                photoUrl: await photo(all.find((p) => p._id === s.id)!),
                figure: all.find((p) => p._id === s.id)?.figure ?? null,
                // Solo test mode: the bots can be asked what they know.
                bot: game.isTest && !!all.find((p) => p._id === s.id)?.bot,
              })),
            ),
            exhibits: input.exhibits.map((e) => ({ id: e.id, letter: e.letter, name: e.name, key: keyOf.get(e.id) ?? null })),
            rooms: input.rooms,
          }
        : null,
      myAccusation: myAcc ? { suspectId: myAcc.suspectId, exhibitId: myAcc.exhibitId, roomKey: myAcc.roomKey, accompliceId: myAcc.accompliceId ?? null } : null,
      // The book (Oct 21).
      book: started ? await bookFor(ctx, game, player, all, cf) : null,
      // The runoff (Oct 21): what's tied, and this guest's runoff vote once cast.
      runoff: started && game.runoff ? await runoffPublic(ctx, game, all, input) : null,
      myRunoff: started && game.runoff
        ? await ctx.db
            .query("runoffVotes")
            .withIndex("by_player", (q) => q.eq("playerId", player._id))
            .unique()
            .then((r) => (r ? { who: r.who ?? null, weapon: r.weapon ?? null, room: r.room ?? null } : null))
        : null,
      results:
        scored && cf
          ? {
              killer: all.find((p) => p._id === cf.solution.killerId)?.charName ?? "",
              exhibit: (() => {
                const e = input?.exhibits.find((x) => x.id === cf.solution.exhibitId);
                return e ? { letter: e.letter, name: e.name, key: keyOf.get(e.id) ?? null } : null;
              })(),
              room: game.rooms.find((r) => r.key === cf.solution.roomKey)?.label ?? "",
              accomplice: cf.solution.accompliceId ? all.find((p) => p._id === cf.solution.accompliceId)?.charName ?? "" : null,
              killerId: cf.solution.killerId,
              accompliceId: cf.solution.accompliceId ?? null,
              killerWins: scored.killerWins,
              mine: scored.scores.find((s) => s.playerId === player._id) ?? null,
              iWasKiller: cf.solution.killerId === player._id,
              iWasAccomplice: !!cf.solution.accompliceId && cf.solution.accompliceId === player._id,
              myVote: myVote ? { dressed: myVote.dressed ?? null } : null,
              // Phase 4: who the killer framed with the plant, or no plant tonight.
              plant: plantReveal(game, all),
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
    if (!player.inGame) return { error: "Only guests who were checked in before the game started can read the cards." };
    const room = game.rooms.find((r) => r.key === marker.roomKey);
    const opens = markerOpensIn(game, marker.roomKey);
    if (isPlaying(game) && (game.round ?? 1) < opens) return { error: `${room?.label ?? "This room"} is sealed until Round ${opens}. Come back then.` };
    const cf = await caseFor(ctx, game);
    const clue = cf?.clues.find((c) => c.channel === "marker" && c.markerNumber === marker.number);
    return { number: marker.number, room: room?.label ?? "", text: cardText(game, clue, player._id) };
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
      .filter((c) => c.channel === "tv" && c.round <= game.round! && (c.kind !== "twist" || twistOut(game)))
      .map((c) => ({ round: c.round, text: c.text, twist: c.kind === "twist" }));
  },
});

/** A guest's own private screen once the game is on: role and motive (Oct 18: no secret, no tip). */
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
    return {
      started: true as const,
      inGame: true as const,
      role: b.role,
      motive: b.motive,
      lines: b.lines,
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
    if (game.status !== "registration" && game.status !== "lobby") throw new ConvexError("The game has started, so the cards are locked.");
    await writeMarkers(ctx, game, markers);
    return { ok: true };
  },
});

/** Sets a game's markers (card numbers and their rooms); card N's code is the same in every game. */
async function writeMarkers(ctx: MutationCtx, game: Doc<"games">, markers: { number: number; roomKey: string }[]) {
  const rooms = new Set(game.rooms.map((r) => r.key));
  const numbers = new Set<number>();
  if (markers.length > MAX_CARDS) throw new ConvexError(`The printed sheet has ${MAX_CARDS} cards, so use ${MAX_CARDS} cards at most.`);
  for (const m of markers) {
    if (!Number.isInteger(m.number) || m.number < 1 || m.number > MAX_CARDS) throw new ConvexError(`Cards are numbered 1 to ${MAX_CARDS}.`);
    // "" means not placed yet: the game won't start until every marker has a room.
    if (m.roomKey !== "" && !rooms.has(m.roomKey)) throw new ConvexError(`Card ${m.number} is in a room that isn't in play.`);
    if (numbers.has(m.number)) throw new ConvexError(`Card ${m.number} is listed twice.`);
    numbers.add(m.number);
  }
  const existing = await ctx.db
    .query("markers")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  const byNumber = new Map(existing.map((m) => [m.number, m]));
  const codes = await ensureAllCards(ctx);
  for (const m of existing) if (!numbers.has(m.number)) await ctx.db.delete(m._id);
  for (const m of markers) {
    const old = byNumber.get(m.number);
    const code = codes.get(m.number)!;
    if (old) await ctx.db.patch(old._id, { roomKey: m.roomKey, code });
    else await ctx.db.insert("markers", { gameId: game._id, number: m.number, roomKey: m.roomKey, code });
  }
}

/**
 * Before the draw (Oct 17): with no cards tonight (F1), the game's cards go and their clues come out on the TV. A card
 * with no room, or in a room that's no longer in play, is dealt to the rooms in play, fewest cards first (F10), so
 * Play never fails in front of everyone.
 */
async function settleCards(ctx: MutationCtx, game: Doc<"games">, none: boolean) {
  const markers = await ctx.db
    .query("markers")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  if (none) {
    for (const m of markers) await ctx.db.delete(m._id);
    return;
  }
  const rooms = game.rooms.map((r) => r.key);
  const count = new Map(rooms.map((k) => [k, markers.filter((m) => m.roomKey === k).length]));
  for (const m of markers.sort((a, b) => a.number - b.number)) {
    if (rooms.includes(m.roomKey)) continue;
    const to = [...count.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
    if (!to) return;
    await ctx.db.patch(m._id, { roomKey: to });
    count.set(to, (count.get(to) ?? 0) + 1);
  }
}

/** Host: party night begins. Guests can check in. */
export const openDoors = mutation({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (game.status !== "registration") throw new ConvexError("The doors are already open.");
    // Oct 16: a host who set no evidence cards gets the recommended ones for this many sign-ups, dealt round the rooms.
    const hasCards = await ctx.db
      .query("markers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .first();
    const signedUp = (await playersOf(ctx, game._id)).length;
    if (!hasCards) await writeMarkers(ctx, game, cardPlan(signedUp, game.rooms));
    await ensureWeapons(ctx, game, signedUp);
    await ctx.db.patch(game._id, { status: "lobby", doorsAt: Date.now() });
    await ensureRoomCode(ctx, game);
    if (game.isTest && game.bots) await ctx.scheduler.runAfter(0, internal.bots.wake, { gameId: game._id });
    return { ok: true };
  },
});

/** Host: the secret draw. Builds and seals the case. Returns counts only, never the answer. */
/** What the host laptop heard in its last few games (Oct 16): per line, the versions, oldest first; the heckles. */
const heardArg = v.optional(v.object({ lines: v.record(v.string(), v.array(v.number())), heckles: v.array(v.string()) }));

/** A new game's picks: the versions this laptop heard least lately, a running gag only if the laptop says it's due. */
function linesFor(game: Doc<"games">, heard: { lines: Record<string, number[]>; heckles: string[] } | undefined, gag: boolean | undefined, inGame: string[]): GameLines {
  const tone = scriptOf(game);
  // Oct 20, the host's roast setting: Nobody, a guest they picked (if they're playing), or Random (the laptop's
  // every-third-game gag, on a guest the game picks).
  const roast = game.roast ?? "random";
  const on = roast !== "random" && roast !== "none" && inGame.includes(roast) ? roast : undefined;
  return {
    picks: pickLines(tone, game.slug, heard?.lines ?? {}, customCounts(tone)),
    gag: roast === "none" ? false : on ? true : gag ?? false,
    avoid: (heard?.heckles ?? []).slice(-120),
    ...(on ? { gagOn: on } : {}),
  };
}

export const startGame = mutation({
  // cards (F1, Oct 17): the host's answer to "Are the QR cards hidden?" at Play. "none": no cards tonight, so their
  // clues come out on the TV instead. Older pages don't send it.
  args: { slug: v.string(), hostKey: v.string(), heard: heardArg, gag: v.optional(v.boolean()), cards: v.optional(v.union(v.literal("hidden"), v.literal("none"))) },
  handler: async (ctx, { slug, hostKey, heard, gag, cards }) => {
    const host = await requireHost(ctx, slug, hostKey);
    if (host.status !== "registration" && host.status !== "lobby") throw new ConvexError("This game has already started.");
    await settleCards(ctx, host, cards === "none");
    // Started straight from sign-ups: the weapons are drawn now, for who's checked in.
    let game = await ensureWeapons(ctx, host, (await playersOf(ctx, host._id)).filter((p) => p.checkedIn).length);
    // Oct 18 (Heston: "get rid of the "all rooms open" option. it should always be a room waves"): every new game
    // opens its rooms in waves, whatever an older game saved.
    if (game.search !== "waves") {
      await ctx.db.patch(game._id, { search: "waves" });
      game = { ...game, search: "waves" };
    }
    if ((game.weaponKeys?.length ?? 0) < MIN_WEAPONS) throw new ConvexError(`Pick at least ${MIN_WEAPONS} weapons in Options, or clear them and the game draws its own.`);
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
    // Oct 31: tonight's victim, a cast drawing nobody plays (the Don if every one is taken); every line about the
    // death names them.
    const victim: Victim = pickVictim(CAST, await takenFigures(ctx, game._id), secure()());
    const { validation: _v, ...drawn } = cf as CaseFile & { validation?: unknown };
    const file = deepVictim(drawn, victim);
    await ctx.db.insert("sealed", { gameId: game._id, ...(await seal(file)) });
    for (const p of await playersOf(ctx, game._id)) {
      await ctx.db.patch(p._id, { inGame: p.checkedIn, readyRound: 0 });
    }
    // The show plays on the TV first (intro, How to play, roll call, check your phones); Round 1's clock
    // starts when it ends. The roll call's turns are estimated now and fixed when it begins.
    const now = Date.now();
    const order = shuffle(
      secure(),
      (await playersOf(ctx, game._id)).filter((p) => p.inGame).map((p) => p._id),
    );
    // This game's lines, picked so this laptop hears the jokes it heard least lately (layouts below time them).
    const lines = linesFor(game, heard, gag, order.map(String));
    const picked = { ...game, lines };
    // Oct 31, 17:30 (Heston): the welcome and the roll call, How to play and Gameplay, then the Don dies and "check your
    // phone".
    const rollAt = now;
    const g1 = { ...picked, hasAccomplice: !!input.accomplice, victim };
    const est = await rollPlan(ctx, g1, rollAt, order, file as CaseFile, "rollFirst");
    const howAt = est.howAt;
    const introAt = howAt + howMsOf(g1);
    const introEndsAt = est.end;
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
      show: { howAt, introAt, rollAt, order },
      victim,
      lines,
      rolesOut: false,
      // v2: a killer and an accomplice only with 7+ players; otherwise one killer. (Off since Oct 16: always one.)
      hasAccomplice: !!input.accomplice,
    });
    // The roll call's turns are fixed when the first guest comes up (the welcome gives their voices time to record).
    await ctx.scheduler.runAt(est.steps[0]?.at ?? rollAt, internal.game.freezeShowRoll, { gameId: game._id });
    await scheduleTimer(ctx, game._id, 1, endsAt);
    await ensureRoomCode(ctx, game); // started straight from sign-ups: late guests still need the code
    // The roll call's voices first (it plays in a couple of minutes), then the names for the intro, the waves
    // and the reveal: one clip for every guest, exhibit and room.
    await scheduleRecording(ctx, game._id, "roll", undefined, "start");
    if (game.isTest && game.bots) await ctx.scheduler.runAfter(0, internal.bots.wake, { gameId: game._id });
    return {
      suspects: input.suspects.length,
      exhibits: input.exhibits.length,
      markers: input.markers.length,
    };
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

// ---------- the show: How to play → the Don dies → roll call → check your phones (Oct 16; before, the intro came first) ----------

const showSecs = (game: Doc<"games">) => {
  const n = narratorOf(game);
  const tone = scriptOf(game);
  // This game's version of each line (adult lines come in several), as the TV will play it.
  // Oct 31: the victim's versions of the lines that name the Don.
  return (cue0: CueKey) => {
    const cue = victimCue(cue0, !!game.victim && game.victim.key !== "don");
    return cueSecs(voiceOf(n), tone, n.host, cue, variantOf(game, cue));
  };
};

/** How long each recorded clip runs (null while it isn't recorded, or no longer says the right thing). */
async function clipSeconds(ctx: QueryCtx, gameId: Id<"games">): Promise<(w: Wanted) => number | null> {
  const rows = await ctx.db
    .query("clips")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
  const byPurpose = new Map(rows.map((r) => [r.purpose, r]));
  return (w) => {
    const r = byPurpose.get(w.purpose);
    return clipMatches(r, w) && r!.seconds ? r!.seconds : null;
  };
}

/** How long How to play and Gameplay run for this game (they follow the roll call since Oct 31). */
const howMsOf = (game: Doc<"games">) =>
  howLayout(0, howCues({ search: game.search ?? "all", pacing: game.pacing, accomplice: !!game.hasAccomplice }), showSecs(game)).end;

/** Where the roll call sits: first (since Oct 31, 17:30: then How to play and the murder), before How to play (Oct 31,
 *  briefly), or last (Oct 16–30, and older). */
type RollMode = "rollFirst" | "how" | "last";
const rollModeOf = (s: NonNullable<Doc<"games">["show"]>): RollMode => (rollFirst(s) ? "rollFirst" : howAfterRoll(s) ? "how" : "last");

/** The roll call's turns, and when what follows it, "check your phones" and Round 1 come, for a roll call at rollAt. */
async function rollPlan(ctx: QueryCtx, game: Doc<"games">, rollAt: number, order: Id<"players">[], cf: CaseFile | null, mode: RollMode) {
  const guests = inOrder(await rollGuests(ctx, game, cf), order);
  const slots = slotsFor(guests, await clipSeconds(ctx, game._id));
  const secs = showSecs(game);
  const after = mode === "rollFirst" ? howMsOf(game) + introMs(secs) : mode === "how" ? howMsOf(game) : 0;
  return { slots, ...rollLayout(rollAt, slots, secs, after, mode === "rollFirst" ? "welcome" : "rollLocked") };
}

/** Moves the end of the show, and Round 1's clock with it. */
async function setShowEnd(ctx: MutationCtx, game: Doc<"games">, end: number, patch: Partial<Doc<"games">>) {
  const timed = game.pacing.mode === "timer" && !game.paused;
  const roundEndsAt = timed ? end + game.pacing.roundMinutes * 60_000 : game.roundEndsAt;
  await ctx.db.patch(game._id, { ...patch, introEndsAt: end, roundEndsAt });
  if (timed) await scheduleTimer(ctx, game._id, 1, roundEndsAt);
}

const inShow = (game: Doc<"games">, now: number) =>
  !!game.show && isPlaying(game) && game.round === 1 && !!game.introEndsAt && game.introEndsAt > now;

/** When the roll call begins, its turns are fixed from the recorded voices (or reading speed for any still missing). */
async function freezeRoll(ctx: MutationCtx, game: Doc<"games">) {
  const s = game.show;
  if (!s || s.roll || !inShow(game, Date.now())) return;
  const mode = rollModeOf(s);
  const plan = await rollPlan(ctx, game, s.rollAt, s.order, await caseFor(ctx, game), mode);
  const moved = mode === "rollFirst" ? { howAt: plan.howAt, introAt: plan.howAt + howMsOf(game) } : mode === "how" ? { howAt: plan.howAt } : {};
  await setShowEnd(ctx, game, plan.end, { show: { ...s, roll: plan.slots, phonesAt: plan.phonesAt, ...moved } });
  if (plan.phonesAt <= Date.now()) await ctx.db.patch(game._id, { rolesOut: true });
  else await ctx.scheduler.runAt(plan.phonesAt, internal.game.releaseRoles, { gameId: game._id });
}

export const freezeShowRoll = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (game) await freezeRoll(ctx, game);
  },
});

/** "Check your phones": the roles appear. */
export const releaseRoles = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.rolesOut || !game.show?.phonesAt || game.show.phonesAt > Date.now() + 500) return;
    await ctx.db.patch(game._id, { rolesOut: true });
  },
});

/** Host: skip to the next part of the show (in this game's order), then check your phones, then Round 1. */
export const skipShow = mutation({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    const now = Date.now();
    const s = game.show;
    if (!s || !inShow(game, now)) return { ok: true };
    const parts = showParts(s, game.startedAt ?? now);
    const i = parts.reduce((k, x, j) => (now >= x.at ? j : k), 0);
    const next = parts[i + 1];
    if (next && next.part !== "roll" && howAfterRoll(s)) {
      // Oct 31 orders (the roll call before How to play): pull the next part, and everything after it, forward to now.
      if (!s.roll) await freezeRoll(ctx, game);
      const g = (await ctx.db.get(game._id))!;
      const sh = g.show!;
      const from = next.part === "how" ? sh.howAt : sh.introAt!;
      const d = from - now;
      const shift = (t: number) => (t >= from ? t - d : t);
      const phonesAt = sh.phonesAt! - d;
      await setShowEnd(ctx, g, g.introEndsAt! - d, { show: { ...sh, howAt: shift(sh.howAt), introAt: shift(sh.introAt!), phonesAt } });
      await ctx.scheduler.runAt(phonesAt, internal.game.releaseRoles, { gameId: game._id });
    } else if (next && next.part !== "roll") {
      // Pull the next part (and everything after it) forward to now.
      const d = next.at - now;
      const field = next.part === "intro" ? "introAt" : "howAt";
      const show = { ...s, [field]: now, rollAt: s.rollAt - d };
      await setShowEnd(ctx, game, game.introEndsAt! - d, { show });
      await ctx.scheduler.runAt(show.rollAt, internal.game.freezeShowRoll, { gameId: game._id });
    } else if (next) {
      await ctx.db.patch(game._id, { show: { ...s, rollAt: now } });
      await freezeRoll(ctx, (await ctx.db.get(game._id))!);
    } else if (!s.phonesAt || now < s.phonesAt) {
      if (!s.roll) await freezeRoll(ctx, game);
      const g = (await ctx.db.get(game._id))!;
      const d = g.show!.phonesAt! - now;
      await setShowEnd(ctx, g, g.introEndsAt! - d, { show: { ...g.show!, phonesAt: now }, rolesOut: true });
    } else {
      await setShowEnd(ctx, game, now, { rolesOut: true });
    }
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
    await ctx.db.patch(game._id, { introEndsAt: Date.now(), roundEndsAt: endsAt, rolesOut: true });
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
    const now = Date.now();
    const vt = voteOf(game);
    if (paused) {
      const left = game.roundEndsAt ? Math.max(0, game.roundEndsAt - now) : undefined;
      // store the remaining time in roundEndsAt as a negative number while paused
      // F8 (Oct 17): an open vote keeps its time left too, and a verdict on screen waits.
      const vote = vt ? { ...vt, left: vt.closedAt ? Math.max(0, (vt.nextAt ?? now) - now) : vt.endsAt ? Math.max(0, vt.endsAt - now) : undefined } : undefined;
      await ctx.db.patch(game._id, { paused: true, pausedAt: now, roundEndsAt: left !== undefined ? -left : undefined, ...(vote ? { vote } : {}) });
    } else {
      const endsAt = game.roundEndsAt !== undefined && game.roundEndsAt <= 0 ? now - game.roundEndsAt : undefined;
      await ctx.db.patch(game._id, { paused: false, resumedAt: now, roundEndsAt: endsAt });
      if (vt) {
        const { left, ...rest } = vt;
        if (!vt.closedAt) {
          // An untimed vote (endsAt 0) stays untimed.
          const endsAt = !vt.endsAt ? 0 : left !== undefined ? now + left : Math.max(now + 1000, vt.endsAt);
          await ctx.db.patch(game._id, { vote: { ...rest, endsAt } });
          if (endsAt) await ctx.scheduler.runAt(endsAt, internal.game.voteTick, { gameId: game._id, at: vt.at });
        } else {
          const nextAt = left !== undefined ? now + left : Math.max(now + 1000, vt.nextAt ?? now);
          await ctx.db.patch(game._id, { vote: { ...rest, nextAt } });
          await ctx.scheduler.runAt(nextAt, internal.game.afterVote, { gameId: game._id, at: vt.at });
        }
      }
      await scheduleTimer(ctx, game._id, game.round ?? 1, endsAt);
      await maybeAdvanceOnReady(ctx, (await ctx.db.get(game._id))!);
      await maybeRevealOnAccusations(ctx, (await ctx.db.get(game._id))!);
    }
    return { ok: true };
  },
});

/** Oct 20: how long the verdict stays up before the awards (Best Dressed is voted in the lobby now). */
const AWARDS_AFTER_VERDICT_MS = 15_000;

/** The awards start: the TV's awards card, and the winners' lines that weren't known before now (Oct 17). */
async function startAwards(ctx: MutationCtx, game: Doc<"games">) {
  await ctx.db.patch(game._id, { status: "done", doneAt: Date.now(), tvShowAll: false });
  const cf = await caseFor(ctx, game);
  if (!cf) return;
  const kinds: Record<string, string> = { detective: "bestDetective", prime: "primeSuspect", dressed: "bestDressed", gotAway: "gotAway" };
  const awards = await awardsOf(ctx, game, cf, await playersOf(ctx, game._id), await scoreGame(ctx, game, cf));
  const ids = awards.flatMap((a) => a.winners.map((w) => `${kinds[a.key]}:${w.id}`));
  if (ids.length) await scheduleRecording(ctx, game._id, "later", ids);
}

export const autoFinish = internalMutation({
  args: { gameId: v.id("games"), revealAt: v.number() },
  handler: async (ctx, { gameId, revealAt }) => {
    const game = await ctx.db.get(gameId);
    if (!game || game.status !== "reveal" || game.revealAt !== revealAt) return;
    await startAwards(ctx, game);
  },
});

/** Host: close the voting and show the awards. */
export const finish = mutation({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (game.status !== "reveal") throw new ConvexError("Finish after the reveal.");
    await startAwards(ctx, game);
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
    const awards = game.status === "done" ? (await awardsOf(ctx, game, cf, await playersOf(ctx, game._id), scored)).map((a) => ({ key: a.key, title: a.title, names: a.winners.map((w) => w.name), sub: a.sub })) : null;
    const exhibit = input.exhibits.find((e) => e.id === cf.solution.exhibitId);
    return {
      killer: name(cf.solution.killerId),
      accomplice: cf.solution.accompliceId ? name(cf.solution.accompliceId) : null,
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
  const tone = scriptOf(game);
  const n = narratorOf(game);
  const beforeStart = game.status === "registration" || game.status === "lobby";
  // The roll call (v2) plays during the show, after How to play: each guest's turn, fixed once it begins.
  let rollCall = null;
  if (game.show && cf && game.status === "playing" && game.round === 1) {
    const guests = inOrder(await rollGuests(ctx, game, cf), game.show.order);
    const items = await Promise.all(
      guests.map(async (g) => ({
        id: g.player._id,
        charName: g.player.charName,
        realName: g.player.realName,
        cast: g.cast,
        photoUrl: g.player.photoId ? await ctx.storage.getUrl(g.player.photoId) : null,
        figure: g.player.figure ?? null,
        line: g.wanted.caption,
        clip: await clip(g.wanted),
      })),
    );
    const secondsOf = (w: Wanted) => {
      const row = byPurpose.get(w.purpose);
      return clipMatches(row, w) && row!.seconds ? row!.seconds : null;
    };
    rollCall = { at: game.show.rollAt, items, slots: game.show.roll ?? slotsFor(guests, secondsOf), frozen: !!game.show.roll };
  }
  if (beforeStart || !input)
    return { voice: voiceOf(n), rollCall, body: null, rooms: {} as Record<string, Clip>, reveal: null, winners: null, roasts: null as Record<string, Clip[]> | null, caught: null as Clip, kept: null as Clip, lastLockIn: null as Clip, heckles: [], verdict: null as Clip };
  const wanted = startWanted(tone, n, {
    players: all.filter((p) => p.inGame).map(guestNames),
    exhibits: input.exhibits.map((e) => ({ id: e.id, letter: e.letter, name: e.name })),
    rooms: game.rooms,
    bodyRoomKey: game.bodyRoomKey,
    victim: game.victim ?? null,
    roomOrder: game.roomOrder,
    search: game.search ?? "all",
    seed: game.slug,
    accomplice: !!game.hasAccomplice,
    picks: game.lines?.picks,
  });
  const get = (purpose: string) => clip(wanted.find((w) => w.purpose === purpose));
  // Oct 17: the insults on real names, recorded when their moment comes (voiceLines.laterWanted).
  const lateLines = laterWanted(tone, n, { players: all.filter((p) => p.inGame).map(guestNames), seed: game.slug });
  const later = (purpose: string) => clip(lateLines.find((w) => w.purpose === purpose));
  const rooms: Record<string, Clip> = {};
  for (const r of [1, 2, 3]) if (r <= (game.round ?? 0)) rooms[r] = await get(`rooms:${r}`);
  let reveal = null;
  let winners: Record<string, Clip[]> | null = null;
  if ((game.status === "reveal" || game.status === "done") && cf) {
    reveal = {
      killer: await get(`killer:${cf.solution.killerId}`),
      exhibit: await get(`exhibit:${cf.solution.exhibitId}`),
      room: await get(`room:${cf.solution.roomKey}`),
      accomplice: cf.solution.accompliceId ? await get(`accomplice:${cf.solution.accompliceId}`) : null,
    };
  }
  let roasts: Record<string, Clip[]> | null = null;
  if (game.status === "done" && cf) {
    // Each award's winners' names, in the TV's order (a shared award says every name), then their lines (Oct 17).
    winners = {} as Record<string, Clip[]>;
    roasts = {} as Record<string, Clip[]>;
    const kinds: Record<string, string> = { detective: "bestDetective", prime: "primeSuspect", dressed: "bestDressed", gotAway: "gotAway" };
    for (const a of await awardsOf(ctx, game, cf, all, await scoreGame(ctx, game, cf))) {
      winners[a.key] = (await Promise.all(a.winners.map((w) => get(`winner:${w.id}`)))).filter((c): c is NonNullable<Clip> => !!c);
      roasts[a.key] = (await Promise.all(a.winners.map((w) => later(`${kinds[a.key]}:${w.id}`)))).filter((c): c is NonNullable<Clip> => !!c);
    }
  }
  // Oct 17: the killer caught at the verdict.
  let caught: Clip = null;
  if ((game.status === "reveal" || game.status === "done") && cf && !(await scoreGame(ctx, game, cf)).killerWins) caught = await later(`caught:${cf.solution.killerId}`);
  // The release vote kept the jailbird in.
  const vt0 = voteOf(game);
  const kept = vt0?.closedAt && vt0.kind === "release" && vt0.outcome === "nobody" && vt0.candidates[0] ? await later(`kept:${vt0.candidates[0]}`) : null;
  // The last guest still to lock in.
  let lastLockIn: Clip = null;
  if (isPlaying(game) && (game.round ?? 0) >= 4) {
    const done = new Set<string>((await ctx.db.query("accusations").withIndex("by_game", (q) => q.eq("gameId", game._id)).collect()).map((a) => a.playerId));
    const left = freeOf(all).filter((p) => !done.has(p._id));
    if (left.length === 1) lastLockIn = await later(`lastLockIn:${left[0]._id}`);
  }
  // The night's heckles for the lulls, the ones that are recorded (convex/heckles.ts).
  const heckles = [];
  for (const h of await heckleWanted(ctx, game)) {
    const c = await clip(h);
    if (c) heckles.push({ id: h.purpose, figure: h.line.figure, guest: !!h.line.target, gag: h.line.gag, clip: c });
  }
  // The vote's verdict, once it has closed on someone: "Velma is going to jail."
  const vt = voteOf(game);
  const verdict = vt?.closedAt && vt.targetId ? await get(`${vt.kind === "jail" ? "jailed" : "released"}:${vt.targetId}`) : null;
  return { voice: voiceOf(n), rollCall, body: await get("body"), rooms, reveal, winners, roasts, caught, kept, lastLockIn, heckles, verdict };
}

/** The night's weapons, by name (never by who brought them). */
async function weaponsInPlay(ctx: QueryCtx, game: Doc<"games">) {
  return (await gameWeapons(ctx, game))
    .filter((w) => w.key)
    .map((w) => ({ key: w.key!, name: w.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
    const shown = started ? playingOf(all) : all;
    const free = shown.filter((p) => !p.jailed);
    const cf = started ? await caseFor(ctx, game) : null;
    const input = started ? await caseInput(ctx, game) : null;
    const revealed = game.status === "reveal" || game.status === "done";
    let results = null;
    if (revealed && cf && input) {
      const scored = await scoreGame(ctx, game, cf);
      const name = (id: string) => all.find((p) => p._id === id)?.charName ?? "";
      const killer = all.find((p) => p._id === cf.solution.killerId);
      const exhibit = input.exhibits.find((e) => e.id === cf.solution.exhibitId);
      const awards = game.status === "done" ? await awardsOf(ctx, game, cf, all, scored) : null;
      const keyOf = await weaponKeys(ctx, game);
      const accomplice = cf.solution.accompliceId ? all.find((p) => p._id === cf.solution.accompliceId) : undefined;
      results = {
        killer: killer?.charName ?? "",
        killerPhoto: killer ? await photo(killer) : null,
        killerFigure: killer?.figure ?? null,
        // v2: the accomplice (killer + accomplice games), and how many of the detectives guessed them.
        accomplice: accomplice ? { name: accomplice.charName, photo: await photo(accomplice), figure: accomplice.figure ?? null } : null,
        namedAccomplice: scored.namedAccomplice,
        guessers: scored.guessers,
        exhibit: exhibit ? { letter: exhibit.letter, name: exhibit.name, key: keyOf.get(exhibit.id) ?? null } : null,
        room: label(cf.solution.roomKey),
        killerWins: scored.killerWins,
        named: scored.named,
        rightWeapon: scored.rightWeapon,
        rightRoom: scored.rightRoom,
        accusers: scored.accusers,
        // The most votes on each part (null: still tied), and which parts went to a runoff (Oct 21).
        top: {
          who: scored.parts.who.top.length === 1 ? name(scored.parts.who.top[0]) : null,
          weapon: scored.parts.weapon.top.length === 1 ? input.exhibits.find((e) => e.id === scored.parts.weapon.top[0])?.name ?? null : null,
          room: scored.parts.room.top.length === 1 ? label(scored.parts.room.top[0]) : null,
          runoff: !!game.runoff,
        },
        aces: scored.scores.filter((s) => s.ace).map((s) => name(s.playerId)),
        // I1 (Oct 17): who named whom at the lock-in, most named first (public once the reveal starts).
        lockins: await lockinTally(ctx, game, all),
        // Oct 21: after a runoff on who, who named whom in the runoff.
        runoffTally: game.runoff?.who ? await runoffTally(ctx, game, all) : null,
        awards,
        // Phase 4: who the killer framed with the plant, or no plant tonight (null: an older game without late tips).
        plant: plantReveal(game, all),
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
        // Oct 31: Round 3's twist: waiting (every card not found yet), the call back to the Lounge, the drop.
        twistWait: await twistPending(ctx, game),
        // Oct 31: who died tonight (null: the Don, in games from before).
        victim: game.victim ?? null,
        twistCallAt: game.twistCallAt ?? null,
        twistAt: game.twistAt ?? null,
        pausedAt: game.pausedAt ?? null,
        resumedAt: game.resumedAt ?? null,
        doneAt: game.doneAt ?? null,
        rulesAt: started ? null : game.rulesAt ?? null,
        // v2: the show between Start and Round 1 (convex/show.ts). phonesAt is set once the roll call begins.
        show: game.show ? { howAt: game.show.howAt, introAt: game.show.introAt ?? null, rollAt: game.show.rollAt, phonesAt: game.show.phonesAt ?? null } : null,
        tone: game.tone ?? "classic",
        // The script the narrator reads (Sailor mode reads its own), and the versions this game picked at Start.
        script: scriptOf(game),
        lines: game.lines ? { picks: game.lines.picks } : null,
        narrator: narratorOf(game),
        levels: levelsOf(game),
        search: game.search ?? "all",
        // Oct 17 (D5): no jail vote (and no jail card in How to play) with fewer than 5 guests in the game.
        jailVote: hasJailVote(started ? playingOf(all).length : all.filter((p) => p.checkedIn).length),
        // v2: a killer + accomplice game (fixed at Start): How to play adds the accomplice, the reveal names them.
        accomplice: started && !!game.hasAccomplice,
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
            short: shortName(p),
            photoUrl: await photo(p),
            figure: p.figure ?? null,
            here: p.checkedIn,
            ready: !!round && p.readyRound === round,
            accused: accused.has(p._id),
            jailed: !!p.jailed,
          })),
      ),
      counts: {
        registered: all.length,
        here: all.filter((p) => p.checkedIn).length,
        // v2: the free guests search, vote and lock in; jailed ones sit it out.
        playing: free.length,
        jailed: shown.length - free.length,
        ready: started ? free.filter((p) => p.readyRound === round).length : 0,
        accused: free.filter((p) => accused.has(p._id)).length,
        // Oct 17: when the latest lock-in came in (the last guest's nudge waits a little after it).
        lastAccusedAt: accs.length ? Math.max(...accs.map((a) => a.at)) : null,
      },
      vote: started ? await publicVote(ctx, game, all) : null,
      exhibits: input ? input.exhibits.map((e) => e.letter) : [],
      // The weapons in play are public, like Clue (drawn by the game since Oct 16).
      weapons: started ? await weaponsInPlay(ctx, game) : [],
      evidence: cf
        ? cf.clues
            .filter((c) => c.channel === "tv" && c.round <= Math.min(round, 3) && (c.kind !== "twist" || twistOut(game)))
            .map((c) => ({ round: c.round, text: c.text, twist: c.kind === "twist" }))
        : [],
      results,
      // Phase 4 (Oct 21): who has the heat (3 or more tags) and since when, for the strip and its sound; the late tips.
      heat: started
        ? heatNow(game, all, cf).map((h) => {
            const p = all.find((x) => x._id === h.id);
            return { id: h.id, name: p ? shortName(p) : "", figure: p?.figure ?? null, since: h.since };
          })
        : [],
      lateTips: started ? publicTips(game) : [],
      lateTipsAt: game.lateTipsAt ?? null,
      runoff: started && game.runoff ? await runoffPublic(ctx, game, all, input) : null,
      reveal: game.revealPlan ?? revealTimes(started && !!game.hasAccomplice, game.tone ?? "classic"),
      voice: await tvVoice(ctx, game, all, input, cf),
      map: await tvMap(ctx, game),
      // A cast game's TV dresses How to play, the accomplice card, the awards and empty line-ups in the cast's
      // drawings (this game's guests first) instead of the old ones.
      // Oct 31: tonight's victim never walks across the TV.
      standIns: standIns(all.filter((p) => p.figure).sort((a, b) => a.createdAt - b.createdAt).map((p) => p.figure!)).filter((k) => k !== game.victim?.key),
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
    rooms: game.rooms.map((r) => ({ key: r.key, label: r.label, note: r.houseName, opensIn: started ? markerOpensIn(game, r.key) : 1 })),
    markers: markers
      .sort((a, b) => a.number - b.number)
      .map((m) => ({ number: m.number, room: m.roomKey, foundAt: found.get(m.number) ?? null })),
  };
}

/**
 * The TV stage (on the host screen) checks in every 20 seconds. Older games get their room code here. The check-in
 * fields (tvSeenAt, tvSound, tvMedia) were for the separate TV window's status on the host laptop; nothing shows them now.
 */
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

/** The test guests a game can still take: the free cast members, by name and drawing, each with a made-up profile
 *  of the same sex (reused when there are more of them than profiles). */
export function fakeGuestsFor(takenFigs: Set<string>, takenNames: Set<string>, rng: () => number) {
  const people = shuffle(rng, FAKE_GUESTS);
  const used: Record<"m" | "f", number> = { m: 0, f: 0 };
  return shuffle(rng, fakeGuestPool())
    .map((k) => castMember(k)!)
    .filter((m) => !takenFigs.has(m.key) && !takenNames.has(charKeyOf(castName(m))))
    .map((m) => {
      const same = people.filter((g) => g.sex === m.sex);
      const g = same[used[m.sex]++ % same.length];
      return { ...g, name: castName(m), first: m.name, figure: m.key };
    });
}

/** Fills a TEST game with fake guests, checks them in, and logs markers. */
export const seedFakeCast = internalMutation({
  args: { slug: v.string(), guests: v.number(), markers: v.number(), seed: v.optional(v.number()), checkIn: v.optional(v.boolean()), longNames: v.optional(v.boolean()) },
  handler: async (ctx, { slug, guests, markers, seed, checkIn, longNames }) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!game) throw new ConvexError("No such game.");
    if (!game.isTest) throw new ConvexError("Fake guests only go in test games.");
    const rng = seed ? seeded(seed) : secure();
    const now = Date.now();
    const taken = new Set((await playersOf(ctx, game._id)).map((p) => p.charKey));
    for (const g of fakeGuestsFor(await takenFigures(ctx, game._id), taken, rng).slice(0, guests)) {
      // Screen checks: the longest nickname and last name sign-up allows, so nothing on the TV gets cut off.
      const own = longNames ? { nickname: "The Butcher of Bleecker", lastName: "Montgomery-Hill" } : {};
      const m = castMember(g.figure)!;
      const name = longNames ? castName(m, own) : g.name;
      const playerId = await ctx.db.insert("players", {
        figure: g.figure,
        gameId: game._id,
        token: randomCode(10),
        // "Tommy (test guest)": roasts use the first word of the real name, so it reads "Tommy".
        realName: `${g.first} (test guest)`,
        // Oct 18: their "real" first name for the insults.
        firstName: g.first,
        charName: name,
        charKey: charKeyOf(name),
        ...own,
        // Oct 16: sign-up no longer asks who you are or for a signature item, so test guests don't have them either.
        who: "",
        signature: "",
        killerOk: rng() < 0.8,
        checkedIn: false,
        createdAt: now,
        updatedAt: now,
      });
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
      revealPlan: undefined,
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
      show: undefined,
      rolesOut: undefined,
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
    const fakes = (await playersOf(ctx, game._id)).filter((p) => p.inGame && (p.realName.endsWith("(test guest)") || p.realName.startsWith("Test ")));
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
