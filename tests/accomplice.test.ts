// Step 5 (v2): killer + accomplice games. The accomplice didn't do it, knows who did and lies for them.
// Needs 7+ players; with fewer the game drops to one killer. Both are drawn from everyone (the opt-in is ignored).
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { api, internal } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { ACCOMPLICE_ON, buildCase, checkInput, MIN_ACCOMPLICE } from "../convex/engine/build";
import { fakeCast, roomsN } from "../convex/engine/fake";
import { seeded } from "../convex/engine/rng";
import { CLASSIC, mid } from "../convex/engine/text";
import { ADULT } from "../convex/engine/textAdult";
import type { CaseFile } from "../convex/engine/types";
import { captionText, cueVersions } from "../convex/narration";
import schema from "../convex/schema";
import { REVEAL, revealTimes } from "../convex/shared";
import { howCues } from "../convex/show";
import { startWanted } from "../convex/voiceLines";
import { VOICE_GAP_MS, plan, type Data } from "../src/tv/timeline";
import { nextRound } from "./steps";

const modules = import.meta.glob("../convex/**/*.ts");
const FUTURE = Date.now() + 7 * 864e5;
const SLUG = "test-accomplice";

beforeAll(() => {
  const k = new Uint8Array(32);
  crypto.getRandomValues(k);
  process.env.SEAL_KEY = btoa(String.fromCharCode(...k));
});

describe("the engine, with an accomplice", () => {
  test("1,000 games (7 to 12 guests, both scripts): one killer, one other accomplice, the evidence leaves the killer among the few standing", () => {
    const failures: string[] = [];
    let clearedAccomplice = 0;
    let killerNotOptedIn = 0;
    let n = 0;
    for (const tone of ["classic", "adult"] as const) {
      for (const guests of [7, 8, 9, 10, 12]) {
        for (let seed = 1; seed <= 100; seed++) {
          const rng = seeded(seed * 104729 + guests);
          const input = fakeCast({ rng, guests, rooms: roomsN(2 + (seed % 7)), markers: (seed * 7) % 30, optInRate: 0.3 });
          input.tone = tone;
          input.accomplice = true;
          let cf: CaseFile;
          try {
            cf = buildCase(input, rng);
          } catch (err) {
            failures.push(`${tone}/${guests}/${seed}: ${(err as Error).message}`);
            continue;
          }
          n++;
          const tag = `${tone}/${guests}g/seed${seed}`;
          const sol = cf.solution;
          const S = tone === "adult" ? ADULT : CLASSIC;
          if (!sol.accompliceId || sol.accompliceId === sol.killerId) failures.push(`${tag}: no separate accomplice`);
          if (!input.suspects.find((s) => s.id === sol.killerId)!.killerOk) killerNotOptedIn++;
          const roles = cf.briefings.map((b) => b.role);
          if (roles.filter((r) => r === "killer").length !== 1 || roles.filter((r) => r === "accomplice").length !== 1) failures.push(`${tag}: roles ${roles.join(",")}`);
          const name = (id: string) => input.suspects.find((s) => s.id === id)!.name;
          const ex = input.exhibits.find((e) => e.id === sol.exhibitId)!;
          const room = input.rooms.find((r) => r.key === sol.roomKey)!;
          // The accomplice's phone: the killer, the weapon and the room.
          const ab = cf.briefings.find((b) => b.role === "accomplice")!;
          if (ab.playerId !== sol.accompliceId) failures.push(`${tag}: the accomplice briefing went to the wrong guest`);
          const said = ab.lines.join(" ");
          if (!said.includes(name(sol.killerId)) || !said.includes(`the ${ex.name.toLowerCase()}`) || !said.includes(mid(room.label))) failures.push(`${tag}: accomplice briefing lacks the facts`);
          if (!ab.lines[0].startsWith("You're the accomplice. ")) failures.push(`${tag}: accomplice card line`);
          // The killer's phone names the accomplice; everyone else hears there is one, but not who.
          const kb = cf.briefings.find((b) => b.role === "killer")!;
          if (!kb.lines.join(" ").includes(name(sol.accompliceId!))) failures.push(`${tag}: killer briefing doesn't name the accomplice`);
          for (const b of cf.briefings.filter((x) => x.role === "innocent")) {
            if (b.lines !== S.innocentLinesAcc) failures.push(`${tag}: innocent lines aren't the accomplice-game ones`);
          }
          // The evidence leaves the killer among the planned few (v4), and may clear the accomplice.
          const left = new Set(input.suspects.map((s) => s.id));
          for (const c of cf.clues) c.elim.suspects.forEach((id) => left.delete(id));
          if (left.size !== cf.open!.suspects || !left.has(sol.killerId)) failures.push(`${tag}: the evidence doesn't leave the killer among the few`);
          if (cf.clues.some((c) => c.elim.suspects.includes(sol.accompliceId!))) clearedAccomplice++;
        }
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
    expect(n).toBe(1000);
    // the evidence clears the accomplice like any innocent (mostly: a few innocents are left standing, v4)
    expect(clearedAccomplice).toBeGreaterThan(n * 0.5);
    // the opt-in is ignored: with few opt-ins, plenty of killers didn't opt in
    expect(killerNotOptedIn).toBeGreaterThan(200);
  });

  test("an accomplice needs 7 guests; one-killer games have none", () => {
    const rng = seeded(5);
    const six = fakeCast({ rng, guests: MIN_ACCOMPLICE - 1, rooms: roomsN(4), markers: 6 });
    expect(checkInput({ ...six, accomplice: true })).toContain(`A killer and an accomplice need at least ${MIN_ACCOMPLICE} guests.`);
    const cf = buildCase(six, rng);
    expect(cf.solution.accompliceId).toBeUndefined();
    expect(cf.briefings.some((b) => b.role === "accomplice")).toBe(false);
    for (const b of cf.briefings.filter((x) => x.role === "innocent")) expect(b.lines).toBe(CLASSIC.innocentLines);
  });

  test("How to play adds the accomplice card and says the accomplice may lie too", () => {
    const base = { search: "all" as const, pacing: { mode: "ready" as const } };
    const one = howCues(base).map(([c]) => c);
    const two = howCues({ ...base, accomplice: true }).map(([c]) => c);
    expect(one).not.toContain("howAccomplice");
    expect(two.slice(0, 2)).toEqual(["howCase", "howAccomplice"]);
    expect(two.length).toBe(one.length + 1);
    // "only the guilty may lie about the murder" covers the accomplice too
    expect(captionText("howCase", "classic", "ivy")).toMatch(/only the guilty/i);
    expect(howCues({ ...base, accomplice: true }).find(([c]) => c === "howAccomplice")![1]).toBe("pair");
    // every adult line has three clean versions, plus the noisy take
    for (const cue of ["howAccomplice", "revealAccomplice"] as const) {
      expect(cueVersions(cue, "adult").length).toBeGreaterThanOrEqual(3);
      expect(captionText(cue, "classic", "ivy")).toMatch(/accomplice/i);
    }
  });

  test("the reveal clips: an accomplice line for every guest, only in accomplice games", () => {
    const n = { host: "ivy" as const, unstable: false };
    const info = { players: [{ id: "a", charName: "Velma" }, { id: "b", charName: "Bunny" }], exhibits: [], rooms: [], search: "all" as const, seed: "s" };
    expect(startWanted("classic", n, info).some((w) => w.purpose.startsWith("accomplice:"))).toBe(false);
    const w = startWanted("classic", n, { ...info, accomplice: true }).filter((x) => x.purpose.startsWith("accomplice:"));
    expect(w.map((x) => x.caption)).toEqual(["Velma.", "Bunny."]);
    const adult = startWanted("adult", n, { ...info, accomplice: true }).find((x) => x.purpose === "accomplice:a")!;
    expect(adult.caption.startsWith("Velma")).toBe(true);
    expect(adult.caption.length).toBeGreaterThan("Velma.".length);
  });
});

async function setup(guests: number, accomplice = true) {
  const t = convexTest(schema, modules);
  const { hostKey } = await t.mutation(internal.admin.createGame, {
    slug: SLUG, title: "Accomplice test", isTest: true, makeActive: false, registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 31",
  });
  await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, pacing: { mode: "ready", roundMinutes: 10 } });
  // A game saved with the accomplice on before Oct 16.
  if (accomplice) await t.run(async (ctx) => ctx.db.patch((await ctx.db.query("games").first())!._id, { accomplice: true }));
  await t.mutation(internal.game.seedFakeCast, { slug: SLUG, guests, markers: 8, seed: 17 });
  await t.mutation(api.game.openDoors, { slug: SLUG, hostKey });
  const started = await t.mutation(api.game.startGame, { slug: SLUG, hostKey });
  const players = await t.run((ctx) => ctx.db.query("players").collect());
  const tvKey = await t.run(async (ctx) => (await ctx.db.query("games").first())!.tvKey!);
  await t.mutation(api.game.skipIntro, { slug: SLUG, hostKey });
  const roles = new Map<string, string>();
  for (const p of players) roles.set(p._id, (await t.query(api.game.phone, { token: p.token }))!.briefing?.role ?? "none");
  const who = (role: string) => players.find((p) => roles.get(p._id) === role)!;
  return { t, hostKey, tvKey, started, players, roles, who };
}

// Oct 16 (Heston): "lets toggle off the accomplice for now, strike that role from everything. that role is gone."
// The engine code above stays (ACCOMPLICE_ON brings it back); no game can turn it on.
describe("the accomplice is off", () => {
  test("ACCOMPLICE_ON is off", () => {
    expect(ACCOMPLICE_ON).toBe(false);
  });

  test("8 guests with the old setting on: one killer, no accomplice anywhere (phones, TV, How to play, the reveal, the host)", async () => {
    const { t, hostKey, tvKey, started, roles } = await setup(8);
    expect(started).toEqual({ suspects: 8, exhibits: 6, markers: 8 });
    const counts = [...roles.values()].reduce<Record<string, number>>((m, r) => ({ ...m, [r]: (m[r] ?? 0) + 1 }), {});
    expect(counts).toEqual({ killer: 1, innocent: 7 });
    const g = await t.run(async (ctx) => (await ctx.db.query("games").first())!);
    expect(g.hasAccomplice).toBe(false);
    const tv = await t.query(api.game.tv, { slug: SLUG, tvKey });
    expect(tv.game.accomplice).toBe(false);
    expect(tv.reveal).toEqual(REVEAL);
    expect(howCues({ search: "all", pacing: { mode: "ready" }, accomplice: tv.game.accomplice }).map(([c]) => c)).not.toContain("howAccomplice");
    for (const [, role] of roles) expect(role).not.toBe("accomplice");
    const roster = await t.query(api.host.roster, { slug: SLUG, hostKey });
    expect(roster!.game.accomplice).toBe(false);
    expect(roster!.game.hasAccomplice).toBe(false);
  });

  test("the host can't turn it back on", async () => {
    const t = convexTest(schema, modules);
    const { hostKey } = await t.mutation(internal.admin.createGame, {
      slug: SLUG, title: "Accomplice test", isTest: true, makeActive: false, registrationClosesAt: FUTURE, deadlineLabel: "Sat, Oct 31",
    });
    await t.mutation(api.host.updateSettings, { slug: SLUG, hostKey, accomplice: true });
    const g = await t.run(async (ctx) => (await ctx.db.query("games").first())!);
    expect(g.accomplice).toBeFalsy();
  });

  test("one-killer games refuse an accomplice guess", async () => {
    const { t, hostKey, players, who } = await setup(5, false);
    for (let r = 0; r < 3; r++) await nextRound(t, SLUG, hostKey);
    const board = (await t.query(api.game.phone, { token: players[0].token }))!.board!;
    const p = players.find((x) => x._id !== who("killer")._id)!;
    const other = players.find((x) => x._id !== p._id)!;
    await expect(
      t.mutation(api.game.accuse, { token: p.token, suspectId: other._id, exhibitId: board.exhibits[0].id, roomKey: board.rooms[0].key, accompliceId: players.find((x) => x._id !== p._id && x._id !== other._id)!._id as Id<"players"> }),
    ).rejects.toThrow(/no accomplice/);
  });
});

describe("the TV reveal with an accomplice", () => {
  const T = 1_800_000_000_000;
  const data = (accomplice: boolean, tone: "classic" | "adult" = "classic") =>
    ({
      now: T,
      game: { title: "T", isTest: true, status: "reveal", round: 4, paused: false, pacing: { mode: "ready", roundMinutes: 10 }, roundEndsAt: null, startedAt: T - 1e6, introEndsAt: T - 9e5, revealAt: T, endedAt: null, doorsAt: T - 2e6, roundStartedAt: null, pausedAt: null, resumedAt: null, doneAt: null, rulesAt: null, tone, narrator: { host: "ivy", unstable: false }, levels: { voice: 100, music: 55, sfx: 80 }, search: "all", wifi: null, tvShowAll: false, soundCheckAt: null, lastRescue: null, bodyRoom: "", rooms: [], openRooms: [], slug: "s", accomplice },
      guests: [],
      counts: { registered: 8, here: 8, playing: 8, ready: 0, accused: 8 },
      exhibits: [],
      evidence: [],
      results: { killerWins: true, killerFigure: "slick", accomplice: accomplice ? { name: "Bunny", photo: null, figure: "flapper" } : null },
      reveal: revealTimes(accomplice, tone),
      voice: { voice: "ivy", rollCall: null, body: null, rooms: {}, reveal: { killer: null, exhibit: null, room: null, accomplice: accomplice ? { url: "a.mp3", caption: "Bunny.", seconds: 1 } : null }, winners: null, heckles: [] },
    }) as unknown as Data;
  const secs = () => 3;

  test("after the weapon and the room: 'And the accomplice…', their name, their drawing; then the verdict, later", () => {
    const R = revealTimes(true);
    const p = plan(data(true), T + R.accomplice! + 500, secs);
    const lead = p.events.find((e) => e.cue === "revealAccomplice")!;
    expect(lead.at).toBe(T + R.accomplice! + 400);
    // the name follows the lead-in after a breath (never on top of it)
    expect(p.events.find((e) => e.id.endsWith(":acc:name"))!.at).toBe(lead.at + 3000 + VOICE_GAP_MS);
    expect(p.cameos.some((c) => c.char === "flapper" && c.on === "reveal3")).toBe(true);
    expect(p.events.find((e) => e.sfx === "sinisterBrass")!.at).toBe(T + R.verdict);
    expect(R.verdict).toBeGreaterThan(REVEAL.verdict);
    expect(revealTimes(true, "adult").verdict).toBeGreaterThan(R.verdict);
  });

  test("one-killer games keep the old reveal", () => {
    const p = plan(data(false), T + REVEAL.verdict + 500, secs);
    expect(p.events.some((e) => e.cue === "revealAccomplice")).toBe(false);
    expect(p.events.find((e) => e.sfx === "sinisterBrass")!.at).toBe(T + REVEAL.verdict);
  });
});
