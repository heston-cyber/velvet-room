import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { nextRound } from "./steps";
import { VOTE } from "../convex/shared";

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

  test("ready votes: once most guests are ready the round ends; Round 1 has no vote, Round 2 ends in the jail vote (Oct 16)", async () => {
    const { t, hostKey, tokens } = await started({ guests: 6 });
    expect((await game(t)).round).toBe(1);
    for (const token of tokens.slice(0, 3)) await t.mutation(api.game.setReady, { token, ready: true });
    expect((await game(t)).round).toBe(1); // 3 of 6 is not most
    await t.mutation(api.game.setReady, { token: tokens[3], ready: true });
    let g = await game(t);
    expect(g.round).toBe(2); // no vote after Round 1
    expect(g.vote).toBeUndefined();
    const phone = await t.query(api.game.phone, { token: tokens[0] });
    expect(phone!.evidence.length).toBeGreaterThan(0);
    expect(phone!.evidence.every((e) => e.round === 2)).toBe(true);
    expect(phone!.me.ready).toBe(false); // a new round starts fresh
    for (const token of tokens.slice(0, 4)) await t.mutation(api.game.setReady, { token, ready: true });
    g = await game(t);
    expect(g.round).toBe(2);
    expect(g.vote).toMatchObject({ kind: "jail", round: 2 });
    await nextRound(t, SLUG, hostKey);
    expect((await game(t)).round).toBe(3);
  });

  test("timer pacing: rounds end on their own (then the vote runs its clock), pausing keeps the time left", async () => {
    vi.useFakeTimers();
    try {
      const { t, hostKey } = await started({ guests: 5, pacing: "timer" });
      expect((await game(t)).roundEndsAt).toBeGreaterThan(Date.now());
      vi.advanceTimersByTime(10 * 60_000 - 1000);
      await t.finishInProgressScheduledFunctions();
      expect((await game(t)).round).toBe(1);
      vi.advanceTimersByTime(2000);
      await t.finishInProgressScheduledFunctions();
      // Round 1 has no vote: straight on to Round 2 (Oct 16)
      expect((await game(t)).round).toBe(2);
      expect((await game(t)).vote).toBeUndefined();
      vi.advanceTimersByTime(10 * 60_000 + 1000);
      await t.finishInProgressScheduledFunctions();
      expect((await game(t)).vote?.kind).toBe("jail");
      // nobody votes: it closes on its clock, the verdict shows, then Round 3
      vi.advanceTimersByTime(VOTE.ms + 100);
      await t.finishInProgressScheduledFunctions();
      expect((await game(t)).vote?.outcome).toBe("nobody");
      vi.advanceTimersByTime(VOTE.nextMs + 100);
      await t.finishInProgressScheduledFunctions();
      expect((await game(t)).round).toBe(3);
      await t.mutation(api.game.setPaused, { slug: SLUG, hostKey, paused: true });
      vi.advanceTimersByTime(30 * 60_000);
      await t.finishInProgressScheduledFunctions();
      expect((await game(t)).round).toBe(3); // paused: no change
      await t.mutation(api.game.setPaused, { slug: SLUG, hostKey, paused: false });
      vi.advanceTimersByTime(10 * 60_000 + 1000);
      await t.finishAllScheduledFunctions(vi.runAllTimers);
      expect((await game(t)).round).toBeGreaterThanOrEqual(4);
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
    ).rejects.toThrow(/after the last round/);
    for (let i = 0; i < 3; i++) await nextRound(t, SLUG, hostKey);
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

  test("scoring (v2): the group wins only with more than half right on the killer, the weapon and the room", async () => {
    const run = async (guests: number, plan: (i: number) => { person: boolean; weapon: boolean; room: boolean }) => {
      const { t, hostKey, tokens, killerToken } = await started({ guests });
      for (let i = 0; i < 3; i++) await nextRound(t, SLUG, hostKey);
      // peek at the answer the way the reveal will, through the sealed file (test only)
      const killer = (await t.query(api.game.phone, { token: killerToken }))!;
      const board = killer.board!;
      const line = killer.briefing!.lines[0];
      const exhibit = board.exhibits.find((e) => line.includes(`with the ${e.name.toLowerCase()} in`))!;
      const room = board.rooms.find((r) => line.includes(r.label.replace(/^The /, "the ")))!;
      const killerId = killer.me.id;
      // Everyone locks in, the killer last (their pick counts too).
      const order = [...tokens.filter((tk) => tk !== killerToken), killerToken];
      for (const [i, token] of order.entries()) {
        const me = (await t.query(api.game.phone, { token }))!.me.id;
        const p = plan(i);
        const wrongSuspect = board.suspects.find((s) => s.id !== killerId && s.id !== me)!.id;
        await t.mutation(api.game.accuse, {
          token,
          suspectId: p.person && me !== killerId ? killerId : wrongSuspect,
          exhibitId: p.weapon ? exhibit.id : board.exhibits.find((e) => e.id !== exhibit.id)!.id,
          roomKey: p.room ? room.key : board.rooms.find((r) => r.key !== room.key)!.key,
        });
      }
      await expect(t.mutation(api.game.accuse, { token: order[0], suspectId: killerId, exhibitId: exhibit.id, roomKey: room.key })).rejects.toThrow();
      return { res: (await t.query(api.game.results, { slug: SLUG }))!, t, first: order[0] };
    };
    // 5 lock-ins: 3 get everything (more than half on each), so the group wins.
    let r = await run(5, (i) => ({ person: i < 3, weapon: i < 3, room: i < 3 }));
    expect(r.res.killerWins).toBe(false);
    expect(r.res.named).toBe(3);
    expect(r.res.aces).toHaveLength(3);
    expect((await r.t.query(api.game.phone, { token: r.first }))!.results!.mine!.score).toBe(3);
    // 4 lock-ins: exactly half on the killer is not enough, even with the weapon and room right.
    r = await run(4, (i) => ({ person: i < 2, weapon: true, room: true }));
    expect(r.res.killerWins).toBe(true);
    // Most name the killer and the room, but not the weapon: the killer still wins.
    r = await run(5, (i) => ({ person: i < 4, weapon: i < 2, room: true }));
    expect(r.res.killerWins).toBe(true);
  });

  test("votes and awards: no self-votes, awards appear when the host finishes", async () => {
    const { t, hostKey, tokens, players } = await started({ guests: 4 });
    for (let i = 0; i < 4; i++) await nextRound(t, SLUG, hostKey);
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
      slug: SLUG, realName: "A", charName: "Ace", who: "x", signature: "x", weapon: "candlestick", killerOk: true, figure: "chrissie",
    });
    const r = await t.mutation(api.game.checkIn, { token, weaponIn: false });
    expect(r.exhibitLetter).toBeNull();
    const r2 = await t.mutation(api.game.checkIn, { token, weaponIn: true });
    expect(r2.exhibitLetter).toMatch(/^[A-Z]$/);
  });
});
