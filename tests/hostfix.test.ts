// Oct 17 bug fixes: pause holds a vote (F8), Sailor off brings the script back (F9), the host's "Not here" (F4), the
// lock-in always has a clock (F12), "Show the awards" waits for the verdict (F7).
import { convexTest } from "convex-test";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { ACCUSE_MAX_MINUTES, VOTE } from "../convex/shared";
import { nextRound } from "./steps";

const modules = import.meta.glob("../convex/**/*.ts");
const FUTURE = Date.now() + 7 * 864e5;
const SLUG = "test-fixes";

beforeAll(() => {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
});
afterEach(() => vi.useRealTimers());

type T = ReturnType<typeof convexTest>;
const game = (t: T) => t.run(async (ctx) => (await ctx.db.query("games").first())!);

async function made(o: { guests?: number; start?: boolean; timed?: boolean } = {}) {
  const t = convexTest(schema, modules);
  const { hostKey } = await t.mutation(internal.admin.createGame, {
    slug: SLUG, title: "Fixes test", isTest: true, makeActive: false, registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 24",
  });
  await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, pacing: { mode: o.timed ? "timer" : "ready", roundMinutes: 10 } });
  await t.mutation(internal.game.seedFakeCast, { slug: SLUG, guests: o.guests ?? 6, markers: 8, seed: 21 });
  if (o.start !== false) {
    await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
    await t.mutation(api.game.startGame, { slug: SLUG, hostKey, cards: "hidden" });
    await t.mutation(api.game.skipIntro, { slug: SLUG, hostKey });
  }
  const players = await t.run((ctx) => ctx.db.query("players").collect());
  return { t, hostKey, players };
}

describe("host fixes (Oct 17)", () => {
  test("F8 (timed games): pausing holds an open vote's clock; votes wait; resuming gives the time back", async () => {
    vi.useFakeTimers();
    const { t, hostKey, players } = await made({ timed: true });
    await nextRound(t, SLUG, hostKey); // → Round 2
    await t.mutation(api.game.advanceRound, { slug: SLUG, hostKey }); // the jail vote
    vi.advanceTimersByTime(30_000);
    await t.mutation(api.game.setPaused, { slug: SLUG, hostKey, paused: true });
    let g = await game(t);
    expect(g.vote!.left).toBeGreaterThan(VOTE.ms - 31_000);
    await expect(t.mutation(api.game.castVote, { token: players[0].token, targetId: null })).rejects.toThrow(/paused/);
    // A long pause: the vote's own time runs out, and it stays open.
    vi.advanceTimersByTime(VOTE.ms * 2);
    await t.finishInProgressScheduledFunctions();
    expect((await game(t)).vote!.closedAt).toBeUndefined();
    await t.mutation(api.game.setPaused, { slug: SLUG, hostKey, paused: false });
    g = await game(t);
    expect(g.vote!.left).toBeUndefined();
    expect(g.vote!.endsAt - Date.now()).toBeGreaterThan(VOTE.ms - 31_000);
    await t.mutation(api.game.castVote, { token: players[0].token, targetId: null });
    vi.advanceTimersByTime(VOTE.ms);
    await t.finishInProgressScheduledFunctions();
    expect((await game(t)).vote!.outcome).toBe("nobody");
  });

  test("F9: Sailor mode off brings back the script the game had", async () => {
    const { t, hostKey } = await made({ start: false });
    expect((await game(t)).tone ?? "classic").toBe("classic");
    await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, narrator: { host: "duke", unstable: false, sailor: true } });
    expect((await game(t)).tone).toBe("adult");
    await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, narrator: { host: "duke", unstable: false, sailor: false } });
    expect((await game(t)).tone).toBe("classic");
  });

  test("F4: the host can mark a checked-in guest not here before the draw; they aren't in the game", async () => {
    const { t, hostKey, players } = await made({ start: false });
    await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
    await t.mutation(api.host.setHere, { slug: SLUG, hostKey, playerId: players[0]._id, here: false });
    expect((await t.run((ctx) => ctx.db.get(players[0]._id)))!.checkedIn).toBe(false);
    await t.mutation(api.game.startGame, { slug: SLUG, hostKey, cards: "hidden" });
    expect((await t.run((ctx) => ctx.db.get(players[0]._id)))!.inGame).toBe(false);
    await expect(t.mutation(api.host.setHere, { slug: SLUG, hostKey, playerId: players[0]._id, here: true })).rejects.toThrow(/started/);
  });

  test("the lock-in (Oct 20): timed games give it a clock that starts the reveal; untimed ones wait for everyone (or the host)", async () => {
    vi.useFakeTimers();
    const timed = await made({ timed: true });
    for (let i = 0; i < 3; i++) await nextRound(timed.t, SLUG, timed.hostKey);
    let g = await game(timed.t);
    expect(g.round).toBe(4);
    expect(g.roundEndsAt! - Date.now()).toBeGreaterThan(ACCUSE_MAX_MINUTES * 60_000 - 2000);
    vi.advanceTimersByTime(ACCUSE_MAX_MINUTES * 60_000 + 1000);
    await timed.t.finishInProgressScheduledFunctions();
    expect((await game(timed.t)).status).toBe("reveal");
    // F7: the host's roster knows when the verdict shows.
    const roster = await timed.t.query(api.host.roster, { slug: SLUG, hostKey: timed.hostKey });
    expect(roster.game.verdictAt).toBeGreaterThan((await game(timed.t)).revealAt!);
    expect(roster.counts).toMatchObject({ awardVotes: 0, inGameAll: 6 });
    const untimed = await made();
    for (let i = 0; i < 3; i++) await nextRound(untimed.t, SLUG, untimed.hostKey);
    g = await game(untimed.t);
    expect(g.round).toBe(4);
    expect(g.roundEndsAt).toBeUndefined();
    vi.advanceTimersByTime(ACCUSE_MAX_MINUTES * 60_000 * 3);
    await untimed.t.finishInProgressScheduledFunctions();
    expect((await game(untimed.t)).status).toBe("playing");
    await untimed.t.mutation(api.game.advanceRound, { slug: SLUG, hostKey: untimed.hostKey });
    expect((await game(untimed.t)).status).toBe("reveal");
  });
});
