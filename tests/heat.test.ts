// Phase 4 (Oct 21): the heat, Round 2's pick (the killer's frame) and the late tips with the plant. Heston, Oct 20:
// three tags puts the heat on someone (at every size), tags stay until moved, the heat goes away below 3 and at the
// lock-in, tags on cleared guests drop; every phone gets the same "pick one" in Round 2; the killer may frame someone
// and change it until the jail vote opens; the plant replaces the real tip that already names that guest.
import { convexTest } from "convex-test";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { caseFor } from "../convex/caseFile";
import { heatNow, myTag } from "../convex/heat";
import { HEAT_AT, debtLines, heatOn, liveTags, plantTips, publiclyCleared } from "../convex/engine/heat";
import { seeded } from "../convex/engine/rng";
import { TIPS } from "../convex/engine/stories";

const modules = import.meta.glob("../convex/**/*.ts");
const FUTURE = Date.now() + 7 * 864e5;
const SLUG = "test-heat";

beforeAll(() => {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
});
afterEach(() => vi.useRealTimers());

describe("the heat's arithmetic", () => {
  const ids = new Set(["a", "b", "c", "d", "e"]);
  test("three tags put the heat on someone; it goes away below three", () => {
    expect(HEAT_AT).toBe(3);
    const two = [{ from: "a", to: "e", at: 1 }, { from: "b", to: "e", at: 2 }];
    expect(heatOn(liveTags(two, ids, new Set()))).toEqual([]);
    const three = [...two, { from: "c", to: "e", at: 5 }, { from: "d", to: "e", at: 3 }];
    expect(heatOn(liveTags(three, ids, new Set()))).toEqual([{ id: "e", tags: 4, since: 3 }]);
    // One moves away: back to three, still on. Two move away: off.
    const moved = three.map((t) => (t.from === "d" ? { ...t, to: "a" } : t));
    expect(heatOn(liveTags(moved, ids, new Set())).map((h) => h.id)).toEqual(["e"]);
    expect(heatOn(liveTags(moved.map((t) => (t.from === "c" ? { ...t, to: undefined } : t)), ids, new Set()))).toEqual([]);
  });
  test("tags on a cleared guest, on yourself, or from or on someone not playing don't count", () => {
    const tags = [{ from: "a", to: "e" }, { from: "b", to: "e" }, { from: "c", to: "e" }, { from: "e", to: "e" }, { from: "z", to: "a" }];
    expect(liveTags(tags, ids, new Set(["e"]))).toEqual([]);
    expect(liveTags(tags, ids, new Set()).length).toBe(3);
  });
  test("debts read from each side", () => {
    const debts = [{ fromId: "a", toId: "b", amount: 200 }, { fromId: "c", toId: "a", amount: 100 }];
    const name = (id: string) => ({ a: "Ana", b: "Ben", c: "Cal" })[id]!;
    expect(debtLines(debts, "a", name)).toEqual(["You owe Ben $200.", "Cal owes you $100."]);
    expect(debtLines(debts, "b", name)).toEqual(["Ana owes you $200."]);
    expect(debtLines(debts, "d", name)).toEqual([]);
  });
});

describe("the plant", () => {
  const names = new Map([["a", "Ana"], ["b", "Ben"], ["c", "Cal"]]);
  const real = [
    { id: "t1", aboutId: "a", text: TIPS.classic[0]("Ana") },
    { id: "t2", aboutId: "b", text: TIPS.classic[1]("Ben") },
  ];
  test("no frame: both real tips, no plant", () => {
    expect(plantTips(real, "classic", null, names, seeded(1))).toEqual(real.map((t) => ({ aboutId: t.aboutId, text: t.text, plant: false })));
  });
  test("framing someone a real tip already names replaces that tip, in its place", () => {
    for (let s = 1; s <= 20; s++) {
      const out = plantTips(real, "classic", { id: "b", name: "Ben" }, names, seeded(s));
      expect(out).toHaveLength(2);
      expect(out[0]).toEqual({ aboutId: "a", text: real[0].text, plant: false });
      expect(out[1].plant && out[1].aboutId === "b" && out[1].text.includes("Ben")).toBe(true);
      expect(out[1].text).not.toBe(real[1].text);
    }
  });
  test("framing someone else replaces one of the two; the plant is worded like a real tip and never repeats one", () => {
    const seen = new Set<number>();
    for (let s = 1; s <= 40; s++) {
      const out = plantTips(real, "adult", { id: "c", name: "Cal" }, names, seeded(s));
      expect(out).toHaveLength(2);
      const i = out.findIndex((t) => t.plant);
      seen.add(i);
      expect(out[i].aboutId).toBe("c");
      expect(TIPS.adult.some((f) => f("Cal") === out[i].text)).toBe(true);
      expect(out.filter((t) => !t.plant)).toHaveLength(1);
    }
    expect(seen).toEqual(new Set([0, 1]));
  });
});

async function round2(guests = 8) {
  const t = convexTest(schema, modules);
  const { hostKey } = await t.mutation(internal.admin.createGame, {
    slug: SLUG, title: "Heat test", isTest: true, makeActive: false, registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 31",
  });
  await t.mutation(internal.game.seedFakeCast, { slug: SLUG, guests, markers: 10, seed: 9 });
  await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
  await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
  await t.mutation(api.game.skipIntro, { slug: SLUG, hostKey });
  await t.run(async (ctx) => {
    const g = (await ctx.db.query("games").first())!;
    await ctx.db.patch(g._id, { round: 2, rolesOut: true, roundStartedAt: Date.now() });
  });
  const players = await t.run((ctx) => ctx.db.query("players").collect());
  const cf = await t.run(async (ctx) => (await caseFor(ctx, (await ctx.db.query("games").first())!))!);
  const killer = players.find((p) => p._id === cf.solution.killerId)!;
  const innocents = players.filter((p) => p._id !== killer._id);
  return { t, hostKey, players, cf, killer, innocents };
}
const game = (t: ReturnType<typeof convexTest>) => t.run(async (ctx) => (await ctx.db.query("games").first())!);
const fresh = (t: ReturnType<typeof convexTest>) => t.run((ctx) => ctx.db.query("players").collect());
const heat = (t: ReturnType<typeof convexTest>) =>
  t.run(async (ctx) => {
    const g = (await ctx.db.query("games").first())!;
    return heatNow(g, await ctx.db.query("players").collect(), await caseFor(ctx, g)).map((h) => h.id as string);
  });

describe("a night with the heat and a frame", () => {
  test("three tags turn the heat on; moving one off turns it off", async () => {
    const { t, cf, innocents } = await round2();
    const cleared = publiclyCleared(cf, 2);
    const target = innocents.find((p) => !cleared.has(p._id))!;
    const taggers = innocents.filter((p) => p._id !== target._id).slice(0, 3);
    for (const p of taggers.slice(0, 2)) await t.mutation(api.heat.tag, { token: p.token, targetId: target._id });
    expect(await heat(t)).toEqual([]);
    await t.mutation(api.heat.tag, { token: taggers[2].token, targetId: target._id });
    expect(await heat(t)).toEqual([target._id]);
    await t.mutation(api.heat.tag, { token: taggers[2].token, targetId: null });
    expect(await heat(t)).toEqual([]);
    await expect(t.mutation(api.heat.tag, { token: taggers[0].token, targetId: taggers[0]._id })).rejects.toThrow(/other than yourself/);
  });

  test("a tag on a guest the TV evidence cleared drops", async () => {
    const { t, cf, innocents } = await round2();
    const cleared = [...publiclyCleared(cf, 2)];
    expect(cleared.length).toBeGreaterThan(0);
    const target = innocents.find((p) => p._id === cleared[0]) ?? innocents[0];
    const tagger = innocents.find((p) => p._id !== target._id)!;
    await t.mutation(api.heat.tag, { token: tagger.token, targetId: target._id as Id<"players"> });
    const g = await game(t);
    const me = (await fresh(t)).find((p) => p._id === tagger._id)!;
    expect(myTag(g, me, cf)).toEqual(cleared.includes(target._id) ? { tag: null, dropped: true } : { tag: target._id, dropped: false });
  });

  test("the killer frames, changes their mind, and the plant lands at the jail vote about the last pick", async () => {
    const { t, hostKey, cf, killer, innocents } = await round2();
    const [x, y] = innocents;
    await t.mutation(api.heat.pick, { token: killer.token, targetId: x._id });
    await t.mutation(api.heat.pick, { token: killer.token, targetId: y._id });
    expect((await game(t)).frame?.targetId).toBe(y._id);
    // The killer's pick moves their tag too, like everyone else's.
    expect((await fresh(t)).find((p) => p._id === killer._id)!.tag).toBe(y._id);
    // An innocent's pick moves their tag; Skip keeps it.
    await t.mutation(api.heat.pick, { token: innocents[2].token, targetId: innocents[3]._id });
    await t.mutation(api.heat.pick, { token: innocents[3].token, targetId: null });
    const after = await fresh(t);
    expect(after.find((p) => p._id === innocents[2]._id)!.tag).toBe(innocents[3]._id);
    expect(after.find((p) => p._id === innocents[3]._id)!.tag).toBeUndefined();
    expect((await game(t)).frame?.targetId).toBe(y._id);
    // Round 2 ends: the tips land, the jail vote opens.
    await t.mutation(api.game.advanceRound, { slug: SLUG, hostKey });
    const g = await game(t);
    expect(g.vote?.kind).toBe("jail");
    expect(g.lateTips).toHaveLength(2);
    const plant = g.lateTips!.filter((tp) => tp.plant);
    expect(plant).toHaveLength(1);
    expect(plant[0].aboutId).toBe(y._id);
    // Real tips stay as the engine wrote them, unless the plant replaced one.
    for (const tp of g.lateTips!.filter((x) => !x.plant)) expect(cf.lateTips!.some((r) => r.text === tp.text)).toBe(true);
    // Locked from here on.
    await expect(t.mutation(api.heat.pick, { token: killer.token, targetId: x._id })).rejects.toThrow(/locked/);
    // Phones and the TV get the words only.
    const ph = await t.query(api.game.phone, { token: innocents[0].token });
    expect(ph!.lateTips).toEqual(g.lateTips!.map((tp) => tp.text));
    expect(JSON.stringify(ph)).not.toContain('"plant":true');
  });

  test("no frame: both tips are real, and the reveal says there was no plant", async () => {
    const { t, hostKey, killer } = await round2();
    await t.mutation(api.heat.pick, { token: killer.token, targetId: null });
    await t.mutation(api.game.advanceRound, { slug: SLUG, hostKey });
    const g = await game(t);
    expect(g.lateTips!.every((tp) => !tp.plant)).toBe(true);
    await t.run((ctx) => ctx.db.patch(g._id, { status: "reveal", round: 4, revealAt: Date.now(), vote: undefined }));
    const ph = await t.query(api.game.phone, { token: killer.token });
    expect(ph!.results?.plant).toEqual({ planted: false });
  });

  test("the pick is only open in Round 2; the heat goes dark at the lock-in", async () => {
    const { t, killer, innocents } = await round2();
    const ph = await t.query(api.game.phone, { token: innocents[0].token });
    expect(ph!.pick).toMatchObject({ open: true, answered: false });
    const k = await t.query(api.game.phone, { token: killer.token });
    // Same prompt on the killer's phone (its title is worded for the role on the phone itself).
    expect(Object.keys(k!.pick!).sort()).toEqual(Object.keys(ph!.pick!).sort());
    for (const p of innocents.slice(1, 4)) await t.mutation(api.heat.tag, { token: p.token, targetId: innocents[0]._id });
    const g = await game(t);
    await t.run((ctx) => ctx.db.patch(g._id, { round: 4, vote: undefined }));
    expect(await heat(t)).toEqual([]);
    await expect(t.mutation(api.heat.tag, { token: innocents[1].token, targetId: innocents[2]._id })).rejects.toThrow(/heat is off/);
    await expect(t.mutation(api.heat.pick, { token: innocents[1].token, targetId: innocents[2]._id })).rejects.toThrow();
    const after = await t.query(api.game.phone, { token: innocents[0].token });
    expect(after!.heat.shows).toBe(false);
    expect(after!.pick).toBeNull();
  });

  test("debts reach both phones, and match", async () => {
    const { t, cf, players } = await round2();
    const d = cf.debts![0];
    const from = players.find((p) => p._id === d.fromId)!;
    const to = players.find((p) => p._id === d.toId)!;
    const a = await t.query(api.game.phone, { token: from.token });
    const b = await t.query(api.game.phone, { token: to.token });
    expect(a!.debts.some((l) => l.startsWith("You owe") && l.endsWith(`$${d.amount}.`))).toBe(true);
    expect(b!.debts.some((l) => l.includes("owes you") && l.endsWith(`$${d.amount}.`))).toBe(true);
  });
});
