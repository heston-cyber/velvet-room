import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { ALL_FIGURE_KEYS, FIGURE_KEYS, FIGURE_SETS, LOOKALIKES, anyFreeFigure, fakeGuestPool } from "../convex/figures";
import { existsSync } from "node:fs";

const modules = import.meta.glob("../convex/**/*.ts");
const FUTURE = Date.now() + 7 * 864e5;
const SLUG = "test-figures";

beforeAll(() => {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
  process.env.VOICE_WORKERS = "1";
});

const guest = (i: number, figure?: string) => ({
  slug: SLUG, realName: `Guest ${i}`, charName: `Character ${String.fromCharCode(65 + i)}`, who: "Someone.", signature: `Item ${i}`,
  weapon: `Weapon ${i}`, weaponDesc: "Plain.", killerOk: true, ...(figure ? { figure } : {}),
});

async function setup() {
  const t = convexTest(schema, modules);
  const { hostKey } = await t.mutation(internal.admin.createGame, {
    slug: SLUG, title: "Figures", isTest: true, makeActive: true, registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 24",
  });
  return { t, hostKey };
}

describe("drawn characters: guests pick their own, one guest per drawing", () => {
  test("16 drawings (8 and 8), every one and its face crop in the site", () => {
    expect(FIGURE_SETS.map((s) => s.keys.length)).toEqual([8, 8]);
    expect(new Set(FIGURE_KEYS).size).toBe(16);
    for (const f of [...FIGURE_KEYS, "don", "killer"]) {
      expect(existsSync(`public/art/${f}.webp`), f).toBe(true);
      expect(existsSync(`public/art/faces/${f}.webp`), f).toBe(true);
    }
  });

  test("sign-up needs a drawing, a real one, and one nobody else has", async () => {
    const { t } = await setup();
    await expect(t.mutation(api.registration.register, guest(0))).rejects.toThrow(/Pick your character drawing/);
    await expect(t.mutation(api.registration.register, guest(0, "don"))).rejects.toThrow(/isn't one of tonight's/);
    const { token } = await t.mutation(api.registration.register, guest(0, "singer"));
    expect((await t.query(api.registration.me, { token }))!.figure).toBe("singer");
    await expect(t.mutation(api.registration.register, guest(1, "singer"))).rejects.toThrow(/Someone just took that drawing/);
  });

  test("the gallery greys out taken drawings, but not your own when you edit", async () => {
    const { t } = await setup();
    const { token } = await t.mutation(api.registration.register, guest(0, "curls"));
    await t.mutation(api.registration.register, guest(1, "slick"));
    const taken = (g: Awaited<ReturnType<typeof t.query<typeof api.registration.figures>>>) => g!.flatMap((s) => s.figures).filter((f) => f.taken).map((f) => f.key).sort();
    expect(taken(await t.query(api.registration.figures, { slug: SLUG }))).toEqual(["curls", "slick"]);
    expect(taken(await t.query(api.registration.figures, { token }))).toEqual(["slick"]);
  });

  test("a guest can switch to a free drawing, not to a taken one", async () => {
    const { t } = await setup();
    const { slug: _s, ...edit } = guest(0, "flapper");
    const { token } = await t.mutation(api.registration.register, guest(0, "flapper"));
    await t.mutation(api.registration.register, guest(1, "heiress"));
    await t.mutation(api.registration.update, { ...edit, token, who: "Someone else." });
    expect((await t.query(api.registration.me, { token }))!.figure).toBe("flapper");
    await expect(t.mutation(api.registration.update, { ...edit, token, figure: "heiress" })).rejects.toThrow(/Someone just took/);
    await t.mutation(api.registration.update, { ...edit, token, figure: "owner" });
    expect((await t.query(api.registration.me, { token }))!.figure).toBe("owner");
    const g = await t.query(api.registration.figures, { slug: SLUG });
    expect(g!.flatMap((s) => s.figures).find((f) => f.key === "flapper")!.taken).toBe(false);
  });

  test("test guests get free drawings; repeats only once all 16 are gone", () => {
    const taken = new Set(FIGURE_KEYS.slice(0, 15));
    expect(anyFreeFigure(taken)).toBe(FIGURE_KEYS[15]);
    expect(FIGURE_KEYS).toContain(anyFreeFigure(new Set(FIGURE_KEYS)));
  });

  test("the TV gets every guest's drawing, but the killer's only at the reveal", async () => {
    const { t, hostKey } = await setup();
    await t.mutation(internal.game.seedFakeCast, { slug: SLUG, guests: 5, markers: 6, seed: 4, checkIn: true });
    const tvKey = await t.run(async (ctx) => (await ctx.db.query("games").first())!.tvKey!);
    let tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(tv!.guests.every((x) => !!x.figure)).toBe(true);
    expect(new Set(tv!.guests.map((x) => x.figure)).size).toBe(5);
    await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
    tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(tv!.results).toBeNull();
    const id = await t.run(async (ctx) => (await ctx.db.query("games").first())!._id);
    await t.run((ctx) => ctx.db.patch(id, { status: "reveal", revealAt: Date.now() }));
    tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(FIGURE_KEYS).toContain(tv!.results!.killerFigure);
  });
});

describe("this party's look-alikes", () => {
  test("Heston and Emily lead the row; every look-alike has its art and face", () => {
    expect(LOOKALIKES.slice(0, 2).map((l) => l.name)).toEqual(["Heston", "Emily"]);
    expect(new Set(LOOKALIKES.map((l) => l.key)).size).toBe(LOOKALIKES.length);
    for (const { key } of LOOKALIKES) {
      expect(existsSync(`public/art/${key}.webp`), key).toBe(true);
      expect(existsSync(`public/art/faces/${key}.webp`), key).toBe(true);
    }
    expect(ALL_FIGURE_KEYS).toEqual(expect.arrayContaining([...FIGURE_KEYS, ...LOOKALIKES.map((l) => l.key)]));
  });

  test("off by default: just the main 16, no names", async () => {
    const { t, hostKey } = await setup();
    expect((await t.query(api.host.roster, { slug: SLUG, hostKey }))!.game.lookalikes).toBe(false);
    const g = (await t.query(api.registration.figures, { slug: SLUG }))!;
    expect(g.map((s) => s.label)).toEqual(["Women", "Men"]);
    expect(g.flatMap((s) => s.figures)).toHaveLength(16);
    expect(g.flatMap((s) => s.figures).every((f) => f.name === null)).toBe(true);
  });

  test("on: a named Tonight's guests row first, and those drawings leave the main rows", async () => {
    const { t, hostKey } = await setup();
    await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, lookalikes: true });
    expect((await t.query(api.host.roster, { slug: SLUG, hostKey }))!.game.lookalikes).toBe(true);
    const g = (await t.query(api.registration.figures, { slug: SLUG }))!;
    expect(g[0].label).toBe("Tonight's guests");
    expect(g[0].figures.map((f) => [f.key, f.name])).toEqual(LOOKALIKES.map((l) => [l.key, l.name]));
    const rest = g.slice(1).flatMap((s) => s.figures);
    expect(rest.some((f) => LOOKALIKES.some((l) => l.key === f.key))).toBe(false);
    expect(rest.every((f) => f.name === null)).toBe(true);
    expect(g.slice(1).map((s) => s.label)).toEqual(["Women", "Men"]);
    // A guest takes their own look-alike; it's taken for everyone else.
    const { token } = await t.mutation(api.registration.register, guest(0, "emily"));
    expect((await t.query(api.registration.me, { token }))!.figure).toBe("emily");
    await expect(t.mutation(api.registration.register, guest(1, "emily"))).rejects.toThrow(/Someone just took/);
    const after = (await t.query(api.registration.figures, { slug: SLUG }))!;
    expect(after[0].figures.find((f) => f.key === "emily")!.taken).toBe(true);
    // A look-alike isn't offered when the row is off.
    await expect(t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, lookalikes: false })).resolves.toBeTruthy();
    await expect(t.mutation(api.registration.register, guest(2, "miranda"))).rejects.toThrow(/isn't one of tonight's/);
  });

  test("test guests never take a real guest's look-alike", async () => {
    const { t, hostKey } = await setup();
    await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, lookalikes: true });
    await t.mutation(internal.game.seedFakeCast, { slug: SLUG, guests: 12, markers: 0, seed: 9 });
    const figs = await t.run(async (ctx) => (await ctx.db.query("players").collect()).map((p) => p.figure!));
    expect(figs.length).toBeGreaterThan(5);
    expect(figs.some((f) => LOOKALIKES.some((l) => l.key === f))).toBe(false);
    expect(fakeGuestPool(false)).toEqual(FIGURE_KEYS);
  });

  test("the setting locks once the game starts", async () => {
    const { t, hostKey } = await setup();
    await t.mutation(internal.game.seedFakeCast, { slug: SLUG, guests: 4, markers: 6, seed: 4, checkIn: true });
    await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
    await expect(t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, lookalikes: true })).rejects.toThrow(/locked/);
  });
});
