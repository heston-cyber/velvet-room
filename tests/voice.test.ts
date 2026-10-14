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
    const base = { realName: "Ana Ruiz", charName: "Velma Kowalski", who: "Cigarette girl.", signature: "Silver case", weapon: "Candlestick", weaponDesc: "Brass.", killerOk: true };
    const { token } = await t.mutation(api.registration.register, { ...base, rumor: "  Once cheated a priest at cards, and won. ", sayAs: "VEL-muh" });
    let me = await t.query(api.registration.me, { token });
    expect(me).toMatchObject({ rumor: "Once cheated a priest at cards, and won.", sayAs: "VEL-muh" });
    await t.mutation(api.registration.update, { token, ...base, who: "Cigarette girl, retired." });
    me = await t.query(api.registration.me, { token });
    expect(me).toMatchObject({ rumor: "Once cheated a priest at cards, and won.", sayAs: "VEL-muh", who: "Cigarette girl, retired." });
    await expect(t.mutation(api.registration.update, { token, ...base, rumor: "x".repeat(141) })).rejects.toThrow(/140/);
  });
});

describe("roll call", () => {
  test("lines come from the rumor, else who they are; the host can rewrite and reset them", async () => {
    const { t, hostKey, players } = await setup();
    await t.run((ctx) => ctx.db.patch(players[0]._id, { rumor: "Owes money to every bookie in Cicero", sayAs: "DOH-lor-ez" }));
    let sheet = await t.query(api.voice.rollCallSheet, { slug: SLUG, hostKey });
    const row0 = sheet.guests.find((g) => g.id === players[0]._id)!;
    expect(row0.line).toBe("Word on the street: Owes money to every bookie in Cicero.");
    expect(row0.spoken).toContain(players[0].charName); // the caption shows the name as written…
    expect(row0.spoken).toContain(players[0].realName);
    expect(row0.voice).toBe("none");
    const row1 = sheet.guests.find((g) => g.id === players[1]._id)!;
    expect(row1.line).toBe(players[1].who.trim().replace(/([^.!?])$/, "$1."));

    await t.mutation(api.voice.setRollLine, { slug: SLUG, hostKey, playerId: players[1]._id, line: "The only man in Chicago afraid of pigeons" });
    sheet = await t.query(api.voice.rollCallSheet, { slug: SLUG, hostKey });
    expect(sheet.guests.find((g) => g.id === players[1]._id)).toMatchObject({ line: "The only man in Chicago afraid of pigeons.", edited: true });
    await t.mutation(api.voice.setRollLine, { slug: SLUG, hostKey, playerId: players[1]._id, line: "  " });
    sheet = await t.query(api.voice.rollCallSheet, { slug: SLUG, hostKey });
    expect(sheet.guests.find((g) => g.id === players[1]._id)!.edited).toBe(false);
    await expect(t.mutation(api.voice.setRollLine, { slug: SLUG, hostKey: "wrong", playerId: players[1]._id, line: "x" })).rejects.toThrow();
  });

  test("recording: every line once, in the chosen voice; unchanged lines aren't paid for twice; edits re-record", async () => {
    const said = fakeElevenLabs();
    process.env.ELEVENLABS_API_KEY = "test-key";
    const { t, hostKey, players } = await setup({ guests: 4 });
    await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, narrator: { host: "duke", unstable: false } });
    await t.run((ctx) => ctx.db.patch(players[0]._id, { sayAs: "DOH-lor-ez" }));
    const gameId = (await t.run(async (ctx) => (await ctx.db.query("games").first())!._id)) as Id<"games">;
    await t.action(internal.voice.record, { gameId, scope: "roll" });
    expect(said).toHaveLength(4);
    expect(said.some((s) => s.text.includes("DOH-lor-ez") && !s.text.includes(players[0].charName))).toBe(true); // …the voice says it their way
    expect(new Set(said.map((s) => s.voice))).toEqual(new Set(["QzTKubutNn9TjrB7Xb2Q"])); // Duke
    let sheet = await t.query(api.voice.rollCallSheet, { slug: SLUG, hostKey });
    expect(sheet.counts).toMatchObject({ total: 4, ready: 4, failed: 0 });
    expect(sheet.guests[0].seconds).toBe(1); // 16 KB at 128 kbps
    await t.action(internal.voice.record, { gameId, scope: "roll" });
    expect(said).toHaveLength(4);
    await t.mutation(api.voice.setRollLine, { slug: SLUG, hostKey, playerId: players[2]._id, line: "Allergic to honesty" });
    sheet = await t.query(api.voice.rollCallSheet, { slug: SLUG, hostKey });
    expect(sheet.counts.ready).toBe(3);
    await t.action(internal.voice.record, { gameId, scope: "roll" });
    expect(said).toHaveLength(5);
    expect(said[4].text).toContain("Allergic to honesty.");
    // Unstable changes every line, so they all record again.
    await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, narrator: { host: "duke", unstable: true } });
    await t.action(internal.voice.record, { gameId, scope: "roll" });
    expect(said).toHaveLength(9);
    expect(said.slice(5).every((s) => /^\[[^\]]+\] /.test(s.text))).toBe(true);
  });

  test("no key on the server: lines are marked failed, the game carries on", async () => {
    const { t, hostKey } = await setup({ guests: 3 });
    const gameId = (await t.run(async (ctx) => (await ctx.db.query("games").first())!._id)) as Id<"games">;
    await t.action(internal.voice.record, { gameId, scope: "roll" });
    const sheet = await t.query(api.voice.rollCallSheet, { slug: SLUG, hostKey });
    expect(sheet.counts).toMatchObject({ ready: 0, failed: 3 });
    expect(sheet.guests[0].error).toMatch(/no ElevenLabs key/);
  });

  test("Play the roll call: guests who are here, shuffled, on the TV with their clips; gone once the game starts", async () => {
    fakeElevenLabs();
    process.env.ELEVENLABS_API_KEY = "test-key";
    const { t, hostKey, players, tvKey } = await setup({ guests: 5 });
    await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
    await t.run((ctx) => ctx.db.patch(players[4]._id, { checkedIn: false }));
    const gameId = (await t.run(async (ctx) => (await ctx.db.query("games").first())!._id)) as Id<"games">;
    await t.action(internal.voice.record, { gameId, scope: "roll" });
    await t.mutation(api.voice.playRollCall, { slug: SLUG, hostKey });
    let tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    const rc = tv.voice.rollCall!;
    expect(rc.items).toHaveLength(4);
    expect(rc.items.map((i) => i.id)).not.toContain(players[4]._id);
    expect(rc.items.every((i) => i.clip && i.clip.seconds === 1 && i.realName)).toBe(true);
    // the rules and the roll call never play at once
    await t.mutation(api.voice.playRules, { slug: SLUG, hostKey });
    tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(tv.voice.rollCall).toBeNull();
    expect(tv.game.rulesAt).not.toBeNull();
    await t.mutation(api.voice.playRollCall, { slug: SLUG, hostKey });
    await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
    tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(tv.voice.rollCall).toBeNull();
    expect(tv.game.rulesAt).toBeNull();
    await expect(t.mutation(api.voice.playRollCall, { slug: SLUG, hostKey })).rejects.toThrow(/before the game starts/);
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
