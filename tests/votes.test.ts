import { convexTest } from "convex-test";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import type { Id } from "../convex/_generated/dataModel";
import { VOTE } from "../convex/shared";
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

// Oct 16 (Heston): "jail vote only can happen on round 2, no votes to release. round 3 no voting to put anyone in
// jail, but we can vote to release." Round 1 ends with no vote; Round 3's release vote only if someone's in jail.
describe("the jail vote", () => {
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

  test("half isn't enough; Round 3 ends in the release vote (no jail vote), then the lock-in", async () => {
    const { t, hostKey, token, id } = await started(4);
    await endRound(t, hostKey); // Round 1 → Round 2, no vote
    await endRound(t, hostKey); // Round 2 → the jail vote
    for (const i of [0, 1]) await t.mutation(api.game.castVote, { token: token(i), targetId: id(3) });
    await t.mutation(api.game.castVote, { token: token(2), targetId: id(1) });
    await endRound(t, hostKey); // the host closes it: 2 of 4 isn't more than half
    expect((await game(t)).vote!.outcome).toBe("nobody");
    await endRound(t, hostKey); // skip the verdict: Round 3
    expect((await game(t)).round).toBe(3);
    // jail guest 3 by hand to test Round 3's release vote
    await t.run((ctx) => ctx.db.patch(id(3), { jailed: true, jailedAt: Date.now() }));
    await endRound(t, hostKey); // Round 3 ends: guest 3 is in jail, so the release vote
    let g = await game(t);
    expect(g.vote).toMatchObject({ kind: "release", round: 3 });
    expect(g.vote!.voters).toHaveLength(3);
    expect(g.vote!.candidates).toEqual([id(3)]);
    await t.mutation(api.game.castVote, { token: token(0), targetId: id(3) });
    await t.mutation(api.game.castVote, { token: token(1), targetId: null });
    await endRound(t, hostKey); // the host closes it: 1 of 3 isn't more than half
    g = await game(t);
    expect(g.vote!.outcome).toBe("nobody");
    expect((await player(t, id(3))).jailed).toBe(true);
    await endRound(t, hostKey); // skip the verdict: straight to the lock-in, no jail vote
    g = await game(t);
    expect(g.round).toBe(4);
  });

  test("Round 3 with nobody in jail: no vote, straight to the lock-in", async () => {
    const { t, hostKey } = await started(4);
    await nextRound(t, SLUG, hostKey); // → Round 2
    await nextRound(t, SLUG, hostKey); // the jail vote (nobody votes) → Round 3
    expect((await game(t)).round).toBe(3);
    await endRound(t, hostKey);
    const g = await game(t);
    expect(g.round).toBe(4);
    expect(g.vote?.round).not.toBe(3);
  });

  test("jailed guests can talk and bribe, nothing else; the release vote frees them for the lock-in", async () => {
    const { t, hostKey, token, id } = await started(5);
    await endRound(t, hostKey); // → Round 2
    await endRound(t, hostKey); // the jail vote
    for (const i of [0, 1, 2]) await t.mutation(api.game.castVote, { token: token(i), targetId: id(4) });
    await endRound(t, hostKey); // the host closes it: 3 of 5
    expect((await player(t, id(4))).jailed).toBe(true);
    await endRound(t, hostKey); // skip the verdict: Round 3
    expect((await game(t)).round).toBe(3);
    const phone = (await t.query(api.game.phone, { token: token(4) }))!;
    expect(phone.me.jailed).toBe(true);
    expect(phone.counts.inGame).toBe(4);
    const markers = await t.run((ctx) => ctx.db.query("markers").collect());
    await expect(t.mutation(api.game.scanMarker, { token: token(4), code: markers[0].code })).rejects.toThrow(/jail/);
    expect((await t.mutation(api.game.setReady, { token: token(4), ready: true })).ok).toBe(false);
    // ready majority counts free guests only: 3 of 4 free
    for (const i of [0, 1, 2]) await t.mutation(api.game.setReady, { token: token(i), ready: true });
    let g = await game(t);
    expect(g.vote).toMatchObject({ kind: "release", round: 3 });
    await expect(t.mutation(api.game.castVote, { token: token(4), targetId: null })).rejects.toThrow(/jail/);
    for (const i of [0, 1, 2]) await t.mutation(api.game.castVote, { token: token(i), targetId: id(4) });
    expect((await game(t)).vote!.closedAt).toBeUndefined(); // one guest still to vote
    await endRound(t, hostKey); // the host closes it: 3 of 4 is more than half
    expect((await game(t)).vote!.outcome).toBe("released");
    expect((await player(t, id(4))).jailed).toBe(false);
    await endRound(t, hostKey); // skip the verdict: the lock-in
    g = await game(t);
    expect(g.round).toBe(4);
    // the freed guest locks in; the reveal waits for everyone free
    const board = (await t.query(api.game.phone, { token: token(1) }))!.board!;
    for (const i of [0, 1, 2, 3, 4]) {
      await t.mutation(api.game.accuse, { token: token(i), suspectId: id(i === 1 ? 2 : 1), exhibitId: board.exhibits[0].id, roomKey: board.rooms[0].key });
    }
    expect((await game(t)).status).toBe("reveal");
  });

  test("on the clock: an open vote closes when its time is up, and the verdict moves the night on", async () => {
    vi.useFakeTimers();
    const { t, hostKey, token, id } = await started(4);
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
