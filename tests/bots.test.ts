// Solo test mode (Oct 20): bot guests in a test game, and what they decide.
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { chooseJail, chooseSuspect, chooseThing, knownElims, scanQuota } from "../convex/botBrain";
import { buildCase } from "../convex/engine/build";
import { fakeCast, ROOMS_5 } from "../convex/engine/fake";
import { seeded } from "../convex/engine/rng";
import { settleRunoff } from "./steps";

const modules = import.meta.glob("../convex/**/*.ts");

beforeAll(() => {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
});

describe("what a bot decides", () => {
  const rng = seeded(7);
  const input = { ...fakeCast({ rng, guests: 8, rooms: ROOMS_5, markers: 10 }), search: "waves" as const };
  const cf = buildCase(input, rng);
  const ids = input.suspects.map((s) => s.id);
  const killer = cf.solution.killerId;
  const innocent = ids.find((id) => id !== killer)!;

  test("a bot knows the TV's evidence and only the cards it scanned", () => {
    const none = knownElims(cf, 3, new Set());
    const tvOnly = new Set(cf.clues.filter((c) => c.channel === "tv").flatMap((c) => c.elim.suspects));
    expect([...none.suspects].sort()).toEqual([...tvOnly].sort());
    const all = knownElims(cf, 3, new Set(cf.clues.flatMap((c) => (c.markerNumber ? [c.markerNumber] : []))));
    expect(all.suspects.size).toBeGreaterThanOrEqual(none.suspects.size);
    // The evidence never clears the killer, whatever a bot has seen.
    expect(all.suspects.has(killer)).toBe(false);
  });

  test("a sharp bot never names someone its evidence cleared, or itself", () => {
    const known = knownElims(cf, 3, new Set(cf.clues.flatMap((c) => (c.markerNumber ? [c.markerNumber] : []))));
    for (let i = 0; i < 200; i++) {
      const pick = chooseSuspect(Math.random, { self: innocent, killerId: killer, style: "sharp" }, ids, known)!;
      expect(pick).not.toBe(innocent);
      expect(known.suspects.has(pick)).toBe(false);
    }
  });

  test("the killer bot never names itself, and dodges the real weapon and room when it can", () => {
    const known = knownElims(cf, 3, new Set());
    const who = { self: killer, killerId: killer, style: "sharp" as const };
    for (let i = 0; i < 200; i++) {
      expect(chooseSuspect(Math.random, who, ids, known)).not.toBe(killer);
      expect(chooseThing(Math.random, who, input.exhibits.map((e) => e.id), known.exhibits, cf.solution.exhibitId)).not.toBe(cf.solution.exhibitId);
      expect(chooseThing(Math.random, who, input.rooms.map((r) => r.key), known.rooms, cf.solution.roomKey)).not.toBe(cf.solution.roomKey);
    }
  });

  test("a jail vote is a candidate or nobody, never the bot itself", () => {
    const known = knownElims(cf, 2, new Set());
    const seen = new Set<string | null>();
    for (let i = 0; i < 300; i++) {
      const v = chooseJail(Math.random, { self: innocent, killerId: killer, style: "careless" }, ids, known);
      expect(v).not.toBe(innocent);
      if (v) expect(ids).toContain(v);
      seen.add(v);
    }
    expect(seen.has(null)).toBe(true);
  });

  test("a bot looks at about half the open cards before it's ready", () => {
    expect(scanQuota(0)).toBe(1);
    expect(scanQuota(4)).toBe(2);
    expect(scanQuota(10)).toBe(5);
  });
});

async function botGame(bots = 6) {
  const t = convexTest(schema, modules);
  const { slug, hostKey } = await t.mutation(api.bots.createBotGame, { bots, speed: "fast" });
  return { t, slug, hostKey };
}

const gameOf = (t: ReturnType<typeof convexTest>, slug: string) =>
  t.run(async (ctx) => (await ctx.db.query("games").withIndex("by_slug", (q) => q.eq("slug", slug)).unique())!);

/** The human: a guest who signed up and checked in, like the host at the door. */
async function addHuman(t: ReturnType<typeof convexTest>, slug: string) {
  return await t.run(async (ctx) => {
    const g = (await ctx.db.query("games").withIndex("by_slug", (q) => q.eq("slug", slug)).unique())!;
    const now = Date.now();
    const id = await ctx.db.insert("players", {
      gameId: g._id, token: "human-token", realName: "Heston", firstName: "Heston", charName: "Mystery Heston", charKey: "mystery heston",
      who: "", signature: "", killerOk: true, checkedIn: true, weaponIn: true, exhibitLetter: "Z", claimedAt: now, figure: "mystery-m", createdAt: now, updatedAt: now,
    });
    return id;
  });
}

/** Skips the TV show so Round 1 is on, and runs the bots' timer a few beats. */
async function beats(t: ReturnType<typeof convexTest>, slug: string, n: number) {
  // The scheduled wake-up doesn't run in tests, so start the bots' timer by hand.
  if (!(await gameOf(t, slug)).bots?.chain) await t.mutation(internal.bots.wake, { gameId: (await gameOf(t, slug))._id });
  for (let i = 0; i < n; i++) {
    const g = await gameOf(t, slug);
    await t.mutation(internal.bots.tick, { gameId: g._id, chain: g.bots!.chain! });
  }
}

describe("a test game with bots", () => {
  test("starts as its own test game, the bots signed up, checked in and claimed", async () => {
    const { t, slug, hostKey } = await botGame(6);
    const g = await gameOf(t, slug);
    expect(g.isTest).toBe(true);
    expect(g.bots).toMatchObject({ speed: "fast", voices: false });
    const roster = await t.query(api.host.roster, { slug, hostKey });
    expect(roster.game.bots).toEqual({ speed: "fast", voices: false, count: 6 });
    const bots = roster.players.filter((p) => p.bot);
    expect(bots).toHaveLength(6);
    expect(bots.every((p) => p.checkedIn && p.claimed)).toBe(true);
  });

  test("the host can change how many bots before the game starts, not after", async () => {
    const { t, slug, hostKey } = await botGame(4);
    await t.mutation(api.bots.updateBots, { slug, hostKey, count: 9 });
    expect((await t.query(api.host.roster, { slug, hostKey })).game.bots?.count).toBe(9);
    await t.mutation(api.bots.updateBots, { slug, hostKey, count: 3 });
    expect((await t.query(api.host.roster, { slug, hostKey })).game.bots?.count).toBe(3);
    await addHuman(t, slug);
    await t.mutation(api.game.openDoors, { slug, hostKey });
    await t.mutation(api.game.startGame, { slug, hostKey, cards: "hidden" });
    await expect(t.mutation(api.bots.updateBots, { slug, hostKey, count: 5 })).rejects.toThrow(/started/);
    await t.mutation(api.bots.updateBots, { slug, hostKey, speed: "party", voices: true });
    expect((await gameOf(t, slug)).bots).toMatchObject({ speed: "party", voices: true });
  });

  test("bot settings only exist in test games with bots", async () => {
    const t = convexTest(schema, modules);
    const { slug, hostKey } = await t.mutation(api.hosting.createGame, {});
    await expect(t.mutation(api.bots.updateBots, { slug, hostKey, count: 3 })).rejects.toThrow(/test games/);
  });

  test("the bots play a whole night with one human: scan, ready, vote, lock in", async () => {
    const { t, slug, hostKey } = await botGame(7);
    await addHuman(t, slug);
    await t.mutation(api.game.openDoors, { slug, hostKey });
    await t.mutation(api.game.startGame, { slug, hostKey, cards: "hidden" });
    // The show is over: roles are out and Round 1 is on.
    await t.run(async (ctx) => {
      const g = (await ctx.db.query("games").withIndex("by_slug", (q) => q.eq("slug", slug)).unique())!;
      await ctx.db.patch(g._id, { rolesOut: true, introEndsAt: Date.now() - 1000 });
    });
    const human = "human-token";
    // Round 1: the bots scan cards in the open rooms and tap Ready; the human's phone lists the open cards.
    await beats(t, slug, 25);
    const scans = await t.run((ctx) => ctx.db.query("scans").collect());
    expect(scans.length).toBeGreaterThan(0);
    const phone = (await t.query(api.game.phone, { token: human }))!;
    expect(phone.game.bots).toBe(true);
    const open = phone.testCards.filter((c) => c.open);
    expect(open.length).toBeGreaterThan(0);
    // Finding a card by number works like scanning it.
    const found = await t.mutation(api.game.scanTestCard, { token: human, number: open[0].number });
    expect(found.number).toBe(open[0].number);
    // Asking a bot gives its story (Phase 3: the killer bot tells its cover) and the cards it found.
    const aBot = phone.board!.suspects.find((s) => s.bot)!;
    const answer = await t.query(api.bots.askBot, { token: human, botId: aBot.id as never });
    expect(answer.name).toBeTruthy();
    expect(answer.story).toMatch(/^I was .+, (alone|with .+)\. .+/);
    expect(Array.isArray(answer.found)).toBe(true);
    // Phase 3: the human's own phone says where they were.
    expect(phone.story).toMatch(/^When the lights went out, you were .+, (alone|with .+)\. .+/);
    // The bots are ready, and the round waits for the human (Oct 20: untimed rounds wait for everyone).
    const readyBots = await t.run(async (ctx) => (await ctx.db.query("players").collect()).filter((p) => p.bot && p.readyRound === 1).length);
    expect(readyBots).toBeGreaterThan(0);
    expect((await gameOf(t, slug)).round).toBe(1);
    await t.mutation(api.game.setReady, { token: human, ready: true });
    await beats(t, slug, 40);
    expect((await gameOf(t, slug)).round).toBe(2); // everyone ready: Round 2
    // On to Round 2's jail vote: the bots vote.
    if (!(await gameOf(t, slug)).vote) await t.mutation(api.game.advanceRound, { slug, hostKey }); // Round 2 ends: the jail vote opens
    expect((await gameOf(t, slug)).vote?.kind).toBe("jail");
    await beats(t, slug, 25);
    const ballots = await t.run((ctx) => ctx.db.query("ballots").collect());
    expect(ballots.length).toBeGreaterThanOrEqual(5);
    // To the lock-in.
    for (let i = 0; i < 8 && (await gameOf(t, slug)).round! < 4; i++) await t.mutation(api.game.advanceRound, { slug, hostKey });
    expect((await gameOf(t, slug)).round).toBe(4);
    await beats(t, slug, 25);
    const accs = await t.run((ctx) => ctx.db.query("accusations").collect());
    const free = await t.run(async (ctx) => (await ctx.db.query("players").collect()).filter((p) => p.bot && p.inGame && !p.jailed).length);
    expect(accs.length).toBe(free);
    // The human locks in last, and the reveal starts.
    const board = (await t.query(api.game.phone, { token: human }))!.board!;
    const me = (await t.query(api.game.phone, { token: human }))!.me;
    if (!me.jailed) {
      await t.mutation(api.game.accuse, { token: human, suspectId: board.suspects.find((s) => s.id !== me.id)!.id, exhibitId: board.exhibits[0].id, roomKey: board.rooms[0].key });
      await settleRunoff(t, slug); // Oct 21: a tie goes to a runoff first
      expect((await gameOf(t, slug)).status).toBe("reveal");
    }
  });

  test("lines with a bot's name aren't recorded unless bot voices are on", async () => {
    const { t, slug, hostKey } = await botGame(5);
    await addHuman(t, slug);
    await t.mutation(api.game.openDoors, { slug, hostKey });
    await t.mutation(api.game.startGame, { slug, hostKey, cards: "hidden" });
    const g = await gameOf(t, slug);
    const botIds = await t.run(async (ctx) => (await ctx.db.query("players").collect()).filter((p) => p.bot).map((p) => p._id as string));
    const todo = await t.mutation(internal.voice.claim, { gameId: g._id, scope: "start" });
    expect(todo.length).toBeGreaterThan(0);
    for (const w of todo) for (const id of botIds) expect(w.purpose).not.toContain(id);
  });
});

describe("the Don's stash (Phase 3)", () => {
  test("the first phone to scan the stash card gets $200; everyone after finds an empty envelope", async () => {
    const t = convexTest(schema, modules);
    const { slug, hostKey } = await t.mutation(api.bots.createBotGame, { bots: 5, speed: "fast" });
    for (const [token, first, letter] of [["h1", "Ann", "Y"], ["h2", "Bea", "Z"]]) {
      const g = await gameOf(t, slug);
      const now = Date.now();
      await t.run((ctx) =>
        ctx.db.insert("players", {
          gameId: g._id, token, realName: `${first} Hill`, firstName: first, charName: `Mystery ${first}`, charKey: `mystery ${first.toLowerCase()}`,
          who: "", signature: "", killerOk: true, checkedIn: true, weaponIn: true, exhibitLetter: letter, claimedAt: now, figure: "mystery-f", createdAt: now, updatedAt: now,
        }),
      );
    }
    await t.mutation(api.game.openDoors, { slug, hostKey });
    await t.mutation(api.game.startGame, { slug, hostKey, cards: "hidden" });
    await t.run(async (ctx) => {
      const g = (await ctx.db.query("games").withIndex("by_slug", (q) => q.eq("slug", slug)).unique())!;
      await ctx.db.patch(g._id, { rolesOut: true, introEndsAt: Date.now() - 1000, round: 3 });
    });
    const cf = await t.run(async (ctx) => {
      const { caseFor } = await import("../convex/caseFile");
      const g = (await ctx.db.query("games").withIndex("by_slug", (q) => q.eq("slug", slug)).unique())!;
      return caseFor(ctx, g);
    });
    const stash = cf!.clues.find((c) => c.kind === "stash");
    expect(stash).toBeTruthy();
    const first = await t.mutation(api.game.scanTestCard, { token: "h1", number: stash!.markerNumber! });
    expect(first.text).toMatch(/\$200 in chips/);
    const second = await t.mutation(api.game.scanTestCard, { token: "h2", number: stash!.markerNumber! });
    expect(second.text).toMatch(/empty envelope/);
    // Each phone keeps what it found.
    expect((await t.query(api.game.phone, { token: "h1" }))!.scans.find((s) => s.number === stash!.markerNumber)!.text).toMatch(/\$200/);
    expect((await t.query(api.game.phone, { token: "h2" }))!.scans.find((s) => s.number === stash!.markerNumber)!.text).toMatch(/empty/);
    expect((await gameOf(t, slug)).stash?.playerId).toBeTruthy();
  });
});

describe("bots in a runoff (Oct 21)", () => {
  test("after the last words, each bot votes on what's tied, never itself; the human's vote finishes it", async () => {
    const { t, slug, hostKey } = await botGame(5);
    await addHuman(t, slug);
    await t.mutation(api.game.openDoors, { slug, hostKey });
    await t.mutation(api.game.startGame, { slug, hostKey, cards: "hidden" });
    const players = await t.run((ctx) => ctx.db.query("players").collect());
    const [a, b] = players.filter((p) => p.bot).map((p) => p._id as string);
    await t.run(async (ctx) => {
      const g = (await ctx.db.query("games").withIndex("by_slug", (q) => q.eq("slug", slug)).unique())!;
      await ctx.db.patch(g._id, { round: 4, rolesOut: true, introEndsAt: Date.now() - 1000, runoff: { at: Date.now() - 100_000, who: [a, b], words: [a, b], voteAt: Date.now() - 1 } });
    });
    await beats(t, slug, 30);
    const votes = await t.run((ctx) => ctx.db.query("runoffVotes").collect());
    const bots = players.filter((p) => p.bot);
    expect(votes.length).toBe(bots.length);
    for (const v of votes) {
      expect([a, b]).toContain(v.who);
      expect(v.who).not.toBe(v.playerId);
    }
    expect((await gameOf(t, slug)).status).toBe("playing");
    await t.mutation(api.game.runoffVote, { token: "human-token", who: a });
    expect((await gameOf(t, slug)).status).toBe("reveal");
  });
});
