import { convexTest } from "convex-test";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { SHOW, cueSecs, howCues, howLayout, introLayout } from "../convex/show";
import { ROASTS, RUMOR_LEADS, WEAPON_ROASTS, roastIndex, roastFor, rumorLead } from "../convex/roasts";
import { WEAPON_KEYS, weaponName } from "../convex/weapons";
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

describe("the show (Oct 16): Start → How to play → the Don dies → roll call → check your phones → Round 1", () => {
  test("Start fixes when each part begins; Round 1's clock starts after the show; the roles wait", async () => {
    vi.useFakeTimers();
    const { t, players, tvKey } = await started();
    const g = await game(t);
    const s = g.show!;
    // Heston, Oct 16: "1. rules 2. don dies 3. Roll call"
    expect(s.howAt).toBe(g.startedAt!);
    const secs = (c: Parameters<typeof cueSecs>[3]) => cueSecs("ivy", "classic", "ivy", c);
    expect(s.introAt).toBe(howLayout(s.howAt, howCues({ search: "waves", pacing: g.pacing }), secs).end);
    expect(s.rollAt).toBe(introLayout(s.introAt!, secs).end);
    expect(s.rollAt - s.introAt!).toBeGreaterThanOrEqual(SHOW.introMs - 10_000);
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
    // The TV has the roll call in show order: each guest's name and nickname, nothing else (Heston, Oct 16).
    const tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(tv.game.show).toMatchObject({ howAt: s.howAt, introAt: s.introAt, rollAt: s.rollAt, phonesAt: null });
    const rc = tv.voice.rollCall!;
    expect(rc.items.map((i) => i.id)).toEqual(s.order);
    expect(rc.slots).toHaveLength(players.length);
    expect(rc.frozen).toBe(false);
    for (const it of rc.items) {
      expect(it).not.toHaveProperty("weapon");
      expect(it.cast).toBeTruthy();
      expect(it.line).toContain(it.cast!.real);
      expect(it.line).not.toMatch(/Weapon|motive|Signature|played by/i);
    }
    expect(tv.weapons.length).toBe(6); // drawn by the game (Oct 16), not one per guest
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
    const before = await game(t);
    vi.advanceTimersByTime(5_000);
    await skip(); // How to play → the Don dies
    let g = await game(t);
    expect(g.show!.introAt).toBe(Date.now());
    expect(g.show!.rollAt - g.show!.introAt!).toBe(before.show!.rollAt - before.show!.introAt!); // the intro keeps its length
    expect(g.roundEndsAt).toBe(g.introEndsAt! + 10 * 60_000);
    vi.advanceTimersByTime(3_000);
    await skip(); // the Don dies → the roll call, its turns fixed now
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
    expect(ROASTS.adult.length).toBeGreaterThanOrEqual(20); // adult: the fallback; weapons have their own
    // Roasts use the player's real name (the motive uses the character's).
    for (const r of [...ROASTS.classic, ...ROASTS.adult]) {
      expect(r).toContain("{real}");
      expect(r).not.toContain("{char}");
    }
  });

  test("adult games roast each guest about their own weapon, so no two roasts in a game match", () => {
    for (const key of WEAPON_KEYS) {
      expect(WEAPON_ROASTS[key]?.length).toBeGreaterThanOrEqual(2);
      for (const r of WEAPON_ROASTS[key]) expect(r).toContain("{real}");
    }
    const roasts = WEAPON_KEYS.map((key, rank) => roastFor("adult", "k57game", rank, { real: "Ana Ruiz", weapon: weaponName(key)!, weaponKey: key }));
    expect(new Set(roasts).size).toBe(WEAPON_KEYS.length);
    expect(roasts.every((r) => r.includes("Ana") && !r.includes("{"))).toBe(true);
    // Classic games keep the general list.
    const n = ROASTS.classic.length;
    expect(roastFor("classic", "k57game", 0, { real: "Ana", weapon: "Rope", weaponKey: "rope" })).toBe(
      ROASTS.classic[roastIndex("k57game", 0, n)].replaceAll("{real}", "Ana").replaceAll("{weapon}", "rope"),
    );
  });

  test("each guest's word on the street gets a different lead-in, so the roasts don't all open the same way", () => {
    for (const tone of ["classic", "adult"] as const) {
      expect(RUMOR_LEADS[tone].length).toBeGreaterThanOrEqual(12);
      // Each guest gets a different slot; the blank leads (said flat, as fact) are the only repeats.
      const n = RUMOR_LEADS[tone].length;
      const slots = Array.from({ length: n }, (_, rank) => roastIndex("k57game:word", rank, n));
      expect(new Set(slots).size).toBe(n);
      const leads = Array.from({ length: n }, (_, rank) => rumorLead(tone, "k57game", rank, "Ana Ruiz"));
      const said = leads.filter(Boolean);
      expect(new Set(said).size).toBe(said.length);
      expect(leads.filter((l) => !l).length).toBeGreaterThanOrEqual(2);
      for (const l of said) {
        expect(l).not.toContain("{real}");
        expect(l.endsWith(":")).toBe(true);
      }
      expect(said.filter((l) => /rumou?r|word on|overheard|little bird|loose lips|dirt on/i.test(l)).length).toBeLessThan(said.length / 2);
    }
  });

  test("the roll-call line: name and nickname (Heston, Oct 16), a few words", () => {
    for (const tone of ["classic", "adult"] as const) {
      const line = rollNarration(tone, { name: "Josh “Two-Tone” Lee", real: "Josh Lee", nickname: "Two-Tone", cast: true, seed: "x" }).text;
      expect(line).toContain("Josh Lee, a.k.a. Two-Tone");
      expect(line.split(" ").length).toBeLessThan(14);
    }
  });
});
