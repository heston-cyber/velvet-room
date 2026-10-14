import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";

const modules = import.meta.glob("../convex/**/*.ts");
const FUTURE = Date.now() + 7 * 864e5;

const guests = [
  { realName: "Ana Ruiz", charName: "Velma “Two-Bits” Kowalski", who: "Cigarette girl who sells secrets.", signature: "Silver cigarette case", weapon: "Brass candlestick", weaponDesc: "Heavy, a foot tall, dented base.", killerOk: true },
  { realName: "Ben Cho", charName: "Father Malone", who: "A priest who drinks too much.", signature: "Rosary he twirls", weapon: "Rubber chicken", weaponDesc: "Yellow, squeaks when squeezed.", killerOk: false },
  { realName: "Cal Ortiz", charName: "Lucky Lou", who: "Bookie with bad luck.", signature: "Lucky green dice", weapon: "Pool cue", weaponDesc: "Snapped in half, chalk on the tip.", killerOk: true },
];

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
      expect(me?.charName).toBe(guests[i].charName);
      expect(me?.weapon).toBe(guests[i].weapon);
      for (let j = 0; j < 3; j++) {
        if (j !== i) expect(JSON.stringify(me)).not.toContain(guests[j].weapon);
      }
    }
    expect(await t.query(api.registration.me, { token: "nope" })).toBeNull();
  });

  test("the host roster never contains weapons, motives, secrets or opt-ins", async () => {
    const { t, hostKey } = await setup("players");
    for (const g of guests) {
      await t.mutation(api.registration.register, { ...g, motive: `Motive of ${g.realName}`, secret: `Secret of ${g.realName}` });
    }
    const roster = await t.query(api.host.roster, { slug: "test-unit", hostKey });
    const json = JSON.stringify(roster);
    expect(roster.players).toHaveLength(3);
    for (const g of guests) {
      expect(json).toContain(g.charName);
      expect(json).not.toContain(g.weapon);
      expect(json).not.toContain(g.weaponDesc);
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

  test("character names must be unique, ignoring case and punctuation", async () => {
    const { t } = await setup();
    await t.mutation(api.registration.register, guests[2]);
    await expect(
      t.mutation(api.registration.register, { ...guests[0], charName: "lucky lou!" }),
    ).rejects.toThrow(/already took/);
  });

  test("players-write mode requires a motive and a secret", async () => {
    const { t } = await setup("players");
    await expect(t.mutation(api.registration.register, guests[0])).rejects.toThrow(/Motive/);
    await t.mutation(api.registration.register, { ...guests[0], motive: "He owes me.", secret: "I'm a fed." });
  });

  test("required fields are enforced", async () => {
    const { t } = await setup();
    await expect(t.mutation(api.registration.register, { ...guests[0], weapon: "  " })).rejects.toThrow(/Weapon/);
    await expect(t.mutation(api.registration.register, { ...guests[0], signature: "" })).rejects.toThrow(/Signature/);
  });

  test("registration closes at the deadline", async () => {
    const { t } = await setup("game", Date.now() - 1000);
    await expect(t.mutation(api.registration.register, guests[0])).rejects.toThrow(/closed/);
    const pub = await t.query(api.registration.publicGame, {});
    expect(pub?.open).toBe(false);
  });

  test("a guest can edit their entry, weapon included", async () => {
    const { t } = await setup();
    const { token } = await t.mutation(api.registration.register, guests[0]);
    await t.mutation(api.registration.update, { token, ...guests[0], weapon: "Velvet rope", weaponDesc: "Red, six feet long." });
    const me = await t.query(api.registration.me, { token });
    expect(me?.weapon).toBe("Velvet rope");
  });

  test("when the opt-in is off, everyone is eligible", async () => {
    const { t, hostKey } = await setup();
    await t.mutation(api.host.updateSettings, { slug: "test-unit", hostKey, killerOptIn: false });
    await t.mutation(api.registration.register, guests[1]);
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
