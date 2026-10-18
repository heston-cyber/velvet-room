// Oct 17 (Heston): Best Detective goes to the most accurate guesses among those who named the killer (a tie to whoever
// voted to jail the killer, else shared); Best Dressed is voted (Best Liar gone Oct 18); the killer who walks gets "Got Away
// With It"; Prime Suspect is the innocent the most lock-ins and jail votes pointed at; and only awards someone won are
// shown.
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import type { Id } from "../convex/_generated/dataModel";
import { caseFor } from "../convex/caseFile";
import { nextRound } from "./steps";

const modules = import.meta.glob("../convex/**/*.ts");
const FUTURE = Date.now() + 7 * 864e5;
const SLUG = "test-awards";

beforeAll(() => {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
});

type T = ReturnType<typeof convexTest>;
const game = (t: T) => t.run(async (ctx) => (await ctx.db.query("games").first())!);

async function toTheJailVote(guests = 6) {
  const t = convexTest(schema, modules);
  const { hostKey } = await t.mutation(internal.admin.createGame, {
    slug: SLUG, title: "Awards test", isTest: true, makeActive: false, registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 24",
  });
  await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, pacing: { mode: "ready", roundMinutes: 10 } });
  await t.mutation(internal.game.seedFakeCast, { slug: SLUG, guests, markers: 8, seed: 12 });
  await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
  await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
  await t.mutation(api.game.skipIntro, { slug: SLUG, hostKey });
  await t.mutation(api.game.advanceRound, { slug: SLUG, hostKey }); // → Round 2
  await t.mutation(api.game.advanceRound, { slug: SLUG, hostKey }); // → the jail vote
  const players = await t.run((ctx) => ctx.db.query("players").collect());
  const sol = await t.run(async (ctx) => (await caseFor(ctx, (await ctx.db.query("games").first())!))!.solution);
  const board = (await t.query(api.game.phone, { token: players[0].token }))!.board!;
  const killer = players.find((p) => p._id === sol.killerId)!;
  const innocents = players.filter((p) => p._id !== sol.killerId);
  const right = { exhibitId: sol.exhibitId, roomKey: sol.roomKey };
  const wrong = { exhibitId: board.exhibits.find((e) => e.id !== sol.exhibitId)!.id, roomKey: board.rooms.find((r) => r.key !== sol.roomKey)!.key };
  const tvKey = (await game(t)).tvKey!;
  return { t, hostKey, players, killer, innocents, right, wrong, tvKey };
}

const finish = async (t: T, hostKey: string) => {
  await t.mutation(api.game.finish, { slug: SLUG, hostKey });
  return (await t.query(api.game.results, { slug: SLUG }))!.awards!;
};

describe("awards (Oct 17)", () => {
  test("the killer walks: Best Detective by most right and the jail-vote tie-break, Prime Suspect, Best Dressed, Got Away With It (no Best Liar since Oct 18)", async () => {
    const { t, hostKey, killer, innocents: [a, b, c, d, e], right, wrong, tvKey } = await toTheJailVote(6);
    // The jail vote: a votes to jail the killer, c and d vote to jail e. Not a majority: nobody goes to jail.
    await t.mutation(api.game.castVote, { token: a.token, targetId: killer._id });
    await t.mutation(api.game.castVote, { token: c.token, targetId: e._id });
    await t.mutation(api.game.castVote, { token: d.token, targetId: e._id });
    await nextRound(t, SLUG, hostKey); // close it, skip the verdict → Round 3
    await nextRound(t, SLUG, hostKey); // → the lock-in (nobody in jail)
    expect((await game(t)).round).toBe(4);
    const lock = (p: { token: string }, suspectId: string, w: typeof right) => t.mutation(api.game.accuse, { token: p.token, suspectId, ...w });
    // a and b get all three, c the killer and nothing else; d and the killer blame e; e blames d.
    // 3 of 6 named the killer: not more than half, so the killer walks.
    await lock(a, killer._id, right);
    await lock(b, killer._id, right);
    await lock(c, killer._id, wrong);
    await lock(d, e._id, right);
    await lock(e, d._id, wrong);
    await lock(killer, e._id, wrong);
    expect((await game(t)).status).toBe("reveal");
    // Best Dressed only for guests who played (Oct 18: Best Liar is gone; an old page's liar vote is ignored).
    const ghost = await t.run((ctx) => ctx.db.insert("players", { gameId: a.gameId, token: "ghost-token", realName: "Ghost", charName: "Ghost", charKey: "ghost", who: "", signature: "", killerOk: true, checkedIn: false, createdAt: 0, updatedAt: 0 }));
    await expect(t.mutation(api.game.vote, { token: a.token, dressed: ghost })).rejects.toThrow(/played tonight/);
    for (const p of [a, b, d, e, killer]) await t.mutation(api.game.vote, { token: p.token, dressed: c._id, liar: p._id === b._id ? d._id : b._id });
    await t.mutation(api.game.vote, { token: c.token, dressed: a._id });
    const awards = await finish(t, hostKey);
    expect(awards.map((x) => x.key)).toEqual(["detective", "prime", "dressed", "gotAway"]);
    const of = (k: string) => awards.find((x) => x.key === k)!;
    // a and b tie on 3 of 3; a voted to jail the killer.
    expect(of("detective").names).toEqual([a.charName]);
    expect(of("detective").sub).toBe("3 of 3 right");
    // e: two lock-ins (d, the killer) and two jail votes (c, d).
    expect(of("prime").names).toEqual([e.charName]);
    expect(of("prime").sub).toMatch(/4 times/);
    expect(of("dressed").names).toEqual([c.charName]);
    expect(of("gotAway").names).toEqual([killer.charName]);
    // The TV gets the same list, with the winners' drawings, and a recorded name for each winner when there is one.
    const tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(tv.results!.awards!.map((x) => x.key)).toEqual(awards.map((x) => x.key));
    expect(tv.results!.awards![0].cue).toBe("awardDetective");
    expect(Object.keys(tv.voice.winners!).sort()).toEqual(["detective", "dressed", "gotAway", "prime"]);
  });

  test("the detectives win: no Got Away With It; an award nobody won isn't shown; a tie nobody can break is shared", async () => {
    const { t, hostKey, killer, innocents: [a, b, c, d, e], right, wrong } = await toTheJailVote(6);
    await nextRound(t, SLUG, hostKey); // nobody votes: nobody jailed → Round 3
    await nextRound(t, SLUG, hostKey); // → the lock-in
    const lock = (p: { token: string }, suspectId: string, w: typeof right) => t.mutation(api.game.accuse, { token: p.token, suspectId, ...w });
    for (const p of [a, b, c, d]) await lock(p, killer._id, right);
    await lock(e, a._id, wrong);
    await lock(killer, a._id, wrong);
    const awards = await finish(t, hostKey);
    // Nobody voted for Best Dressed or Best Liar; the killer was caught.
    expect(awards.map((x) => x.key)).toEqual(["detective", "prime"]);
    expect(awards[0].names.sort()).toEqual([a, b, c, d].map((p) => p.charName).sort());
    expect(awards[1].names).toEqual([a.charName]);
  });

  test("Best Detective needs the killer: right weapon and room alone don't win it", async () => {
    const { t, hostKey, killer, innocents: [a, b, c, d, e], right, wrong } = await toTheJailVote(6);
    await nextRound(t, SLUG, hostKey);
    await nextRound(t, SLUG, hostKey);
    const lock = (p: { token: string }, suspectId: string, w: typeof right) => t.mutation(api.game.accuse, { token: p.token, suspectId, ...w });
    await lock(a, b._id, right); // 2 of 3, but not the killer
    await lock(b, killer._id, wrong); // 1 of 3, with the killer
    for (const p of [c, d, e, killer]) await lock(p, a._id, wrong);
    const awards = await finish(t, hostKey);
    expect(awards.find((x) => x.key === "detective")!.names).toEqual([b.charName]);
    expect(awards.find((x) => x.key === "detective")!.sub).toBe("1 of 3 right");
  });
});
