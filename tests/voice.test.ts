import { convexTest } from "convex-test";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { api, internal } from "../convex/_generated/api";
import schema from "../convex/schema";
import type { Id } from "../convex/_generated/dataModel";

const modules = import.meta.glob("../convex/**/*.ts");
const FUTURE = Date.now() + 7 * 864e5;
const SLUG = "test-voice";

beforeAll(() => {
  process.env.VOICE_WORKERS = "1";
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
});

/** ElevenLabs stand-in: returns 16 KB of "audio" per line and remembers what it was asked to say. */
function fakeElevenLabs() {
  const said: { text: string; voice: string }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: { body: string; headers: Record<string, string> }) => {
      expect(url).toMatch(/^https:\/\/api\.elevenlabs\.io\/v1\/text-to-speech\//);
      expect(init.headers["xi-api-key"]).toBe("test-key");
      said.push({ text: JSON.parse(init.body).text, voice: url.split("/").pop()!.split("?")[0] });
      return new Response(new Uint8Array(16_000), { status: 200, headers: { "Content-Type": "audio/mpeg" } });
    }),
  );
  return said;
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.ELEVENLABS_API_KEY;
});

async function setup(o: { guests?: number; start?: boolean; search?: "all" | "waves" } = {}) {
  const t = convexTest(schema, modules);
  const { hostKey } = await t.mutation(internal.admin.createGame, {
    slug: SLUG, title: "Voice test", isTest: true, makeActive: false, registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 24",
  });
  await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, pacing: { mode: "ready", roundMinutes: 10 }, search: o.search ?? "all" });
  await t.mutation(internal.game.seedFakeCast, { slug: SLUG, guests: o.guests ?? 5, markers: 8, seed: 3 });
  const players = await t.run((ctx) => ctx.db.query("players").collect());
  const tvKey = await t.run(async (ctx) => (await ctx.db.query("games").first())!.tvKey!);
  if (o.start) {
    await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
    await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
  }
  return { t, hostKey, players, tvKey };
}

describe("sign-up: roll-call question and Say it like", () => {
  test("stored with the guest, and kept when an older page edits without them", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.admin.createGame, { slug: SLUG, title: "T", isTest: true, makeActive: true, registrationClosesAt: FUTURE, deadlineLabel: "Sat" });
    const base = { realName: "Ana Ruiz", charName: "Velma Kowalski", who: "Cigarette girl.", signature: "Silver case", weapon: "candlestick", killerOk: true, figure: "lady" };
    const { token } = await t.mutation(api.registration.register, { ...base, rumor: "  Once cheated a priest at cards, and won. ", sayAs: "VEL-muh" });
    let me = await t.query(api.registration.me, { token });
    expect(me).toMatchObject({ rumor: "Once cheated a priest at cards, and won.", sayAs: "VEL-muh" });
    await t.mutation(api.registration.update, { token, ...base, who: "Cigarette girl, retired." });
    me = await t.query(api.registration.me, { token });
    expect(me).toMatchObject({ rumor: "Once cheated a priest at cards, and won.", sayAs: "VEL-muh", who: "Cigarette girl, retired." });
    await expect(t.mutation(api.registration.update, { token, ...base, rumor: "x".repeat(141) })).rejects.toThrow(/140/);
  });
});

describe("roll call (v2)", () => {
  test("every guest gets a different roast with their names and weapon; the host can rewrite and reset it before Start", async () => {
    const { t, hostKey, players } = await setup({ guests: 6 });
    let sheet = await t.query(api.voice.rollCallSheet, { slug: SLUG, hostKey });
    expect(sheet.started).toBe(false);
    expect(sheet.guests).toHaveLength(6);
    expect(new Set(sheet.guests.map((g) => g.roast)).size).toBe(6);
    for (const g of sheet.guests) {
      expect(g.roast).toContain(g.realName.split(" ")[0]); // roasts use the real name
      expect(g.roast).not.toContain(g.charName);
      expect(g.roast).not.toMatch(/[{}]/);
      expect(g.voice).toBe("later");
      expect(g.weapon).toBeTruthy();
    }
    await t.mutation(api.voice.setRollLine, { slug: SLUG, hostKey, playerId: players[1]._id, line: "The only man in Chicago afraid of pigeons" });
    sheet = await t.query(api.voice.rollCallSheet, { slug: SLUG, hostKey });
    expect(sheet.guests.find((g) => g.id === players[1]._id)).toMatchObject({ roast: "The only man in Chicago afraid of pigeons", edited: true });
    await t.mutation(api.voice.setRollLine, { slug: SLUG, hostKey, playerId: players[1]._id, line: "  " });
    sheet = await t.query(api.voice.rollCallSheet, { slug: SLUG, hostKey });
    expect(sheet.guests.find((g) => g.id === players[1]._id)!.edited).toBe(false);
    await expect(t.mutation(api.voice.setRollLine, { slug: SLUG, hostKey: "wrong", playerId: players[1]._id, line: "x" })).rejects.toThrow();
  });

  test("recorded at Start in the chosen voice: name, signature, weapon, motive and roast, the name said their way", async () => {
    const said = fakeElevenLabs();
    process.env.ELEVENLABS_API_KEY = "test-key";
    vi.useFakeTimers();
    const { t, hostKey, players } = await setup({ guests: 4 });
    await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, narrator: { host: "duke", unstable: false } });
    await t.run((ctx) => ctx.db.patch(players[0]._id, { sayAs: "DOH-lor-ez" }));
    await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
    await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const roll = said.filter((s) => s.text.includes("Weapon: the"));
    expect(roll).toHaveLength(4);
    expect(roll.every((s) => /your motive: /.test(s.text) && /Signature: /.test(s.text))).toBe(true);
    expect(roll.some((s) => s.text.includes("DOH-lor-ez") && !s.text.includes(players[0].charName))).toBe(true);
    expect(new Set(said.map((s) => s.voice))).toEqual(new Set(["QzTKubutNn9TjrB7Xb2Q"])); // Duke
    const sheet = await t.query(api.voice.rollCallSheet, { slug: SLUG, hostKey });
    expect(sheet.started).toBe(true);
    expect(sheet.counts).toMatchObject({ total: 4, ready: 4, failed: 0 });
    const gameId = (await t.run(async (ctx) => (await ctx.db.query("games").first())!._id)) as Id<"games">;
    const before = said.length;
    await t.action(internal.voice.record, { gameId, scope: "roll" });
    expect(said.length).toBe(before); // nothing paid for twice
    await expect(t.mutation(api.voice.setRollLine, { slug: SLUG, hostKey, playerId: players[1]._id, line: "x" })).rejects.toThrow(/locked/);
  });

  test("no key on the server: the roll call's voices are marked failed, the game carries on", async () => {
    const { t, hostKey } = await setup({ guests: 3, start: true });
    const gameId = (await t.run(async (ctx) => (await ctx.db.query("games").first())!._id)) as Id<"games">;
    await t.action(internal.voice.record, { gameId, scope: "roll" });
    const sheet = await t.query(api.voice.rollCallSheet, { slug: SLUG, hostKey });
    expect(sheet.counts).toMatchObject({ ready: 0, failed: 3 });
    expect(sheet.guests[0].error).toMatch(/no ElevenLabs key/);
  });
});

describe("names for the intro, waves and reveal", () => {
  test("recorded at Start for every guest, exhibit and room, so the set gives nothing away", async () => {
    const said = fakeElevenLabs();
    process.env.ELEVENLABS_API_KEY = "test-key";
    vi.useFakeTimers();
    const { t } = await setup({ guests: 6, start: true, search: "waves" });
    const game = await t.run(async (ctx) => (await ctx.db.query("games").first())!);
    // Start schedules the recording on its own.
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const clips = await t.query(internal.voice.clipsOf, { slug: SLUG });
    const kinds = (k: string) => clips.filter((c) => c.purpose.startsWith(k)).length;
    expect(kinds("killer:")).toBe(6);
    expect(kinds("winner:")).toBe(6);
    expect(kinds("exhibit:")).toBe(6);
    expect(kinds("room:")).toBe(game.rooms.length);
    expect(kinds("body")).toBe(1);
    expect(kinds("rooms:")).toBeGreaterThanOrEqual(2);
    expect(clips.every((c) => c.status === "ready")).toBe(true);
    // Every line went to ElevenLabs (other tests' background runs may add calls of their own).
    expect(said.length).toBeGreaterThanOrEqual(clips.length);
  });

  test("the TV gets the body room after Start, the answer's clips only at the reveal, the winners only at the awards", async () => {
    fakeElevenLabs();
    process.env.ELEVENLABS_API_KEY = "test-key";
    vi.useFakeTimers();
    const { t, hostKey, tvKey } = await setup({ guests: 5, start: true });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    let tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(tv.voice.body?.caption).toMatch(/found in/);
    expect(tv.voice.reveal).toBeNull();
    expect(tv.voice.winners).toBeNull();
    for (let i = 0; i < 4; i++) await t.mutation(api.game.advanceRound, { slug: SLUG, hostKey });
    tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(tv.game.status).toBe("reveal");
    expect(tv.voice.reveal?.killer?.caption).toContain(tv.results!.killer.split(" ")[0]);
    expect(tv.voice.reveal?.room?.caption).toContain(tv.results!.room.replace(/^The /, ""));
    expect(tv.voice.reveal?.exhibit?.caption).toContain(`Exhibit ${tv.results!.exhibit!.letter}`);
    expect(tv.voice.winners).toBeNull();
    await t.mutation(api.game.finish, { slug: SLUG, hostKey });
    tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(tv.game.doneAt).not.toBeNull();
    expect(tv.voice.winners).not.toBeNull();
  });
});

describe("narrator and levels", () => {
  test("levels change any time; the narrator locks at Start", async () => {
    const { t, hostKey, tvKey } = await setup({ start: true });
    await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, levels: { voice: 70, music: 140, sfx: -5 } });
    const tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(tv.game.levels).toEqual({ voice: 70, music: 100, sfx: 0 });
    await expect(t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, narrator: { host: "duke", unstable: true } })).rejects.toThrow(/locked/);
  });

  test("turn timestamps: doors, rounds, pause and resume, awards", async () => {
    const { t, hostKey, tvKey } = await setup();
    await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
    let tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(tv.game.doorsAt).not.toBeNull();
    await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
    await t.mutation(api.game.advanceRound, { slug: SLUG, hostKey });
    await t.mutation(api.game.setPaused, { slug: SLUG, hostKey, paused: true });
    await t.mutation(api.game.setPaused, { slug: SLUG, hostKey, paused: false });
    tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(tv.game.round).toBe(2);
    expect(tv.game.roundStartedAt).not.toBeNull();
    expect(tv.game.pausedAt).not.toBeNull();
    expect(tv.game.resumedAt! >= tv.game.pausedAt!).toBe(true);
  });
});
