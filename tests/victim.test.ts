// Oct 31 (Heston: "the game kills a player that is not in the game (uses don ray sanders as a back up if all players
// full)"): the victim is a cast drawing nobody plays tonight; the Don only when every drawing is taken.
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { CAST } from "../convex/figures";
import { DON_VICTIM, deepVictim, forVictim, pickVictim } from "../convex/victim";
import { aboutDeadDon, cueVariant, cueVersions, victimCue } from "../convex/narration";

const modules = import.meta.glob("../convex/**/*.ts");
beforeAll(() => {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
});

const sienna = { key: "sienna", name: "Sienna", sex: "f" as const };

describe("the victim", () => {
  test("a cast drawing nobody plays; the Don when every one is taken", () => {
    const taken = new Set(CAST.filter((c) => c.key !== "sienna" && c.key !== "abby").map((c) => c.key));
    for (const r of [0, 0.3, 0.99]) expect(["sienna", "abby"]).toContain(pickVictim(CAST, taken, r).key);
    expect(pickVictim(CAST, new Set(CAST.map((c) => c.key)), 0.5)).toEqual(DON_VICTIM);
  });

  test("lines about the death name the victim (her pronouns); the Don keeps his stash, car and safe", () => {
    expect(forVictim("A delivery guy outside heard a man shouting at the Don just before he died.", sienna)).toBe("A delivery guy outside heard a man shouting at Sienna just before she died.");
    expect(forVictim("The coroner's report: marks around the Don's neck. He was strangled.", sienna)).toBe("The coroner's report: marks around Sienna's neck. She was strangled.");
    expect(forVictim("You did it. You killed Don Ray Sanders with the rope.", sienna)).toBe("You did it. You killed Sienna with the rope.");
    expect(forVictim("The twist: no drag marks. Nobody hauled his heavy ass anywhere. The Don was killed right where he dropped.", sienna)).not.toMatch(/ass|Don/);
    for (const owner of ["Taped under a drawer: the Don's emergency stash.", "The Don locked the rope in his office safe before the party.", "in the trunk of the Don's Escalade, and his driver sat on the bumper"])
      expect(forVictim(owner, sienna)).toBe(owner);
    expect(forVictim("the Don died", DON_VICTIM)).toBe("the Don died");
    expect(deepVictim({ a: ["the Don died", { b: "You didn't kill the Don." }] }, { key: "josh", name: "Josh", sex: "m" })).toEqual({ a: ["Josh died", { b: "You didn't kill Josh." }] });
  });

  test("the narrator's lines: the victim's versions, and no version about the Don's death", () => {
    for (const c of ["intro2", "reveal1", "playDies"] as const) {
      const v = victimCue(c, true);
      expect(v).not.toBe(c);
      for (const tone of ["classic", "adult"] as const) for (const t of cueVersions(v, tone)) expect(aboutDeadDon(t), t).toBe(false);
    }
    for (const tone of ["classic", "adult"] as const)
      for (const c of ["round1Waves", "oneMinute", "accuseLastCall", "paused", "voteLastCall", "playStory"] as const)
        for (let k = 0; k < 20; k++) expect(aboutDeadDon(cueVersions(c, tone)[cueVariant(tone, c, `g${k}`, "", { picks: {}, victim: true })])).toBe(false);
  });
});

describe("a game", () => {
  async function started(guests: number) {
    const t = convexTest(schema, modules);
    const { hostKey } = await t.mutation(internal.admin.createGame, {
      slug: "test-victim", title: "Victim test", isTest: true, makeActive: false, registrationClosesAt: Date.now() + 7 * 864e5, deadlineLabel: "Sat, Oct 31",
    });
    await t.mutation(internal.game.seedFakeCast, { slug: "test-victim", guests, markers: 8, seed: 7 });
    await t.mutation(api.game.openDoors, { slug: "test-victim", hostKey });
    await t.mutation(api.game.startGame, { slug: "test-victim", hostKey });
    await t.mutation(api.game.skipIntro, { slug: "test-victim", hostKey });
    const game = await t.run(async (ctx) => (await ctx.db.query("games").first())!);
    const players = await t.run((ctx) => ctx.db.query("players").collect());
    return { t, game, players };
  }

  test("kills a cast member who isn't playing, and every phone and line names them", async () => {
    const { t, game, players } = await started(6);
    const v = game.victim!;
    expect(v.key).not.toBe("don");
    expect(players.map((p) => p.figure)).not.toContain(v.key);
    expect(CAST.map((c) => c.key)).toContain(v.key);
    const ph = (await t.query(api.game.phone, { token: players[0].token }))!;
    expect(ph.game.victim).toEqual(v);
    const lines = JSON.stringify([ph.briefing, ph.story]);
    expect(lines).not.toMatch(/Don Ray Sanders|You didn't kill the Don/);
    if (ph.briefing?.role !== "killer") expect(lines).toContain(v.name);
  });

  test("the Don when every cast drawing is taken", async () => {
    const { game } = await started(CAST.length);
    expect(game.victim).toEqual(DON_VICTIM);
  });
});
