import { describe, expect, test } from "vitest";
import { buildCase, draw, eligibleKillers, openEnding, openRound, openRoomsIn, waveSizes, worldProblems } from "../convex/engine/build";
import { setupFor } from "../convex/engine/setup";
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

// Oct 18 (Heston: "make sure everything lines up properly and makes sense without any contradictions"): an independent
// read of the words. Where does an alibi or a weapon clear say people were, and what does each room clear say about its
// room? Worked out from the text, not from the engine's own tags.
const SAYS: [RegExp, RegExp][] = [
  // words in a clue → words in a room's name
  [/\bbar\b(?! tab)|bartender/i, /\bbar\b/i],
  [/coat-check|coat check|hall telephone/i, /coat|cloak|foyer|entry|front|hall/i],
  [/piano|bandleader|dance floor|bandstand|the band\b|Charleston/i, /lounge|ballroom|dance|music/i],
  [/\bat cards\b|craps|card sharps/i, /\bcards?\b|gaming|casino|poker/i],
  [/kitchen|\bcook\b|dishwasher/i, /kitchen/i],
  [/powder room|\bthe can\b/i, /bath|powder|wash|restroom/i],
];
function contradictions(input: CaseInput, cf: CaseFile): string[] {
  const out: string[] = [];
  const sealed = new Set<string>();
  const crowded = new Map<string, number>();
  for (const c of cf.clues.filter((x) => x.kind === "room")) {
    const r = c.elim.rooms[0];
    if (/locked|dust|ribbon|set foot/i.test(c.text)) sealed.add(r);
    else if (/witnesses|card game|toast/i.test(c.text)) crowded.set(r, Math.min(crowded.get(r) ?? 9, c.round));
    else out.push(`${c.id}: a room clear that says neither who was there nor that it was shut`);
  }
  for (const c of cf.clues.filter((x) => ["suspect", "suspectPair", "suspectTrio", "exhibit", "exhibitPair"].includes(x.kind))) {
    for (const [said, named] of SAYS) {
      if (!said.test(c.text)) continue;
      for (const r of input.rooms.filter((x) => named.test(x.label))) {
        if (r.key === cf.solution.roomKey) out.push(`${c.id} puts people in the room the Don died in (${r.label}): ${c.text}`);
        else if (r.key === cf.bodyRoomKey) out.push(`${c.id} puts people in the room the body turned up in (${r.label}): ${c.text}`);
        else if (sealed.has(r.key)) out.push(`${c.id} puts people in ${r.label}, which another clue says was shut: ${c.text}`);
        else if ((crowded.get(r.key) ?? 9) > c.round) out.push(`${c.id} puts people in ${r.label} before the evidence clears it: ${c.text}`);
      }
    }
  }
  // Nothing says where it was found, or that it was by the body.
  for (const c of cf.clues) if (c.kind !== "witness" && /(next to|near|by|beside) the body|in here|this room/i.test(c.text)) out.push(`${c.id} says where it was found: ${c.text}`);
  return out;
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

        // independent solve (v4, Oct 16: the evidence leaves a planned few standing, the answer among them; Heston: "it
        // should not narrow down to exactly the answer ... still be ambiguous, but close")
        const fin = candidates(input, cf.clues, 3);
        const open = cf.open!;
        if (!(fin.s.length === open.suspects && fin.s.includes(sol.killerId) && fin.e.length === open.exhibits && fin.e.includes(sol.exhibitId) && fin.r.length === open.rooms && fin.r.includes(sol.roomKey))) {
          failures.push(`${tag}: public clues don't leave the planned few standing (${fin.s.length}/${fin.e.length}/${fin.r.length} vs ${JSON.stringify(open)})`);
        }
        if (input.suspects.length >= 3 && open.suspects < 2 && cf.attempts < 80) failures.push(`${tag}: the evidence names the killer outright`);
        if (open.exhibits > 2 || open.rooms > 2) failures.push(`${tag}: weapon or room left wide open`);
        if (candidates(input, cf.clues, 2).combos < 2) failures.push(`${tag}: solved before Round 3`);
        const r1 = candidates(input, cf.clues, 1);
        if (r1.s.length < Math.min(3, input.suspects.length)) failures.push(`${tag}: too easy after Round 1`);

        // every wrong suspect, exhibit and room is ruled out by at least one clue, except the planned few left standing
        const ruledOut = new Set(cf.clues.flatMap((c) => [...c.elim.suspects, ...c.elim.exhibits, ...c.elim.rooms]));
        const never = (list: string[]) => list.filter((id) => !ruledOut.has(id)).length;
        if (never(input.suspects.map((s) => s.id)) !== open.suspects) failures.push(`${tag}: suspects never cleared don't match the plan`);
        if (never(input.exhibits.map((e) => e.id)) !== open.exhibits) failures.push(`${tag}: weapons never cleared don't match the plan`);
        if (never(input.rooms.map((r) => r.key)) !== open.rooms) failures.push(`${tag}: rooms never cleared don't match the plan`);
        // a red herring always points at someone the evidence clears later
        for (const h of cf.clues.filter((c) => c.kind === "herring")) if (!ruledOut.has(h.pointsAt!)) failures.push(`${tag}: a herring points at someone left standing`);

        // words match logic
        for (const c of cf.clues) {
          const bad = textMatchesLogic(input, c, cf.bodyRoomKey);
          if (bad) failures.push(`${tag}: ${bad}`);
        }
        // Oct 18: no tips, no secrets, and nothing contradicts anything (the engine's check and an independent one)
        if (cf.tips.length) failures.push(`${tag}: tips`);
        if (cf.briefings.some((b) => b.secret)) failures.push(`${tag}: secrets`);
        for (const p of worldProblems(input, cf)) failures.push(`${tag}: ${p}`);
        for (const p of contradictions(input, cf)) failures.push(`${tag}: ${p}`);
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

  test("opt-outs are never drawn, unless everyone opted out (Oct 17)", () => {
    const rng = seeded(7);
    const input = fakeCast({ rng, guests: 6 });
    input.suspects.forEach((s) => (s.killerOk = false));
    expect(eligibleKillers(input)).toHaveLength(6);
    input.suspects[0].killerOk = true;
    expect(eligibleKillers(input).map((s) => s.id)).toEqual(["p1"]);
    input.suspects[1].killerOk = true;
    expect(eligibleKillers(input).map((s) => s.id)).toEqual(["p1", "p2"]);
    input.suspects.forEach((s) => (s.killerOk = true));
    input.suspects[3].killerOk = false;
    expect(eligibleKillers(input)).toHaveLength(5);
    for (let i = 0; i < 300; i++) expect(draw(input, rng).killerId).not.toBe("p4");
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

  test("Oct 20: no motives and no motive-leak cards (Heston: \"Motives: cut them\")", () => {
    const rng = seeded(11);
    for (let i = 0; i < 30; i++) {
      const input = fakeCast({ rng, guests: 8 });
      const cf = buildCase(input, rng);
      for (const b of cf.briefings) {
        expect(b.motive).toBe("");
        expect(b.motiveThey).toBeUndefined();
        expect(b.secret).toBeUndefined();
      }
      for (const c of cf.clues) expect(c.text).not.toMatch(/\bmotive\b|\bIOU\b|\bledger\b|appointment book|pawn ticket/i);
    }
  });

  test("the adult script is used when the game menu picks it, and keeps every fact", () => {
    const rng = seeded(21);
    const input = fakeCast({ rng, guests: 8 });
    input.tone = "adult";
    const cf = buildCase(input, rng);
    const killer = cf.briefings.find((b) => b.role === "killer")!;
    expect(killer.lines[0]).toMatch(/^You did it\. You whacked Don Ray Sanders/);
    const classic = buildCase({ ...input, tone: "classic" }, seeded(21));
    expect(classic.bodyRoomKey).toBeTruthy();
    expect(classic.briefings.find((b) => b.role === "killer")!.lines[0]).toMatch(/You killed Don Ray Sanders/);
  });

  // v3 evidence (Heston, Oct 16: "Too easy, to many markers all but eliminate all other candidates"; he chose "Fully
  // solvable, fewer clues"). Measured as a table that finds every marker from the start (Oct 18: no tips any more).
  test("v3: harder, with fewer and bigger clues: still open after Round 1, narrowed after Round 2, solved only in Round 3", () => {
    const open = (input: CaseInput, cf: CaseFile, round: number) => {
      const s = new Set(input.suspects.map((x) => x.id));
      const e = new Set(input.exhibits.map((x) => x.id));
      for (const el of [...cf.clues.filter((c) => c.round <= round).map((c) => c.elim), ...cf.tips.map((t) => t.elim)]) {
        el.suspects.forEach((id) => s.delete(id));
        el.exhibits.forEach((id) => e.delete(id));
      }
      return { s: s.size, e: e.size };
    };
    let games = 0, witness = 0, coroner = 0, clues = 0, wrong = 0, r1s = 0, r2s = 0;
    for (const guests of [8, 10, 12]) {
      for (let seed = 1; seed <= 100; seed++) {
        const rng = seeded(seed * 131 + guests);
        const input = { ...fakeCast({ rng, guests, rooms: ROOMS_6, markers: 15 }), search: "waves" as const };
        const cf = buildCase(input, rng);
        games++;
        if (cf.clues.some((c) => c.kind === "witness")) witness++;
        if (cf.clues.some((c) => c.kind === "coroner")) coroner++;
        // (Phase 3: story cards and the stash rule nothing out, so they don't count.)
        clues += cf.clues.filter((c) => !["flavor", "herring", "story", "stash"].includes(c.kind)).length;
        wrong += input.suspects.length - 1 + input.exhibits.length - 1 + input.rooms.length - 1;
        const a = open(input, cf, 1);
        const b = open(input, cf, 2);
        r1s += a.s / guests;
        r2s += b.s / guests;
        expect(a.s).toBeGreaterThanOrEqual(Math.ceil(guests * 0.55));
        expect(a.e).toBeGreaterThanOrEqual(Math.ceil(input.exhibits.length * 0.55));
        expect(b.s).toBeGreaterThanOrEqual(3);
        expect(cf.tips).toEqual([]);
        // the big clues are on the TV in Rounds 2 and 3, never on a marker
        for (const c of cf.clues.filter((c) => c.kind === "witness" || c.kind === "coroner")) {
          expect(c.channel).toBe("tv");
          expect(c.round).toBeGreaterThanOrEqual(2);
        }
      }
    }
    expect(witness / games).toBeGreaterThan(0.6); // whenever both sexes are in it
    expect(coroner / games).toBeGreaterThan(0.6);
    expect(clues / wrong).toBeLessThan(0.75); // the old evidence had about one clue per wrong answer
    expect(r1s / games).toBeGreaterThan(0.65); // about three quarters of the suspects still open after Round 1
    expect(r2s / games).toBeLessThan(0.6); // well under two thirds after Round 2 (v4: a few stand to the end)
  });

  test("v3: the witness and the coroner name everything they clear, and never the answer", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rng = seeded(seed);
      const input = fakeCast({ rng, guests: 10, rooms: ROOMS_5, markers: 12 });
      input.tone = seed % 2 ? "adult" : "classic";
      const cf = buildCase(input, rng);
      const killer = input.suspects.find((s) => s.id === cf.solution.killerId)!;
      const weapon = input.exhibits.find((e) => e.id === cf.solution.exhibitId)!;
      for (const c of cf.clues.filter((c) => c.kind === "witness")) {
        expect(c.elim.suspects.length).toBeGreaterThanOrEqual(2);
        for (const id of c.elim.suspects) expect(input.suspects.find((s) => s.id === id)!.sex).not.toBe(killer.sex);
        expect(c.text).toMatch(killer.sex === "m" ? /\bman\b/ : /\bwoman\b/);
      }
      for (const c of cf.clues.filter((c) => c.kind === "coroner")) {
        expect(c.elim.exhibits).not.toContain(weapon.id);
        expect(c.text).toMatch(/^The coroner's report/);
      }
    }
  });

  // Oct 16, from Heston's test game: the coroner ruled out every heavy weapon in Round 2, then Round 3 "found" the
  // hammer was never touched. "need to make sure that the "new evidence" is actually new".
  test("new evidence is new: no alibi or weapon clear repeats what an earlier clue (or one the same round) already cleared", () => {
    const keys = (c: PlacedClue) => [...c.elim.suspects, ...c.elim.exhibits, ...c.elim.rooms];
    const small = new Set(["suspect", "suspectPair", "suspectTrio", "exhibit", "exhibitPair", "room"]);
    let covers = 0;
    for (const search of ["all", "waves"] as const)
      for (const guests of [4, 6, 8, 10, 12, 15])
        for (let seed = 1; seed <= 60; seed++) {
          const rng = seeded(seed * 7919 + guests);
          const input: CaseInput = { ...fakeCast({ rng, guests, rooms: roomsN(guests <= 6 ? 4 : guests <= 12 ? 5 : 6), markers: guests + 2 }), search, tone: seed % 2 ? "adult" : "classic" };
          const cf = buildCase(input, rng);
          for (const c of cf.clues) {
            const mine = keys(c);
            if (!mine.length) continue;
            const before = cf.clues.filter((x) => x !== c && x.round <= c.round);
            if (small.has(c.kind)) {
              for (const x of before) expect(keys(x).filter((k) => mine.includes(k)), `${c.text} / ${x.text}`).toEqual([]);
            } else {
              const known = new Set(before.filter((x) => x.round < c.round || small.has(x.kind)).flatMap(keys));
              expect(mine.some((k) => !known.has(k)), c.text).toBe(true);
            }
          }
          // The witness and the coroner may repeat a few cleared before them (cover, so the early alibis don't give
          // the killer's sex or the weapon's kind away); those come out in an earlier round, never after.
          for (const big of cf.clues.filter((c) => c.kind === "witness" || c.kind === "coroner")) {
            const early = cf.clues.filter((x) => x !== big && keys(x).some((k) => keys(big).includes(k)));
            covers += early.length;
            for (const x of early) expect(x.round).toBeLessThan(big.round);
          }
          // When the twist says he died where he was found, it settles every room: no room clear comes out with it.
          const twist = cf.clues.find((c) => c.kind === "twist")!;
          if (twist.elim.rooms.length > 1) expect(cf.clues.filter((c) => c.kind === "room" && c.round === 3)).toEqual([]);
        }
    expect(covers).toBeGreaterThan(100); // the cover alibis and clears still happen
  });

  // Oct 16, Heston: "we need to make sure all the evidence makes sense, lines up and doesn't clear things that are not
  // supposed to be cleared ... evidence that say there was no blood at the site of the death (indicating poison, but he
  // was killed with a flare gun". Clues never reason from blood, wounds, a lab or a struggle (that hints at, or
  // contradicts, how he died); a gun is "shot", not "a bullet" (a flare gun has none); only guns are cleared as "not fired".
  test("the wording never contradicts the real murder", () => {
    const BANNED = /\b(blood|bleed\w*|bruises?|bullet|lab|spotless|struggle|thud)\b|wounds? don't match|is clean|came back .*clean/i;
    const kinds = { "Flare Gun": "gun", Poison: "other", Rope: "cord", Hammer: "blunt", Knife: "blade", "Water Bucket": "other", Revolver: "gun", Gloves: "cord" } as const;
    for (const [weapon, kind] of Object.entries(kinds))
      for (let seed = 1; seed <= 40; seed++) {
        const rng = seeded(seed * 31 + weapon.length);
        const input: CaseInput = { ...fakeCast({ rng, guests: 10, rooms: ROOMS_5, markers: 12 }), tone: seed % 2 ? "adult" : "classic" };
        input.exhibits[0] = { ...input.exhibits[0], name: weapon, kind };
        const cf = buildCase(input, rng, { killerId: input.suspects[1].id, exhibitId: input.exhibits[0].id, roomKey: ROOMS_5[seed % 5].key });
        for (const c of cf.clues) {
          expect(c.text).not.toMatch(BANNED);
          if (c.kind === "exhibit" && /fired|loaded|powder/.test(c.text)) expect(input.exhibits.find((e) => e.id === c.elim.exhibits[0])!.kind, c.text).toBe("gun");
          if (c.kind === "coroner" && kind === "gun" && c.elim.exhibits.length === input.exhibits.filter((e) => e.kind !== "gun").length) expect(c.text).toMatch(/\bshot\b/);
        }
      }
  });

  // v4 (Oct 16): "narrows down the room and weapons but leaves the person more unknown". Phase 3 (Oct 20, Heston: "yes
  // still 3 suspects"): the evidence leaves exactly 3 standing (2 in games of 3 or 4), and the stories decide between them.
  test("Phase 3: the evidence leaves exactly 3 suspects standing (2 in games of 3 or 4), usually one weapon and one room", () => {
    const stats = new Map<number, { w: number[]; r: number[] }>();
    for (const guests of [3, 4, 6, 8, 10, 12, 15]) {
      const st = { w: [] as number[], r: [] as number[] };
      for (let seed = 1; seed <= 80; seed++) {
        const rng = seeded(seed * 613 + guests);
        const setup = setupFor(guests);
        const input: CaseInput = { ...fakeCast({ rng, guests, rooms: roomsN(setup.rooms), markers: setup.markers, weaponsHandedIn: Math.min(guests, setup.weapons!) }), search: seed % 2 ? "waves" : "all" };
        const cf = buildCase(input, rng);
        const fin = candidates(input, cf.clues, 3);
        expect(fin.s).toContain(cf.solution.killerId);
        expect(fin.s.length).toBe(guests <= 4 ? 2 : 3);
        expect(fin.e.length).toBeLessThanOrEqual(2);
        expect(fin.r.length).toBeLessThanOrEqual(2);
        st.w.push(fin.e.length);
        st.r.push(fin.r.length);
      }
      stats.set(guests, st);
    }
    for (const [, st] of stats) {
      // weapon and room: usually pinned
      expect(st.w.filter((x) => x === 1).length / st.w.length).toBeGreaterThan(0.65);
      expect(st.r.filter((x) => x === 1).length / st.r.length).toBeGreaterThan(0.7);
    }
    // bigger setups sometimes leave a second weapon or room
    expect(Math.max(...stats.get(12)!.w, ...stats.get(15)!.w)).toBe(2);
  });

  test("Phase 3: openEnding is 3 suspects (2 in games of 3 or 4) and one or two weapons and rooms", () => {
    for (const guests of [3, 4, 5, 8, 12, 20, 24]) {
      for (let seed = 1; seed <= 200; seed++) {
        const rng = seeded(seed + guests * 1000);
        const input = { ...fakeCast({ rng, guests: Math.min(guests, 15), rooms: ROOMS_6, markers: 10 }), suspects: Array.from({ length: guests }, (_, i) => ({ id: `p${i}`, name: `P${i}`, signature: "", who: "", killerOk: true })) };
        const o = openEnding(input, rng);
        expect(o.suspects).toBe(guests <= 4 ? 2 : 3);
        expect([1, 2]).toContain(o.exhibits);
        expect([1, 2]).toContain(o.rooms);
      }
    }
  });
});
