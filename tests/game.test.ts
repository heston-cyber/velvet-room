import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const FUTURE = Date.now() + 7 * 864e5;

beforeAll(() => {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
});

async function setup(guests = 9, markers = 15) {
  const t = convexTest(schema, modules);
  const { hostKey } = await t.mutation(internal.admin.createGame, {
    slug: "test-engine", title: "Test", isTest: true, makeActive: false,
    registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 24",
  });
  await t.mutation(internal.game.seedFakeCast, { slug: "test-engine", guests, markers, seed: 4 });
  const players = await t.run((ctx) => ctx.db.query("players").collect());
  return { t, hostKey, tokens: players.map((p) => p.token) };
}

async function everyDoc(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const out: unknown[] = [];
    for (const table of ["games", "players", "weapons", "markers", "sealed"] as const) {
      out.push(...(await ctx.db.query(table).collect()));
    }
    return JSON.stringify(out);
  });
}

describe("the draw, sealed", () => {
  test("starting the game seals the case: no answer, clue or briefing is readable in the database", async () => {
    const { t, hostKey } = await setup();
    const res = await t.mutation(api.game.startGame, { slug: "test-engine", hostKey });
    expect(res).toEqual({ suspects: 9, exhibits: 9, markers: 15 });
    const db = await everyDoc(t);
    for (const phrase of ["You did it", "Cleared.", "Not the weapon", "The twist", "killerId", "solution"]) {
      expect(db).not.toContain(phrase);
    }
  });

  test("exactly one phone learns it's the killer; every innocent gets a tip; the killer gets none", async () => {
    const { t, hostKey, tokens } = await setup();
    await t.mutation(api.game.startGame, { slug: "test-engine", hostKey });
    const briefs = await Promise.all(tokens.map((token) => t.query(api.game.myBriefing, { token })));
    const roles = briefs.map((b) => (b && "role" in b ? b.role : null));
    expect(roles.filter((r) => r === "killer")).toHaveLength(1);
    expect(roles.filter((r) => r === "innocent")).toHaveLength(8);
    for (const b of briefs) {
      if (!b || !("role" in b)) throw new Error("missing briefing");
      if (b.role === "killer") {
        expect(b.tip).toBeNull();
        expect(b.lines[0]).toMatch(/^You did it\./);
      } else {
        expect(b.tip).toBeTruthy();
        expect(b.lines.join(" ")).not.toMatch(/You did it/);
      }
    }
  });

  test("the host roster still shows nothing about the answer after the draw", async () => {
    const { t, hostKey, tokens } = await setup();
    await t.mutation(api.game.startGame, { slug: "test-engine", hostKey });
    const roster = JSON.stringify(await t.query(api.host.roster, { slug: "test-engine", hostKey }));
    const privateTexts: string[] = [];
    for (const token of tokens) {
      const b = await t.query(api.game.myBriefing, { token });
      if (b && "role" in b) privateTexts.push(b.motive, b.secret, ...(b.tip ? [b.tip] : []), ...b.lines);
    }
    const weapons = await t.run((ctx) => ctx.db.query("weapons").collect());
    privateTexts.push(...weapons.map((w) => w.name), ...weapons.map((w) => w.description));
    expect(privateTexts.length).toBeGreaterThan(30);
    for (const text of privateTexts) expect(roster).not.toContain(text);
    expect(roster).not.toMatch(/Exhibit [A-Z]/);
    expect(roster).not.toContain("exhibitLetter");
  });

  test("markers say nothing before the draw, and each gives its clue after", async () => {
    const { t, hostKey, tokens } = await setup();
    const markers = await t.run((ctx) => ctx.db.query("markers").collect());
    const before = await t.query(api.game.readMarker, { token: tokens[0], code: markers[0].code });
    expect(before).toHaveProperty("error");
    await t.mutation(api.game.startGame, { slug: "test-engine", hostKey });
    for (const m of markers) {
      const r = await t.query(api.game.readMarker, { token: tokens[0], code: m.code });
      expect(r).toHaveProperty("text");
      expect((r as { number: number }).number).toBe(m.number);
    }
    const bad = await t.query(api.game.readMarker, { token: "nobody", code: markers[0].code });
    expect(bad).toHaveProperty("error");
  });

  test("TV evidence only appears from Round 2, and Round 3 only in Round 3", async () => {
    const { t, hostKey } = await setup();
    await t.mutation(api.game.startGame, { slug: "test-engine", hostKey });
    expect(await t.query(api.game.evidence, { slug: "test-engine" })).toEqual([]);
    await t.run(async (ctx) => {
      const g = (await ctx.db.query("games").first())!;
      await ctx.db.patch(g._id, { round: 2 });
    });
    const r2 = await t.query(api.game.evidence, { slug: "test-engine" });
    expect(r2.length).toBeGreaterThan(0);
    expect(r2.every((c) => c.round === 2)).toBe(true);
    await t.run(async (ctx) => {
      const g = (await ctx.db.query("games").first())!;
      await ctx.db.patch(g._id, { round: 3 });
    });
    const r3 = await t.query(api.game.evidence, { slug: "test-engine" });
    expect(r3.some((c) => c.twist)).toBe(true);
  });

  test("the game can't be started twice, or with fewer than 3 guests", async () => {
    const { t, hostKey } = await setup();
    await t.mutation(api.game.startGame, { slug: "test-engine", hostKey });
    await expect(t.mutation(api.game.startGame, { slug: "test-engine", hostKey })).rejects.toThrow(/already started/);
    const small = await setup(2, 5);
    await expect(small.t.mutation(api.game.startGame, { slug: "test-engine", hostKey: small.hostKey })).rejects.toThrow(/3 guests/);
  });

  test("a wrong host key can't start the game", async () => {
    const { t } = await setup();
    await expect(t.mutation(api.game.startGame, { slug: "test-engine", hostKey: "nope" })).rejects.toThrow();
  });

  test("only guests who checked in can be drawn", async () => {
    for (let run = 0; run < 12; run++) {
      const { t, hostKey, tokens } = await setup(6, 6);
      // two guests never made it
      await t.run(async (ctx) => {
        const ps = await ctx.db.query("players").collect();
        for (const p of ps.slice(0, 2)) await ctx.db.patch(p._id, { checkedIn: false });
        for (const p of ps.slice(2)) await ctx.db.patch(p._id, { killerOk: true });
      });
      await t.mutation(api.game.startGame, { slug: "test-engine", hostKey });
      const briefs = await Promise.all(tokens.map((token) => t.query(api.game.myBriefing, { token })));
      const killerIdx = briefs.findIndex((b) => b && "role" in b && b.role === "killer");
      expect(killerIdx).toBeGreaterThanOrEqual(2);
      expect(briefs[0]).toEqual({ started: true, inGame: false });
    }
  });

  test("check-in deals each guest a different exhibit letter and locks once the game starts", async () => {
    const t = convexTest(schema, modules);
    const { hostKey } = await t.mutation(internal.admin.createGame, {
      slug: "test-checkin", title: "Test", isTest: true, makeActive: false,
      registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 24",
    });
    const tokens: string[] = [];
    for (const [i, name] of ["Ada Ace", "Bo Bell", "Cy Cole", "Di Dunn"].entries()) {
      const { token } = await t.mutation(api.registration.register, {
        slug: "test-checkin", realName: `Guest ${i}`, charName: name, who: "Someone.", signature: `Item ${i}`,
        weapon: `Weapon ${i}`, weaponDesc: "Plain.", killerOk: true,
      });
      tokens.push(token);
    }
    const letters = [];
    for (const token of tokens) letters.push((await t.mutation(api.game.checkIn, { token, weaponIn: true })).exhibitLetter);
    expect(new Set(letters).size).toBe(4);
    for (const l of letters) expect("ABCD").toContain(l);
    // checking in again keeps the same letter
    expect((await t.mutation(api.game.checkIn, { token: tokens[0], weaponIn: true })).exhibitLetter).toBe(letters[0]);
    await t.mutation(api.game.saveMarkers, { slug: "test-checkin", hostKey, markers: [{ number: 1, roomKey: "bar" }, { number: 2, roomKey: "office" }] });
    await t.mutation(api.game.startGame, { slug: "test-checkin", hostKey });
    await expect(t.mutation(api.game.checkIn, { token: tokens[0], weaponIn: true })).rejects.toThrow(/already started/);
  });

  test("markers keep their QR codes when re-logged, and must be in rooms in play", async () => {
    const { t, hostKey } = await setup(5, 0);
    await t.mutation(api.game.saveMarkers, { slug: "test-engine", hostKey, markers: [{ number: 1, roomKey: "bar" }, { number: 2, roomKey: "office" }] });
    const before = await t.run((ctx) => ctx.db.query("markers").collect());
    await t.mutation(api.game.saveMarkers, { slug: "test-engine", hostKey, markers: [{ number: 1, roomKey: "lounge" }, { number: 2, roomKey: "office" }, { number: 3, roomKey: "bar" }] });
    const after = await t.run((ctx) => ctx.db.query("markers").collect());
    expect(after.find((m) => m.number === 1)!.code).toBe(before.find((m) => m.number === 1)!.code);
    expect(after).toHaveLength(3);
    await expect(
      t.mutation(api.game.saveMarkers, { slug: "test-engine", hostKey, markers: [{ number: 1, roomKey: "garage" }] }),
    ).rejects.toThrow(/isn't in play/);
  });

  test("fake guests can only go in test games", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.admin.createGame, {
      slug: "real", title: "Real", isTest: false, makeActive: true, registrationClosesAt: FUTURE, deadlineLabel: "x",
    });
    await expect(t.mutation(internal.game.seedFakeCast, { slug: "real", guests: 5, markers: 5 })).rejects.toThrow(/test games/);
  });
});
