import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { CAST, castName } from "../convex/figures";

const modules = import.meta.glob("../convex/**/*.ts");
const FUTURE = Date.now() + 7 * 864e5;

// Every guest is one of the party cast: their face brings their name. Oct 16: sign-up is the face, a last name and
// a nickname (and motive and secret when guests write their own). No "about you", signature, photo or weapon.
const nameOf = (key: string) => castName(CAST.find((c) => c.key === key)!);
const guests = [
  { realName: "Emily", charName: nameOf("emily"), killerOk: true, figure: "emily", lastName: "Hill" },
  { realName: "Josh", charName: nameOf("josh"), killerOk: false, figure: "josh", lastName: "Lee", nickname: "Two-Tone" },
  { realName: "Sam", charName: nameOf("sam"), killerOk: true, figure: "sam", lastName: "Reed" },
];
// What a page from before Oct 16 sent as well.
const OLD_FIELDS = { who: "Cigarette girl who sells secrets.", signature: "Silver cigarette case", weapon: "candlestick" };

async function setup(motiveMode: "game" | "players" = "game", closesAt = FUTURE) {
  const t = convexTest(schema, modules);
  const { hostKey } = await t.mutation(internal.admin.createGame, {
    slug: "test-unit", title: "Test", isTest: true, makeActive: true,
    registrationClosesAt: closesAt, deadlineLabel: "Sat, Oct 24", motiveMode,
  });
  return { t, hostKey };
}

describe("registration", () => {
  test("three guests register, each link reopens only its own guest", async () => {
    const { t } = await setup();
    const tokens: string[] = [];
    for (const g of guests) {
      const { token } = await t.mutation(api.registration.register, g);
      tokens.push(token);
    }
    expect(new Set(tokens).size).toBe(3);
    for (let i = 0; i < 3; i++) {
      const me = await t.query(api.registration.me, { token: tokens[i] });
      expect(me?.charName).toContain(guests[i].lastName);
      for (let j = 0; j < 3; j++) {
        if (j !== i) expect(JSON.stringify(me)).not.toContain(guests[j].lastName);
      }
    }
    expect(await t.query(api.registration.me, { token: "nope" })).toBeNull();
  });

  test("the host roster never contains motives, secrets or opt-ins", async () => {
    const { t, hostKey } = await setup("players");
    for (const g of guests) {
      await t.mutation(api.registration.register, { ...g, motive: `Motive of ${g.realName}`, secret: `Secret of ${g.realName}` });
    }
    const roster = await t.query(api.host.roster, { slug: "test-unit", hostKey });
    const json = JSON.stringify(roster);
    expect(roster.players).toHaveLength(3);
    for (const g of guests) {
      expect(json).toContain(g.lastName);
      expect(json).not.toContain(`Motive of ${g.realName}`);
      expect(json).not.toContain(`Secret of ${g.realName}`);
    }
    expect(json).not.toContain("killerOk");
    expect(json).not.toContain("token");
    expect(roster.counts).toMatchObject({ total: 3, optedIn: 2 });
  });

  test("a wrong host key is refused", async () => {
    const { t } = await setup();
    await expect(t.query(api.host.roster, { slug: "test-unit", hostKey: "guess" })).rejects.toThrow();
  });

  test("each cast member signs up once", async () => {
    const { t } = await setup();
    await t.mutation(api.registration.register, guests[2]);
    await expect(t.mutation(api.registration.register, { ...guests[0], figure: "sam" })).rejects.toThrow(/Someone just took that drawing/);
  });

  test("Oct 17 (D9): guests never have to write a motive or a secret, even in an old players-write game", async () => {
    const { t } = await setup("players");
    await t.mutation(api.registration.register, guests[0]);
  });

  test("sign-up needs only a face (the last name comes with the form); no weapon, signature or about you", async () => {
    const { t } = await setup();
    await expect(t.mutation(api.registration.register, { ...guests[0], figure: undefined })).rejects.toThrow(/drawing/);
    const { token } = await t.mutation(api.registration.register, guests[0]);
    const p = await t.run(async (ctx) => (await ctx.db.query("players").collect())[0]);
    expect(p).toMatchObject({ who: "", signature: "" });
    expect(p.photoId).toBeUndefined();
    expect(await t.run((ctx) => ctx.db.query("weapons").collect())).toEqual([]);
    expect(await t.query(api.registration.me, { token })).not.toHaveProperty("weapon");
  });

  test("an older page that still sends who, signature and a weapon is accepted, and they're ignored", async () => {
    const { t } = await setup();
    await t.mutation(api.registration.register, { ...guests[0], ...OLD_FIELDS });
    const p = await t.run(async (ctx) => (await ctx.db.query("players").collect())[0]);
    expect(p).toMatchObject({ who: "", signature: "" });
    expect(await t.run((ctx) => ctx.db.query("weapons").collect())).toEqual([]);
  });

  test("a typed 'aka' in the nickname is dropped (the roll call says a.k.a. itself)", async () => {
    const { t } = await setup();
    for (const [typed, kept] of [["Aka Long Johnson", "Long Johnson"], ["a.k.a. The Knife", "The Knife"], ["AKA Lucky", "Lucky"], ["Akash", "Akash"]]) {
      const t2 = (await setup()).t;
      const { token } = await t2.mutation(api.registration.register, { ...guests[0], nickname: typed });
      expect((await t2.query(api.registration.me, { token }))?.nickname).toBe(kept);
    }
    expect(t).toBeTruthy();
  });

  test("registration closes at the deadline", async () => {
    const { t } = await setup("game", Date.now() - 1000);
    await expect(t.mutation(api.registration.register, guests[0])).rejects.toThrow(/closed/);
    const pub = await t.query(api.registration.publicGame, {});
    expect(pub?.open).toBe(false);
  });

  test("a guest can edit their entry", async () => {
    const { t } = await setup();
    const { token } = await t.mutation(api.registration.register, guests[0]);
    await t.mutation(api.registration.update, { token, ...guests[0], nickname: "Two-Bits", lastName: "Rose" });
    const me = await t.query(api.registration.me, { token });
    expect(me?.nickname).toBe("Two-Bits");
    expect(me?.charName).toContain("Rose");
  });

  test("Oct 17 (D8): an opt-out of being the killer always counts; the old host switch is ignored", async () => {
    const { t, hostKey } = await setup();
    await t.mutation(api.host.updateSettings, { slug: "test-unit", hostKey, killerOptIn: false });
    await t.mutation(api.registration.register, guests[1]); // opted out
    await t.mutation(api.registration.register, guests[0]);
    const ps = await t.run((ctx) => ctx.db.query("players").collect());
    expect(ps.find((p) => p.figure === "josh")!.killerOk).toBe(false);
    expect(ps.find((p) => p.figure === "emily")!.killerOk).toBe(true);
    const roster = await t.query(api.host.roster, { slug: "test-unit", hostKey });
    expect(roster.counts.optedIn).toBe(1);
  });

  test("the host can remove a guest, and their weapon goes with them", async () => {
    const { t, hostKey } = await setup();
    const { token } = await t.mutation(api.registration.register, guests[0]);
    const roster = await t.query(api.host.roster, { slug: "test-unit", hostKey });
    await t.mutation(api.host.removePlayer, { slug: "test-unit", hostKey, playerId: roster.players[0].id });
    expect(await t.query(api.registration.me, { token })).toBeNull();
    const weapons = await t.run((ctx) => ctx.db.query("weapons").collect());
    expect(weapons).toHaveLength(0);
  });

  test("room settings must stay valid", async () => {
    const { t, hostKey } = await setup();
    await expect(
      t.mutation(api.host.updateSettings, { slug: "test-unit", hostKey, rooms: [{ key: "bar", label: "The Bar", houseName: "Kitchen" }] }),
    ).rejects.toThrow(/at least 2/);
    const nine = Array.from({ length: 9 }, (_, i) => ({ key: `r${i}`, label: `Room ${i}`, houseName: "" }));
    await expect(t.mutation(api.host.updateSettings, { slug: "test-unit", hostKey, rooms: nine })).rejects.toThrow(/at most 8/);
    await expect(
      t.mutation(api.host.updateSettings, {
        slug: "test-unit", hostKey,
        rooms: [{ key: "bar", label: "The Bar", houseName: "Kitchen" }, { key: "x", label: "  ", houseName: "" }],
      }),
    ).rejects.toThrow(/needs a name/);
    await expect(
      t.mutation(api.host.updateSettings, {
        slug: "test-unit", hostKey,
        rooms: [{ key: "bar", label: "The Bar", houseName: "Kitchen" }, { key: "x", label: "the bar", houseName: "" }],
      }),
    ).rejects.toThrow(/same name/);
    // Two rooms is fine, and the body room is no longer a setting: it's drawn at Start.
    await t.mutation(api.host.updateSettings, {
      slug: "test-unit", hostKey,
      rooms: [{ key: "bar", label: "The Bar", houseName: "Kitchen" }, { key: "office", label: "The Back Office", houseName: "Office" }],
    });
  });

  test("real games can't be deleted by the test cleanup", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.admin.createGame, {
      slug: "real", title: "Real", isTest: false, makeActive: true,
      registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 24",
    });
    await expect(t.mutation(internal.admin.deleteTestGame, { slug: "real" })).rejects.toThrow(/Only test games/);
  });
});
