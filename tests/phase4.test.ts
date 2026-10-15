import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import { nextRound } from "./steps";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");
const FUTURE = Date.now() + 7 * 864e5;
const SLUG = "test-p4";

beforeAll(() => {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
});

type Opts = {
  guests?: number;
  markers?: number;
  pacing?: "ready" | "timer";
  search?: "all" | "waves";
  start?: boolean;
  /** Leave the show running (intro, How to play, roll call) instead of skipping to Round 1. */
  show?: boolean;
};

async function setup(o: Opts = {}) {
  const t = convexTest(schema, modules);
  const { hostKey } = await t.mutation(internal.admin.createGame, {
    slug: SLUG, title: "Phase 4 test", isTest: true, makeActive: false, registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 24",
  });
  await t.mutation(api.host.updateSettings, {
    slug: SLUG, hostKey,
    pacing: { mode: o.pacing ?? "ready", roundMinutes: 10 },
    search: o.search ?? "all",
    wifi: { name: "VelvetRoom", password: "bootleg1929" },
  });
  await t.mutation(internal.game.seedFakeCast, { slug: SLUG, guests: o.guests ?? 8, markers: o.markers ?? 15, seed: 4 });
  const players = await t.run((ctx) => ctx.db.query("players").collect());
  if (o.start !== false) {
    await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
    await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
    if (!o.show) await t.mutation(api.game.skipIntro, { slug: SLUG, hostKey });
  }
  const tokens = players.map((p) => p.token);
  return { t, hostKey, players, tokens };
}

const game = (t: ReturnType<typeof convexTest>) => t.run(async (ctx) => (await ctx.db.query("games").first())!);
const tvKey = async (t: ReturnType<typeof convexTest>) => (await game(t)).tvKey!;

describe("Phase 4: drawn body room, waves, Wi-Fi, the TV", () => {
  test("where the body turns up is drawn at Start and only shown after it", async () => {
    const { t, hostKey, tokens } = await setup({ start: false });
    const before = await t.query(api.game.phone, { token: tokens[0] });
    expect(before!.game.bodyRoom).toBe("");
    expect((await t.query(api.host.roster, { slug: SLUG, hostKey })).game.bodyRoom).toBeNull();
    await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
    await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
    const g = await game(t);
    expect(g.rooms.map((r) => r.key)).toContain(g.bodyRoomKey);
    expect(g.roomOrder![0]).toBe(g.bodyRoomKey);
    const label = g.rooms.find((r) => r.key === g.bodyRoomKey)!.label;
    expect((await t.query(api.game.phone, { token: tokens[0] }))!.game.bodyRoom).toBe(label);
    expect((await t.query(api.game.tv, { slug: SLUG, tvKey: await tvKey(t) })).game.bodyRoom).toBe(label);
    expect((await t.query(api.host.roster, { slug: SLUG, hostKey })).game.bodyRoom).toBe(label);
  });

  test("waves: a marker in a closed room is sealed until its round, then readable", async () => {
    const { t, hostKey, tokens } = await setup({ search: "waves", guests: 6, markers: 15 });
    const g = await game(t);
    const markers = await t.run((ctx) => ctx.db.query("markers").collect());
    const lastRoom = g.roomOrder![g.roomOrder!.length - 1]; // opens in Round 3
    const late = markers.find((m) => m.roomKey === lastRoom)!;
    const first = markers.find((m) => m.roomKey === g.roomOrder![0])!;
    await expect(t.mutation(api.game.scanMarker, { token: tokens[0], code: late.code })).rejects.toThrow(/sealed until Round 3/);
    expect(await t.query(api.game.readMarker, { token: tokens[0], code: late.code })).toMatchObject({ error: expect.stringMatching(/sealed until Round 3/) });
    expect((await t.mutation(api.game.scanMarker, { token: tokens[0], code: first.code })).number).toBe(first.number);
    // a sealed scan isn't recorded
    expect((await t.query(api.game.phone, { token: tokens[0] }))!.scans.map((s) => s.number)).toEqual([first.number]);
    const phone1 = await t.query(api.game.phone, { token: tokens[0] });
    expect(phone1!.game.openRooms).toHaveLength(2); // 2 of 5 open in Round 1
    await nextRound(t, SLUG, hostKey);
    await nextRound(t, SLUG, hostKey);
    expect((await game(t)).round).toBe(3);
    expect((await t.mutation(api.game.scanMarker, { token: tokens[0], code: late.code })).number).toBe(late.number);
    expect((await t.query(api.game.phone, { token: tokens[0] }))!.game.openRooms).toHaveLength(5);
  });

  test("all rooms open: every marker reads from Round 1", async () => {
    const { t, tokens } = await setup({ search: "all" });
    const markers = await t.run((ctx) => ctx.db.query("markers").collect());
    for (const m of markers) expect((await t.mutation(api.game.scanMarker, { token: tokens[1], code: m.code })).number).toBe(m.number);
  });

  test("the host roster never holds the answer", async () => {
    const { t, hostKey, tokens } = await setup({ guests: 6 });
    const roster = JSON.stringify(await t.query(api.host.roster, { slug: SLUG, hostKey }));
    for (const token of tokens) {
      const p = (await t.query(api.game.phone, { token }))!;
      expect(roster).not.toContain(p.briefing!.lines[0]);
      expect(roster).not.toContain(p.briefing!.motive);
      if (p.briefing!.tip) expect(roster).not.toContain(p.briefing!.tip);
    }
    expect(roster).not.toContain("token");
  });

  test("an old game that still carries Self MC fields plays like any other: everyone is in the draw", async () => {
    const { t, hostKey, tokens, players } = await setup({ guests: 6, start: false });
    // Production has games from before v2 that still carry the Self MC fields. The schema keeps them; the server ignores them.
    await t.run(async (ctx) => {
      const g = (await ctx.db.query("games").first())!;
      await ctx.db.patch(g._id, { mode: "mc", mcPlayerId: players[0]._id });
    });
    const tv0 = await t.query(api.game.tv, { slug: SLUG, tvKey: await tvKey(t) });
    expect(tv0.guests.map((x) => x.id)).toContain(players[0]._id);
    expect(tv0.counts.registered).toBe(6);
    await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
    await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
    await t.mutation(api.game.skipIntro, { slug: SLUG, hostKey });
    const phone = (await t.query(api.game.phone, { token: tokens[0] }))!;
    expect(phone.me.inGame).toBe(true);
    expect(phone.briefing).not.toBeNull();
    expect(phone.board!.suspects.map((s) => s.id)).toContain(players[0]._id);
    expect(phone.game).not.toHaveProperty("mode");
    const roster = await t.query(api.host.roster, { slug: SLUG, hostKey });
    expect(roster.counts.inGame).toBe(6);
    expect(roster.game).not.toHaveProperty("mode");
    expect((await t.query(api.game.tv, { slug: SLUG, tvKey: await tvKey(t) })).game).not.toHaveProperty("mode");
    // their ready tap and lock-in count like anyone's
    expect((await t.mutation(api.game.setReady, { token: tokens[0], ready: true })).ok).toBe(true);
    for (let i = 0; i < 3; i++) await nextRound(t, SLUG, hostKey);
    const board = phone.board!;
    const suspect = board.suspects.find((s) => s.id !== players[0]._id)!;
    await t.mutation(api.game.accuse, { token: tokens[0], suspectId: suspect.id, exhibitId: board.exhibits[0].id, roomKey: board.rooms[0].key });
    expect((await t.query(api.host.roster, { slug: SLUG, hostKey })).counts.accused).toBe(1);
  });

  test("guest Wi-Fi shows on phones and the TV, within real Wi-Fi limits", async () => {
    const { t, hostKey, tokens } = await setup({ start: false });
    expect((await t.query(api.game.phone, { token: tokens[0] }))!.game.wifi).toEqual({ name: "VelvetRoom", password: "bootleg1929" });
    expect((await t.query(api.game.tv, { slug: SLUG, tvKey: await tvKey(t) })).game.wifi).toEqual({ name: "VelvetRoom", password: "bootleg1929" });
    await expect(t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, wifi: { name: "x".repeat(33), password: "" } })).rejects.toThrow(/32/);
    await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, wifi: { name: "", password: "" } });
    expect((await t.query(api.game.phone, { token: tokens[0] }))!.game.wifi).toBeNull();
  });

  test("the TV needs the host key and shows nothing secret before the reveal", async () => {
    const { t, hostKey, tokens } = await setup({ guests: 6 });
    await expect(t.query(api.game.tv, { slug: SLUG, tvKey: "nope" })).rejects.toThrow(/TV link/);
    // the TV's key can't run the host's controls
    await expect(t.mutation(api.game.advanceRound, { slug: SLUG, hostKey: await tvKey(t) })).rejects.toThrow(/host link/);
    await expect(t.query(api.host.roster, { slug: SLUG, hostKey: await tvKey(t) })).rejects.toThrow(/host link/);
    const markerTexts = await Promise.all(
      (await t.run((ctx) => ctx.db.query("markers").collect())).map(async (m) => (await t.mutation(api.game.scanMarker, { token: tokens[0], code: m.code })).text),
    );
    for (let r = 1; r <= 4; r++) {
      const tv = JSON.stringify(await t.query(api.game.tv, { slug: SLUG, tvKey: await tvKey(t) }));
      for (const token of tokens) {
        const b = (await t.query(api.game.phone, { token }))!.briefing!;
        expect(tv).not.toContain(b.lines[0]);
        expect(tv).not.toContain(b.secret); // (motives are public in v2: the roll call reads them out)
      }
      for (const text of markerTexts) if (text.length > 30) expect(tv).not.toContain(text);
      expect(JSON.parse(tv).results).toBeNull();
      if (r < 4) await nextRound(t, SLUG, hostKey);
    }
    // Round 4 (accusations): everything the TV dropped is there, and still no answer
    const tv4 = await t.query(api.game.tv, { slug: SLUG, tvKey: await tvKey(t) });
    expect(tv4.evidence.some((e) => e.twist)).toBe(true);
    await nextRound(t, SLUG, hostKey);
    const rv = await t.query(api.game.tv, { slug: SLUG, tvKey: await tvKey(t) });
    expect(rv.results!.killer).toBeTruthy();
    expect((await game(t)).revealAt).toBeGreaterThan(0);
  });

  test("removing a room unassigns its markers, and the game won't start until they have a room", async () => {
    const { t, hostKey } = await setup({ start: false, markers: 10 });
    const g = await game(t);
    await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, rooms: g.rooms.filter((r) => r.key !== "bar") });
    const markers = await t.run((ctx) => ctx.db.query("markers").collect());
    const loose = markers.filter((m) => m.roomKey === "");
    expect(loose.length).toBe(2); // markers 2 and 7 were in the Bar
    await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
    await expect(t.mutation(api.game.startGame, { slug: SLUG, hostKey })).rejects.toThrow(/Marker \d+ needs a room/);
    await t.mutation(api.game.saveMarkers, {
      slug: SLUG, hostKey, markers: markers.map((m) => ({ number: m.number, roomKey: m.roomKey || "office" })),
    });
    await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
    expect((await game(t)).status).toBe("playing");
  });

  test("host controls: show all evidence, sound check, awards, end of the night", async () => {
    const { t, hostKey, tokens } = await setup({ guests: 4 });
    await t.mutation(api.game.setTvShowAll, { slug: SLUG, hostKey, show: true });
    expect((await t.query(api.game.tv, { slug: SLUG, tvKey: await tvKey(t) })).game.tvShowAll).toBe(true);
    await t.mutation(api.game.soundCheck, { slug: SLUG, hostKey });
    expect((await t.query(api.game.tv, { slug: SLUG, tvKey: await tvKey(t) })).game.soundCheckAt).toBeGreaterThan(0);
    for (let i = 0; i < 4; i++) await nextRound(t, SLUG, hostKey);
    expect((await game(t)).tvShowAll).toBe(false); // the reveal takes the screen
    await expect(t.mutation(api.game.endNight, { slug: SLUG, hostKey })).rejects.toThrow(/awards first/);
    const players = await t.run((ctx) => ctx.db.query("players").collect());
    await t.mutation(api.game.vote, { token: tokens[1], dressed: players[0]._id as Id<"players"> });
    await t.mutation(api.game.finish, { slug: SLUG, hostKey });
    const tv = await t.query(api.game.tv, { slug: SLUG, tvKey: await tvKey(t) });
    expect(tv.results!.awards!.bestDressed[0].name).toBe(players[0].charName);
    await t.mutation(api.game.endNight, { slug: SLUG, hostKey });
    expect((await t.query(api.game.tv, { slug: SLUG, tvKey: await tvKey(t) })).game.endedAt).toBeGreaterThan(0);
  });

  test("one printed set of 36 QR cards serves every game; unused cards aren't in play", async () => {
    const { t, hostKey, tokens } = await setup({ markers: 6 });
    await t.mutation(api.host.ensureCards, { slug: SLUG, hostKey });
    const sheet = await t.query(api.host.markerCards, { slug: SLUG, hostKey });
    expect(sheet.cards).toHaveLength(36);
    expect(new Set(sheet.cards.map((c) => c.code)).size).toBe(36);
    expect(sheet.markers).toHaveLength(6);
    // card N is the same code in the game as on the sheet
    for (const m of sheet.markers) expect(m.code).toBe(sheet.cards[m.number - 1].code);
    // a card past the ones in play: a friendly "not tonight", and no clue
    await expect(t.mutation(api.game.scanMarker, { token: tokens[0], code: sheet.cards[20].code })).rejects.toThrow(/Card 21 isn't in play tonight/);
    expect(await t.query(api.game.readMarker, { token: tokens[0], code: sheet.cards[20].code })).toMatchObject({ error: expect.stringMatching(/Card 21/) });
    // the case file only has clues for the 6 markers in play
    expect((await t.mutation(api.game.scanMarker, { token: tokens[0], code: sheet.cards[5].code.toUpperCase() })).number).toBe(6);
    // a second game uses the same printed cards
    await t.mutation(internal.admin.createGame, { slug: "test-p4b", title: "Second", isTest: true, makeActive: false, registrationClosesAt: FUTURE, deadlineLabel: "x" });
    await t.mutation(internal.game.seedFakeCast, { slug: "test-p4b", guests: 4, markers: 3, seed: 2 });
    const second = await t.run((ctx) => ctx.db.query("markers").collect());
    const m1 = second.filter((m) => m.number === 1);
    expect(new Set(m1.map((m) => m.code)).size).toBe(1);
    await expect(t.mutation(api.game.saveMarkers, { slug: SLUG, hostKey, markers: [{ number: 37, roomKey: "" }] })).rejects.toThrow();
  });

  test("printing QR cards and rescuing a phone need the host key", async () => {
    const { t, hostKey, players } = await setup({ start: false, markers: 6 });
    await expect(t.query(api.host.markerCards, { slug: SLUG, hostKey: "x" })).rejects.toThrow();
    await expect(t.mutation(api.host.ensureCards, { slug: SLUG, hostKey: "x" })).rejects.toThrow();
    await expect(t.mutation(api.host.rescuePhone, { slug: SLUG, hostKey: "x", playerId: players[2]._id })).rejects.toThrow();
    // rescue: a brand-new link, the old one stops working, and the TV says so
    const r = await t.mutation(api.host.rescuePhone, { slug: SLUG, hostKey, playerId: players[2]._id });
    expect(r.token).not.toBe(players[2].token);
    expect(await t.query(api.game.phone, { token: players[2].token })).toBeNull();
    expect((await t.query(api.game.phone, { token: r.token }))!.me.charName).toBe(players[2].charName);
    const tv = await t.query(api.game.tv, { slug: SLUG, tvKey: await tvKey(t) });
    expect(tv.game.lastRescue!.name).toBe(players[2].charName);
  });
});
