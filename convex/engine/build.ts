import { pick, shuffle } from "./rng";
import { CLASSIC, deckPicker, fill, mid, type Script } from "./text";
import { ADULT } from "./textAdult";
import { hasJailVote } from "../shared";
import type {
  Briefing,
  CaseFile,
  CaseInput,
  ClueKind,
  Elim,
  Open,
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
  /** The last round this clue may come out in (a cover clear, before the big clue that would make it old news). */
  by?: Round;
};


/** A killer and an accomplice need at least this many guests (Heston's rule, v2). */
export const MIN_ACCOMPLICE = 7;

/**
 * Off (Heston, Oct 16: "lets toggle off the accomplice for now, strike that role from everything. that role is gone").
 * No new game draws an accomplice, whatever its saved setting, and the host menu no longer offers one. The engine code
 * stays, so the role can come back by turning this on.
 */
export const ACCOMPLICE_ON = false;

/**
 * Guests the draw may pick (Oct 17, D8: "an 'opt out' of being the killer for people who just don't want to play that
 * role. Everyone is opted in by default."): everyone who didn't opt out. Only if everyone opted out is everyone in the
 * draw. With an accomplice, everyone (the opt-out is ignored in that mode).
 */
export function eligibleKillers(input: CaseInput): Suspect[] {
  if (input.accomplice) return input.suspects;
  const ok = input.suspects.filter((s) => s.killerOk);
  return ok.length ? ok : input.suspects;
}

export const MIN_ROOMS = 2;
export const MAX_ROOMS = 8;

export function checkInput(input: CaseInput): string[] {
  const problems: string[] = [];
  if (input.suspects.length < 3) problems.push("At least 3 guests have to be checked in.");
  else if (input.accomplice && input.suspects.length < MIN_ACCOMPLICE) problems.push(`A killer and an accomplice need at least ${MIN_ACCOMPLICE} guests.`);
  if (input.exhibits.length < 1) problems.push("At least one weapon has to be handed in.");
  if (input.rooms.length < MIN_ROOMS) problems.push("Play with at least 2 rooms.");
  if (input.rooms.length > MAX_ROOMS) problems.push(`Play with at most ${MAX_ROOMS} rooms.`);
  if (input.bodyRoomKey !== undefined && !input.rooms.some((r) => r.key === input.bodyRoomKey)) problems.push("The body room must be in play.");
  const roomKeys = new Set(input.rooms.map((r) => r.key));
  for (const m of input.markers) {
    if (!m.roomKey) problems.push(`Marker ${m.number} needs a room.`);
    else if (!roomKeys.has(m.roomKey)) problems.push(`Marker ${m.number} is in a room that isn't in play.`);
  }
  return problems;
}

export function draw(input: CaseInput, rng: Rng): Solution {
  const problems = checkInput(input);
  if (problems.length) throw new Error(problems.join(" "));
  const sol: Solution = {
    killerId: pick(rng, eligibleKillers(input)).id,
    exhibitId: pick(rng, input.exhibits).id,
    roomKey: pick(rng, input.rooms).key,
  };
  return withAccomplice(input, rng, sol);
}

/** In a killer + accomplice game, draws the accomplice from everyone but the killer (unless the solution has one). */
export function withAccomplice(input: CaseInput, rng: Rng, sol: Solution): Solution {
  if (!input.accomplice || sol.accompliceId) return sol;
  return { ...sol, accompliceId: pick(rng, input.suspects.filter((s) => s.id !== sol.killerId)).id };
}

// ---------- searching in waves ----------

/** How many rooms are open in Rounds 1, 2 and 3: about 40%, then 75%, then all. Opened rooms stay open. */
export function waveSizes(n: number): [number, number, number] {
  const w1 = Math.max(1, Math.ceil(n * 0.4));
  const w2 = Math.max(w1, Math.ceil(n * 0.75));
  return [w1, w2, n];
}

/** The round a room opens for searching. With every room open, that's Round 1. */
export function openRound(roomKey: string, order: string[], search: CaseInput["search"]): Round {
  if (search !== "waves") return 1;
  const i = order.indexOf(roomKey);
  if (i < 0) return 1;
  const [w1, w2] = waveSizes(order.length);
  return i < w1 ? 1 : i < w2 ? 2 : 3;
}

/** Room keys open for searching in a round (accusations and later: all of them). */
export function openRoomsIn(round: number, order: string[], search: CaseInput["search"]): string[] {
  if (search !== "waves" || round >= 3) return order;
  return order.slice(0, waveSizes(order.length)[Math.max(1, round) - 1]);
}

/**
 * Drawn at Start, independent of the answer: where the body turns up, and the order rooms open in.
 * The body's room always opens first, since that's where everyone runs.
 */
export function drawScene(input: CaseInput, rng: Rng): { bodyRoomKey: string; roomOrder: string[] } {
  const body = input.bodyRoomKey ?? pick(rng, input.rooms).key;
  const rest = shuffle(rng, input.rooms.filter((r) => r.key !== body)).map((r) => r.key);
  return { bodyRoomKey: body, roomOrder: input.roomOrder ?? [body, ...rest] };
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

  // v4: the public evidence leaves exactly what the case planned standing (a few suspects, usually one weapon and one
  // room), the answer always among them. Older case files planned one of each.
  const want = cf.open ?? { suspects: 1, exhibits: 1, rooms: 1 };
  const fin = stages[2].rem;
  if (!(fin.suspects.size === want.suspects && fin.suspects.has(sol.killerId))) problems.push("Suspects don't narrow to the planned few.");
  if (!(fin.exhibits.size === want.exhibits && fin.exhibits.has(sol.exhibitId))) problems.push("Exhibits don't narrow to the planned few.");
  if (!(fin.rooms.size === want.rooms && fin.rooms.has(sol.roomKey))) problems.push("Rooms don't narrow to the planned few.");

  // Not too easy (v3), even for a table that finds every marker and shares every tip from the start:
  const tipped: PlacedClue[] = [...cf.clues, ...cf.tips.map((t, i): PlacedClue => ({ id: `tip${i}`, kind: "suspect", text: t.text, elim: t.elim, round: 1, channel: "tv" }))];
  const p1 = remainingAfter(input, tipped, 1);
  const p2 = remainingAfter(input, tipped, 2);
  const N = input.suspects.length;
  const W = input.exhibits.length;
  // after Round 1, more than half of every list is still open (half, in games under 6);
  if (p1.suspects.size < (N < 6 ? Math.max(2, Math.ceil(N / 2)) : Math.max(3, Math.ceil(N * 0.55)))) problems.push("Too few suspects left after Round 1.");
  if (p1.exhibits.size < (W < 6 ? Math.max(Math.min(2, W), Math.ceil(W / 2)) : Math.max(2, Math.ceil(W * 0.55)))) problems.push("Too few exhibits left after Round 1.");
  if (stages[0].suspects < Math.min(3, N)) problems.push("Too few suspects left after Round 1.");
  if (p1.rooms.size < Math.min(2, input.rooms.length)) problems.push("Too few rooms left after Round 1.");
  // after Round 2, it's narrowed but not solved: a few suspects, and more than one weapon or room.
  if ((N >= 6 ? p2.suspects.size : stages[1].suspects) < (N >= 8 ? 3 : 2)) problems.push("Too few suspects left after Round 2.");
  if (p2.exhibits.size * p2.rooms.size < 2) problems.push("Weapon and room settled before Round 3.");
  if (stages[1].combos < 2) problems.push("Solved before Round 3.");

  // Every marker carries exactly one clue, and only real markers are used.
  // A marker's clue counts from the round its room opens (Round 1 unless searching in waves).
  const markerNums = new Set(input.markers.map((m) => m.number));
  const markerRoom = new Map(input.markers.map((m) => [m.number, m.roomKey]));
  const used = new Map<number, number>();
  for (const c of cf.clues) {
    if (c.channel !== "marker") continue;
    const opens = c.markerNumber === undefined ? 1 : openRound(markerRoom.get(c.markerNumber) ?? "", cf.roomOrder, input.search);
    if (c.round !== opens) problems.push(`Marker clue ${c.id} isn't in the round its room opens.`);
    if (c.markerNumber === undefined || !markerNums.has(c.markerNumber)) problems.push(`Clue ${c.id} is on a marker that doesn't exist.`);
    else used.set(c.markerNumber, (used.get(c.markerNumber) ?? 0) + 1);
  }
  for (const n of markerNums) if (used.get(n) !== 1) problems.push(`Marker ${n} doesn't have exactly one clue.`);

  // Tips: one for every guest, the killer too, so having a tip gives nobody away.
  // Every tip is a true clue the public evidence will prove later, so the killer's is harmless.
  const tippedIds = new Set(cf.tips.map((t) => t.playerId));
  const hasTipPool = cf.clues.some((c) => c.round > 1 && isSmall(c.kind));
  if (hasTipPool) {
    for (const s of input.suspects) if (!tippedIds.has(s.id)) problems.push(`${s.name} has no tip.`);
  }
  if (cf.tips.length !== tippedIds.size) problems.push("Someone got two tips.");
  const killerTip = cf.tips.find((t) => t.playerId === sol.killerId);
  if (killerTip && cf.tips.length > 1 && cf.tips.filter((t) => t.clueId === killerTip.clueId).length < 2) problems.push("Only the killer holds their tip.");
  if (new Set(cf.tips.map((t) => t.clueId)).size > tipCount(N)) problems.push("Too many different tips.");

  // A herring must be cleared publicly no earlier than it appears.
  for (const c of cf.clues) {
    if (c.kind !== "herring" || !c.pointsAt) continue;
    const clears = cf.clues.filter((x) => x.elim.suspects.includes(c.pointsAt!));
    if (!clears.length) problems.push("A herring points at someone who is never cleared.");
    else if (Math.min(...clears.map((x) => x.round)) < c.round) problems.push("A herring appears after its target was already cleared.");
  }

  // New evidence is new (Heston, Oct 16). A small clue clears nothing that any other clue cleared in an earlier round
  // or clears the same round. The witness, the coroner and the twist name a whole group (all the women, every heavy
  // weapon, every other room), so they may repeat a few cleared earlier, but each also clears something nothing else does.
  const keys = (e: Elim) => [...e.suspects.map((x) => `s:${x}`), ...e.exhibits.map((x) => `e:${x}`), ...e.rooms.map((x) => `r:${x}`)];
  for (const c of cf.clues) {
    const mine = keys(c.elim);
    if (!mine.length) continue;
    const others = cf.clues.filter((x) => x !== c && x.round <= c.round);
    if (isSmall(c.kind)) {
      for (const x of others) if (keys(x.elim).some((k) => mine.includes(k))) problems.push(`Clue ${c.id} repeats evidence from clue ${x.id}.`);
    } else {
      const known = new Set(others.filter((x) => x.round < c.round || isSmall(x.kind)).flatMap((x) => keys(x.elim)));
      if (mine.every((k) => known.has(k))) problems.push(`Clue ${c.id} tells nobody anything new.`);
    }
  }

  // Every guest has a briefing, and exactly one of them is the killer (and, with an accomplice, one the accomplice).
  if (cf.briefings.length !== input.suspects.length) problems.push("Not every guest has a briefing.");
  if (cf.briefings.filter((b) => b.role === "killer").length !== 1) problems.push("There isn't exactly one killer.");
  const accomplices = cf.briefings.filter((b) => b.role === "accomplice");
  if (input.accomplice) {
    if (accomplices.length !== 1 || !sol.accompliceId || sol.accompliceId === sol.killerId || accomplices[0].playerId !== sol.accompliceId) problems.push("There isn't exactly one accomplice.");
  } else if (accomplices.length || sol.accompliceId) problems.push("An accomplice in a one-killer game.");

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

/** The clue kinds a private tip can come from: the small ones (never the witness, the coroner or the twist). */
const SMALL: ClueKind[] = ["suspect", "suspectPair", "suspectTrio", "exhibit", "exhibitPair", "room"];
const isSmall = (k: ClueKind) => SMALL.includes(k);

/** How many different tips a game deals: few, so pooling every tip doesn't solve it, and shared, so a liar can be caught. */
export const tipCount = (guests: number) => (guests <= 8 ? 2 : 3);

/**
 * v3 evidence (Heston, Oct 16: "Too easy … we need to solve the game for not too hard to play, not too easy"; he chose
 * "Fully solvable, fewer clues"). The public evidence still proves exactly one answer by the end of Round 3, but with
 * fewer, bigger clues and more of them late:
 * - a witness says whether the killer is a man or a woman (clears everyone of the other sex at once);
 * - the coroner's report rules out a whole kind of weapon (heavy, sharp, a gun, a cord, no wound at all);
 * - alibis clear the rest one, two or three at a time, including some the witness or coroner also clears, so the
 *   alibis alone don't give the killer's sex or the weapon's kind away;
 * - the twist still settles the room in Round 3.
 * One big clue lands in Round 2, the other in Round 3. Markers carry a few alibis; the rest are dead ends and a red
 * herring. Tips: only two or three different ones, each given to several guests.
 */
function tryBuild(input: CaseInput, rng: Rng, sol: Solution, plan: Open = { suspects: 1, exhibits: 1, rooms: 1 }): CaseFile {
  const S = scriptFor(input);
  const say = deckPicker(rng);
  const name = new Map(input.suspects.map((s) => [s.id, s.name]));
  const innocents = input.suspects.filter((s) => s.id !== sol.killerId);
  const wrongExhibits = input.exhibits.filter((e) => e.id !== sol.exhibitId);
  const otherRooms = input.rooms.filter((r) => r.key !== sol.roomKey);
  const body = input.rooms.find((r) => r.key === input.bodyRoomKey)!;
  const order = input.roomOrder ?? input.rooms.map((r) => r.key);
  const killer = input.suspects.find((s) => s.id === sol.killerId)!;
  const weapon = input.exhibits.find((e) => e.id === sol.exhibitId)!;
  // A clue on a marker can only be read once that marker's room is open.
  const roundOf = (m: { roomKey: string }) => openRound(m.roomKey, order, input.search);

  // 1. The big clues, and when they land: one in Round 2, the other in Round 3 (a lone one in either).
  const bigs: Draft[] = [];
  // v4: the innocents the evidence never clears (plan.suspects - 1 of them). They stand with the killer at the end, and
  // people have to make the last call themselves.
  let standing: Suspect[] = shuffle(rng, innocents).slice(0, plan.suspects - 1);
  let needAlibi = innocents.filter((s) => !standing.includes(s));
  let camoSus: Suspect[] = [];
  // The witness: the killer is a man, or a woman. Needs every guest's drawing, and at least two innocents of each sex.
  // Not every game has one (about one in five goes without), so the ones left standing aren't always all one sex.
  if (killer.sex && input.suspects.every((s) => s.sex) && rng() < 0.8) {
    const other = innocents.filter((s) => s.sex !== killer.sex);
    const same = innocents.filter((s) => s.sex === killer.sex);
    // Not when it would leave the killer almost alone in their sex: that's the whole case in one clue.
    if (other.length >= 2 && same.length >= 2) {
      bigs.push({ kind: "witness", text: S.witness(say, killer.sex, other.map((s) => s.name)), elim: { ...NONE, suspects: other.map((s) => s.id) } });
      // The ones left standing are the killer's sex then (the witness clears the rest).
      standing = shuffle(rng, same).slice(0, plan.suspects - 1);
      // Some of the other sex get alibis too, before the witness talks, so the early alibis don't give the sex away.
      camoSus = shuffle(rng, other).slice(0, Math.round(other.length * (0.3 + rng() * 0.2)));
      needAlibi = same.filter((s) => !standing.includes(s));
    }
  }
  // The coroner: picks the report that rules out closest to half the wrong weapons (at least two).
  let needClear = wrongExhibits;
  let camoEx: typeof wrongExhibits = [];
  if (weapon.kind && input.exhibits.every((e) => e.kind)) {
    const kinds = [...new Set(wrongExhibits.map((e) => e.kind!))];
    const options = [
      { kind: weapon.kind, positive: true, out: wrongExhibits.filter((e) => e.kind !== weapon.kind) },
      ...kinds.filter((k) => k !== weapon.kind).map((k) => ({ kind: k, positive: false, out: wrongExhibits.filter((e) => e.kind === k) })),
    ].filter((o) => o.out.length >= 2);
    if (options.length) {
      const half = wrongExhibits.length / 2;
      const best = Math.min(...options.map((o) => Math.abs(o.out.length - half)));
      const o = pick(rng, options.filter((x) => Math.abs(x.out.length - half) === best));
      bigs.push({ kind: "coroner", text: S.coroner(say, o.kind, o.positive, o.out.map((e) => e.name.toLowerCase())), elim: { ...NONE, exhibits: o.out.map((e) => e.id) } });
      camoEx = shuffle(rng, o.out).slice(0, Math.round(o.out.length * (0.3 + rng() * 0.2)));
      needClear = wrongExhibits.filter((e) => !o.out.includes(e));
    }
  }
  // v4: a weapon the evidence never clears, now and then (plan.exhibits): one the coroner doesn't rule out.
  const weaponsStanding = shuffle(rng, needClear).slice(0, plan.exhibits - 1);
  needClear = needClear.filter((e) => !weaponsStanding.includes(e));
  const bigRound = new Map<ClueKind, Round>();
  const bigOrder = shuffle(rng, bigs);
  if (bigOrder.length === 2) {
    bigRound.set(bigOrder[0].kind, 2);
    bigRound.set(bigOrder[1].kind, 3);
  } else if (bigOrder.length === 1) bigRound.set(bigOrder[0].kind, rng() < 0.5 ? 2 : 3);
  // A cover clear has to come out before its big clue: once the witness or the coroner has spoken, it's old news.
  const before = (k: ClueKind) => ((bigRound.get(k) ?? 4) - 1) as Round;

  // 2. Alibis and weapon clears for the rest, one, two or (in bigger games) three to a clue.
  const trios = input.suspects.length >= 9;
  const alibis = (who: Suspect[], by?: Round): Draft[] => {
    const out: Draft[] = [];
    const sus = shuffle(rng, who);
    for (let i = 0; i < sus.length; ) {
      const r = rng();
      if (trios && i + 2 < sus.length && r < 0.3) {
        const [a, b, c] = [sus[i], sus[i + 1], sus[i + 2]];
        out.push({ kind: "suspectTrio", text: S.suspectTrioClear(say, a.name, b.name, c.name), elim: { ...NONE, suspects: [a.id, b.id, c.id] }, by });
        i += 3;
      } else if (i + 1 < sus.length && r < 0.7) {
        const [a, b] = [sus[i], sus[i + 1]];
        out.push({ kind: "suspectPair", text: S.suspectPairClear(say, a.name, b.name), elim: { ...NONE, suspects: [a.id, b.id] }, by });
        i += 2;
      } else {
        out.push({ kind: "suspect", text: S.suspectClear(say, sus[i].name), elim: { ...NONE, suspects: [sus[i].id] }, by });
        i += 1;
      }
    }
    return out;
  };
  const clears = (which: typeof wrongExhibits, by?: Round): Draft[] => {
    const out: Draft[] = [];
    const exs = shuffle(rng, which);
    for (let i = 0; i < exs.length; ) {
      if (i + 1 < exs.length && rng() < 0.55) {
        const [a, b] = [exs[i], exs[i + 1]];
        out.push({ kind: "exhibitPair", text: S.exhibitPairClear(say, a.name.toLowerCase(), b.name.toLowerCase()), elim: { ...NONE, exhibits: [a.id, b.id] }, by });
        i += 2;
      } else {
        out.push({ kind: "exhibit", text: S.exhibitClear(say, exs[i].name.toLowerCase(), exs[i].kind), elim: { ...NONE, exhibits: [exs[i].id] }, by });
        i += 1;
      }
    }
    return out;
  };
  const suspectDrafts = alibis(needAlibi);
  const exhibitDrafts = clears(needClear);
  const cover = [...alibis(camoSus, before("witness")), ...clears(camoEx, before("coroner"))];

  // 3. Rooms. The twist always carries the last word on the room.
  let twist: Draft;
  let roomTargets = otherRooms;
  // When the twist says he died where he was found, it settles every room at once, so the room clears come out first.
  let roomsBy: Round | undefined;
  let roomsStanding: typeof otherRooms = [];
  if (sol.roomKey !== body.key) {
    twist = { kind: "twist", text: S.twistMoved(body.label), elim: { ...NONE, rooms: [body.key] } };
    roomTargets = otherRooms.filter((r) => r.key !== body.key);
    // v4: a room the evidence never clears, now and then (plan.rooms). Only here: the other twist settles the room.
    roomsStanding = shuffle(rng, roomTargets).slice(0, plan.rooms - 1);
    roomTargets = roomTargets.filter((r) => !roomsStanding.includes(r));
  } else {
    const held = pick(rng, otherRooms);
    twist = { kind: "twist", text: S.twistStayed(body.label), elim: { ...NONE, rooms: otherRooms.map((r) => r.key) } };
    roomTargets = otherRooms.filter((r) => r.key !== held.key);
    roomsBy = 2;
  }
  const roomDrafts: Draft[] = shuffle(rng, roomTargets).map((r) => ({
    kind: "room",
    text: S.roomClear(say, r.label),
    elim: { ...NONE, rooms: [r.key] },
    roomKey: r.key,
    by: roomsBy,
  }));

  // 4. Spread across rounds. The small ones: about a third in Round 1; of the rest, Round 2 takes few where that list's
  // big clue is already in Round 2 and most where it isn't, so each list is narrowed but still open going into Round 3.
  // Cover clears land in a round before their big clue.
  const byRound: Record<Round, Draft[]> = { 1: [], 2: [], 3: [] };
  for (const b of bigOrder) byRound[bigRound.get(b.kind)!].push(b);
  for (const d of shuffle(rng, cover)) byRound[d.by === 1 ? 1 : rng() < 0.5 ? 1 : 2].unshift(d);
  for (const [drafts, big] of [
    [suspectDrafts, bigRound.get("witness") === 2],
    [exhibitDrafts, bigRound.get("coroner") === 2],
    [roomDrafts, false],
  ] as const) {
    const q = shuffle(rng, drafts);
    const n1 = Math.floor(q.length * (0.25 + rng() * 0.15));
    const n2 = Math.round((q.length - n1) * (big ? 0.15 + rng() * 0.15 : 0.5 + rng() * 0.15));
    byRound[1].push(...q.splice(0, n1));
    byRound[2].push(...q.splice(0, n2));
    // Room clears the twist would settle anyway go in Round 2 instead.
    byRound[roomsBy && drafts === roomDrafts ? 2 : 3].push(...q);
  }

  // 5. Small clues go on markers in rooms that open that round (Round 1's that find no marker wait for the first TV
  // drop); big ones always go on the TV. Room clears never sit in their own room: a fully searched room with no
  // "clean" card would hint it's the murder room. A Round 1 cover clear with no marker left is dropped: on the TV in
  // Round 2 it would arrive with the big clue it was covering for.
  const placed: PlacedClue[] = [];
  let n = 0;
  const id = () => `c${++n}`;
  const freeMarkers = shuffle(rng, input.markers);
  const markerFor = (round: Round, d: Draft) => {
    const i = freeMarkers.findIndex((m) => roundOf(m) === round && m.roomKey !== d.roomKey);
    return i < 0 ? undefined : freeMarkers.splice(i, 1)[0];
  };
  for (const round of [1, 2, 3] as Round[]) {
    for (const d of byRound[round]) {
      const m = isSmall(d.kind) ? markerFor(round, d) : undefined;
      if (m) placed.push({ id: id(), kind: d.kind, text: d.text, elim: d.elim, round, channel: "marker", markerNumber: m.number });
      else if (round === 1 && d.by === 1) continue;
      else placed.push({ id: id(), kind: d.kind, text: d.text, elim: d.elim, round: round === 1 ? 2 : round, channel: "tv" });
    }
  }

  // 6. Red herrings at innocents who get cleared later (two in bigger games), then dead ends on the spare markers.
  const clearedIn = (sid: string) => Math.min(...placed.filter((c) => c.elim.suspects.includes(sid)).map((c) => c.round));
  // Only at someone the evidence does clear later (never at one left standing: that would never be answered).
  const herrings = shuffle(rng, innocents.filter((s) => Number.isFinite(clearedIn(s.id)) && clearedIn(s.id) > 1)).slice(0, input.suspects.length >= 10 ? 2 : 1);
  for (const h of herrings) {
    const clearRound = clearedIn(h.id);
    const i = freeMarkers.findIndex((m) => roundOf(m) < clearRound);
    if (i >= 0) {
      const m = freeMarkers.splice(i, 1)[0];
      placed.push({ id: id(), kind: "herring", text: S.herring(say, h.name), elim: NONE, round: roundOf(m), channel: "marker", markerNumber: m.number, pointsAt: h.id });
    } else if (clearRound === 3) {
      placed.push({ id: id(), kind: "herring", text: S.herring(say, h.name), elim: NONE, round: 2, channel: "tv", pointsAt: h.id });
    }
  }
  const flavor = shuffle(rng, S.flavor);
  let f = 0;
  while (freeMarkers.length) {
    const m = freeMarkers.shift()!;
    placed.push({ id: id(), kind: "flavor", text: flavor[f++ % flavor.length], elim: NONE, round: roundOf(m), channel: "marker", markerNumber: m.number });
  }
  // The twist reads last on the final drop.
  placed.push({ id: id(), kind: "twist", text: twist.text, elim: twist.elim, round: 3, channel: "tv" });

  // 7. Private tips: early word of a small Round 3 clue (Round 2 if Round 3 has none). Only two or three different
  // tips, shared out so several guests hold each one: the killer gets one too (having a tip gives nobody away), may
  // lie about it, and whoever holds the same tip can catch them. Nobody gets a tip that clears themselves.
  const tips: Tip[] = [];
  const late = placed.filter((c) => c.round === 3 && isSmall(c.kind));
  const pool = late.length ? late : placed.filter((c) => c.round === 2 && isSmall(c.kind));
  if (pool.length) {
    // Each list keeps at least one Round 3 clue nobody hears about early, so pooled tips can't finish a list.
    const listOf = (c: PlacedClue) => (c.elim.suspects.length ? "s" : c.elim.exhibits.length ? "e" : "r");
    const kept = new Set(["s", "e", "r"].map((l) => shuffle(rng, late.filter((c) => listOf(c) === l))[0]).filter(Boolean));
    let candidates = shuffle(rng, pool.filter((c) => !kept.has(c)));
    if (candidates.length < tipCount(input.suspects.length)) candidates.push(...shuffle(rng, placed.filter((c) => c.round === 2 && isSmall(c.kind))));
    if (!candidates.length) candidates = shuffle(rng, pool);
    // Prefer a mix: not all about suspects.
    const notSuspect = candidates.filter((c) => !c.elim.suspects.length);
    const chosen = [...notSuspect.slice(0, 1), ...candidates.filter((c) => c !== notSuspect[0])].slice(0, tipCount(input.suspects.length));
    let k = 0;
    for (const s of shuffle(rng, input.suspects)) {
      const fits = (c: PlacedClue) => !c.elim.suspects.includes(s.id);
      let choice = chosen[k % chosen.length];
      for (let tries = 0; tries < chosen.length && !fits(choice); tries++) choice = chosen[++k % chosen.length];
      if (!fits(choice)) choice = pool.find(fits) ?? choice;
      k++;
      tips.push({ playerId: s.id, clueId: choice.id, text: choice.text, elim: choice.elim });
    }
    // F13 (Oct 17): the killer's tip is always one somebody else holds too, so they can't lie about it safely. Any
    // tip suits the killer: tips are true, so none clears them.
    const held = (clueId: string) => tips.filter((t) => t.clueId === clueId).length;
    const mine = tips.find((t) => t.playerId === sol.killerId);
    if (mine && held(mine.clueId) < 2 && tips.length > 1) {
      const others = tips.filter((t) => t.playerId !== sol.killerId);
      const shared = [...others].sort((a, b) => held(b.clueId) - held(a.clueId))[0];
      Object.assign(mine, { clueId: shared.clueId, text: shared.text, elim: shared.elim });
    }
  }

  // 8. Briefings for every phone.
  const motives = writeMotives(input, rng, S);
  const ex = input.exhibits.find((e) => e.id === sol.exhibitId)!;
  const room = input.rooms.find((r) => r.key === sol.roomKey)!;
  const herringClue = placed.find((c) => c.kind === "herring");
  const herringAt = herringClue?.pointsAt;
  const accompliceName = sol.accompliceId ? name.get(sol.accompliceId) : undefined;
  // Oct 17 (D5): a game too small for a jail vote doesn't mention jail.
  const noJail = (lines: string[]) => (hasJailVote(input.suspects.length) ? lines : lines.filter((l) => !/\bjail/i.test(l)));
  const briefings: Briefing[] = input.suspects.map((s) => {
    const m = motives.get(s.id)!;
    if (s.id === sol.killerId) {
      const lines = S.killerLines({
        weapon: ex.name,
        room: room.label,
        ownWeapon: ex.ownerId === s.id,
        herringName: herringAt ? name.get(herringAt) : undefined,
        accompliceName,
      });
      return { playerId: s.id, role: "killer", motive: m.motive, secret: m.secret, lines: noJail(lines) };
    }
    if (s.id === sol.accompliceId) {
      const lines = S.accompliceLines({
        killerName: name.get(sol.killerId)!,
        weapon: ex.name,
        room: room.label,
        ownWeapon: ex.ownerId === s.id,
        herringName: herringAt && herringAt !== s.id && herringAt !== sol.killerId ? name.get(herringAt) : undefined,
        herringIsMe: herringAt === s.id,
      });
      return { playerId: s.id, role: "accomplice", motive: m.motive, secret: m.secret, lines: noJail(lines) };
    }
    return { playerId: s.id, role: "innocent", motive: m.motive, secret: m.secret, lines: noJail(sol.accompliceId ? S.innocentLinesAcc : S.innocentLines) };
  });

  const open: Open = { suspects: standing.length + 1, exhibits: weaponsStanding.length + 1, rooms: roomsStanding.length + 1 };
  return { solution: sol, bodyRoomKey: body.key, roomOrder: order, clues: placed, tips, briefings, attempts: 1, open };
}

/**
 * v4 (Oct 16): how much the evidence leaves open at the end. Heston: "with evidence, it should not narrow down to exactly
 * the answer at the end of the game. It's should still be ambiguous, but close", "narrows down the room and weapons but
 * leaves the person more unknown, that way it's a human element of intuition and bluffing/blaming", and the numbers
 * should "vary slightly across player size, evidence, and rooms ... vary slightly from game to game".
 * - Suspects: about a quarter of the party (2 in small games, up to 5 in big ones), give or take one.
 * - Weapons: one; two in about 1 game in 10 with 6 or 7 weapons, 1 in 5 with 8 or more.
 * - Rooms: one; two in about 1 game in 10 with 5 rooms, 1 in 5 with 6 or more (only when the body was moved).
 */
export function openEnding(input: CaseInput, rng: Rng): Open {
  const N = input.suspects.length;
  const W = input.exhibits.length;
  const R = input.rooms.length;
  const base = N <= 4 ? 2 : N <= 7 ? 2.5 : N <= 10 ? 3 : N <= 14 ? 3.5 : N <= 18 ? 4 : 4.5;
  let suspects = Math.floor(base + rng());
  const j = rng();
  suspects += j < 0.2 ? -1 : j >= 0.8 ? 1 : 0;
  suspects = Math.max(Math.min(2, N - 1), Math.min(suspects, Math.max(2, Math.ceil(N / 2)), N - 1, 5));
  const exhibits = W >= 8 ? (rng() < 0.2 ? 2 : 1) : W >= 6 ? (rng() < 0.1 ? 2 : 1) : 1;
  const rooms = R >= 6 ? (rng() < 0.2 ? 2 : 1) : R >= 5 ? (rng() < 0.1 ? 2 : 1) : 1;
  return { suspects, exhibits, rooms };
}

/**
 * Draws the answer (unless given), where the body turns up and the order rooms open in,
 * then builds a case that passes every solvability rule.
 */
export function buildCase(input: CaseInput, rng: Rng, solution?: Solution): CaseFile & { validation: Validation } {
  const problems = checkInput(input);
  if (problems.length) throw new Error(problems.join(" "));
  const full: CaseInput = { ...input, ...drawScene(input, rng) };
  const sol = solution ? withAccomplice(full, rng, solution) : draw(full, rng);
  let plan = openEnding(full, rng);
  let last: Validation | null = null;
  for (let attempt = 1; attempt <= 200; attempt++) {
    // A plan that won't build after a while gets a little narrower.
    if (attempt === 80 || attempt === 140) plan = { suspects: Math.max(1, plan.suspects - 1), exhibits: 1, rooms: 1 };
    const cf = tryBuild(full, rng, sol, plan);
    const v = validateCase(full, cf);
    if (v.ok) return { ...cf, attempts: attempt, validation: v };
    last = v;
  }
  throw new Error(`Couldn't build a solvable case: ${last?.problems.join(" ")}`);
}
