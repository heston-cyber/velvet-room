import { convexTest } from "convex-test";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { SHOW, cueSecs, howCues, howLayout } from "../convex/show";
import { ROASTS, roastIndex } from "../convex/roasts";
import { rollNarration } from "../convex/narration";

const modules = import.meta.glob("../convex/**/*.ts");
const FUTURE = Date.now() + 7 * 864e5;
const SLUG = "test-show";

beforeAll(() => {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
});
afterEach(() => vi.useRealTimers());

async function started(guests = 6) {
  const t = convexTest(schema, modules);
  const { hostKey } = await t.mutation(internal.admin.createGame, {
    slug: SLUG, title: "Show test", isTest: true, makeActive: false, registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 24",
  });
  await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, pacing: { mode: "timer", roundMinutes: 10 } });
  await t.mutation(internal.game.seedFakeCast, { slug: SLUG, guests, markers: 8, seed: 11 });
  await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
  await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
  const players = await t.run((ctx) => ctx.db.query("players").collect());
  const tvKey = await t.run(async (ctx) => (await ctx.db.query("games").first())!.tvKey!);
  return { t, hostKey, players, tvKey };
}
/** "Check your phone", then time to read the role (ivy, classic). */
const PHONES_MS = Math.max(SHOW.phonesHold, cueSecs("ivy", "classic", "ivy", "intro4") * 1000 + 8000);
const game = (t: ReturnType<typeof convexTest>) => t.run(async (ctx) => (await ctx.db.query("games").first())!);

describe("the show (v2): Start → intro → How to play → roll call → check your phones → Round 1", () => {
  test("Start fixes when each part begins; Round 1's clock starts after the show; the roles wait", async () => {
    vi.useFakeTimers();
    const { t, players, tvKey } = await started();
    const g = await game(t);
    const s = g.show!;
    expect(s.howAt - g.startedAt!).toBe(SHOW.introMs);
    const secs = (c: Parameters<typeof cueSecs>[3]) => cueSecs("ivy", "classic", "ivy", c);
    expect(s.rollAt).toBe(howLayout(s.howAt, howCues({ search: "all", pacing: g.pacing }), secs).end);
    expect([...s.order].sort()).toEqual(players.map((p) => p._id).sort());
    expect(s.roll).toBeUndefined();
    expect(g.introEndsAt!).toBeGreaterThan(s.rollAt + players.length * SHOW.rollMin);
    expect(g.roundEndsAt).toBe(g.introEndsAt! + 10 * 60_000);
    expect(g.rolesOut).toBe(false);
    for (const p of players) {
      const phone = (await t.query(api.game.phone, { token: p.token }))!;
      expect(phone.briefing).toBeNull();
      expect(phone.game.rolesOut).toBe(false);
    }
    // The TV has the roll call in show order: weapon, motive and roast for each guest.
    const tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(tv.game.show).toMatchObject({ howAt: s.howAt, rollAt: s.rollAt, phonesAt: null });
    const rc = tv.voice.rollCall!;
    expect(rc.items.map((i) => i.id)).toEqual(s.order);
    expect(rc.slots).toHaveLength(players.length);
    expect(rc.frozen).toBe(false);
    for (const it of rc.items) {
      expect(it.weapon?.key).toBeTruthy();
      expect(it.motive.length).toBeGreaterThan(10);
      expect(it.line).toContain(`Weapon: the ${it.weapon!.name.toLowerCase()}.`);
      expect(it.line).toContain(it.roast);
      expect(it.marks.weapon).toBeGreaterThan(it.marks.signature);
      expect(it.marks.roast).toBeGreaterThan(it.marks.motive);
    }
    expect(new Set(rc.items.map((i) => i.roast)).size).toBe(players.length);
    expect(tv.weapons.length).toBe(players.length);
  });

  test("the roll call's turns are fixed when it begins; the roles reach the phones at check your phones", async () => {
    vi.useFakeTimers();
    const { t, players } = await started(5);
    const g = await game(t);
    vi.advanceTimersByTime(g.show!.rollAt + 50 - Date.now());
    await t.finishInProgressScheduledFunctions();
    const g2 = await game(t);
    expect(g2.show!.roll).toHaveLength(5);
    expect(g2.show!.roll!.every((ms) => ms >= SHOW.rollMin)).toBe(true);
    expect(g2.show!.phonesAt).toBeGreaterThan(g2.show!.rollAt);
    expect(g2.introEndsAt).toBe(g2.show!.phonesAt! + PHONES_MS);
    expect(g2.roundEndsAt).toBe(g2.introEndsAt! + 10 * 60_000);
    vi.advanceTimersByTime(g2.show!.phonesAt! + 50 - Date.now());
    await t.finishInProgressScheduledFunctions();
    expect((await game(t)).rolesOut).toBe(true);
    const roles = await Promise.all(players.map(async (p) => (await t.query(api.game.phone, { token: p.token }))!.briefing!.role));
    expect(roles.filter((r) => r === "killer")).toHaveLength(1);
  });

  test("the host skips one part at a time, and Round 1's clock moves with the show", async () => {
    vi.useFakeTimers();
    const { t, hostKey } = await started(4);
    const skip = () => t.mutation(api.game.skipShow, { slug: SLUG, hostKey });
    vi.advanceTimersByTime(5_000);
    await skip(); // intro → How to play
    let g = await game(t);
    expect(g.show!.howAt).toBe(Date.now());
    expect(g.roundEndsAt).toBe(g.introEndsAt! + 10 * 60_000);
    vi.advanceTimersByTime(3_000);
    await skip(); // How to play → the roll call, its turns fixed now
    g = await game(t);
    expect(g.show!.rollAt).toBe(Date.now());
    expect(g.show!.roll).toHaveLength(4);
    expect(g.rolesOut).toBe(false);
    vi.advanceTimersByTime(3_000);
    await skip(); // the roll call → check your phones
    g = await game(t);
    expect(g.show!.phonesAt).toBe(Date.now());
    expect(g.rolesOut).toBe(true);
    expect(g.introEndsAt).toBe(Date.now() + PHONES_MS);
    await skip(); // → Round 1
    g = await game(t);
    expect(g.introEndsAt).toBe(Date.now());
    expect(g.roundEndsAt).toBe(Date.now() + 10 * 60_000);
    await skip(); // nothing left to skip
    expect((await game(t)).introEndsAt).toBe(g.introEndsAt);
    // The roll call's own scheduled job finds the show over and leaves it alone.
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect((await game(t)).introEndsAt).toBe(g.introEndsAt);
    expect((await t.query(api.host.roster, { slug: SLUG, hostKey })).game.show).not.toBeNull();
  });

  test("Begin Round 1 skips the whole show and puts the roles on the phones", async () => {
    vi.useFakeTimers();
    const { t, hostKey, players } = await started(4);
    vi.advanceTimersByTime(2_000);
    await t.mutation(api.game.skipIntro, { slug: SLUG, hostKey });
    const g = await game(t);
    expect(g.rolesOut).toBe(true);
    expect(g.introEndsAt).toBe(Date.now());
    expect((await t.query(api.game.phone, { token: players[0].token }))!.briefing).not.toBeNull();
    await t.finishAllScheduledFunctions(() => vi.runAllTimers());
    expect((await game(t)).show!.roll).toBeUndefined(); // the show was over before the roll call
  });
});

describe("roasts and the roll-call line", () => {
  test("a game gives every guest a different roast, for as many guests as there are roasts", () => {
    for (const seed of ["a", "game-1", "k57abc"]) {
      const n = ROASTS.classic.length;
      const picks = Array.from({ length: n }, (_, rank) => roastIndex(seed, rank, n));
      expect(new Set(picks).size).toBe(n);
    }
    expect(ROASTS.classic.length).toBeGreaterThanOrEqual(40);
    expect(ROASTS.adult.length).toBeGreaterThanOrEqual(40);
    for (const r of [...ROASTS.classic, ...ROASTS.adult]) expect(/\{char\}|\{real\}/.test(r)).toBe(true);
  });

  test("the line reads the motive in the guest's own words, or the house's", () => {
    const base = { name: "Velma", real: "Ana", signature: "A silver case", weapon: "Lawn Gnome", roast: "She cheats at cards." };
    const own = rollNarration("classic", { ...base, motive: "He owes me three months of tips", motiveOwn: true });
    expect(own.text).toContain("Signature: A silver case.");
    expect(own.text).toContain("Weapon: the lawn gnome.");
    expect(own.text).toContain("Motive, in their own words: “He owes me three months of tips.”");
    expect(own.text.endsWith("She cheats at cards.")).toBe(true);
    const house = rollNarration("adult", { ...base, motive: "The Don owed you a small fortune.", motiveOwn: false });
    expect(house.text).toContain("Motive: The Don owed you a small fortune.");
    expect(house.marks.signature).toBeLessThan(house.marks.weapon);
    expect(house.marks.motive).toBeLessThan(house.marks.roast);
  });
});
