// The book (Oct 21): one optional bet per guest on who the killer is, odds by round, closed at the lock-in, settled on
// each phone after the reveal.
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { killerTake, oddsFor, pot, settleBet } from "../convex/book";
import { caseFor } from "../convex/caseFile";
import { settleRunoff } from "./steps";

const modules = import.meta.glob("../convex/**/*.ts");
const FUTURE = Date.now() + 7 * 864e5;
const SLUG = "test-book";

beforeAll(() => {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
});

describe("the book's arithmetic", () => {
  test("bet early, win more: Round 1 pays 4 to 1, Round 2 3 to 1, Round 3 2 to 1, then it's closed", () => {
    expect([1, 2, 3, 4].map(oddsFor)).toEqual([4, 3, 2, null]);
  });
  test("right: stake back plus winnings; wrong: to the killer; the killer's own bet doesn't count", () => {
    expect(settleBet({ playerId: "a", suspectId: "k", amount: 200, odds: 4 }, "k")).toEqual({ kind: "won", amount: 200, odds: 4, winnings: 800, take: 1000 });
    expect(settleBet({ playerId: "a", suspectId: "b", amount: 200, odds: 4 }, "k")).toEqual({ kind: "lost", amount: 200 });
    expect(settleBet({ playerId: "k", suspectId: "b", amount: 300, odds: 2 }, "k")).toEqual({ kind: "void", amount: 300 });
    const bets = [
      { playerId: "a", suspectId: "k", amount: 100, odds: 4 },
      { playerId: "b", suspectId: "c", amount: 300, odds: 3 },
      { playerId: "c", suspectId: "b", amount: 200, odds: 2 },
      { playerId: "k", suspectId: "a", amount: 500, odds: 4 },
    ];
    expect(killerTake(bets, "k")).toBe(500);
    expect(pot(bets)).toBe(1100);
  });
});

async function started(guests = 6) {
  const t = convexTest(schema, modules);
  const { hostKey } = await t.mutation(internal.admin.createGame, {
    slug: SLUG, title: "Book test", isTest: true, makeActive: false, registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 31",
  });
  await t.mutation(internal.game.seedFakeCast, { slug: SLUG, guests, markers: 8, seed: 9 });
  await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
  await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
  await t.mutation(api.game.skipIntro, { slug: SLUG, hostKey });
  const players = await t.run((ctx) => ctx.db.query("players").collect());
  const cf = await t.run(async (ctx) => (await caseFor(ctx, (await ctx.db.query("games").first())!))!);
  return { t, hostKey, players, cf };
}
const setRound = (t: ReturnType<typeof convexTest>, round: number, extra: Record<string, unknown> = {}) =>
  t.run(async (ctx) => {
    const g = (await ctx.db.query("games").first())!;
    await ctx.db.patch(g._id, { round, ...extra });
  });

describe("the Betting tab", () => {
  test("one bet each, $100 to $500, never on yourself, at the round's odds; the stand's total shows, not who bet on whom", async () => {
    const { t, players, cf } = await started();
    const [a, b, c] = players;
    await expect(t.mutation(api.game.placeBet, { token: a.token, suspectId: a._id, amount: 100 })).rejects.toThrow(/yourself/);
    await expect(t.mutation(api.game.placeBet, { token: a.token, suspectId: b._id, amount: 600 })).rejects.toThrow(/\$100 to \$500/);
    await expect(t.mutation(api.game.placeBet, { token: a.token, suspectId: b._id, amount: 150 })).rejects.toThrow(/\$100 to \$500/);
    await t.mutation(api.game.placeBet, { token: a.token, suspectId: b._id, amount: 200 });
    await expect(t.mutation(api.game.placeBet, { token: a.token, suspectId: c._id, amount: 100 })).rejects.toThrow(/One bet a game/);
    await setRound(t, 2);
    await t.mutation(api.game.placeBet, { token: b.token, suspectId: cf.solution.killerId === b._id ? a._id : cf.solution.killerId, amount: 500 });
    const phone = (await t.query(api.game.phone, { token: c.token }))!;
    expect(phone.book).toMatchObject({ odds: 3, pot: 700, bets: 2, mine: null, result: null });
    const mine = (await t.query(api.game.phone, { token: a.token }))!.book!.mine!;
    expect(mine).toMatchObject({ suspectId: b._id, amount: 200, odds: 4, round: 1 });
  });

  test("jailbirds can't bet, and the book closes when the lock-in starts", async () => {
    const { t, players } = await started();
    const [a, b, c] = players;
    await t.run((ctx) => ctx.db.patch(a._id, { jailed: true }));
    await setRound(t, 3);
    await expect(t.mutation(api.game.placeBet, { token: a.token, suspectId: b._id, amount: 100 })).rejects.toThrow(/Jailbirds/);
    expect((await t.query(api.game.phone, { token: c.token }))!.book!.odds).toBe(2);
    await setRound(t, 4);
    await expect(t.mutation(api.game.placeBet, { token: c.token, suspectId: b._id, amount: 100 })).rejects.toThrow(/closed when the lock-in started/);
    expect((await t.query(api.game.phone, { token: c.token }))!.book!.odds).toBeNull();
  });

  test("after the reveal each phone says what its bet came to; the killer's says the wrong bets are theirs", async () => {
    const { t, players, cf } = await started();
    const killer = players.find((p) => p._id === cf.solution.killerId)!;
    const innocents = players.filter((p) => p._id !== killer._id);
    const [right, wrong, cover] = [innocents[0], innocents[1], killer];
    await t.mutation(api.game.placeBet, { token: right.token, suspectId: killer._id, amount: 200 }); // Round 1: 4 to 1
    await t.mutation(api.game.placeBet, { token: wrong.token, suspectId: innocents[2]._id, amount: 300 });
    await t.mutation(api.game.placeBet, { token: cover.token, suspectId: innocents[3]._id, amount: 100 });
    await setRound(t, 4, { rolesOut: true });
    const board = (await t.query(api.game.phone, { token: players[0].token }))!.board!;
    for (const p of players) await t.mutation(api.game.accuse, { token: p.token, suspectId: p._id === killer._id ? innocents[0]._id : killer._id, exhibitId: cf.solution.exhibitId, roomKey: board.rooms[0].key });
    await settleRunoff(t, SLUG);
    const book = async (p: { token: string }) => (await t.query(api.game.phone, { token: p.token }))!.book!;
    expect((await book(right)).result).toEqual({ kind: "won", amount: 200, odds: 4, winnings: 800, take: 1000 });
    expect((await book(wrong)).result).toEqual({ kind: "lost", amount: 300 });
    expect((await book(cover)).result).toEqual({ kind: "void", amount: 100 });
    expect((await book(cover)).take).toBe(300);
    expect((await book(right)).take).toBeNull();
  });
});
