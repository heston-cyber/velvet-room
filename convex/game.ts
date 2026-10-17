import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { ACCOMPLICE_ON, buildCase, checkInput, MIN_ACCOMPLICE, openRound, openRoomsIn, scriptFor } from "./engine/build";
import { secure, seeded, shuffle } from "./engine/rng";
import { cardPlan } from "./engine/setup";
import { FAKE_GUESTS, LETTERS } from "./engine/fake";
import type { CaseFile, CaseInput } from "./engine/types";
import { charKeyOf, randomCode, registrationIsOpen, requireHost, requireTv } from "./lib";
import { seal } from "./seal";
import { caseFor } from "./caseFile";
import { ensureAllCards, markerForCode } from "./cards";
import { ACCUSE_MAX_MINUTES, LOCKED_UP_MS, MAX_CARDS, hasJailVote, revealTimes, VOTE, voteAfterRound } from "./shared";
import { SHOW, cueSecs, howCues, howLayout, introLayout, revealLayout, rollLayout, showParts } from "./show";
import { inOrder, rollGuests, slotsFor } from "./rollCall";
import { heckleWanted } from "./heckles";
import { customCounts, pickLines, type CueKey } from "./narration";
import { scheduleRecording } from "./voice";
import { ensureRoomCode } from "./join";
import { castMember, castName, fakeGuestPool, shortName, standIns, takenFigures } from "./figures";
import { MIN_WEAPONS, drawWeapons, gameWeapons, recommendedWeapons } from "./weapons";
import { clipMatches, levelsOf, narratorOf, scriptOf, startWanted, variantOf, voiceOf, type GameLines, type Wanted } from "./voiceLines";

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

async function playersOf(ctx: QueryCtx, gameId: Id<"games">) {
  return await ctx.db
    .query("players")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
}

/** Builds the engine's input from who actually showed up. */
async function caseInput(ctx: QueryCtx, game: Doc<"games">): Promise<CaseInput> {
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

const isPlaying = (g: Doc<"games">) => g.status === "playing";

/** Guests who are playing: everyone in the draw. */
const playingOf = (players: Doc<"players">[]) => players.filter((p) => p.inGame);

/** A marker's room opens in this round (Round 1 unless searching in waves). */
function markerOpensIn(game: Doc<"games">, roomKey: string) {
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
async function advance(ctx: MutationCtx, game: Doc<"games">) {
  if (!isPlaying(game)) return;
  const round = game.round ?? 1;
  if (round >= 4) return nextRound(ctx, game);
  const v = voteOf(game);
  if (!v) {
    const playing = playingOf(await playersOf(ctx, game._id));
    const kind = voteAfterRound(round, playing.some((p) => p.jailed), playing.length);
    // Oct 17 (D10): a guest the evidence has already cleared walks out of jail without a vote.
    if (kind === "release") {
      const cf = await caseFor(ctx, game);
      const cleared = cf ? playing.find((p) => p.jailed && clearedBy(cf, p._id, round)) : undefined;
      if (cleared) return autoRelease(ctx, game, cleared._id);
    }
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
  return revealLayout(base, showSecs(game), {
    killer: secsOf(`killer:${sol.killerId}`),
    exhibit: secsOf(`exhibit:${sol.exhibitId}`),
    room: secsOf(`room:${sol.roomKey}`),
    accomplice: sol.accompliceId ? secsOf(`accomplice:${sol.accompliceId}`) : null,
  });
}

/** Round 1 -> 2 -> 3 -> the lock-in -> the reveal. */
async function nextRound(ctx: MutationCtx, game: Doc<"games">) {
  if (!isPlaying(game)) return;
  const round = game.round ?? 1;
  if (round >= 4) {
    await ctx.db.patch(game._id, { status: "reveal", roundEndsAt: undefined, paused: false, tvShowAll: false, revealAt: Date.now(), revealPlan: await revealPlanFor(ctx, game) });
    return;
  }
  const next = round + 1;
  const timed = game.pacing.mode === "timer";
  // F12 (Oct 17): the lock-in always runs on a clock (5 minutes at most), even when guests tap Ready, so one dead
  // phone can't hold up the reveal.
  const minutes = next === 4 ? (timed ? Math.min(game.pacing.roundMinutes, ACCUSE_MAX_MINUTES) : ACCUSE_MAX_MINUTES) : game.pacing.roundMinutes;
  const endsAt = timed || next === 4 ? Date.now() + minutes * 60_000 : undefined;
  // Skipping ahead also cuts the intro short.
  await ctx.db.patch(game._id, { round: next, roundStartedAt: Date.now(), roundEndsAt: endsAt, paused: false, introEndsAt: Math.min(game.introEndsAt ?? 0, Date.now()), rolesOut: true });
  await scheduleTimer(ctx, game._id, next, endsAt);
}

// ---------- votes (v2): jail and release, after every round ----------

/** Guests in the game who aren't in jail: they search, vote and lock in. */
const freeOf = (players: Doc<"players">[]) => playingOf(players).filter((p) => !p.jailed);

/** This round's vote, open or showing its verdict. */
const voteOf = (game: Doc<"games">) => (game.vote && game.vote.round === game.round ? game.vote : null);

async function ballotsOf(ctx: QueryCtx, gameId: Id<"games">, voteAt: number) {
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
  const endsAt = at + VOTE.ms;
  const vote = { kind, round: game.round ?? 1, at, endsAt, voters: free.map((p) => p._id), candidates: candidates.map((p) => p._id) };
  await ctx.db.patch(game._id, { vote, roundEndsAt: undefined, paused: false, ...(kind === "jail" ? { jailVoteAt: at } : {}) });
  // Nobody to vote, or nobody to vote for: it closes straight away with nobody.
  if (!vote.voters.length || !vote.candidates.length) return closeVote(ctx, (await ctx.db.get(game._id))!);
  await ctx.scheduler.runAt(endsAt, internal.game.voteTick, { gameId: game._id, at });
}

/** Counts the ballots. More than half of the voters on one guest jails (or frees) them; anything less is nobody. */
async function closeVote(ctx: MutationCtx, game: Doc<"games">) {
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

/** Whether the evidence released so far (every card and TV clue up to this round) rules this guest out. */
const clearedBy = (cf: CaseFile, playerId: Id<"players">, round: number) =>
  cf.clues.some((c) => c.round <= round && c.elim.suspects.includes(playerId));

/**
 * Oct 17 (D10): the guest in jail is already cleared by the evidence, so there's no release vote. A vote that is
 * closed as it opens, released, with nobody voting: the TV shows the Release card and "The evidence clears them".
 */
async function autoRelease(ctx: MutationCtx, game: Doc<"games">, target: Id<"players">) {
  const now = Date.now();
  await ctx.db.patch(target, { jailed: false });
  const row = (await ctx.db
    .query("clips")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect()).find((r) => r.purpose === `released:${target}` && r.seconds);
  const n = narratorOf(game);
  const said = cueSecs(voiceOf(n), scriptOf(game), n.host, "releaseCleared", variantOf(game, "releaseCleared", `${game.round}`));
  const nextAt = Math.max(now + VOTE.autoNextMs, now + VOTE.autoVerdictMs + (said + (row?.seconds ?? 3)) * 1000 + 2000);
  const vote = { kind: "release" as const, round: game.round ?? 3, at: now, endsAt: now, voters: [], candidates: [target], closedAt: now, outcome: "released" as const, targetId: target, nextAt, auto: true };
  await ctx.db.patch(game._id, { vote, roundEndsAt: undefined, paused: false });
  await ctx.scheduler.runAt(nextAt, internal.game.afterVote, { gameId: game._id, at: now });
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
    if (game.paused || game.vote.endsAt > Date.now() + 500) return;
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
    if (!vt.voters.includes(player._id)) throw new ConvexError(player.jailed ? "You're in jail, so you can't vote. You can still bribe." : "You're not in this vote.");
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

/** Ready votes: once most guests in the game are ready, the next round starts. */
async function maybeAdvanceOnReady(ctx: MutationCtx, game: Doc<"games">) {
  if (game.pacing.mode !== "ready" || game.paused || !game.round || game.round > 3 || voteOf(game)) return;
  const inGame = freeOf(await playersOf(ctx, game._id));
  const ready = inGame.filter((p) => p.readyRound === game.round).length;
  if (inGame.length && ready > inGame.length / 2) await advance(ctx, game);
}

/** Accusations: once everyone in the game has accused, the reveal starts. */
async function maybeRevealOnAccusations(ctx: MutationCtx, game: Doc<"games">) {
  if (!isPlaying(game) || (game.round ?? 0) < 4 || game.paused) return;
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
  const scores = accs.map((a) => {
    const score = Number(a.suspectId === sol.killerId) + Number(a.exhibitId === sol.exhibitId) + Number(a.roomKey === sol.roomKey);
    const gotAccomplice = !!sol.accompliceId && a.accompliceId === sol.accompliceId;
    return { playerId: a.playerId, score, ace: score === 3, gotKiller: a.suspectId === sol.killerId, gotAccomplice, at: a.at };
  });
  // v2: every lock-in counts, the killer's too (their last sabotage).
  const n = scores.length;
  const named = scores.filter((s) => s.gotKiller).length;
  const byId = new Map(accs.map((a) => [a.playerId as string, a]));
  const rightWeapon = scores.filter((s) => byId.get(s.playerId)?.exhibitId === sol.exhibitId).length;
  const rightRoom = scores.filter((s) => byId.get(s.playerId)?.roomKey === sol.roomKey).length;
  // The group wins only if more than half of the lock-ins have the killer, more than half the weapon, and more than
  // half the room (Heston: "No ties"; Oct 17: "Keep it as is"). Otherwise the killer wins.
  const groupWins = n > 0 && named > n / 2 && rightWeapon > n / 2 && rightRoom > n / 2;
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
  for (const a of accs) pointAt(a.suspectId);
  for (const b of jailBallots) pointAt(b.targetId);
  const most = Math.max(0, ...blame.values());
  const name = (id: string) => players.find((p) => p._id === id)?.charName ?? "";
  return {
    scores,
    killerWins: !groupWins,
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

/** The awards, in the order the TV gives them. CUE: the narrator's line before the names. */
export const AWARDS = {
  detective: { title: "Best Detective", cue: "awardDetective" },
  prime: { title: "Prime Suspect", cue: "awardPrimeSuspect" },
  dressed: { title: "Best Dressed", cue: "awardDressed" },
  liar: { title: "Best Liar", cue: "awardLiar" },
  gotAway: { title: "Got Away With It", cue: "awardGotAway" },
} as const satisfies Record<string, { title: string; cue: CueKey }>;
export type AwardKey = keyof typeof AWARDS;

/**
 * The night's awards (Oct 17): only the ones someone won (Heston: "don't show awards at the end if no one won them").
 * Best Dressed and Best Liar are voted on the phones, for guests in the game only; Best Liar is among the innocents
 * (D6), since the killer gets "Got Away With It" when they walk. A tie is shared.
 */
async function awardsOf(ctx: QueryCtx, game: Doc<"games">, cf: CaseFile, all: Doc<"players">[], scored: Scored) {
  const votes = await ctx.db
    .query("votes")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  const sol = cf.solution;
  const p = (id: string) => all.find((x) => x._id === id);
  const inGame = new Set<string>(playingOf(all).map((x) => x._id));
  const who = (ids: string[]) => ids.filter((id) => p(id)).map((id) => ({ id: id as Id<"players">, name: p(id)!.charName, figure: p(id)!.figure ?? null }));
  const tally = (key: "dressed" | "liar", ok: (id: string) => boolean) => {
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
  const liar = tally("liar", (id) => inGame.has(id) && id !== sol.killerId && id !== sol.accompliceId);
  add("liar", liar.ids, plural(liar.votes, "vote"));
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
  args: { token: v.string(), suspectId: v.string(), exhibitId: v.string(), roomKey: v.string(), accompliceId: v.optional(v.string()) },
  handler: async (ctx, { token, suspectId, exhibitId, roomKey, accompliceId }) => {
    const { player, game } = await requirePlayer(ctx, token);
    if (!isPlaying(game) || (game.round ?? 0) < 4) throw new ConvexError("The lock-in opens after the last round.");
    if (!player.inGame) throw new ConvexError("Only guests in the game can lock in.");
    if (player.jailed) throw new ConvexError("You're in jail, so you can't lock in.");
    if (suspectId === player._id) throw new ConvexError("You can't accuse yourself. Nice try.");
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
    await maybeRevealOnAccusations(ctx, game);
    return { ok: true };
  },
});

export const vote = mutation({
  args: { token: v.string(), dressed: v.optional(v.id("players")), liar: v.optional(v.id("players")) },
  handler: async (ctx, { token, dressed, liar }) => {
    const { player, game } = await requirePlayer(ctx, token);
    if (game.status !== "reveal") throw new ConvexError("Voting opens after the reveal.");
    const sol = (await caseFor(ctx, game))?.solution;
    for (const pick of [dressed, liar]) {
      if (!pick) continue;
      if (pick === player._id) throw new ConvexError("You can't vote for yourself.");
      const p = await ctx.db.get(pick);
      // Oct 17: only guests who played this game can win its awards.
      if (!p || p.gameId !== game._id || !p.inGame) throw new ConvexError("Pick someone who played tonight.");
    }
    // Best Liar is among the innocents (D6): the killer gets "Got Away With It" when they walk.
    if (liar && sol && (liar === sol.killerId || liar === sol.accompliceId)) throw new ConvexError("Best Liar is for the innocents. The killer has their own award.");
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
    // v2: roles reach the phones at "check your phones", after the roll call.
    const rolesOut = !game.show || !!game.rolesOut;
    const brief = rolesOut ? cf?.briefings.find((b) => b.playerId === player._id) : undefined;
    const tip = cf?.tips.find((t) => t.playerId === player._id);
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
        // Oct 17 (D5): games with fewer than 5 guests in them have no jail vote.
        jailVote: started ? hasJailVote(inGame.length) : hasJailVote(all.length),
        // Rooms open for searching right now (all of them unless searching in waves).
        openRooms: started && game.roomOrder ? openRoomsIn(round, game.roomOrder, game.search).map(roomLabel) : [],
        wifi: game.wifi?.name ? game.wifi : null,
        introEndsAt: game.introEndsAt ?? null,
        rolesOut,
        revealAt: game.revealAt ?? null,
        // v2: a killer + accomplice game (fixed at Start), and when the TV's reveal reaches the verdict.
        hasAccomplice: started && !!game.hasAccomplice,
        verdictMs: (game.revealPlan ?? revealTimes(started && !!game.hasAccomplice, game.tone ?? "classic")).verdict,
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
        jailed: !!player.jailed,
        // Jailed when the lock-in opened (they sat it out), for the reveal (F15).
        satOut: !!player.jailed && (game.round ?? 0) >= 4,
        weaponIn: !!player.weaponIn,
        exhibitLetter: player.exhibitLetter ?? null,
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
              secret: brief.secret,
              lines: brief.lines,
              tip: tip?.text ?? null,
              tipLabel: S.tipLabel,
              // Oct 16: the role card is pictures and a few words. Only the killer's own phone gets the facts.
              card: brief.role === "killer" ? await killerCard(ctx, game, cf, all) : null,
            }
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
            exhibits: input.exhibits.map((e) => ({ id: e.id, letter: e.letter, name: e.name, key: keyOf.get(e.id) ?? null })),
            rooms: input.rooms,
          }
        : null,
      myAccusation: myAcc ? { suspectId: myAcc.suspectId, exhibitId: myAcc.exhibitId, roomKey: myAcc.roomKey, accompliceId: myAcc.accompliceId ?? null } : null,
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
    await writeMarkers(ctx, game, markers);
    return { ok: true };
  },
});

/** Sets a game's markers (card numbers and their rooms); card N's code is the same in every game. */
async function writeMarkers(ctx: MutationCtx, game: Doc<"games">, markers: { number: number; roomKey: string }[]) {
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
    return { ok: true };
  },
});

/** Host: the secret draw. Builds and seals the case. Returns counts only, never the answer. */
/** What the host laptop heard in its last few games (Oct 16): per line, the versions, oldest first; the heckles. */
const heardArg = v.optional(v.object({ lines: v.record(v.string(), v.array(v.number())), heckles: v.array(v.string()) }));

/** A new game's picks: the versions this laptop heard least lately, a running gag only if the laptop says it's due. */
function linesFor(game: Doc<"games">, heard: { lines: Record<string, number[]>; heckles: string[] } | undefined, gag: boolean | undefined): GameLines {
  const tone = scriptOf(game);
  return {
    picks: pickLines(tone, game.slug, heard?.lines ?? {}, customCounts(tone)),
    gag: gag ?? false,
    avoid: (heard?.heckles ?? []).slice(-120),
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
    const game = await ensureWeapons(ctx, host, (await playersOf(ctx, host._id)).filter((p) => p.checkedIn).length);
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
    const { validation: _v, ...file } = cf as CaseFile & { validation?: unknown };
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
    const lines = linesFor(game, heard, gag);
    const picked = { ...game, lines };
    // Oct 16 (Heston): How to play first, then the Don dies, then the roll call.
    const howAt = now;
    const introAt = howLayout(howAt, howCues({ search: game.search ?? "all", pacing: game.pacing, accomplice: !!input.accomplice, jailVote: hasJailVote(input.suspects.length) }), showSecs(picked)).end;
    const rollAt = introLayout(introAt, showSecs(picked)).end;
    const est = await rollPlan(ctx, picked, rollAt, order, file as CaseFile);
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
      lines,
      rolesOut: false,
      // v2: a killer and an accomplice only with 7+ players; otherwise one killer. (Off since Oct 16: always one.)
      hasAccomplice: !!input.accomplice,
    });
    await ctx.scheduler.runAt(rollAt, internal.game.freezeShowRoll, { gameId: game._id });
    await scheduleTimer(ctx, game._id, 1, endsAt);
    await ensureRoomCode(ctx, game); // started straight from sign-ups: late guests still need the code
    // The roll call's voices first (it plays in a couple of minutes), then the names for the intro, the waves
    // and the reveal: one clip for every guest, exhibit and room.
    await scheduleRecording(ctx, game._id, "roll", undefined, "start");
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
  return (cue: CueKey) => cueSecs(voiceOf(n), tone, n.host, cue, variantOf(game, cue));
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

/** The roll call's turns, and when "check your phones" and Round 1 follow, for a roll call starting at rollAt. */
async function rollPlan(ctx: QueryCtx, game: Doc<"games">, rollAt: number, order: Id<"players">[], cf: CaseFile | null) {
  const guests = inOrder(await rollGuests(ctx, game, cf), order);
  const slots = slotsFor(guests, await clipSeconds(ctx, game._id));
  return { slots, ...rollLayout(rollAt, slots, showSecs(game)) };
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
  const plan = await rollPlan(ctx, game, s.rollAt, s.order, await caseFor(ctx, game));
  await setShowEnd(ctx, game, plan.end, { show: { ...s, roll: plan.slots, phonesAt: plan.phonesAt } });
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
    if (next && next.part !== "roll") {
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
      const vote = vt ? { ...vt, left: vt.closedAt ? Math.max(0, (vt.nextAt ?? now) - now) : Math.max(0, vt.endsAt - now) } : undefined;
      await ctx.db.patch(game._id, { paused: true, pausedAt: now, roundEndsAt: left !== undefined ? -left : undefined, ...(vote ? { vote } : {}) });
    } else {
      const endsAt = game.roundEndsAt !== undefined && game.roundEndsAt <= 0 ? now - game.roundEndsAt : undefined;
      await ctx.db.patch(game._id, { paused: false, resumedAt: now, roundEndsAt: endsAt });
      if (vt) {
        const { left, ...rest } = vt;
        if (!vt.closedAt) {
          const endsAt = left !== undefined ? now + left : Math.max(now + 1000, vt.endsAt);
          await ctx.db.patch(game._id, { vote: { ...rest, endsAt } });
          await ctx.scheduler.runAt(endsAt, internal.game.voteTick, { gameId: game._id, at: vt.at });
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
  if (beforeStart || !input) return { voice: voiceOf(n), rollCall, body: null, rooms: {} as Record<string, Clip>, reveal: null, winners: null, heckles: [], verdict: null as Clip };
  const wanted = startWanted(tone, n, {
    players: all.filter((p) => p.inGame).map((p) => ({ id: p._id, charName: p.charName, sayAs: p.sayAs })),
    exhibits: input.exhibits.map((e) => ({ id: e.id, letter: e.letter, name: e.name })),
    rooms: game.rooms,
    bodyRoomKey: game.bodyRoomKey,
    roomOrder: game.roomOrder,
    search: game.search ?? "all",
    seed: game.slug,
    accomplice: !!game.hasAccomplice,
    picks: game.lines?.picks,
  });
  const get = (purpose: string) => clip(wanted.find((w) => w.purpose === purpose));
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
  if (game.status === "done" && cf) {
    // Each award's winners' names, in the TV's order (a shared award says every name).
    winners = {} as Record<string, Clip[]>;
    for (const a of await awardsOf(ctx, game, cf, all, await scoreGame(ctx, game, cf))) {
      winners[a.key] = (await Promise.all(a.winners.map((w) => get(`winner:${w.id}`)))).filter((c): c is NonNullable<Clip> => !!c);
    }
  }
  // The night's heckles for the lulls, the ones that are recorded (convex/heckles.ts).
  const heckles = [];
  for (const h of await heckleWanted(ctx, game)) {
    const c = await clip(h);
    if (c) heckles.push({ id: h.purpose, figure: h.line.figure, gag: h.line.gag, clip: c });
  }
  // The vote's verdict, once it has closed on someone: "Velma is going to jail."
  const vt = voteOf(game);
  const verdict = vt?.closedAt && vt.targetId ? await get(`${vt.kind === "jail" ? "jailed" : "released"}:${vt.targetId}`) : null;
  return { voice: voiceOf(n), rollCall, body: await get("body"), rooms, reveal, winners, heckles, verdict };
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
        aces: scored.scores.filter((s) => s.ace).map((s) => name(s.playerId)),
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
      },
      vote: started ? await publicVote(ctx, game, all) : null,
      exhibits: input ? input.exhibits.map((e) => e.letter) : [],
      // The weapons in play are public, like Clue (drawn by the game since Oct 16).
      weapons: started ? await weaponsInPlay(ctx, game) : [],
      evidence: cf
        ? cf.clues
            .filter((c) => c.channel === "tv" && c.round <= Math.min(round, 3))
            .map((c) => ({ round: c.round, text: c.text, twist: c.kind === "twist" }))
        : [],
      results,
      reveal: game.revealPlan ?? revealTimes(started && !!game.hasAccomplice, game.tone ?? "classic"),
      voice: await tvVoice(ctx, game, all, input, cf),
      map: await tvMap(ctx, game),
      // A cast game's TV dresses How to play, the accomplice card, the awards and empty line-ups in the cast's
      // drawings (this game's guests first) instead of the old ones.
      standIns: standIns(all.filter((p) => p.figure).sort((a, b) => a.createdAt - b.createdAt).map((p) => p.figure!)),
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
