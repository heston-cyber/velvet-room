import { pick, shuffle } from "./rng";
import { CLASSIC, deckPicker, fill, mid, type Script } from "./text";
import { ADULT } from "./textAdult";
import type {
  Briefing,
  CaseFile,
  CaseInput,
  ClueKind,
  Elim,
  PlacedClue,
  Rng,
  Round,
  Solution,
  Suspect,
  Tip,
} from "./types";

const NONE: Elim = { suspects: [], exhibits: [], rooms: [] };

type Draft = {
  kind: ClueKind;
  text: string;
  elim: Elim;
  roomKey?: string; // room clears: lets a marker in that room carry it
  pointsAt?: string;
};

/** Fewer opt-ins than this and the draw uses everyone who checked in (Heston's rule). */
export const MIN_OPT_INS = 3;

/** Guests the draw may pick: those who opted in, or everyone if fewer than 3 did. */
export function eligibleKillers(input: CaseInput): Suspect[] {
  const ok = input.suspects.filter((s) => s.killerOk);
  return ok.length >= MIN_OPT_INS ? ok : input.suspects;
}

export function checkInput(input: CaseInput): string[] {
  const problems: string[] = [];
  if (input.suspects.length < 3) problems.push("At least 3 guests have to be checked in.");
  if (input.exhibits.length < 1) problems.push("At least one weapon has to be handed in.");
  if (input.rooms.length < 2) problems.push("Play with at least 2 rooms.");
  if (!input.rooms.some((r) => r.key === input.bodyRoomKey)) problems.push("The body room must be in play.");
  const roomKeys = new Set(input.rooms.map((r) => r.key));
  for (const m of input.markers) {
    if (!roomKeys.has(m.roomKey)) problems.push(`Marker ${m.number} is in a room that isn't in play.`);
  }
  return problems;
}

export function draw(input: CaseInput, rng: Rng): Solution {
  const problems = checkInput(input);
  if (problems.length) throw new Error(problems.join(" "));
  return {
    killerId: pick(rng, eligibleKillers(input)).id,
    exhibitId: pick(rng, input.exhibits).id,
    roomKey: pick(rng, input.rooms).key,
  };
}

/** Public clues released up to and including a round, and what's still possible after them. */
export function remainingAfter(input: CaseInput, clues: PlacedClue[], round: Round) {
  const out = { suspects: new Set<string>(), exhibits: new Set<string>(), rooms: new Set<string>() };
  input.suspects.forEach((s) => out.suspects.add(s.id));
  input.exhibits.forEach((e) => out.exhibits.add(e.id));
  input.rooms.forEach((r) => out.rooms.add(r.key));
  for (const c of clues) {
    if (c.round > round) continue;
    c.elim.suspects.forEach((id) => out.suspects.delete(id));
    c.elim.exhibits.forEach((id) => out.exhibits.delete(id));
    c.elim.rooms.forEach((k) => out.rooms.delete(k));
  }
  return out;
}

export type Validation = {
  ok: boolean;
  problems: string[];
  stages: { suspects: number; exhibits: number; rooms: number; combos: number }[];
};

export function validateCase(input: CaseInput, cf: CaseFile): Validation {
  const problems: string[] = [];
  const sol = cf.solution;
  const hitsSolution = (e: Elim) =>
    e.suspects.includes(sol.killerId) || e.exhibits.includes(sol.exhibitId) || e.rooms.includes(sol.roomKey);

  for (const c of cf.clues) if (hitsSolution(c.elim)) problems.push(`Clue ${c.id} rules out part of the answer.`);
  for (const t of cf.tips) if (hitsSolution(t.elim)) problems.push(`A tip rules out part of the answer.`);

  const stages = ([1, 2, 3] as Round[]).map((r) => {
    const rem = remainingAfter(input, cf.clues, r);
    return {
      suspects: rem.suspects.size,
      exhibits: rem.exhibits.size,
      rooms: rem.rooms.size,
      combos: rem.suspects.size * rem.exhibits.size * rem.rooms.size,
      rem,
    };
  });

  // Every wrong answer is ruled out by public clues, and exactly one answer is left.
  const fin = stages[2].rem;
  if (!(fin.suspects.size === 1 && fin.suspects.has(sol.killerId))) problems.push("Suspects don't narrow to the killer.");
  if (!(fin.exhibits.size === 1 && fin.exhibits.has(sol.exhibitId))) problems.push("Exhibits don't narrow to the weapon.");
  if (!(fin.rooms.size === 1 && fin.rooms.has(sol.roomKey))) problems.push("Rooms don't narrow to the murder room.");

  // Not too easy: after Round 1 several answers are still open in every category.
  const s1 = stages[0];
  if (s1.suspects < Math.min(3, input.suspects.length)) problems.push("Too few suspects left after Round 1.");
  if (s1.exhibits < Math.min(2, input.exhibits.length)) problems.push("Too few exhibits left after Round 1.");
  if (s1.rooms < Math.min(2, input.rooms.length)) problems.push("Too few rooms left after Round 1.");
  // Still unsolved going into Round 3.
  if (stages[1].combos < 2) problems.push("Solved before Round 3.");

  // Every marker carries exactly one clue, and only real markers are used.
  const markerNums = new Set(input.markers.map((m) => m.number));
  const used = new Map<number, number>();
  for (const c of cf.clues) {
    if (c.channel !== "marker") continue;
    if (c.round !== 1) problems.push(`Marker clue ${c.id} isn't in Round 1.`);
    if (c.markerNumber === undefined || !markerNums.has(c.markerNumber)) problems.push(`Clue ${c.id} is on a marker that doesn't exist.`);
    else used.set(c.markerNumber, (used.get(c.markerNumber) ?? 0) + 1);
  }
  for (const n of markerNums) if (used.get(n) !== 1) problems.push(`Marker ${n} doesn't have exactly one clue.`);

  // Tips: one per innocent, none for the killer, nothing the public clues won't also prove.
  const tipped = new Set(cf.tips.map((t) => t.playerId));
  if (tipped.has(sol.killerId)) problems.push("The killer got a tip.");
  const hasTipPool = cf.clues.some((c) => c.round > 1 && c.kind !== "twist" && c.kind !== "herring" && c.kind !== "flavor");
  if (hasTipPool) {
    for (const s of input.suspects) if (s.id !== sol.killerId && !tipped.has(s.id)) problems.push(`${s.name} has no tip.`);
  }

  // A herring must be cleared publicly no earlier than it appears.
  for (const c of cf.clues) {
    if (c.kind !== "herring" || !c.pointsAt) continue;
    const clear = cf.clues.find((x) => x.elim.suspects.includes(c.pointsAt!));
    if (!clear) problems.push("A herring points at someone who is never cleared.");
    else if (clear.round < c.round) problems.push("A herring appears after its target was already cleared.");
  }

  // Every guest has a briefing, and exactly one of them is the killer.
  if (cf.briefings.length !== input.suspects.length) problems.push("Not every guest has a briefing.");
  if (cf.briefings.filter((b) => b.role === "killer").length !== 1) problems.push("There isn't exactly one killer.");

  return {
    ok: problems.length === 0,
    problems,
    stages: stages.map(({ suspects, exhibits, rooms, combos }) => ({ suspects, exhibits, rooms, combos })),
  };
}

export function scriptFor(input: CaseInput): Script {
  return input.tone === "adult" ? ADULT : CLASSIC;
}

function writeMotives(input: CaseInput, rng: Rng, S: Script): Map<string, { motive: string; secret: string }> {
  const motives = shuffle(rng, S.motives);
  const secrets = shuffle(rng, S.secrets);
  const out = new Map<string, { motive: string; secret: string }>();
  input.suspects.forEach((s, i) => {
    const own = input.playerMotives?.[s.id];
    out.set(s.id, {
      motive: own?.motive?.trim() || fill(motives[i % motives.length], s.signature),
      secret: own?.secret?.trim() || fill(secrets[i % secrets.length], s.signature),
    });
  });
  return out;
}

function tryBuild(input: CaseInput, rng: Rng, sol: Solution): CaseFile {
  const S = scriptFor(input);
  const say = deckPicker(rng);
  const name = new Map(input.suspects.map((s) => [s.id, s.name]));
  const innocents = input.suspects.filter((s) => s.id !== sol.killerId);
  const wrongExhibits = input.exhibits.filter((e) => e.id !== sol.exhibitId);
  const otherRooms = input.rooms.filter((r) => r.key !== sol.roomKey);
  const body = input.rooms.find((r) => r.key === input.bodyRoomKey)!;

  // 1. Turn every wrong answer into clues, sometimes two to a clue.
  const suspectDrafts: Draft[] = [];
  const sus = shuffle(rng, innocents);
  for (let i = 0; i < sus.length; ) {
    if (i + 1 < sus.length && rng() < 0.35) {
      const [a, b] = [sus[i], sus[i + 1]];
      suspectDrafts.push({ kind: "suspectPair", text: S.suspectPairClear(say, a.name, b.name), elim: { ...NONE, suspects: [a.id, b.id] } });
      i += 2;
    } else {
      suspectDrafts.push({ kind: "suspect", text: S.suspectClear(say, sus[i].name), elim: { ...NONE, suspects: [sus[i].id] } });
      i += 1;
    }
  }
  const exhibitDrafts: Draft[] = [];
  const exs = shuffle(rng, wrongExhibits);
  for (let i = 0; i < exs.length; ) {
    if (i + 1 < exs.length && rng() < 0.35) {
      const [a, b] = [exs[i], exs[i + 1]];
      exhibitDrafts.push({ kind: "exhibitPair", text: S.exhibitPairClear(say, a.letter, b.letter), elim: { ...NONE, exhibits: [a.id, b.id] } });
      i += 2;
    } else {
      exhibitDrafts.push({ kind: "exhibit", text: S.exhibitClear(say, exs[i].letter, exs[i].name), elim: { ...NONE, exhibits: [exs[i].id] } });
      i += 1;
    }
  }

  // 2. Rooms. The twist always carries the last word on the room.
  let twist: Draft;
  let roomTargets = otherRooms;
  if (sol.roomKey !== body.key) {
    twist = { kind: "twist", text: S.twistMoved(body.label), elim: { ...NONE, rooms: [body.key] } };
    roomTargets = otherRooms.filter((r) => r.key !== body.key);
  } else {
    const held = pick(rng, otherRooms);
    twist = { kind: "twist", text: S.twistStayed(body.label), elim: { ...NONE, rooms: otherRooms.map((r) => r.key) } };
    roomTargets = otherRooms.filter((r) => r.key !== held.key);
  }
  const roomDrafts: Draft[] = shuffle(rng, roomTargets).map((r) => ({
    kind: "room",
    text: S.roomClear(say, r.label),
    elim: { ...NONE, rooms: [r.key] },
    roomKey: r.key,
  }));

  // 3. Spread across rounds: Round 3 holds the twist plus a suspect, Round 2 about a third.
  const sQ = shuffle(rng, suspectDrafts);
  const eQ = shuffle(rng, exhibitDrafts);
  const rQ = shuffle(rng, roomDrafts);
  const r3: Draft[] = [];
  if (sQ.length) r3.push(sQ.pop()!);
  if (eQ.length && rng() < 0.7) r3.push(eQ.pop()!);
  const take = (arr: Draft[], frac: number, min: number) =>
    arr.splice(0, Math.min(arr.length, Math.max(min, Math.round(arr.length * frac))));
  const r2: Draft[] = [...take(sQ, 0.35, 1), ...take(eQ, 0.35, 1), ...take(rQ, 0.3, 0)];
  let r1: Draft[] = shuffle(rng, [...sQ, ...eQ, ...rQ]);

  // 4. Markers carry Round 1. Room clears go on a marker in that same room when one is free.
  const placed: PlacedClue[] = [];
  let n = 0;
  const id = () => `c${++n}`;
  const freeMarkers = shuffle(rng, input.markers);
  const takeMarker = (roomKey?: string) => {
    const idx = roomKey ? freeMarkers.findIndex((m) => m.roomKey === roomKey) : 0;
    if (idx < 0 || !freeMarkers.length) return undefined;
    return freeMarkers.splice(idx, 1)[0];
  };
  const overflow: Draft[] = [];
  for (const d of r1.filter((d) => d.kind === "room")) {
    const m = takeMarker(d.roomKey);
    if (m) {
      placed.push({ id: id(), kind: d.kind, text: S.roomClearHere(input.rooms.find((r) => r.key === d.roomKey)!.label), elim: d.elim, round: 1, channel: "marker", markerNumber: m.number });
    } else overflow.push(d);
  }
  for (const d of [...r1.filter((d) => d.kind !== "room"), ...overflow]) {
    const m = takeMarker();
    if (m) placed.push({ id: id(), kind: d.kind, text: d.text, elim: d.elim, round: 1, channel: "marker", markerNumber: m.number });
    else r2.push(d); // more Round 1 clues than markers: they move to the first TV drop
  }
  r1 = [];

  for (const d of shuffle(rng, r2)) placed.push({ id: id(), kind: d.kind, text: d.text, elim: d.elim, round: 2, channel: "tv" });
  for (const d of r3) placed.push({ id: id(), kind: d.kind, text: d.text, elim: d.elim, round: 3, channel: "tv" });

  // 5. A red herring at an innocent who gets cleared later, then flavor on any spare markers.
  const laterCleared = innocents.filter((s) => placed.some((c) => c.round > 1 && c.elim.suspects.includes(s.id)));
  if (laterCleared.length) {
    const h = pick(rng, laterCleared);
    const clearRound = placed.find((c) => c.elim.suspects.includes(h.id))!.round;
    const m = takeMarker();
    if (m) {
      placed.push({ id: id(), kind: "herring", text: S.herring(say, h.signature), elim: NONE, round: 1, channel: "marker", markerNumber: m.number, pointsAt: h.id });
    } else if (clearRound === 3) {
      placed.push({ id: id(), kind: "herring", text: S.herring(say, h.signature), elim: NONE, round: 2, channel: "tv", pointsAt: h.id });
    }
  }
  const flavor = shuffle(rng, S.flavor);
  let f = 0;
  while (freeMarkers.length) {
    const m = freeMarkers.shift()!;
    placed.push({ id: id(), kind: "flavor", text: flavor[f++ % flavor.length], elim: NONE, round: 1, channel: "marker", markerNumber: m.number });
  }
  // The twist reads last on the final drop.
  placed.push({ id: id(), kind: "twist", text: twist.text, elim: twist.elim, round: 3, channel: "tv" });

  // 6. Private tips: early access to something the TV will confirm later.
  const pool = placed.filter((c) => c.round > 1 && (c.kind === "suspect" || c.kind === "suspectPair" || c.kind === "exhibit" || c.kind === "exhibitPair" || c.kind === "room"));
  const tips: Tip[] = [];
  if (pool.length) {
    const order = shuffle(rng, pool);
    let k = 0;
    for (const s of shuffle(rng, innocents)) {
      let choice = order[k % order.length];
      for (let tries = 0; tries < order.length && choice.elim.suspects.includes(s.id); tries++) {
        k++;
        choice = order[k % order.length];
      }
      k++;
      tips.push({ playerId: s.id, clueId: choice.id, text: choice.text, elim: choice.elim });
    }
  }

  // 7. Briefings for every phone.
  const motives = writeMotives(input, rng, S);
  const ex = input.exhibits.find((e) => e.id === sol.exhibitId)!;
  const room = input.rooms.find((r) => r.key === sol.roomKey)!;
  const herringClue = placed.find((c) => c.kind === "herring");
  const briefings: Briefing[] = input.suspects.map((s) => {
    const m = motives.get(s.id)!;
    if (s.id === sol.killerId) {
      const lines = S.killerLines({
        letter: ex.letter,
        weapon: ex.name,
        room: room.label,
        ownWeapon: ex.ownerId === s.id,
        herringName: herringClue?.pointsAt ? name.get(herringClue.pointsAt) : undefined,
      });
      return { playerId: s.id, role: "killer", motive: m.motive, secret: m.secret, lines };
    }
    return { playerId: s.id, role: "innocent", motive: m.motive, secret: m.secret, lines: S.innocentLines };
  });

  return { solution: sol, clues: placed, tips, briefings, attempts: 1 };
}

/** Draws the answer (unless given) and builds a case that passes every solvability rule. */
export function buildCase(input: CaseInput, rng: Rng, solution?: Solution): CaseFile & { validation: Validation } {
  const sol = solution ?? draw(input, rng);
  let last: Validation | null = null;
  for (let attempt = 1; attempt <= 200; attempt++) {
    const cf = tryBuild(input, rng, sol);
    const v = validateCase(input, cf);
    if (v.ok) return { ...cf, attempts: attempt, validation: v };
    last = v;
  }
  throw new Error(`Couldn't build a solvable case: ${last?.problems.join(" ")}`);
}
