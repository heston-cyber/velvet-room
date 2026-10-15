import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const FUTURE = Date.now() + 7 * 864e5;
const SLUG = "test-party";

beforeAll(() => {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
});

async function started(opts: { guests?: number; markers?: number; pacing?: "ready" | "timer"; tone?: "classic" | "adult" } = {}) {
  const t = convexTest(schema, modules);
  const { hostKey } = await t.mutation(internal.admin.createGame, {
    slug: SLUG, title: "Party test", isTest: true, makeActive: false, registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 24",
  });
  await t.mutation(api.host.updateSettings, {
    slug: SLUG, hostKey, pacing: { mode: opts.pacing ?? "ready", roundMinutes: 10 }, tone: opts.tone ?? "classic",
  });
  await t.mutation(internal.game.seedFakeCast, { slug: SLUG, guests: opts.guests ?? 9, markers: opts.markers ?? 15, seed: 8 });
  await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
  await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
  // Skip the show (intro, How to play, roll call): Round 1 starts and the roles are on the phones.
  await t.mutation(api.game.skipIntro, { slug: SLUG, hostKey });
  const players = await t.run((ctx) => ctx.db.query("players").collect());
  const tokens = players.map((p) => p.token);
  const phones = await Promise.all(tokens.map((token) => t.query(api.game.phone, { token })));
  const killerToken = tokens[phones.findIndex((p) => p?.briefing?.role === "killer")];
  return { t, hostKey, tokens, killerToken, players };
}

const game = (t: ReturnType<typeof convexTest>) => t.run(async (ctx) => (await ctx.db.query("games").first())!);

describe("party night", () => {
  test("each phone sees only its own secrets, and nobody sees the answer before the reveal", async () => {
    const { t, tokens } = await started();
    const phones = await Promise.all(tokens.map((token) => t.query(api.game.phone, { token })));
    expect(phones.filter((p) => p!.briefing!.role === "killer")).toHaveLength(1);
    for (const [i, p] of phones.entries()) {
      const mine = JSON.stringify(p);
      for (const [j, other] of phones.entries()) {
        if (i === j) continue;
        const b = other!.briefing!;
        expect(mine).not.toContain(b.motive);
        expect(mine).not.toContain(b.secret);
        if (b.tip) expect(mine.includes(b.tip) && !p!.briefing!.tip?.includes(b.tip)).toBe(false);
      }
      if (p!.briefing!.role !== "killer") expect(mine).not.toContain("You did it");
      expect(p!.results).toBeNull();
    }
  });

  test("ready votes: the next round starts once most guests are ready", async () => {
    const { t, tokens } = await started({ guests: 6 });
    expect((await game(t)).round).toBe(1);
    for (const token of tokens.slice(0, 3)) await t.mutation(api.game.setReady, { token, ready: true });
    expect((await game(t)).round).toBe(1); // 3 of 6 is not most
    await t.mutation(api.game.setReady, { token: tokens[3], ready: true });
    expect((await game(t)).round).toBe(2);
    const phone = await t.query(api.game.phone, { token: tokens[0] });
    expect(phone!.evidence.length).toBeGreaterThan(0);
    expect(phone!.evidence.every((e) => e.round === 2)).toBe(true);
    expect(phone!.me.ready).toBe(false); // a new round starts fresh
  });

  test("timer pacing: rounds end on their own, pausing keeps the time left", async () => {
    vi.useFakeTimers();
    try {
      const { t, hostKey } = await started({ guests: 5, pacing: "timer" });
      expect((await game(t)).roundEndsAt).toBeGreaterThan(Date.now());
      vi.advanceTimersByTime(10 * 60_000 - 1000);
      await t.finishInProgressScheduledFunctions();
      expect((await game(t)).round).toBe(1);
      vi.advanceTimersByTime(2000);
      await t.finishInProgressScheduledFunctions();
      expect((await game(t)).round).toBe(2);
      await t.mutation(api.game.setPaused, { slug: SLUG, hostKey, paused: true });
      vi.advanceTimersByTime(30 * 60_000);
      await t.finishInProgressScheduledFunctions();
      expect((await game(t)).round).toBe(2); // paused: no change
      await t.mutation(api.game.setPaused, { slug: SLUG, hostKey, paused: false });
      vi.advanceTimersByTime(10 * 60_000 + 1000);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect((await game(t)).round).toBeGreaterThanOrEqual(3);
    } finally {
      vi.useRealTimers();
    }
  });

  test("scanning a marker records it for that guest only", async () => {
    const { t, tokens } = await started();
    const markers = await t.run((ctx) => ctx.db.query("markers").collect());
    const clue = await t.mutation(api.game.scanMarker, { token: tokens[0], code: markers[2].code.toUpperCase() });
    expect(clue.number).toBe(markers[2].number);
    await t.mutation(api.game.scanMarker, { token: tokens[0], code: markers[2].code }); // again: no duplicate
    const mine = await t.query(api.game.phone, { token: tokens[0] });
    const theirs = await t.query(api.game.phone, { token: tokens[1] });
    expect(mine!.scans).toHaveLength(1);
    expect(mine!.scans[0].text).toBe(clue.text);
    expect(theirs!.scans).toHaveLength(0);
    await expect(t.mutation(api.game.scanMarker, { token: tokens[0], code: "zzzzzz" })).rejects.toThrow(/isn't one of tonight's markers/);
  });

  test("a guest who arrives after the draw can't play", async () => {
    const { t } = await started({ guests: 5 });
    const late = await t.mutation(api.registration.update, {
      token: (await t.run((ctx) => ctx.db.query("players").first()))!.token,
      realName: "x", charName: "x", who: "x", signature: "x", weapon: "x", weaponDesc: "x", killerOk: true,
    }).catch((e) => e);
    expect(late).toBeInstanceOf(Error); // registration is closed once the game starts
  });

  test("accusations: open after Round 3, no self-accusing, all in means the reveal", async () => {
    const { t, hostKey, tokens, players } = await started({ guests: 5 });
    const board = (await t.query(api.game.phone, { token: tokens[0] }))!.board!;
    await expect(
      t.mutation(api.game.accuse, { token: tokens[0], suspectId: board.suspects[1].id, exhibitId: board.exhibits[0].id, roomKey: board.rooms[0].key }),
    ).rejects.toThrow(/after the last evidence/);
    for (let i = 0; i < 3; i++) await t.mutation(api.game.advanceRound, { slug: SLUG, hostKey });
    expect((await game(t)).round).toBe(4);
    await expect(
      t.mutation(api.game.accuse, { token: tokens[0], suspectId: players[0]._id, exhibitId: board.exhibits[0].id, roomKey: board.rooms[0].key }),
    ).rejects.toThrow(/can't accuse yourself/);
    for (const [i, token] of tokens.entries()) {
      const other = board.suspects.find((s) => s.id !== players[i]._id)!;
      await t.mutation(api.game.accuse, { token, suspectId: other.id, exhibitId: board.exhibits[0].id, roomKey: board.rooms[0].key });
    }
    expect((await game(t)).status).toBe("reveal");
    const res = await t.query(api.game.results, { slug: SLUG });
    expect(res!.killer).toBeTruthy();
    const phone = await t.query(api.game.phone, { token: tokens[0] });
    expect(phone!.results!.mine).not.toBeNull();
  });

  test("scoring: a point each for person, exhibit and room; the killer wins only if most guess wrong", async () => {
    const { t, hostKey, tokens, killerToken } = await started({ guests: 5 });
    for (let i = 0; i < 3; i++) await t.mutation(api.game.advanceRound, { slug: SLUG, hostKey });
    // peek at the answer the way the reveal will, through the sealed file (test only)
    const killer = (await t.query(api.game.phone, { token: killerToken }))!;
    const board = killer.board!;
    const line = killer.briefing!.lines[0];
    const letter = /Exhibit ([A-Z])/.exec(line)![1];
    const exhibit = board.exhibits.find((e) => e.letter === letter)!;
    const room = board.rooms.find((r) => line.includes(r.label.replace(/^The /, "the ")))!;
    const killerId = killer.me.id;
    const innocents = tokens.filter((tk) => tk !== killerToken);
    // two of four innocents name the killer (exactly half): detectives win
    for (const [i, token] of innocents.entries()) {
      const wrong = board.suspects.find((s) => s.id !== killerId && s.id !== (killer.lobby.find(() => false)?.id))!;
      const me = (await t.query(api.game.phone, { token }))!.me.id;
      const suspectId = i < 2 ? killerId : board.suspects.find((s) => s.id !== killerId && s.id !== me)!.id;
      await t.mutation(api.game.accuse, { token, suspectId, exhibitId: exhibit.id, roomKey: i === 0 ? room.key : board.rooms.find((r) => r.key !== room.key)!.key });
      void wrong;
    }
    const other = board.suspects.find((s) => s.id !== killerId)!;
    await t.mutation(api.game.accuse, { token: killerToken, suspectId: other.id, exhibitId: exhibit.id, roomKey: room.key });
    const res = (await t.query(api.game.results, { slug: SLUG }))!;
    expect(res.killerWins).toBe(false);
    expect(res.named).toBe(2);
    expect(res.aces).toHaveLength(1);
    const first = (await t.query(api.game.phone, { token: innocents[0] }))!.results!.mine!;
    expect(first.score).toBe(3);
  });

  test("votes and awards: no self-votes, awards appear when the host finishes", async () => {
    const { t, hostKey, tokens, players } = await started({ guests: 4 });
    for (let i = 0; i < 4; i++) await t.mutation(api.game.advanceRound, { slug: SLUG, hostKey });
    expect((await game(t)).status).toBe("reveal");
    await expect(t.mutation(api.game.vote, { token: tokens[0], dressed: players[0]._id })).rejects.toThrow(/yourself/);
    for (const token of tokens.slice(1)) await t.mutation(api.game.vote, { token, dressed: players[0]._id, liar: players[0]._id });
    expect((await t.query(api.game.results, { slug: SLUG }))!.awards).toBeNull();
    await t.mutation(api.game.finish, { slug: SLUG, hostKey });
    const res = (await t.query(api.game.results, { slug: SLUG }))!;
    expect(res.awards!.bestDressed[0].name).toBe(players[0].charName);
  });

  test("the adult script reaches the phones when the game menu picks it", async () => {
    const { t, killerToken } = await started({ guests: 5, tone: "adult" });
    const phone = (await t.query(api.game.phone, { token: killerToken }))!;
    expect(phone.briefing!.lines[0]).toMatch(/whacked/);
    expect(phone.briefing!.tipLabel).toMatch(/damn/);
  });

  test("check-in before the doors open works, and a late guest without a weapon gets no letter", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.admin.createGame, {
      slug: SLUG, title: "x", isTest: true, makeActive: false, registrationClosesAt: FUTURE, deadlineLabel: "x",
    });
    const { token } = await t.mutation(api.registration.register, {
      slug: SLUG, realName: "A", charName: "Ace", who: "x", signature: "x", weapon: "candlestick", killerOk: true, figure: "slick",
    });
    const r = await t.mutation(api.game.checkIn, { token, weaponIn: false });
    expect(r.exhibitLetter).toBeNull();
    const r2 = await t.mutation(api.game.checkIn, { token, weaponIn: true });
    expect(r2.exhibitLetter).toMatch(/^[A-Z]$/);
  });
});
