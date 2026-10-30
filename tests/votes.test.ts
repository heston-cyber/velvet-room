import { convexTest } from "convex-test";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import type { Id } from "../convex/_generated/dataModel";
import { VOTE } from "../convex/shared";
import { caseFor } from "../convex/caseFile";
import { nextRound } from "./steps";

const modules = import.meta.glob("../convex/**/*.ts");
const FUTURE = Date.now() + 7 * 864e5;
const SLUG = "test-votes";

beforeAll(() => {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
});
afterEach(() => vi.useRealTimers());

async function started(guests = 6) {
  const t = convexTest(schema, modules);
  const { hostKey } = await t.mutation(internal.admin.createGame, {
    slug: SLUG, title: "Votes test", isTest: true, makeActive: false, registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 24",
  });
  await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, pacing: { mode: "ready", roundMinutes: 10 } });
  await t.mutation(internal.game.seedFakeCast, { slug: SLUG, guests, markers: 8, seed: 31 });
  await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
  await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
  await t.mutation(api.game.skipIntro, { slug: SLUG, hostKey });
  const players = await t.run((ctx) => ctx.db.query("players").collect());
  const tvKey = await t.run(async (ctx) => (await ctx.db.query("games").first())!.tvKey!);
  return { t, hostKey, players, tvKey, token: (i: number) => players[i].token, id: (i: number) => players[i]._id as Id<"players"> };
}
const game = (t: ReturnType<typeof convexTest>) => t.run(async (ctx) => (await ctx.db.query("games").first())!);
const player = (t: ReturnType<typeof convexTest>, id: Id<"players">) => t.run(async (ctx) => (await ctx.db.get(id))!);
const endRound = (t: ReturnType<typeof convexTest>, hostKey: string) => t.mutation(api.game.advanceRound, { slug: SLUG, hostKey });
/** The case's answer, and which guests the evidence clears by the end of Round 3. */
const theCase = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => {
    const cf = (await caseFor(ctx, (await ctx.db.query("games").first())!))!;
    return { killer: cf.solution.killerId, cleared: [...new Set(cf.clues.filter((c) => c.round <= 3).flatMap((c) => c.elim.suspects))] };
  }).then((x) => ({ killer: x.killer, cleared: new Set<string>(x.cleared) }));
/** A guest the evidence never clears (an innocent left standing, else the killer): a release vote is a real vote. */
const unclearedIdx = async (t: ReturnType<typeof convexTest>, players: { _id: string }[]) => {
  const { killer, cleared } = await theCase(t);
  const i = players.findIndex((p) => p._id !== killer && !cleared.has(p._id));
  return i >= 0 ? i : players.findIndex((p) => p._id === killer);
};

// Oct 16 (Heston): "jail vote only can happen on round 2, no votes to release. round 3 no voting to put anyone in
// jail, but we can vote to release." Round 1 ends with no vote; Round 3's release vote only if someone's in jail.
describe("no jail vote (Oct 29)", () => {
  // Heston, Oct 29: "I think we get rid of the jail thing altogether, it doesnt actually do anything in the game."
  test("at any size, Round 2 ends in the late tips and goes straight to Round 3; How to play has the late-tips card", async () => {
    for (const n of [4, 6, 10]) {
      const { t, hostKey, tvKey, token } = await started(n);
      await endRound(t, hostKey); // → Round 2
      await endRound(t, hostKey); // Round 2 ends: the late tips, then Round 3
      const g = await game(t);
      expect(g.round).toBe(3);
      expect(g.vote).toBeUndefined();
      expect(g.lateTipsAt).toBeTruthy();
      const tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
      expect(tv.game.jailVote).toBe(false);
      expect((await t.query(api.game.phone, { token: token(0) }))!.game.jailVote).toBe(false);
      await endRound(t, hostKey); // → the lock-in
      expect((await game(t)).round).toBe(4);
    }
  });
});

// The jail vote as it was (Oct 16 to 28). No game opens it since Oct 29; the code stays, unreachable, so these are skipped.
describe.skip("the jail vote", () => {
  test("Round 1 ends with no vote; Round 2 ends in the jail vote: more than half on one guest jails them; ballots stay secret until it closes", async () => {
    const { t, hostKey, token, id, tvKey } = await started(6);
    await endRound(t, hostKey);
    let g = await game(t);
    expect(g.round).toBe(2);
    expect(g.vote).toBeUndefined();
    await endRound(t, hostKey);
    g = await game(t);
    expect(g.round).toBe(2);
    expect(g.vote).toMatchObject({ kind: "jail", round: 2 });
    expect(g.vote!.voters).toHaveLength(6);
    expect(g.vote!.candidates).toHaveLength(6);
    await expect(t.mutation(api.game.castVote, { token: token(0), targetId: id(0) })).rejects.toThrow(/yourself/);
    // four of six on guest 5, one on nobody: the TV sees the count, not the ballots
    for (const i of [0, 1, 2]) await t.mutation(api.game.castVote, { token: token(i), targetId: id(5) });
    await t.mutation(api.game.castVote, { token: token(3), targetId: null });
    await t.mutation(api.game.castVote, { token: token(3), targetId: id(5) }); // changed their mind
    let tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(tv.vote).toMatchObject({ kind: "jail", voted: 4, voters: 6, closedAt: null, tally: null });
    const mine = (await t.query(api.game.phone, { token: token(0) }))!;
    expect(mine.myBallot).toMatchObject({ canVote: true, voted: true, targetId: id(5) });
    await t.mutation(api.game.castVote, { token: token(4), targetId: null });
    await t.mutation(api.game.castVote, { token: token(5), targetId: id(0) });
    // everyone voted: it closes on its own
    tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(tv.vote!.outcome).toBe("jailed");
    expect(tv.vote!.target!.id).toBe(id(5));
    const col = tv.vote!.tally!.find((c) => c.targetId === id(5))!;
    expect(col.voters).toHaveLength(4);
    expect(tv.vote!.tally!.find((c) => c.targetId === null)!.voters).toHaveLength(1);
    expect((await player(t, id(5))).jailed).toBe(true);
    expect(tv.guests.find((x) => x.id === id(5))!.jailed).toBe(true);
    expect(tv.counts).toMatchObject({ playing: 5, jailed: 1 });
    await expect(t.mutation(api.game.castVote, { token: token(4), targetId: id(1) })).rejects.toThrow(/closed/);
    // the verdict shows, then Round 3
    await endRound(t, hostKey);
    expect((await game(t)).round).toBe(3);
  });

  test("half isn't enough; Round 3 ends with no vote (Oct 20: no release vote), and a jailbird rejoins for the lock-in", async () => {
    const { t, hostKey, token, id, players } = await started(6);
    await endRound(t, hostKey); // Round 1 → Round 2, no vote
    await endRound(t, hostKey); // Round 2 → the jail vote
    for (const i of [0, 1, 2]) await t.mutation(api.game.castVote, { token: token(i), targetId: id(5) });
    await t.mutation(api.game.castVote, { token: token(3), targetId: id(1) });
    await endRound(t, hostKey); // the host closes it: 3 of 6 isn't more than half
    expect((await game(t)).vote!.outcome).toBe("nobody");
    await endRound(t, hostKey); // skip the verdict: Round 3
    expect((await game(t)).round).toBe(3);
    // jail a guest by hand: Round 3 still ends with no vote
    const j = await unclearedIdx(t, players);
    await t.run((ctx) => ctx.db.patch(id(j), { jailed: true, jailedAt: Date.now() }));
    await endRound(t, hostKey);
    const g = await game(t);
    expect(g.round).toBe(4);
    expect(g.vote?.round).not.toBe(3);
    expect((await player(t, id(j))).jailed).toBe(false); // back out for the lock-in
  });

  test("Oct 17 (D5): under 5 guests there's no jail vote, and How to play skips the jail card", async () => {
    const { t, hostKey, tvKey, token } = await started(4);
    await endRound(t, hostKey); // → Round 2
    await endRound(t, hostKey); // Round 2 ends: no jail vote, straight to Round 3
    let g = await game(t);
    expect(g.round).toBe(3);
    expect(g.vote).toBeUndefined();
    const tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(tv.game.jailVote).toBe(false);
    expect((await t.query(api.game.phone, { token: token(0) }))!.game.jailVote).toBe(false);
    await endRound(t, hostKey); // → the lock-in
    g = await game(t);
    expect(g.round).toBe(4);
    const five = await started(5);
    expect((await five.t.query(api.game.tv, { slug: SLUG, tvKey: five.tvKey })).game.jailVote).toBe(true);
  });

  test("Round 3 with nobody in jail: no vote, straight to the lock-in", async () => {
    const { t, hostKey } = await started(6);
    await nextRound(t, SLUG, hostKey); // → Round 2
    await nextRound(t, SLUG, hostKey); // the jail vote (nobody votes) → Round 3
    expect((await game(t)).round).toBe(3);
    await endRound(t, hostKey);
    const g = await game(t);
    expect(g.round).toBe(4);
    expect(g.vote?.round).not.toBe(3);
  });

  test("jailed guests (Oct 20) sit out Round 3: no searching, no Ready, no vote; the round waits only for the free guests; they rejoin for the lock-in", async () => {
    const { t, hostKey, token, id, players } = await started(5);
    await endRound(t, hostKey); // → Round 2
    await endRound(t, hostKey); // the jail vote
    const j = await unclearedIdx(t, players);
    const free = [0, 1, 2, 3, 4].filter((i) => i !== j);
    for (const i of free.slice(0, 3)) await t.mutation(api.game.castVote, { token: token(i), targetId: id(j) });
    await endRound(t, hostKey); // the host closes it: 3 of 5
    expect((await player(t, id(j))).jailed).toBe(true);
    await endRound(t, hostKey); // skip the verdict: Round 3
    expect((await game(t)).round).toBe(3);
    const phone = (await t.query(api.game.phone, { token: token(j) }))!;
    expect(phone.me.jailed).toBe(true);
    expect(phone.counts.inGame).toBe(4);
    const markers = await t.run((ctx) => ctx.db.query("markers").collect());
    await expect(t.mutation(api.game.scanMarker, { token: token(j), code: markers[0].code })).rejects.toThrow(/jail/);
    expect((await t.mutation(api.game.setReady, { token: token(j), ready: true })).ok).toBe(false);
    // The round waits for the 4 free guests only.
    for (const i of free.slice(0, 3)) await t.mutation(api.game.setReady, { token: token(i), ready: true });
    expect((await game(t)).round).toBe(3);
    await t.mutation(api.game.setReady, { token: token(free[3]), ready: true });
    const g = await game(t);
    expect(g.round).toBe(4); // no release vote: straight to the lock-in
    expect((await player(t, id(j))).jailed).toBe(false);
    // Everyone locks in, the former jailbird too; the reveal waits for all five.
    const board = (await t.query(api.game.phone, { token: token(1) }))!.board!;
    for (const i of [0, 1, 2, 3, 4]) {
      await t.mutation(api.game.accuse, { token: token(i), suspectId: id(i === 1 ? 2 : 1), exhibitId: board.exhibits[0].id, roomKey: board.rooms[0].key });
    }
    expect((await game(t)).status).toBe("reveal");
  });


  test("timed games (Oct 20): an open vote closes when its time is up, and the verdict moves the night on", async () => {
    vi.useFakeTimers();
    const { t, hostKey, token, id } = await started(6);
    await t.run(async (ctx) => {
      const g = (await ctx.db.query("games").first())!;
      await ctx.db.patch(g._id, { pacing: { mode: "timer", roundMinutes: 10 } });
    });
    await endRound(t, hostKey); // → Round 2
    await endRound(t, hostKey); // the jail vote
    await t.mutation(api.game.castVote, { token: token(0), targetId: id(1) });
    vi.advanceTimersByTime(VOTE.ms + 100);
    await t.finishInProgressScheduledFunctions();
    expect((await game(t)).vote!.outcome).toBe("nobody");
    vi.advanceTimersByTime(VOTE.nextMs + 100);
    await t.finishInProgressScheduledFunctions();
    expect((await game(t)).round).toBe(3);
  });
});
