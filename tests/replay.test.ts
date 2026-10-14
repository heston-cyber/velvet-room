import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const FUTURE = Date.now() + 7 * 864e5;
const SLUG = "velvet-test";

beforeAll(() => {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
  process.env.VOICE_WORKERS = "1";
});

async function setup() {
  const t = convexTest(schema, modules);
  const { hostKey } = await t.mutation(internal.admin.createGame, {
    slug: SLUG, title: "The Velvet Room", isTest: true, makeActive: true, registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 24",
  });
  await t.mutation(api.host.updateSettings, {
    slug: SLUG, hostKey, pacing: { mode: "timer", roundMinutes: 7 }, search: "waves", tone: "adult",
    wifi: { name: "Speakeasy", password: "bathtubgin" }, narrator: { host: "duke", unstable: true }, levels: { voice: 90, music: 50, sfx: 70 },
  });
  await t.mutation(internal.game.seedFakeCast, { slug: SLUG, guests: 4, markers: 6, seed: 5, checkIn: true });
  const game = await t.run(async (ctx) => (await ctx.db.query("games").first())!);
  return { t, hostKey, game };
}

const finishNight = (t: Awaited<ReturnType<typeof setup>>["t"], id: Awaited<ReturnType<typeof setup>>["game"]["_id"]) =>
  t.run((ctx) => ctx.db.patch(id, { status: "done", doneAt: Date.now() }));

describe("play again: New game", () => {
  test("only after the awards", async () => {
    const { t, hostKey } = await setup();
    await expect(t.mutation(api.replay.newGame, { slug: SLUG, hostKey })).rejects.toThrow(/awards first/);
    await expect(t.mutation(api.replay.newGame, { slug: SLUG, hostKey: "wrong" })).rejects.toThrow();
  });

  test("game 2 keeps the house setup, starts fresh sign-ups, and takes over as the active game", async () => {
    const { t, hostKey, game } = await setup();
    await finishNight(t, game._id);
    const { slug } = await t.mutation(api.replay.newGame, { slug: SLUG, hostKey });
    expect(slug).toBe(`${SLUG}-g2`);
    const [g1, g2] = await t.run(async (ctx) => [await ctx.db.get(game._id), await ctx.db.query("games").withIndex("by_slug", (q) => q.eq("slug", slug)).unique()]);
    expect(g2).toMatchObject({
      title: "The Velvet Room · Game 2", status: "registration", registrationOpen: true, gameNumber: 2, isActive: true, isTest: true,
      hostKey, tvKey: game.tvKey, rooms: game.rooms, pacing: { mode: "timer", roundMinutes: 7 }, search: "waves", tone: "adult",
      wifi: { name: "Speakeasy", password: "bathtubgin" }, narrator: { host: "duke", unstable: true }, levels: { voice: 90, music: 50, sfx: 70 },
    });
    expect(g2!.roomCode).toBeUndefined();
    expect(g1).toMatchObject({ nextSlug: slug, isActive: false });
    expect(g1!.endedAt).toBeGreaterThan(0);
    // Same marker cards in the same rooms.
    const markers = await t.run(async (ctx) => {
      const of = async (id: typeof game._id) => (await ctx.db.query("markers").withIndex("by_game", (q) => q.eq("gameId", id)).collect()).map((m) => [m.number, m.roomKey, m.code]).sort();
      return [await of(game._id), await of(g2!._id)];
    });
    expect(markers[1]).toEqual(markers[0]);
    expect(markers[1]).toHaveLength(6);
    // Nobody carries over: everyone signs up again.
    const players2 = await t.run((ctx) => ctx.db.query("players").withIndex("by_game", (q) => q.eq("gameId", g2!._id)).collect());
    expect(players2).toHaveLength(0);
    // The landing page now points at game 2, and sign-ups are open.
    const pub = await t.query(api.registration.publicGame, {});
    expect(pub).toMatchObject({ slug, open: true });
  });

  test("pressing it twice is safe; game 2 can make game 3", async () => {
    const { t, hostKey, game } = await setup();
    await finishNight(t, game._id);
    const a = await t.mutation(api.replay.newGame, { slug: SLUG, hostKey });
    const b = await t.mutation(api.replay.newGame, { slug: SLUG, hostKey });
    expect(b.slug).toBe(a.slug);
    expect(await t.run(async (ctx) => (await ctx.db.query("games").collect()).length)).toBe(2);
    const g2 = await t.run(async (ctx) => (await ctx.db.query("games").withIndex("by_slug", (q) => q.eq("slug", a.slug)).unique())!);
    await finishNight(t, g2._id);
    const c = await t.mutation(api.replay.newGame, { slug: a.slug, hostKey });
    expect(c.slug).toBe(`${SLUG}-g3`);
    const g3 = await t.run(async (ctx) => (await ctx.db.query("games").withIndex("by_slug", (q) => q.eq("slug", c.slug)).unique())!);
    expect(g3.title).toBe("The Velvet Room · Game 3");
  });

  test("the old game's TV and phones are told where the next game is", async () => {
    const { t, hostKey, game } = await setup();
    const player = await t.run(async (ctx) => (await ctx.db.query("players").first())!);
    await finishNight(t, game._id);
    expect((await t.query(api.game.tv, { slug: SLUG, tvKey: game.tvKey! }))!.game.nextSlug).toBeNull();
    const { slug } = await t.mutation(api.replay.newGame, { slug: SLUG, hostKey });
    expect((await t.query(api.game.tv, { slug: SLUG, tvKey: game.tvKey! }))!.game.nextSlug).toBe(slug);
    expect((await t.query(api.game.phone, { token: player.token }))!.game.nextSlug).toBe(slug);
    expect((await t.query(api.host.roster, { slug: SLUG, hostKey }))!.game.nextSlug).toBe(slug);
    // The TV and host keep their keys in game 2.
    const tv2 = await t.query(api.game.tv, { slug, tvKey: game.tvKey! });
    expect(tv2!.game).toMatchObject({ status: "registration", slug, gameNumber: 2 });
    expect((await t.query(api.host.roster, { slug, hostKey }))!.game.gameNumber).toBe(2);
  });

  test("a guest from game 1 signs up fresh for game 2", async () => {
    const { t, hostKey, game } = await setup();
    await finishNight(t, game._id);
    const { slug } = await t.mutation(api.replay.newGame, { slug: SLUG, hostKey });
    const { token } = await t.mutation(api.registration.register, {
      slug, realName: "Ana Ruiz", charName: "Velma Kowalski", who: "Cigarette girl.", signature: "Silver case", weapon: "Candlestick", weaponDesc: "Brass.", killerOk: true, figure: "owner",
    });
    const me = await t.query(api.registration.me, { token });
    expect(me!.game.slug).toBe(slug);
  });
});
