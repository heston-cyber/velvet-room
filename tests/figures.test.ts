import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { WEAPON_KEYS } from "../convex/weapons";
import { ALL_FIGURE_KEYS, CAST, CAST_KEYS, MYSTERY_KEYS, anyFreeFigure, castName, castRealName, fakeGuestPool, standIns } from "../convex/figures";
import { rollNarration } from "../convex/narration";
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
  weapon: WEAPON_KEYS[i], killerOk: true, ...(figure ? { figure } : {}),
});

async function setup() {
  const t = convexTest(schema, modules);
  const { hostKey } = await t.mutation(internal.admin.createGame, {
    slug: SLUG, title: "Figures", isTest: true, makeActive: true, registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 24",
  });
  return { t, hostKey };
}

describe("the party cast: the only characters (Heston, Oct 16: the generic ones are gone)", () => {
  test("Heston and Emily lead; every cast member has art, a face, and is a guy or a girl", () => {
    expect(CAST.slice(0, 2).map((l) => l.name)).toEqual(["Heston", "Emily"]);
    expect(new Set(CAST_KEYS).size).toBe(CAST.length);
    for (const { key, sex } of CAST) {
      expect(existsSync(`public/art/${key}.webp`), key).toBe(true);
      expect(existsSync(`public/art/faces/${key}.webp`), key).toBe(true);
      expect(["m", "f"]).toContain(sex);
    }
    for (const f of ["don", "killer"]) expect(existsSync(`public/art/${f}.webp`), f).toBe(true);
    // F6 (Oct 17): plus the two mystery-guest silhouettes.
    expect(ALL_FIGURE_KEYS).toEqual([...CAST_KEYS, ...MYSTERY_KEYS]);
  });

  test("a cast member goes by their own name and nickname", () => {
    expect(castName({ key: "josh", name: "Josh", sex: "m", nickname: "Two-Tone", last: "Lee" })).toBe("Josh “Two-Tone” Lee");
    expect(castRealName({ key: "josh", name: "Josh", sex: "m", nickname: "Two-Tone", last: "Lee" })).toBe("Josh Lee");
    expect(castName({ key: "josh", name: "Josh", sex: "m" })).toBe("Josh");
  });

  test("the sign-up gallery: the guys, then the girls, each with a name; no other drawings", async () => {
    const { t } = await setup();
    const g = (await t.query(api.registration.figures, { slug: SLUG }))!;
    expect(g.map((s) => s.label)).toEqual(["The guys", "The girls", "Not in the cast? A plus-one?"]);
    expect(g.flatMap((s) => s.figures.map((f) => f.key)).sort()).toEqual([...CAST_KEYS, ...MYSTERY_KEYS].sort());
    expect(g[0].figures.every((f) => CAST.find((l) => l.key === f.key)!.sex === "m")).toBe(true);
    expect(g.flatMap((s) => s.figures).every((f) => f.name && f.castName)).toBe(true);
  });

  test("sign-up needs a face, one of the cast, and one nobody else has", async () => {
    const { t } = await setup();
    await expect(t.mutation(api.registration.register, guest(0))).rejects.toThrow(/Pick your character drawing/);
    await expect(t.mutation(api.registration.register, guest(0, "don"))).rejects.toThrow(/isn't one of tonight's/);
    await expect(t.mutation(api.registration.register, guest(0, "flapper"))).rejects.toThrow(/isn't one of tonight's/);
    const { token } = await t.mutation(api.registration.register, guest(0, "emily"));
    expect((await t.query(api.registration.me, { token }))!.figure).toBe("emily");
    await expect(t.mutation(api.registration.register, guest(1, "emily"))).rejects.toThrow(/Someone just took that drawing/);
    const after = (await t.query(api.registration.figures, { slug: SLUG }))!;
    expect(after.flatMap((s) => s.figures).find((f) => f.key === "emily")!.taken).toBe(true);
  });

  test("a face brings its name, whatever the page sends", async () => {
    const { t } = await setup();
    const { token } = await t.mutation(api.registration.register, { ...guest(0, "josh"), sayAs: "nope" });
    const me = (await t.query(api.registration.me, { token }))!;
    const josh = CAST.find((l) => l.key === "josh")!;
    expect(me.charName).toBe(castName(josh));
    expect(me.realName).toBe(castRealName(josh));
    expect(me.sayAs).toBe("");
    const { slug: _s, ...edit } = guest(0, "josh");
    await t.mutation(api.registration.update, { ...edit, token, figure: "sam", charName: "Whatever" });
    expect((await t.query(api.registration.me, { token }))!.charName).toBe(castName(CAST.find((l) => l.key === "sam")!));
  });

  test("each guest types their own nickname and last name; the roll call uses them", async () => {
    const { t, hostKey } = await setup();
    const { token } = await t.mutation(api.registration.register, { ...guest(0, "josh"), nickname: " “Two-Tone” ", lastName: "Lee" });
    let me = (await t.query(api.registration.me, { token }))!;
    expect(me).toMatchObject({ charName: "Josh “Two-Tone” Lee", realName: "Josh Lee", nickname: "Two-Tone", lastName: "Lee" });
    // an older page that doesn't send them keeps what's there
    const { slug: _s, ...edit } = guest(0, "josh");
    await t.mutation(api.registration.update, { ...edit, token, who: "Changed." });
    me = (await t.query(api.registration.me, { token }))!;
    expect(me.charName).toBe("Josh “Two-Tone” Lee");
    await expect(t.mutation(api.registration.update, { ...edit, token, nickname: "x".repeat(25) })).rejects.toThrow(/24/);
    const sheet = await t.query(api.voice.rollCallSheet, { slug: SLUG, hostKey });
    expect(sheet.guests[0].line).toContain("Josh Lee, a.k.a. Two-Tone");
  });

  test("the gallery greys out taken faces, but not your own when you edit; switching frees the old one", async () => {
    const { t } = await setup();
    const { token } = await t.mutation(api.registration.register, guest(0, "heston"));
    await t.mutation(api.registration.register, guest(1, "reily"));
    const taken = (g: Awaited<ReturnType<typeof t.query<typeof api.registration.figures>>>) => g!.flatMap((s) => s.figures).filter((f) => f.taken).map((f) => f.key).sort();
    expect(taken(await t.query(api.registration.figures, { slug: SLUG }))).toEqual(["heston", "reily"]);
    expect(taken(await t.query(api.registration.figures, { token }))).toEqual(["reily"]);
    const { slug: _s, ...edit } = guest(0, "heston");
    await expect(t.mutation(api.registration.update, { ...edit, token, figure: "reily" })).rejects.toThrow(/Someone just took/);
    await t.mutation(api.registration.update, { ...edit, token, figure: "sam" });
    expect(taken(await t.query(api.registration.figures, { slug: SLUG }))).toEqual(["reily", "sam"]);
  });

  test("test guests are the cast, by name, with a made-up profile of the same sex", async () => {
    const { t } = await setup();
    await t.mutation(internal.game.seedFakeCast, { slug: SLUG, guests: 8, markers: 0, seed: 9 });
    const players = await t.run(async (ctx) => await ctx.db.query("players").collect());
    expect(players).toHaveLength(8);
    for (const p of players) {
      const m = CAST.find((l) => l.key === p.figure)!;
      expect(m, p.figure).toBeTruthy();
      expect(p.charName).toBe(castName(m));
      expect(p.realName).toBe(`${m.name} (test guest)`);
    }
    expect(new Set(players.map((p) => p.figure)).size).toBe(8);
    expect(fakeGuestPool()).toEqual(CAST_KEYS);
    const taken = new Set(CAST_KEYS.slice(0, CAST_KEYS.length - 1));
    expect(anyFreeFigure(taken)).toBe(CAST_KEYS[CAST_KEYS.length - 1]);
  });

  test("the roll call: name and nickname only, no played by", () => {
    for (const tone of ["classic", "adult"] as const) {
      for (const seed of ["a", "b", "c", "d", "e", "f"]) {
        const line = rollNarration(tone, { name: "Josh “Two-Tone” Lee", real: "Josh Lee", nickname: "Two-Tone", seed, cast: true }).text;
        expect(line).toContain("Josh Lee, a.k.a. Two-Tone");
        expect(line).not.toMatch(/played by|better known/i);
        expect(line.length).toBeLessThan(80);
        expect(rollNarration(tone, { name: "Josh", real: "Josh", seed, cast: true }).text).not.toContain("a.k.a.");
      }
    }
  });

  test("the TV's stand-in drawings: this game's guests first, then the rest of the cast", async () => {
    expect(standIns(["sam", "flapper", "emily", "sam"]).slice(0, 2)).toEqual(["sam", "emily"]);
    expect(standIns([])).toEqual(CAST_KEYS);
    const { t } = await setup();
    const tvKey = await t.run(async (ctx) => (await ctx.db.query("games").first())!.tvKey!);
    await t.mutation(api.registration.register, guest(0, "reily"));
    expect((await t.query(api.game.tv, { slug: SLUG, tvKey }))!.standIns[0]).toBe("reily");
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
    expect(CAST_KEYS).toContain(tv!.results!.killerFigure);
  });
});
