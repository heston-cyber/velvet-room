// Anyone can host (Oct 16): /host starts a game, the laptop keeps its key, Play makes the room code, and guests sign up
// with the game's own link or at the door with the code.
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { HOURLY_GAME_CAP } from "../convex/hosting";
import { CAST_KEYS, MYSTERY_KEYS } from "../convex/figures";

const modules = import.meta.glob("../convex/**/*.ts");

beforeAll(() => {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
  process.env.VOICE_WORKERS = "1";
});

describe("anyone can host", () => {
  test("a new game is ready to play: its own host key, the cast, sign-ups open, no room code until Play", async () => {
    const t = convexTest(schema, modules);
    const a = await t.mutation(api.hosting.createGame, {});
    const b = await t.mutation(api.hosting.createGame, {});
    expect(a.slug).not.toBe(b.slug);
    expect(a.hostKey).not.toBe(b.hostKey);
    const roster = await t.query(api.host.roster, { slug: a.slug, hostKey: a.hostKey });
    expect(roster!.game.status).toBe("registration");
    expect(roster!.game.isTest).toBe(false);
    expect(roster!.game.roomCode ?? null).toBeNull();
    // the other game's key doesn't open it
    await expect(t.query(api.host.roster, { slug: a.slug, hostKey: b.hostKey })).rejects.toThrow();
    // its own sign-up page, with the party cast
    const pub = await t.query(api.registration.publicGame, { slug: a.slug });
    expect(pub!.open).toBe(true);
    const figs = await t.query(api.registration.figures, { slug: a.slug });
    expect(figs.flatMap((s) => s.figures.map((f) => f.key)).sort()).toEqual([...CAST_KEYS, ...MYSTERY_KEYS].sort());
    // it never becomes the main page's game
    const g = await t.run(async (ctx) => (await ctx.db.query("games").collect()).find((x) => x.slug === a.slug)!);
    expect(g.isActive).toBe(false);
    expect(g.selfServe).toBe(true);
    // Play makes the room code
    await t.mutation(api.game.openDoors, { slug: a.slug, hostKey: a.hostKey });
    const code = (await t.query(api.host.roster, { slug: a.slug, hostKey: a.hostKey }))!.game.roomCode;
    expect(code).toMatch(/^[A-Z]{4}$/);
    expect((await t.query(api.join.room, { code: code! })).ok).toBe(true);
  });

  test("the laptop's games: only links with the right key, each at its latest replay, newest first", async () => {
    const t = convexTest(schema, modules);
    const a = await t.mutation(api.hosting.createGame, {});
    const b = await t.mutation(api.hosting.createGame, {});
    // b has moved on to Game 2
    await t.run(async (ctx) => {
      const g = (await ctx.db.query("games").collect()).find((x) => x.slug === b.slug)!;
      await ctx.db.patch(g._id, { status: "done", endedAt: Date.now(), nextSlug: `${b.slug}-g2` });
      await ctx.db.insert("games", { ...Object.fromEntries(Object.entries(g).filter(([k]) => !k.startsWith("_"))), slug: `${b.slug}-g2`, title: "The Velvet Room · Game 2", status: "registration", endedAt: undefined, nextSlug: undefined, createdAt: Date.now() + 1 } as never);
    });
    const mine = await t.query(api.hosting.myGames, {
      links: [
        { slug: a.slug, hostKey: a.hostKey },
        { slug: b.slug, hostKey: b.hostKey },
        { slug: a.slug, hostKey: "wrongwrongwrong1" },
        { slug: "nope", hostKey: a.hostKey },
      ],
    });
    expect(mine.map((g) => g.slug)).toEqual([`${b.slug}-g2`, a.slug]);
    expect(mine[0].title).toBe("The Velvet Room · Game 2");
    expect(mine.every((g) => !g.over)).toBe(true);
  });

  test(`at most ${HOURLY_GAME_CAP} new games an hour across the site; games made with a command don't count`, async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.admin.createGame, { slug: "made-by-claude", title: "x", isTest: true, makeActive: false, registrationClosesAt: Date.now() + 864e5, deadlineLabel: "Sat" });
    for (let i = 0; i < HOURLY_GAME_CAP; i++) await t.mutation(api.hosting.createGame, {});
    await expect(t.mutation(api.hosting.createGame, {})).rejects.toThrow(/Try again in a few minutes/);
    // an hour later it opens up again
    await t.run(async (ctx) => {
      for (const g of await ctx.db.query("games").collect()) await ctx.db.patch(g._id, { createdAt: g.createdAt - 61 * 60 * 1000 });
    });
    await expect(t.mutation(api.hosting.createGame, {})).resolves.toHaveProperty("slug");
  });
});
