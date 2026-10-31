// Oct 31 (Heston: "a wait on the twist in round 3 (wait till after all evidence is scanned.) Do a notification on all
// devices to return to the lounge for the twist once all evidence is scanned. then the twist drops, then players
// continue talking and guessing to ready for vote"): the host can call it sooner; it drops on its own after 10 minutes.
import { convexTest } from "convex-test";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const SLUG = "test-twist";
beforeAll(() => {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
});
afterEach(() => vi.useRealTimers());


async function setup() {
  vi.useFakeTimers();
  const t = convexTest(schema, modules);
  const { hostKey } = await t.mutation(internal.admin.createGame, {
    slug: SLUG, title: "Twist test", isTest: true, makeActive: false, registrationClosesAt: Date.now() + 7 * 864e5, deadlineLabel: "Sat, Oct 31",
  });
  await t.mutation(internal.game.seedFakeCast, { slug: SLUG, guests: 6, markers: 8, seed: 3 });
  await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
  await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
  await t.mutation(api.game.skipIntro, { slug: SLUG, hostKey });
  await t.mutation(api.game.advanceRound, { slug: SLUG, hostKey });
  await t.mutation(api.game.advanceRound, { slug: SLUG, hostKey });
  const game = () => t.run(async (ctx) => (await ctx.db.query("games").first())!);
  const players = await t.run((ctx) => ctx.db.query("players").collect());
  const markers = await t.run((ctx) => ctx.db.query("markers").collect());
  return { t, hostKey, game, players, cards: markers.filter((m) => !!m.roomKey).map((m) => m.number) };
}
const twisty = (ev: { twist: boolean }[]) => ev.some((c) => c.twist);

describe("Round 3's twist waits", () => {
  test("for every card: Ready waits, the last card calls everyone to the Lounge, then the twist drops", async () => {
    const { t, game, players, cards } = await setup();
    expect((await game()).round).toBe(3);
    const p = players.find((x) => x.inGame && !x.jailed)!;
    const phone = async () => (await t.query(api.game.phone, { token: p.token }))!;
    expect((await phone()).game.twistWait).toBe(true);
    expect(twisty(await t.query(api.game.evidence, { slug: SLUG }))).toBe(false);
    await expect(t.mutation(api.game.setReady, { token: p.token, ready: true })).rejects.toThrow(/Wait for the twist/);
    vi.advanceTimersByTime(31_000);
    for (const n of cards.slice(0, -1)) await t.mutation(api.game.scanTestCard, { token: p.token, number: n });
    expect((await game()).twistCallAt).toBeUndefined();
    await t.mutation(api.game.scanTestCard, { token: p.token, number: cards[cards.length - 1] });
    const called = await game();
    expect(called.twistCallAt).toBeDefined();
    expect(called.twistAt).toBeUndefined();
    expect((await phone()).game.twistCallAt).toBe(called.twistCallAt);
    expect(twisty(await t.query(api.game.evidence, { slug: SLUG }))).toBe(false);
    vi.advanceTimersByTime(30_500);
    await t.finishInProgressScheduledFunctions();
    expect((await game()).twistAt).toBeDefined();
    expect(twisty(await t.query(api.game.evidence, { slug: SLUG }))).toBe(true);
    expect((await phone()).game.twistWait).toBe(false);
    await t.mutation(api.game.setReady, { token: p.token, ready: true });
  });

  test("the host can call it sooner, and press again to drop it now", async () => {
    const { t, hostKey, game } = await setup();
    await t.mutation(api.game.dropTwist, { slug: SLUG, hostKey });
    expect((await game()).twistCallAt).toBeDefined();
    expect((await game()).twistAt).toBeUndefined();
    expect((await t.query(api.host.roster, { slug: SLUG, hostKey })).game.twistCallAt).toBeDefined();
    await t.mutation(api.game.dropTwist, { slug: SLUG, hostKey });
    expect((await game()).twistAt).toBeDefined();
    expect((await t.query(api.host.roster, { slug: SLUG, hostKey })).game.twistWait).toBe(false);
  });

  test("it drops on its own 10 minutes into Round 3", async () => {
    const { t, game } = await setup();
    vi.advanceTimersByTime(10 * 60_000 + 100);
    await t.finishInProgressScheduledFunctions();
    expect((await game()).twistCallAt).toBeDefined();
    vi.advanceTimersByTime(30_500);
    await t.finishInProgressScheduledFunctions();
    expect((await game()).twistAt).toBeDefined();
  });
});
