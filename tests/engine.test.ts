import { describe, expect, test } from "vitest";
import { buildCase, draw, eligibleKillers } from "../convex/engine/build";
import { fakeCast, ROOMS_5, ROOMS_6 } from "../convex/engine/fake";
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
function textMatchesLogic(input: CaseInput, c: PlacedClue): string | null {
  for (const id of c.elim.suspects) {
    const n = input.suspects.find((s) => s.id === id)!.name;
    if (c.kind !== "twist" && !c.text.includes(n)) return `${c.id} doesn't name ${n}`;
  }
  for (const id of c.elim.exhibits) {
    const L = input.exhibits.find((x) => x.id === id)!.letter;
    if (!new RegExp(`Exhibits? [^.]*\\b${L}\\b`).test(c.text)) return `${c.id} doesn't name Exhibit ${L}`;
  }
  if (c.kind === "room") {
    const label = input.rooms.find((r) => r.key === c.elim.rooms[0])!.label;
    if (!c.text.includes(label) && !c.text.includes(mid(label))) return `${c.id} doesn't name ${label}`;
  }
  if (c.kind === "twist") {
    const body = input.rooms.find((r) => r.key === input.bodyRoomKey)!.label;
    if (!c.text.includes(mid(body))) return `${c.id} twist doesn't name the body room`;
  }
  return null;
}

type Config = { guests: number; rooms: typeof ROOMS_5; markers: number; optIn: number; tone: "classic" | "adult" };
const configs: Config[] = [];
for (const tone of ["classic", "adult"] as const) {
  for (const guests of [4, 5, 6, 8, 9, 10, 12]) {
    for (const rooms of [ROOMS_5, ROOMS_6]) {
      for (const markers of [0, 5, 10, 15, 20]) {
        configs.push({ guests, rooms, markers, optIn: 0.8, tone });
      }
    }
  }
}

describe("the engine", () => {
  test("2,100 simulated games (both scripts) are all solvable, fair and consistent", () => {
    let games = 0;
    const failures: string[] = [];
    const attempts: number[] = [];
    for (const cfg of configs) {
      for (let seed = 1; seed <= 15; seed++) {
        const rng = seeded(seed * 7919 + cfg.guests * 31 + cfg.markers);
        const input = fakeCast({ rng, guests: cfg.guests, rooms: cfg.rooms, markers: cfg.markers, optInRate: cfg.optIn });
        input.tone = cfg.tone;
        let cf: CaseFile;
        try {
          cf = buildCase(input, rng);
        } catch (err) {
          failures.push(`${JSON.stringify({ ...cfg, rooms: cfg.rooms.length, seed })}: ${(err as Error).message}`);
          continue;
        }
        games++;
        attempts.push(cf.attempts);
        const tag = `${cfg.tone}/${cfg.guests}g/${cfg.rooms.length}r/${cfg.markers}m/seed${seed}`;
        const sol = cf.solution;

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
        for (const e of input.exhibits) if (e.id !== sol.exhibitId && !ruledOut.has(e.id)) failures.push(`${tag}: Exhibit ${e.letter} never cleared`);
        for (const r of input.rooms) if (r.key !== sol.roomKey && !ruledOut.has(r.key)) failures.push(`${tag}: ${r.label} never cleared`);

        // words match logic
        for (const c of cf.clues) {
          const bad = textMatchesLogic(input, c);
          if (bad) failures.push(`${tag}: ${bad}`);
        }
        // tips: innocents only, and they never contradict the answer
        for (const t of cf.tips) {
          if (t.playerId === sol.killerId) failures.push(`${tag}: killer got a tip`);
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
        if (!kb[0]?.lines[0].includes(`Exhibit ${ex.letter}`) || !kb[0]?.lines[0].includes(mid(room.label))) failures.push(`${tag}: killer briefing has the wrong details`);
        // no innocent briefing mentions the answer
        for (const b of cf.briefings.filter((b) => b.role === "innocent")) {
          if (b.lines.join(" ").includes(`Exhibit ${ex.letter}`)) failures.push(`${tag}: innocent briefing leaks the weapon`);
        }
      }
    }
    expect(failures.slice(0, 20)).toEqual([]);
    expect(games).toBe(2100);
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
    one.bodyRoomKey = one.rooms[0].key;
    one.markers = [];
    expect(() => draw(one, rng)).toThrow(/2 rooms/);
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
    expect(classic.briefings.find((b) => b.role === "killer")!.lines[0]).toMatch(/You killed Don Carmine Velluto/);
  });
});
