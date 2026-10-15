import { describe, expect, test } from "vitest";
import { buildCase, draw, eligibleKillers, openRound, openRoomsIn, waveSizes } from "../convex/engine/build";
import { fakeCast, roomsN, ROOMS_5, ROOMS_6 } from "../convex/engine/fake";
import { seeded } from "../convex/engine/rng";
import { mid } from "../convex/engine/text";
import type { CaseFile, CaseInput, PlacedClue } from "../convex/engine/types";

// An independent solver: replays public clues in order, written separately from the engine
// so the engine isn't grading its own homework.
function candidates(input: CaseInput, clues: PlacedClue[], upToRound: number) {
  let s = input.suspects.map((x) => x.id);
  let e = input.exhibits.map((x) => x.id);
  let r = input.rooms.map((x) => x.key);
  for (const c of clues.filter((c) => c.round <= upToRound)) {
    s = s.filter((id) => !c.elim.suspects.includes(id));
    e = e.filter((id) => !c.elim.exhibits.includes(id));
    r = r.filter((k) => !c.elim.rooms.includes(k));
  }
  return { s, e, r, combos: s.length * e.length * r.length };
}

// Every clue's words must name exactly what it rules out.
function textMatchesLogic(input: CaseInput, c: PlacedClue, bodyRoomKey: string): string | null {
  for (const id of c.elim.suspects) {
    const n = input.suspects.find((s) => s.id === id)!.name;
    if (c.kind !== "twist" && !c.text.includes(n)) return `${c.id} doesn't name ${n}`;
  }
  for (const id of c.elim.exhibits) {
    // v2: weapons go by name ("the lawn gnome"), not exhibit letters
    const n = input.exhibits.find((x) => x.id === id)!.name.toLowerCase();
    if (!c.text.toLowerCase().includes(`the ${n}`)) return `${c.id} doesn't name the ${n}`;
  }
  if (c.kind === "room") {
    const label = input.rooms.find((r) => r.key === c.elim.rooms[0])!.label;
    if (!c.text.includes(label) && !c.text.includes(mid(label))) return `${c.id} doesn't name ${label}`;
  }
  if (c.kind === "twist") {
    const body = input.rooms.find((r) => r.key === bodyRoomKey)!.label;
    if (!c.text.includes(mid(body))) return `${c.id} twist doesn't name the body room`;
  }
  return null;
}

type Config = { guests: number; rooms: typeof ROOMS_5; markers: number; optIn: number; tone: "classic" | "adult"; search: "all" | "waves" };
const configs: Config[] = [];
for (const tone of ["classic", "adult"] as const) {
  for (const search of ["all", "waves"] as const) {
    for (const guests of [4, 5, 6, 8, 9, 10, 12]) {
      for (const n of [2, 3, 5, 6, 8]) {
        for (const markers of [0, 5, 10, 15, 20, 30, 36]) {
          configs.push({ guests, rooms: roomsN(n), markers, optIn: 0.8, tone, search });
        }
      }
    }
  }
}
const SEEDS = 5; // 980 setups x 5 = 4,900 games

describe("the engine", () => {
  test("4,900 simulated games (2 to 8 rooms, 0 to 36 markers, both scripts, both search modes) are all solvable, fair and consistent", () => {
    let games = 0;
    const failures: string[] = [];
    const attempts: number[] = [];
    for (const cfg of configs) {
      for (let seed = 1; seed <= SEEDS; seed++) {
        const rng = seeded(seed * 7919 + cfg.guests * 31 + cfg.markers + cfg.rooms.length * 101);
        const input = fakeCast({ rng, guests: cfg.guests, rooms: cfg.rooms, markers: cfg.markers, optInRate: cfg.optIn });
        input.tone = cfg.tone;
        input.search = cfg.search;
        let cf: CaseFile;
        try {
          cf = buildCase(input, rng);
        } catch (err) {
          failures.push(`${JSON.stringify({ ...cfg, rooms: cfg.rooms.length, seed })}: ${(err as Error).message}`);
          continue;
        }
        games++;
        attempts.push(cf.attempts);
        const tag = `${cfg.tone}/${cfg.search}/${cfg.guests}g/${cfg.rooms.length}r/${cfg.markers}m/seed${seed}`;
        const sol = cf.solution;

        // the body room is drawn at Start, is a real room, and opens first
        if (!input.rooms.some((r) => r.key === cf.bodyRoomKey)) failures.push(`${tag}: body room isn't in play`);
        if (cf.roomOrder[0] !== cf.bodyRoomKey) failures.push(`${tag}: body room doesn't open first`);
        if ([...cf.roomOrder].sort().join() !== input.rooms.map((r) => r.key).sort().join()) failures.push(`${tag}: room order isn't every room once`);
        // a marker's clue is readable from the round its room opens, never before
        for (const c of cf.clues.filter((x) => x.channel === "marker")) {
          const room = input.markers.find((m) => m.number === c.markerNumber)!.roomKey;
          const opens = openRound(room, cf.roomOrder, cfg.search);
          if (c.round !== opens) failures.push(`${tag}: marker ${c.markerNumber} clue is in Round ${c.round}, room opens Round ${opens}`);
          if (cfg.search === "all" && c.round !== 1) failures.push(`${tag}: all rooms open but a marker isn't Round 1`);
          if (!openRoomsIn(c.round, cf.roomOrder, cfg.search).includes(room)) failures.push(`${tag}: marker ${c.markerNumber} readable while its room is closed`);
        }

        // killer only ever from eligible, checked-in guests
        const killer = input.suspects.find((s) => s.id === sol.killerId);
        if (!killer) failures.push(`${tag}: killer isn't a checked-in guest`);
        if (input.suspects.filter((s) => s.killerOk).length >= 3 && !killer?.killerOk) failures.push(`${tag}: killer didn't opt in`);
        if (!input.exhibits.some((e) => e.id === sol.exhibitId)) failures.push(`${tag}: weapon wasn't handed in`);

        // independent solve
        const fin = candidates(input, cf.clues, 3);
        if (!(fin.s.length === 1 && fin.s[0] === sol.killerId && fin.e.length === 1 && fin.e[0] === sol.exhibitId && fin.r.length === 1 && fin.r[0] === sol.roomKey)) {
          failures.push(`${tag}: public clues don't narrow to exactly the answer`);
        }
        if (candidates(input, cf.clues, 2).combos < 2) failures.push(`${tag}: solved before Round 3`);
        const r1 = candidates(input, cf.clues, 1);
        if (r1.s.length < Math.min(3, input.suspects.length)) failures.push(`${tag}: too easy after Round 1`);

        // each wrong suspect, exhibit and room is ruled out by at least one clue
        const ruledOut = new Set(cf.clues.flatMap((c) => [...c.elim.suspects, ...c.elim.exhibits, ...c.elim.rooms]));
        for (const s of input.suspects) if (s.id !== sol.killerId && !ruledOut.has(s.id)) failures.push(`${tag}: ${s.name} never cleared`);
        for (const e of input.exhibits) if (e.id !== sol.exhibitId && !ruledOut.has(e.id)) failures.push(`${tag}: the ${e.name} never cleared`);
        for (const r of input.rooms) if (r.key !== sol.roomKey && !ruledOut.has(r.key)) failures.push(`${tag}: ${r.label} never cleared`);

        // words match logic
        for (const c of cf.clues) {
          const bad = textMatchesLogic(input, c, cf.bodyRoomKey);
          if (bad) failures.push(`${tag}: ${bad}`);
        }
        // tips: every guest gets one (the killer too, so a tip gives nobody away), and none contradicts the answer
        const pool = cf.clues.some((c) => c.round > 1 && ["suspect", "suspectPair", "exhibit", "exhibitPair", "room"].includes(c.kind));
        if (pool && !cf.tips.some((t) => t.playerId === sol.killerId)) failures.push(`${tag}: the killer has no tip, so tips give them away`);
        if (pool && new Set(cf.tips.map((t) => t.playerId)).size !== input.suspects.length) failures.push(`${tag}: not every guest has a tip`);
        for (const t of cf.tips) {
          if (t.elim.suspects.includes(sol.killerId) || t.elim.exhibits.includes(sol.exhibitId) || t.elim.rooms.includes(sol.roomKey)) failures.push(`${tag}: tip contradicts the answer`);
        }
        // every marker has exactly one clue
        for (const m of input.markers) {
          const n = cf.clues.filter((c) => c.markerNumber === m.number).length;
          if (n !== 1) failures.push(`${tag}: marker ${m.number} has ${n} clues`);
        }
        // exactly one killer briefing, and it names the right exhibit and room
        const kb = cf.briefings.filter((b) => b.role === "killer");
        if (kb.length !== 1 || kb[0].playerId !== sol.killerId) failures.push(`${tag}: wrong killer briefing`);
        const ex = input.exhibits.find((e) => e.id === sol.exhibitId)!;
        const room = input.rooms.find((r) => r.key === sol.roomKey)!;
        if (!kb[0]?.lines[0].includes(`the ${ex.name.toLowerCase()}`) || !kb[0]?.lines[0].includes(mid(room.label))) failures.push(`${tag}: killer briefing has the wrong details`);
        // no innocent briefing mentions the answer
        for (const b of cf.briefings.filter((b) => b.role === "innocent")) {
          if (b.lines.join(" ").toLowerCase().includes(ex.name.toLowerCase())) failures.push(`${tag}: innocent briefing leaks the weapon`);
        }
      }
    }
    expect(failures.slice(0, 20)).toEqual([]);
    expect(games).toBe(configs.length * SEEDS);
    // the builder rarely needs more than a few tries
    expect(Math.max(...attempts)).toBeLessThan(50);
  });

  test("the draw respects the killer opt-in", () => {
    const rng = seeded(42);
    const input = fakeCast({ rng, guests: 9, optInRate: 1 });
    input.suspects.forEach((s, i) => (s.killerOk = i < 3)); // only three opted in
    const counts = new Map<string, number>();
    for (let i = 0; i < 600; i++) {
      const sol = draw(input, rng);
      counts.set(sol.killerId, (counts.get(sol.killerId) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual(["p1", "p2", "p3"]);
    for (const n of counts.values()) expect(n).toBeGreaterThan(120); // roughly even, ~200 each
  });

  test("if fewer than 3 opted in, anyone checked in can be drawn", () => {
    const rng = seeded(7);
    const input = fakeCast({ rng, guests: 6 });
    input.suspects.forEach((s) => (s.killerOk = false));
    expect(eligibleKillers(input)).toHaveLength(6);
    input.suspects[0].killerOk = true;
    input.suspects[1].killerOk = true;
    expect(eligibleKillers(input)).toHaveLength(6);
    input.suspects[2].killerOk = true;
    expect(eligibleKillers(input).map((s) => s.id)).toEqual(["p1", "p2", "p3"]);
  });

  test("every room, weapon and guest can come up", () => {
    const rng = seeded(99);
    const input = fakeCast({ rng, guests: 8, rooms: ROOMS_6, optInRate: 1 });
    const seen = { k: new Set<string>(), w: new Set<string>(), r: new Set<string>() };
    for (let i = 0; i < 800; i++) {
      const s = draw(input, rng);
      seen.k.add(s.killerId);
      seen.w.add(s.exhibitId);
      seen.r.add(s.roomKey);
    }
    expect(seen.k.size).toBe(8);
    expect(seen.w.size).toBe(8);
    expect(seen.r.size).toBe(6);
  });

  test("only weapons that were handed in can be the weapon", () => {
    const rng = seeded(3);
    const input = fakeCast({ rng, guests: 9, weaponsHandedIn: 6 });
    for (let i = 0; i < 300; i++) {
      const cf = buildCase(input, rng);
      expect(input.exhibits.map((e) => e.id)).toContain(cf.solution.exhibitId);
    }
  });

  test("refuses to start with too few guests or rooms", () => {
    const rng = seeded(5);
    expect(() => draw(fakeCast({ rng, guests: 2 }), rng)).toThrow(/3 guests/);
    const one = fakeCast({ rng, guests: 5 });
    one.rooms = one.rooms.slice(0, 1);
    one.markers = [];
    expect(() => draw(one, rng)).toThrow(/2 rooms/);
    const nine = fakeCast({ rng, guests: 5 });
    nine.rooms = [...roomsN(8), { key: "attic", label: "The Attic" }];
    expect(() => buildCase(nine, rng)).toThrow(/at most 8 rooms/);
  });

  test("waves open about 40%, then 75%, then every room, and opened rooms stay open", () => {
    expect(waveSizes(2)).toEqual([1, 2, 2]);
    expect(waveSizes(3)).toEqual([2, 3, 3]);
    expect(waveSizes(5)).toEqual([2, 4, 5]);
    expect(waveSizes(8)).toEqual([4, 6, 8]);
    const order = ["a", "b", "c", "d", "e"];
    expect(openRoomsIn(1, order, "waves")).toEqual(["a", "b"]);
    expect(openRoomsIn(2, order, "waves")).toEqual(["a", "b", "c", "d"]);
    expect(openRoomsIn(3, order, "waves")).toEqual(order);
    expect(openRoomsIn(4, order, "waves")).toEqual(order);
    expect(openRoomsIn(1, order, "all")).toEqual(order);
  });

  test("where the body turns up and the room order don't give away the answer", () => {
    // Over many draws, the murder room is in the first wave about as often as chance says.
    const rng = seeded(2026);
    let firstWave = 0, bodyIsMurderRoom = 0;
    const N = 1500;
    const bodies = new Map<string, number>();
    for (let i = 0; i < N; i++) {
      const input = fakeCast({ rng, guests: 8, rooms: ROOMS_5, markers: 10 });
      input.search = "waves";
      const cf = buildCase(input, rng);
      if (openRound(cf.solution.roomKey, cf.roomOrder, "waves") === 1) firstWave++;
      if (cf.solution.roomKey === cf.bodyRoomKey) bodyIsMurderRoom++;
      bodies.set(cf.bodyRoomKey, (bodies.get(cf.bodyRoomKey) ?? 0) + 1);
    }
    expect(firstWave / N).toBeGreaterThan(0.33); // chance: 2 of 5 rooms = 0.4
    expect(firstWave / N).toBeLessThan(0.47);
    expect(bodyIsMurderRoom / N).toBeGreaterThan(0.14); // chance: 1 in 5
    expect(bodyIsMurderRoom / N).toBeLessThan(0.26);
    expect(bodies.size).toBe(5);
    for (const n of bodies.values()) expect(n).toBeGreaterThan(220); // ~300 each
  });

  test("players' own motives are used when they wrote them", () => {
    const rng = seeded(11);
    const input = fakeCast({ rng, guests: 5 });
    input.playerMotives = { p1: { motive: "He stole my parrot.", secret: "I am the parrot." } };
    const cf = buildCase(input, rng);
    const b = cf.briefings.find((x) => x.playerId === "p1")!;
    expect(b.motive).toBe("He stole my parrot.");
    expect(b.secret).toBe("I am the parrot.");
    const others = cf.briefings.filter((x) => x.playerId !== "p1");
    expect(new Set(others.map((x) => x.motive)).size).toBe(others.length); // game-written ones don't repeat
  });

  test("the adult script is used when the game menu picks it, and keeps every fact", () => {
    const rng = seeded(21);
    const input = fakeCast({ rng, guests: 8 });
    input.tone = "adult";
    const cf = buildCase(input, rng);
    const killer = cf.briefings.find((b) => b.role === "killer")!;
    expect(killer.lines[0]).toMatch(/^You did it\. You whacked Don Carmine Velluto/);
    const classic = buildCase({ ...input, tone: "classic" }, seeded(21));
    expect(classic.bodyRoomKey).toBeTruthy();
    expect(classic.briefings.find((b) => b.role === "killer")!.lines[0]).toMatch(/You killed Don Carmine Velluto/);
  });
});
