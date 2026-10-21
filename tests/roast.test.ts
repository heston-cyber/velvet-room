// Gag night (Oct 20, Heston: "I like the host setting for this"): Random (every third game), Nobody, or a guest.
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { heckleLines } from "../convex/heckles";

const modules = import.meta.glob("../convex/**/*.ts");
const FUTURE = Date.now() + 7 * 864e5;
const SLUG = "test-roast";

beforeAll(() => {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
});

async function made() {
  const t = convexTest(schema, modules);
  const { hostKey } = await t.mutation(internal.admin.createGame, {
    slug: SLUG, title: "Roast test", isTest: true, makeActive: false, registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 31",
  });
  await t.mutation(internal.game.seedFakeCast, { slug: SLUG, guests: 6, markers: 8, seed: 3 });
  const players = await t.run((ctx) => ctx.db.query("players").collect());
  return { t, hostKey, players };
}
const game = (t: ReturnType<typeof convexTest>) => t.run(async (ctx) => (await ctx.db.query("games").first())!);

describe("gag night", () => {
  test("a gag night's insults can all land on the guest the host picked", () => {
    const guests = ["a", "b", "c", "d"].map((id) => ({ id, real: id.toUpperCase(), figure: null }));
    const lines = heckleLines("classic", "seed", guests, { gag: true, gagOn: "c" });
    expect(lines.length).toBeGreaterThan(0);
    expect(new Set(lines.map((l) => l.target))).toEqual(new Set(["c"]));
    const normal = heckleLines("classic", "seed", guests, { gag: false, gagOn: "c" });
    expect(new Set(normal.map((l) => l.target)).size).toBeGreaterThan(1);
  });

  test("the host's pick decides it at Start: a guest, nobody, or the laptop's every-third-game random", async () => {
    let { t, hostKey, players } = await made();
    expect((await t.query(api.host.roster, { slug: SLUG, hostKey })).game.roast).toBe("random");
    await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, roast: players[2]._id });
    await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
    await t.mutation(api.game.startGame, { slug: SLUG, hostKey, gag: false });
    let g = await game(t);
    expect(g.lines).toMatchObject({ gag: true, gagOn: players[2]._id });

    ({ t, hostKey, players } = await made());
    await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, roast: "none" });
    await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
    await t.mutation(api.game.startGame, { slug: SLUG, hostKey, gag: true });
    g = await game(t);
    expect(g.lines!.gag).toBe(false);

    ({ t, hostKey, players } = await made());
    await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
    await t.mutation(api.game.startGame, { slug: SLUG, hostKey, gag: true });
    g = await game(t);
    expect(g.lines!.gag).toBe(true);
    expect(g.lines!.gagOn).toBeUndefined();
  });

  test("only a guest of this game can be picked, and not after Start", async () => {
    const { t, hostKey, players } = await made();
    await t.mutation(internal.admin.createGame, {
      slug: "other-game", title: "Other", isTest: true, makeActive: false, registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 31",
    });
    await t.mutation(internal.game.seedFakeCast, { slug: "other-game", guests: 3, markers: 4, seed: 9 });
    const stranger = (await t.run((ctx) => ctx.db.query("players").collect())).find((p) => !players.some((x) => x._id === p._id))!;
    await expect(t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, roast: stranger._id })).rejects.toThrow(/tonight's guests/);
    await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
    await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
    await expect(t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, roast: players[0]._id })).rejects.toThrow(/locked/);
  });
});
