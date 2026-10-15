import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { ROOM_LETTERS } from "../convex/join";

const modules = import.meta.glob("../convex/**/*.ts");
const FUTURE = Date.now() + 7 * 864e5;
const SLUG = "test-join";

beforeAll(() => {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
  process.env.VOICE_WORKERS = "1";
});

async function setup(o: { open?: boolean; checkIn?: boolean } = {}) {
  const t = convexTest(schema, modules);
  const { hostKey } = await t.mutation(internal.admin.createGame, {
    slug: SLUG, title: "Join test", isTest: true, makeActive: true, registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 24",
  });
  await t.mutation(internal.game.seedFakeCast, { slug: SLUG, guests: 5, markers: 8, seed: 7, checkIn: o.checkIn ?? false });
  const players = await t.run((ctx) => ctx.db.query("players").collect());
  const tvKey = await t.run(async (ctx) => (await ctx.db.query("games").first())!.tvKey!);
  if (o.open !== false) await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
  const code = await t.run(async (ctx) => (await ctx.db.query("games").first())!.roomCode ?? "");
  return { t, hostKey, players, tvKey, code };
}

describe("room code: join Jackbox style, each name once", () => {
  test("opening the doors makes a 4-letter code the host, the TV and the landing page all see", async () => {
    const { t, hostKey, tvKey, code } = await setup();
    expect(code).toMatch(new RegExp(`^[${ROOM_LETTERS}]{4}$`));
    expect((await t.query(api.host.roster, { slug: SLUG, hostKey }))!.game.roomCode).toBe(code);
    const tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(tv!.game.roomCode).toBe(code);
    expect((await t.query(api.registration.publicGame, { slug: SLUG }))!.partyOn).toBe(true);
  });

  test("before the doors open there's no code, and nobody can join", async () => {
    const { t, tvKey, players } = await setup({ open: false });
    expect((await t.query(api.game.tv, { slug: SLUG, tvKey }))!.game.roomCode).toBeNull();
    expect((await t.query(api.registration.publicGame, { slug: SLUG }))!.partyOn).toBe(false);
    await t.run(async (ctx) => ctx.db.patch((await ctx.db.query("games").first())!._id, { roomCode: "BCDF" }));
    const room = await t.query(api.join.room, { code: "BCDF" });
    expect(room).toEqual({ ok: false, reason: expect.stringMatching(/aren't open/) });
    await expect(t.mutation(api.join.claim, { code: "BCDF", playerId: players[0]._id })).rejects.toThrow(/aren't open/);
  });

  test("the room lists every guest; codes are forgiving about case and spaces; a wrong code says so", async () => {
    const { t, code, players } = await setup();
    const room = await t.query(api.join.room, { code: ` ${code.toLowerCase().split("").join(" ")} ` });
    if (!room.ok) throw new Error(room.reason);
    expect(room.slug).toBe(SLUG);
    expect(room.guests).toHaveLength(players.length);
    expect(room.guests.every((g) => !g.taken)).toBe(true);
    expect(room.guests.map((g) => g.charName)).toEqual([...room.guests.map((g) => g.charName)].sort((a, b) => a.localeCompare(b)));
    // The join page never sees anyone's link.
    expect(JSON.stringify(room)).not.toContain(players[0].token);
    const wrong = code === "ZZZZ" ? "XXXX" : "ZZZZ";
    expect((await t.query(api.join.room, { code: wrong })).ok).toBe(false);
    expect((await t.query(api.join.room, { code: "AB" })).ok).toBe(false);
  });

  test("claiming a name hands back that guest's link once; a second phone is turned away; the TV hears about it", async () => {
    const { t, code, players, tvKey } = await setup();
    const p = players[1];
    const res = await t.mutation(api.join.claim, { code, playerId: p._id });
    expect(res).toEqual({ token: p.token, slug: SLUG });
    const room = await t.query(api.join.room, { code });
    if (!room.ok) throw new Error(room.reason);
    expect(room.guests.find((g) => g.id === p._id)!.taken).toBe(true);
    await expect(t.mutation(api.join.claim, { code, playerId: p._id })).rejects.toThrow(/already joined as/);
    const tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(tv!.game.lastJoin?.name).toBe(p.charName);
  });

  test("checking in with a saved link takes the name too", async () => {
    const { t, code, players } = await setup();
    await t.mutation(api.game.checkIn, { token: players[2].token, weaponIn: true });
    await expect(t.mutation(api.join.claim, { code, playerId: players[2]._id })).rejects.toThrow(/already joined/);
    const room = await t.query(api.join.room, { code });
    if (!room.ok) throw new Error(room.reason);
    expect(room.guests.filter((g) => g.taken).map((g) => g.id)).toEqual([players[2]._id]);
  });

  test("the fake cast counts as claimed when it checks in", async () => {
    const { t, code } = await setup({ checkIn: true });
    const room = await t.query(api.join.room, { code });
    if (!room.ok) throw new Error(room.reason);
    expect(room.guests.every((g) => g.taken)).toBe(true);
  });

  test("rescuing a phone frees the name: the old link dies, the guest can join again", async () => {
    const { t, hostKey, code, players } = await setup();
    const p = players[0];
    await t.mutation(api.join.claim, { code, playerId: p._id });
    const { token } = await t.mutation(api.host.rescuePhone, { slug: SLUG, hostKey, playerId: p._id });
    expect(token).not.toBe(p.token);
    const roster = await t.query(api.host.roster, { slug: SLUG, hostKey });
    expect(roster!.players.find((x) => x.id === p._id)!.claimed).toBe(false);
    const again = await t.mutation(api.join.claim, { code, playerId: p._id });
    expect(again.token).toBe(token);
  });

  test("a guest from another game can't be claimed with this code", async () => {
    const { t, code } = await setup();
    await t.mutation(internal.admin.createGame, { slug: "other", title: "Other", isTest: true, makeActive: false, registrationClosesAt: FUTURE, deadlineLabel: "Sat" });
    await t.mutation(internal.game.seedFakeCast, { slug: "other", guests: 3, markers: 0, seed: 1, checkIn: false });
    const otherGame = await t.run(async (ctx) => (await ctx.db.query("games").withIndex("by_slug", (q) => q.eq("slug", "other")).first())!._id);
    const stranger = await t.run(async (ctx) => (await ctx.db.query("players").withIndex("by_game", (q) => q.eq("gameId", otherGame)).first())!);
    await expect(t.mutation(api.join.claim, { code, playerId: stranger._id })).rejects.toThrow(/Pick your name/);
  });

  test("the game keeps its code through the start; it stops working when the night ends", async () => {
    const { t, hostKey, code, players, tvKey } = await setup({ checkIn: true });
    await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
    const g = await t.run(async (ctx) => (await ctx.db.query("games").first())!);
    expect(g.roomCode).toBe(code);
    await t.run((ctx) => ctx.db.patch(g._id, { endedAt: Date.now() }));
    expect((await t.query(api.join.room, { code })).ok).toBe(false);
    await expect(t.mutation(api.join.claim, { code, playerId: players[0]._id })).rejects.toThrow(/over for the night/);
    expect((await t.query(api.game.tv, { slug: SLUG, tvKey }))!.game.roomCode).toBeNull();
    expect((await t.query(api.registration.publicGame, { slug: SLUG }))!.partyOn).toBe(false);
  });

  test("a game started straight from sign-ups still gets a code", async () => {
    const { t, hostKey } = await setup({ open: false, checkIn: true });
    await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
    const g = await t.run(async (ctx) => (await ctx.db.query("games").first())!);
    expect(g.roomCode).toMatch(/^[A-Z]{4}$/);
  });

  test("a game whose doors opened before codes existed gets one when the TV checks in", async () => {
    const { t, tvKey } = await setup();
    const id = await t.run(async (ctx) => {
      const g = (await ctx.db.query("games").first())!;
      await ctx.db.patch(g._id, { roomCode: undefined });
      return g._id;
    });
    await t.mutation(api.game.tvPing, { slug: SLUG, tvKey, sound: false });
    expect((await t.run((ctx) => ctx.db.get(id)))!.roomCode).toMatch(/^[A-Z]{4}$/);
  });

  test("two games never share a code", async () => {
    const { t, code } = await setup();
    const { hostKey } = await t.mutation(internal.admin.createGame, { slug: "other", title: "Other", isTest: true, makeActive: false, registrationClosesAt: FUTURE, deadlineLabel: "Sat" });
    await t.mutation(internal.game.seedFakeCast, { slug: "other", guests: 3, markers: 0, seed: 1, checkIn: false });
    await t.mutation(api.game.openDoors, { slug: "other", hostKey });
    const other = await t.run(async (ctx) => (await ctx.db.query("games").withIndex("by_slug", (q) => q.eq("slug", "other")).first())!.roomCode);
    expect(other).toMatch(/^[A-Z]{4}$/);
    expect(other).not.toBe(code);
  });
});

describe("walk-ins (v2): new guests sign up at the door with the room code", () => {
  const walkIn = (code: string, figure: string, weapon: string) => ({
    slug: SLUG, roomCode: code, realName: "Walk In", charName: "Late Larry", who: "Showed up uninvited.", signature: "Wet umbrella", weapon, killerOk: true, figure,
  });
  async function freePicks(t: Awaited<ReturnType<typeof setup>>["t"]) {
    const figs = (await t.query(api.registration.figures, { slug: SLUG }))!.flatMap((s) => s.figures).find((f) => !f.taken)!.key;
    const weapon = (await t.query(api.registration.weapons, { slug: SLUG }))!.find((w) => !w.taken)!.key;
    return { figs, weapon };
  }

  test("with tonight's code a walk-in signs up after the deadline, is checked in, and the TV announces them", async () => {
    const { t, code, tvKey } = await setup();
    // Sign-ups closed weeks ago; the room code still lets someone at the door in.
    await t.run(async (ctx) => ctx.db.patch((await ctx.db.query("games").first())!._id, { registrationClosesAt: Date.now() - 1000, registrationOpen: false }));
    const { figs, weapon } = await freePicks(t);
    const { token } = await t.mutation(api.registration.register, walkIn(code.toLowerCase(), figs, weapon));
    const me = await t.run(async (ctx) => (await ctx.db.query("players").withIndex("by_token", (q) => q.eq("token", token)).unique())!);
    expect(me).toMatchObject({ checkedIn: true, weaponIn: true });
    expect(me.claimedAt).toBeGreaterThan(0);
    expect((await t.query(api.game.tv, { slug: SLUG, tvKey }))!.game.lastJoin?.name).toBe("Late Larry");
  });

  test("without the right code, or before the doors open, sign-ups stay closed", async () => {
    const { t, code } = await setup();
    await t.run(async (ctx) => ctx.db.patch((await ctx.db.query("games").first())!._id, { registrationClosesAt: Date.now() - 1000 }));
    const { figs, weapon } = await freePicks(t);
    const wrong = code === "BCDF" ? "BCDG" : "BCDF";
    await expect(t.mutation(api.registration.register, walkIn(wrong, figs, weapon))).rejects.toThrow(/closed/);
    const before = await setup({ open: false });
    await before.t.run(async (ctx) => ctx.db.patch((await ctx.db.query("games").first())!._id, { registrationClosesAt: Date.now() - 1000, roomCode: "BCDF" }));
    const p2 = await freePicks(before.t);
    await expect(before.t.mutation(api.registration.register, walkIn("BCDF", p2.figs, p2.weapon))).rejects.toThrow(/closed/);
  });

  test("a guest who signed up before is let in by their own phone (check-in needs no weapon bag)", async () => {
    const { t, players } = await setup();
    await t.mutation(api.game.checkIn, { token: players[0].token, weaponIn: true });
    const p = await t.run((ctx) => ctx.db.get(players[0]._id));
    expect(p).toMatchObject({ checkedIn: true });
    expect(p!.claimedAt).toBeGreaterThan(0);
  });
});
