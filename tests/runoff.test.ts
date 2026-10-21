// The runoff (Oct 21). Heston, Oct 20: a tie on who starts a runoff on who only, with everyone tied in it (two, or
// three in a three-way tie), each with 30 seconds of last words first; a weapon or room tie re-votes just that part;
// a tie in the runoff means the killer walks. Best Detective counts final answers.
import { convexTest } from "convex-test";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { caseFor } from "../convex/caseFile";
import { finalAnswer, finalParts, LAST_WORDS_MS, RUNOFF_INTRO_MS, runoffVoteAt, speakingNow, tiedParts } from "../convex/lockin";

const modules = import.meta.glob("../convex/**/*.ts");
const FUTURE = Date.now() + 7 * 864e5;
const SLUG = "test-runoff";

beforeAll(() => {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
});
afterEach(() => vi.useRealTimers());

describe("the runoff's arithmetic", () => {
  const a = (s: string, e = "w1", r = "r1") => ({ suspectId: s, exhibitId: e, roomKey: r });
  test("only the parts tied for the most votes go to a runoff", () => {
    expect(tiedParts([a("p1"), a("p1"), a("p2")])).toEqual({});
    expect(tiedParts([a("p1"), a("p2")])).toEqual({ who: ["p1", "p2"] });
    expect(tiedParts([a("p1", "w1"), a("p1", "w2"), a("p1", "w3")])).toEqual({ weapon: ["w1", "w2", "w3"] });
    expect(tiedParts([a("p1", "w1", "r1"), a("p2", "w1", "r2")])).toEqual({ who: ["p1", "p2"], room: ["r1", "r2"] });
  });
  test("last words: 30 seconds each, after the TV says it's a tie, then the vote", () => {
    expect(runoffVoteAt(0, 2)).toBe(RUNOFF_INTRO_MS + 2 * LAST_WORDS_MS);
    expect(speakingNow(0, 2, RUNOFF_INTRO_MS - 1)).toBe(-1);
    expect(speakingNow(0, 2, RUNOFF_INTRO_MS)).toBe(0);
    expect(speakingNow(0, 2, RUNOFF_INTRO_MS + LAST_WORDS_MS)).toBe(1);
    expect(speakingNow(0, 2, RUNOFF_INTRO_MS + 2 * LAST_WORDS_MS)).toBe(-1);
  });
  test("final answers: the runoff vote for the tied parts, the lock-in for the rest; a second tie decides nothing", () => {
    const tied = { who: ["p1", "p2"] };
    expect(finalAnswer(a("p3", "w2", "r2"), { who: "p1" }, tied)).toEqual({ suspectId: "p1", exhibitId: "w2", roomKey: "r2" });
    expect(finalAnswer(a("p3"), undefined, tied)).toEqual(a("p3"));
    const truth = { killerId: "p1", exhibitId: "w1", roomKey: "r1" };
    expect(finalParts([a("p1"), a("p2")], [{ who: "p1" }, { who: "p1" }, { who: "p2" }], tied, truth).who).toMatchObject({ won: true, runoff: true });
    expect(finalParts([a("p1"), a("p2")], [{ who: "p1" }, { who: "p2" }], tied, truth).who).toMatchObject({ won: false, tied: true });
  });
});

async function lockedIn(guests = 6, timed = false) {
  const t = convexTest(schema, modules);
  const { hostKey } = await t.mutation(internal.admin.createGame, {
    slug: SLUG, title: "Runoff test", isTest: true, makeActive: false, registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 31",
  });
  await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, pacing: { mode: timed ? "timer" : "ready", roundMinutes: 10 } });
  await t.mutation(internal.game.seedFakeCast, { slug: SLUG, guests, markers: 8, seed: 5 });
  await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
  await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
  await t.mutation(api.game.skipIntro, { slug: SLUG, hostKey });
  // Straight to the lock-in.
  await t.run(async (ctx) => {
    const g = (await ctx.db.query("games").first())!;
    await ctx.db.patch(g._id, { round: 4, rolesOut: true, vote: undefined });
  });
  const players = await t.run((ctx) => ctx.db.query("players").collect());
  const cf = await t.run(async (ctx) => (await caseFor(ctx, (await ctx.db.query("games").first())!))!);
  const input = await t.run(async (ctx) => {
    const g = (await ctx.db.query("games").first())!;
    return { exhibits: (await ctx.db.query("players").collect()).length, rooms: g.rooms };
  });
  return { t, hostKey, players, cf, rooms: input.rooms };
}
const game = (t: ReturnType<typeof convexTest>) => t.run(async (ctx) => (await ctx.db.query("games").first())!);
const lockIn = (t: ReturnType<typeof convexTest>, p: Doc<"players">, suspectId: string, exhibitId: string, roomKey: string) =>
  t.mutation(api.game.accuse, { token: p.token, suspectId, exhibitId, roomKey });
/** Lock-ins that tie 3-3 on who: the two vote for each other, the other four split. */
function tiePick(players: Doc<"players">[], a: string, b: string, i: number) {
  const p = players[i]._id as string;
  if (p === a) return b;
  if (p === b) return a;
  const rest = players.map((x) => x._id as string).filter((x) => x !== a && x !== b);
  return rest.indexOf(p) % 2 ? a : b;
}
/** Skips the last words (as if they ran out). */
const toTheVote = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => {
    const g = (await ctx.db.query("games").first())!;
    await ctx.db.patch(g._id, { runoff: { ...g.runoff!, voteAt: Date.now() - 1 } });
  });

describe("the runoff", () => {
  test("a tie on who: the runoff on who only, last words for both, then the vote; most votes wins", async () => {
    const { t, players, cf, rooms } = await lockedIn(6);
    const killer = cf.solution.killerId;
    const other = players.find((p) => p._id !== killer)!._id as string;
    const W = cf.solution.exhibitId;
    const R = cf.solution.roomKey;
    // Three on the killer, three on someone else: a tie on who. Weapon and room agree.
    for (const [i, p] of players.entries()) {
      await lockIn(t, p, tiePick(players, killer, other, i), W, R);
    }
    let g = await game(t);
    expect(g.status).toBe("playing");
    expect(g.runoff).toBeTruthy();
    expect(new Set(g.runoff!.who)).toEqual(new Set(g.runoff!.words));
    expect(g.runoff!.weapon).toBeUndefined();
    expect(g.runoff!.room).toBeUndefined();
    expect(g.runoff!.voteAt).toBe(runoffVoteAt(g.runoff!.at, g.runoff!.words.length));
    expect(g.runoff!.endsAt).toBeUndefined(); // untimed: the only clock is the last words
    // The vote waits for the last words.
    const voter = players.find((p) => !g.runoff!.who!.includes(p._id))!;
    await expect(t.mutation(api.game.runoffVote, { token: voter.token, who: killer })).rejects.toThrow(/Last words first/);
    await toTheVote(t);
    // Only who's tied, never yourself, final once cast.
    await expect(t.mutation(api.game.runoffVote, { token: voter.token, who: voter._id === killer ? other : (players.find((p) => !g.runoff!.who!.includes(p._id) && p._id !== voter._id)!._id as string) })).rejects.toThrow(/one of the guests in the runoff/);
    const tiedOne = players.find((p) => p._id === g.runoff!.who![0])!;
    await expect(t.mutation(api.game.runoffVote, { token: tiedOne.token, who: tiedOne._id })).rejects.toThrow(/yourself/);
    // Everyone else votes the killer out; the tied innocent votes the killer too.
    for (const p of players) {
      const pick = p._id === killer ? other : killer;
      await t.mutation(api.game.runoffVote, { token: p.token, who: pick });
    }
    await expect(t.mutation(api.game.runoffVote, { token: voter.token, who: killer })).rejects.toThrow();
    g = await game(t);
    expect(g.status).toBe("reveal");
    expect(g.runoff!.closedAt).toBeTruthy();
    // The TV's verdict: the runoff's most votes, and the detectives win.
    const tv = await t.query(api.game.tv, { slug: SLUG, tvKey: g.tvKey! });
    expect(tv.results!.killerWins).toBe(false);
    expect(tv.results!.top.runoff).toBe(true);
    expect(tv.results!.top.room).toBe(rooms.find((r) => r.key === R)!.label);
  });

  test("a tie in the runoff: the killer walks", async () => {
    const { t, players, cf } = await lockedIn(6);
    const killer = cf.solution.killerId;
    const other = players.find((p) => p._id !== killer)!._id as string;
    for (const [i, p] of players.entries()) {
      await lockIn(t, p, tiePick(players, killer, other, i), cf.solution.exhibitId, cf.solution.roomKey);
    }
    await toTheVote(t);
    const g = await game(t);
    const [a, b] = g.runoff!.who!;
    for (const [i, p] of players.entries()) await t.mutation(api.game.runoffVote, { token: p.token, who: tiePick(players, a, b, i) });
    const after = await game(t);
    expect(after.status).toBe("reveal");
    const tv = await t.query(api.game.tv, { slug: SLUG, tvKey: after.tvKey! });
    expect(tv.results!.killerWins).toBe(true);
    expect(tv.results!.top.who).toBeNull();
  });

  test("a weapon tie re-votes just the weapon, with no last words; the host's Next closes it", async () => {
    const { t, hostKey, players, cf } = await lockedIn(6);
    const killer = cf.solution.killerId;
    const others = await t.run(async (ctx) => {
      const { caseInput } = await import("../convex/game");
      return (await caseInput(ctx, (await ctx.db.query("games").first())!)).exhibits.map((e) => e.id).filter((id) => id !== cf.solution.exhibitId);
    });
    for (const [i, p] of players.entries()) {
      const suspect = p._id === killer ? players.find((x) => x._id !== killer)!._id : killer;
      await lockIn(t, p, suspect, i % 2 ? cf.solution.exhibitId : others[0], cf.solution.roomKey);
    }
    let g = await game(t);
    expect(g.runoff).toMatchObject({ weapon: expect.any(Array), words: [] });
    expect(g.runoff!.who).toBeUndefined();
    expect(g.runoff!.voteAt).toBe(g.runoff!.at + RUNOFF_INTRO_MS);
    await toTheVote(t);
    await t.mutation(api.game.runoffVote, { token: players[0].token, weapon: cf.solution.exhibitId });
    await t.mutation(api.game.runoffVote, { token: players[1].token, weapon: cf.solution.exhibitId });
    // The host moves on with only two votes in.
    await t.mutation(api.game.advanceRound, { slug: SLUG, hostKey });
    g = await game(t);
    expect(g.status).toBe("reveal");
    const tv = await t.query(api.game.tv, { slug: SLUG, tvKey: g.tvKey! });
    expect(tv.results!.killerWins).toBe(false);
  });

  test("the host's Next during the last words cuts them short and opens the vote", async () => {
    const { t, hostKey, players, cf } = await lockedIn(6);
    const killer = cf.solution.killerId;
    const other = players.find((p) => p._id !== killer)!._id as string;
    for (const [i, p] of players.entries()) {
      await lockIn(t, p, tiePick(players, killer, other, i), cf.solution.exhibitId, cf.solution.roomKey);
    }
    const before = (await game(t)).runoff!;
    await t.mutation(api.game.advanceRound, { slug: SLUG, hostKey });
    const after = await game(t);
    expect(after.status).toBe("playing");
    expect(after.runoff!.voteAt).toBeLessThan(before.voteAt);
    expect(after.runoff!.voteAt).toBeLessThanOrEqual(Date.now());
  });

  test("a timed game's runoff vote has a clock, and runs out on its own", async () => {
    vi.useFakeTimers();
    const { t, players, cf } = await lockedIn(6, true);
    const killer = cf.solution.killerId;
    const other = players.find((p) => p._id !== killer)!._id as string;
    for (const [i, p] of players.entries()) {
      await lockIn(t, p, tiePick(players, killer, other, i), cf.solution.exhibitId, cf.solution.roomKey);
    }
    const g = await game(t);
    expect(g.runoff!.endsAt).toBe(g.runoff!.voteAt + 90_000);
    vi.advanceTimersByTime(g.runoff!.endsAt! - Date.now() + 1000);
    await t.finishInProgressScheduledFunctions();
    expect((await game(t)).status).toBe("reveal");
  });

  test("the phones and the TV see what's tied, whose last words come when, and how many are in", async () => {
    const { t, players, cf } = await lockedIn(6);
    const killer = cf.solution.killerId;
    const other = players.find((p) => p._id !== killer)!._id as string;
    for (const [i, p] of players.entries()) {
      await lockIn(t, p, tiePick(players, killer, other, i), cf.solution.exhibitId, cf.solution.roomKey);
    }
    const g = await game(t);
    const phone = (await t.query(api.game.phone, { token: players[0].token }))!;
    expect(phone.runoff!.who!.map((x) => x.id).sort()).toEqual([...g.runoff!.who!].sort());
    expect(phone.runoff!.words).toEqual(g.runoff!.words);
    expect(phone.myRunoff).toBeNull();
    const tv = await t.query(api.game.tv, { slug: SLUG, tvKey: g.tvKey! });
    expect(tv.runoff).toMatchObject({ voted: 0, of: 6, weapon: null, room: null });
  });
});
