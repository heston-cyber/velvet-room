import { pick, shuffle } from "./rng";
import { CLASSIC, deckPicker, type Line, type Say, type Script } from "./text";
import { ADULT } from "./textAdult";
import { hasJailVote } from "../shared";
import { SPOTS, STASH, alibiText, dealSpots, drawDebts, drawTips, pairUp, spotsFor, storyWords, type Story, type Unit } from "./stories";
import type {
  Briefing,
  CaseFile,
  CaseInput,
  ClueFacts,
  ClueKind,
  Elim,
  Open,
  Place,
  PlacedClue,
  Rng,
  Room,
  Round,
  Solution,
  Suspect,
} from "./types";

const NONE: Elim = { suspects: [], exhibits: [], rooms: [] };

type Draft = {
  kind: ClueKind;
  /** Big clues and the twist: their words. The rest pick theirs once the night is laid out (render, below). */
  text?: string;
  /** Oct 18: the sentence patterns this clue may use, the deck they're dealt from, and what goes in them. */
  lines?: Line<string[]>[];
  deck?: string;
  args?: string[];
  elim: Elim;
  roomKey?: string; // room clears: lets a marker in that room carry it
  pointsAt?: string;
  /** The last round this clue may come out in (a cover clear, before the big clue that would make it old news). */
  by?: Round;
  /** Phase 3: an alibi in the stories' words carries where it says each guest was. */
  facts?: ClueFacts;
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
    if (!m.roomKey) problems.push(`Card ${m.number} needs a room.`);
    else if (!roomKeys.has(m.roomKey)) problems.push(`Card ${m.number} is in a room that isn't in play.`);
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

  // Not too easy (v3), even for a table that finds every card (Oct 18: no tips any more):
  const p1 = remainingAfter(input, cf.clues, 1);
  const p2 = remainingAfter(input, cf.clues, 2);
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

  // Oct 18: no tips.
  if (cf.tips.length) problems.push("A new game has tips.");

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

  // Oct 18: nothing contradicts anything else (where people were, which rooms were sealed, where he died and was found).
  problems.push(...worldProblems(input, cf));
  // Phase 3: the stories, the story cards, the debts and the late tips.
  problems.push(...storyProblems(input, cf));

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

/** The single, pair and trio clears and the room clears: the small clues (never the witness, the coroner or the twist). */
const SMALL: ClueKind[] = ["suspect", "suspectPair", "suspectTrio", "exhibit", "exhibitPair", "room"];
const isSmall = (k: ClueKind) => SMALL.includes(k);

// ---------- the night, checked (Oct 18) ----------

/** What each place is called when it's one of the house's rooms. "out" never is. */
const PLACE_WORDS: Record<Place, RegExp | null> = {
  bar: /\bbar\b|saloon|tavern/i,
  office: /office|study/i,
  lounge: /lounge|parlou?r|ballroom|dance|music|piano|band/i,
  cards: /\bcards?\b|gaming|casino|poker|craps/i,
  front: /coat|cloak|foyer|entry|entrance|front|hall/i,
  kitchen: /kitchen|pantry/i,
  bath: /bath|powder|wash|restroom|lavatory/i,
  out: null,
  // Phase 3: the stories' spots.
  cellar: /cellar|basement/i,
  stairs: /stair/i,
  roof: /roof|terrace/i,
  garage: /garage|carriage/i,
};

/** The room of the house a place is, if any (by the room's name: "The Bar" is the bar). */
export function roomOfPlace(rooms: Room[], place: Place): string | undefined {
  const re = PLACE_WORDS[place];
  return re ? rooms.find((r) => re.test(r.label))?.key : undefined;
}

/**
 * Rooms a clue may put people (or a watched weapon) in, in a round: never where the Don died or was found (anyone
 * there the whole time would have seen it), never a room another clue sealed, and only a room the evidence has already
 * shown full of people (a "packed with witnesses" clear by then), so an alibi never gives a room away early.
 */
function placesFit(rooms: Room[], at: Place[] | undefined, round: Round, night: Night): boolean {
  for (const p of at ?? []) {
    const r = roomOfPlace(rooms, p);
    if (!r) continue;
    if (r === night.murderRoom || r === night.bodyRoom || night.sealed.has(r)) return false;
    if ((night.crowded.get(r) ?? 99) > round) return false;
  }
  return true;
}
type Night = { murderRoom: string; bodyRoom: string; sealed: Set<string>; crowded: Map<string, Round> };

/** Every claim the evidence makes about the night, checked against every other (the last word before a game starts). */
export function worldProblems(input: CaseInput, cf: CaseFile): string[] {
  const out: string[] = [];
  const night: Night = { murderRoom: cf.solution.roomKey, bodyRoom: cf.bodyRoomKey, sealed: new Set(), crowded: new Map() };
  for (const c of cf.clues) {
    if (c.kind !== "room" || !c.facts) continue;
    const r = c.elim.rooms[0];
    if (c.facts.seal) night.sealed.add(r);
    if (c.facts.crowd) night.crowded.set(r, Math.min(night.crowded.get(r) ?? 3, c.round) as Round);
  }
  for (const c of cf.clues) {
    if (c.kind === "room" || !c.facts?.at?.length) continue;
    if (!placesFit(input.rooms, c.facts.at, c.round, night)) out.push(`Clue ${c.id} puts people where the night says they can't have been.`);
  }
  for (const c of cf.clues) {
    // Nothing says where it was found, or that it was found by the body (the cards sit all over the house).
    if (c.kind !== "witness" && /\b(next to|near|by|beside) the body\b|\bin here\b|\bthis room\b/i.test(c.text)) out.push(`Clue ${c.id} says where it was found.`);
  }
  return out;
}

/**
 * Phase 3 (Oct 20): every story rule, checked from the case file alone.
 * - Everyone has one story, in a spot that's none of the game's rooms; nobody shares a spot except a pair.
 * - Pairs only among guests the evidence clears; the ones left standing, and the killer, are alone; at least 2 cleared
 *   guests are alone (1 in games of 6 or fewer).
 * - Every alibi says the same spot as the cleared guests' stories, and clears a pair together.
 * - The deciding card breaks the killer's detail and nothing else, never in Round 1; no card backs up the killer.
 * - Exactly one innocent left standing is backed up by a card; the other by none, and not by any other guest.
 * - Story cards never name a guest, and break no innocent's story.
 * - Two late tips about two different guests still standing after Round 2; two or three true debts.
 */
export function storyProblems(input: CaseInput, cf: CaseFile): string[] {
  const out: string[] = [];
  const stories = cf.stories ?? [];
  const ids = input.suspects.map((x) => x.id);
  const sol = cf.solution;
  if (stories.length !== ids.length || new Set(stories.map((x) => x.playerId)).size !== ids.length || !ids.every((id) => stories.some((x) => x.playerId === id))) {
    out.push("Not every guest has one story.");
    return out;
  }
  const by = new Map(stories.map((x) => [x.playerId, x]));
  const spots = new Map(SPOTS.map((x) => [x.key, x]));
  const details = new Map(SPOTS.flatMap((x) => x.details.map((d) => [d.id, d] as const)));
  const ruledOut = new Set(cf.clues.flatMap((c) => c.elim.suspects));
  const standing = ids.filter((id) => !ruledOut.has(id));
  const innocentsStanding = standing.filter((id) => id !== sol.killerId);
  const names = input.suspects.map((x) => x.name).filter(Boolean);
  // Spots: real, not a room in play, one unit each.
  const atSpot = new Map<string, string[]>();
  for (const st of stories) {
    const sp = spots.get(st.spot);
    if (!sp) out.push(`${st.playerId}'s story is in a spot that doesn't exist.`);
    else if (roomOfPlace(input.rooms, sp.place)) out.push(`${st.playerId}'s story is in one of the game's rooms.`);
    if (!sp?.details.some((d) => d.id === st.detail)) out.push(`${st.playerId}'s detail isn't one of the spot's.`);
    atSpot.set(st.spot, [...(atSpot.get(st.spot) ?? []), st.playerId]);
  }
  for (const [spot, who] of atSpot) {
    if (who.length > 2) out.push(`Three or more guests share ${spot}.`);
    if (who.length === 2) {
      const [a, b] = who.map((id) => by.get(id)!);
      if (a.withId !== b.playerId || b.withId !== a.playerId) out.push(`Two guests at ${spot} who aren't together.`);
      if (a.detail !== b.detail) out.push(`A pair at ${spot} with different details.`);
    }
  }
  const topics = stories.map((x) => details.get(x.detail)?.topic).filter(Boolean);
  if (new Set(topics).size !== new Set(stories.filter((x) => details.get(x.detail)?.topic).map((x) => x.spot)).size) out.push("Two stories on one topic.");
  // Who's alone.
  for (const st of stories) {
    if (st.withId && (!by.has(st.withId) || by.get(st.withId)!.withId !== st.playerId)) out.push(`${st.playerId}'s partner doesn't say so.`);
    if (st.withId && (!ruledOut.has(st.playerId) || !ruledOut.has(st.withId))) out.push("A pair with someone the evidence never clears.");
  }
  if (by.get(sol.killerId)!.withId) out.push("The killer isn't alone.");
  for (const id of standing) if (by.get(id)!.withId) out.push("Someone left standing isn't alone.");
  const clearedAlone = stories.filter((x) => ruledOut.has(x.playerId) && !x.withId).length;
  const clearedCount = ids.filter((id) => ruledOut.has(id)).length;
  if (clearedAlone < Math.min(clearedCount, ids.length <= 6 ? 1 : 2)) out.push("Too few cleared guests are alone: being alone would give the standing away.");
  // The words: only a pair names a guest, and only their partner.
  for (const st of stories) {
    const partner = st.withId ? input.suspects.find((x) => x.id === st.withId)?.name : undefined;
    const tail = partner ? st.text.replace(partner, "") : st.text;
    if (names.some((n) => tail.includes(n))) out.push(`${st.playerId}'s story names a guest.`);
  }
  // Alibis agree with the stories, and a pair is cleared by one clue.
  for (const c of cf.clues.filter((x) => x.facts?.spots)) {
    for (const [pid, spot] of Object.entries(c.facts!.spots!)) {
      if (by.get(pid)?.spot !== spot) out.push(`Clue ${c.id} says ${pid} was somewhere their story doesn't.`);
      const partner = by.get(pid)?.withId;
      if (partner && !c.elim.suspects.includes(partner)) out.push(`Clue ${c.id} clears half of a pair.`);
    }
  }
  // Story cards.
  const cards = cf.clues.filter((c) => c.kind === "story");
  const killerDetail = by.get(sol.killerId)!.detail;
  const breaking = cards.filter((c) => c.facts?.breaks);
  if (breaking.length !== 1) out.push(`${breaking.length} deciding cards.`);
  for (const c of breaking) {
    if (c.facts?.detail !== killerDetail) out.push("The deciding card breaks an innocent's story.");
    if (c.round < 2) out.push("The deciding card is in Round 1.");
  }
  for (const c of cards.filter((x) => !x.facts?.breaks)) {
    const owners = stories.filter((x) => x.detail === c.facts?.detail);
    if (!owners.length) out.push(`Story card ${c.id} backs up nobody's story.`);
    if (owners.some((x) => x.playerId === sol.killerId)) out.push(`Story card ${c.id} backs up the killer.`);
  }
  for (const c of cards) if (names.some((n) => c.text.includes(n))) out.push(`Story card ${c.id} names a guest.`);
  const backedUp = (id: string) => cards.filter((c) => !c.facts?.breaks && c.facts?.detail === by.get(id)!.detail).length;
  if (innocentsStanding.length) {
    const backed = innocentsStanding.filter((id) => backedUp(id) > 0);
    if (backed.length !== 1) out.push(`${backed.length} of the innocents left standing are backed up by a card (want exactly 1).`);
    if (backed.some((id) => backedUp(id) > 1)) out.push("The innocent left standing is backed up twice.");
  }
  // Late tips and debts.
  const tips = cf.lateTips ?? [];
  const afterR2 = remainingAfter(input, cf.clues, 2).suspects;
  if (tips.length !== Math.min(2, afterR2.size)) out.push("Not two late tips.");
  if (new Set(tips.map((t) => t.aboutId)).size !== tips.length) out.push("Both late tips name the same guest.");
  for (const t of tips) if (!afterR2.has(t.aboutId)) out.push("A late tip names a guest already cleared.");
  const debts = cf.debts ?? [];
  if (debts.length < 2 || debts.length > 3) out.push("Not two or three debts.");
  const pairs = new Set<string>();
  for (const d of debts) {
    if (d.fromId === d.toId || !ids.includes(d.fromId) || !ids.includes(d.toId)) out.push("A debt between the wrong guests.");
    if (![100, 200, 300].includes(d.amount)) out.push("A debt that isn't $100 to $300.");
    const k = [d.fromId, d.toId].sort().join("|");
    if (pairs.has(k)) out.push("Two debts between the same two guests.");
    pairs.add(k);
  }
  return out;
}

/** Picks a clue's words: the next pattern in its deck that fits the night (and what it claims). */
function render(say: Say, d: { lines: Line<string[]>[]; deck: string; args: string[] }, ok: (l: Line<string[]>) => boolean): { text: string; facts: ClueFacts } {
  const l = say(d.deck, d.lines, ok);
  const facts: ClueFacts = {};
  if (l.at?.length) facts.at = l.at;
  if (l.seal) facts.seal = true;
  if (l.crowd) facts.crowd = true;
  return { text: l.t(...d.args), facts };
}

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
  // Phase 3: guests the witness clears and no alibi does (their own group for who stands with whom).
  let witnessOnly: Suspect[] = [];
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
      witnessOnly = other.filter((s) => !camoSus.includes(s));
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

  // Phase 3: where everyone was when the lights went out. The killer and the innocents left standing are alone; the
  // cleared pair up within the way they're cleared (so one alibi clears a pair), except a few who stay alone.
  const N = input.suspects.length;
  // Two groups: the ones alibis clear, and the ones the witness clears (with or without an earlier alibi). A pair in
  // the second group with one alibi between them gets it together: its partner joins the early alibis.
  const groups = [needAlibi, [...camoSus, ...witnessOnly]].map((g) => g.map((x) => x.id));
  const together = pairUp(rng, groups, N <= 6 ? 1 : 2);
  for (const t of together) {
    if (t.length === 2 && t.some((id) => camoSus.some((x) => x.id === id))) {
      for (const id of t) if (!camoSus.some((x) => x.id === id)) camoSus.push(witnessOnly.find((x) => x.id === id)!);
    }
  }
  witnessOnly = witnessOnly.filter((x) => !camoSus.includes(x));
  const units: Unit[] = dealSpots(rng, spotsFor(input.rooms, roomOfPlace), [[killer.id], ...standing.map((x) => [x.id]), ...together]) ?? [];
  const unitOf = new Map(units.flatMap((u) => u.ids.map((id) => [id, u] as const)));
  const sayN = (key: string, n: number) => say(`story-${key}-${n}`, Array.from({ length: n }, (_, i) => i));
  const tone = input.tone === "adult" ? "adult" : "classic";

  // 2. Alibis and weapon clears for the rest, one, two or (in bigger games) three to a clue. Phase 3: alibis say
  // where people were in their stories' words, and a pair is always cleared together.
  const trios = input.suspects.length >= 9;
  const storyAlibis = (who: Suspect[], by?: Round): Draft[] => {
    const out: Draft[] = [];
    const us = shuffle(rng, [...new Set(who.map((x) => unitOf.get(x.id)).filter((u): u is Unit => !!u))]);
    while (us.length) {
      const take = [us.pop()!];
      const r = rng();
      const size = () => take.reduce((n, u) => n + u.ids.length, 0);
      if (us.length && size() + us[us.length - 1].ids.length <= (trios ? 3 : 2) && r < 0.45) take.push(us.pop()!);
      const ids = take.flatMap((u) => u.ids);
      const kind: ClueKind = ids.length === 1 ? "suspect" : ids.length === 2 ? "suspectPair" : "suspectTrio";
      out.push({
        kind,
        text: alibiText(sayN, tone, take, name),
        elim: { ...NONE, suspects: ids },
        by,
        facts: { spots: Object.fromEntries(take.flatMap((u) => u.ids.map((id) => [id, u.spot.key]))) },
      });
    }
    return out;
  };
  // Older builds (no stories: the spots ran out): the alibi decks.
  const alibis = (who: Suspect[], by?: Round): Draft[] => {
    const out: Draft[] = [];
    const sus = shuffle(rng, who);
    for (let i = 0; i < sus.length; ) {
      const r = rng();
      if (trios && i + 2 < sus.length && r < 0.3) {
        const [a, b, c] = [sus[i], sus[i + 1], sus[i + 2]];
        out.push({ kind: "suspectTrio", lines: S.suspectTrioClear as Line<string[]>[], deck: "s3", args: [a.name, b.name, c.name], elim: { ...NONE, suspects: [a.id, b.id, c.id] }, by });
        i += 3;
      } else if (i + 1 < sus.length && r < 0.7) {
        const [a, b] = [sus[i], sus[i + 1]];
        out.push({ kind: "suspectPair", lines: S.suspectPairClear as Line<string[]>[], deck: "s2", args: [a.name, b.name], elim: { ...NONE, suspects: [a.id, b.id] }, by });
        i += 2;
      } else {
        out.push({ kind: "suspect", lines: S.suspectClear as Line<string[]>[], deck: "s1", args: [sus[i].name], elim: { ...NONE, suspects: [sus[i].id] }, by });
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
        out.push({ kind: "exhibitPair", lines: S.exhibitPairClear as Line<string[]>[], deck: "e2", args: [a.name.toLowerCase(), b.name.toLowerCase()], elim: { ...NONE, exhibits: [a.id, b.id] }, by });
        i += 2;
      } else {
        const gun = exs[i].kind === "gun";
        out.push({ kind: "exhibit", lines: (gun ? S.exhibitGunClear : S.exhibitClear) as Line<string[]>[], deck: gun ? "e1g" : "e1", args: [exs[i].name.toLowerCase()], elim: { ...NONE, exhibits: [exs[i].id] }, by });
        i += 1;
      }
    }
    return out;
  };
  const withStories = units.length > 0;
  const suspectDrafts = withStories ? storyAlibis(needAlibi) : alibis(needAlibi);
  const exhibitDrafts = clears(needClear);
  const cover = [...(withStories ? storyAlibis(camoSus, before("witness")) : alibis(camoSus, before("witness"))), ...clears(camoEx, before("coroner"))];

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
    lines: S.roomClear as Line<string[]>[],
    deck: "r1",
    args: [r.label],
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
  // Oct 18: a clue's words are picked last (render, below), once every clue knows its round.
  const later = new Map<string, Draft>();
  const put = (c: PlacedClue, d: Draft) => {
    placed.push({ ...c, text: d.text ?? "", ...(d.facts ? { facts: d.facts } : {}) });
    if (!d.text) later.set(c.id, d);
  };
  let n = 0;
  const id = () => `c${++n}`;
  const freeMarkers = shuffle(rng, input.markers);
  // Phase 3: the story cards that matter are dealt first. The deciding card breaks the killer's detail: in a room that
  // opens in Round 2 about 1 game in 3, Round 3 otherwise, never Round 1. One innocent left standing gets a card
  // backing them up, in Round 2 or 3; the other gets none. Then every round from 2 on gets at least one story card,
  // so where a story card turns up says nothing about which one it is.
  const killerUnit = unitOf.get(killer.id);
  const backed = standing[0] ? unitOf.get(standing[0].id) : undefined;
  const takeMarker = (round: Round) => {
    const i = freeMarkers.findIndex((m) => roundOf(m) === round);
    return i < 0 ? undefined : freeMarkers.splice(i, 1)[0];
  };
  const hasIn = (round: Round) => freeMarkers.some((m) => roundOf(m) === round);
  const storyCards: { round: Round; marker?: { number: number; roomKey: string }; detail: string; breaks?: true; text: string }[] = [];
  if (withStories && killerUnit) {
    const decRound: Round = hasIn(2) && (!hasIn(3) || rng() < 1 / 3) ? 2 : 3;
    storyCards.push({ round: decRound, marker: takeMarker(decRound), detail: killerUnit.detail.id, breaks: true, text: killerUnit.detail.breaks });
    if (backed) {
      const options = ([2, 3] as Round[]).filter(hasIn);
      const r = options.length ? pick(rng, options) : (pick(rng, [2, 3]) as Round);
      storyCards.push({ round: r, marker: takeMarker(r), detail: backed.detail.id, text: backed.detail.confirm[0] });
    }
  }
  // Cleared guests' details, for the other story cards: each backed up once, then (if there are cards to spare) twice.
  const clearedUnits = shuffle(rng, units.filter((u) => u !== killerUnit && u !== backed && !u.ids.some((id) => standing.some((x) => x.id === id))));
  const confirms: { detail: string; text: string }[] = [...clearedUnits.map((u) => ({ detail: u.detail.id, text: u.detail.confirm[0] })), ...clearedUnits.map((u) => ({ detail: u.detail.id, text: u.detail.confirm[1] }))];
  for (const round of [2, 3] as Round[]) {
    if (withStories && confirms.length && hasIn(round) && !storyCards.some((c) => c.round === round)) storyCards.push({ round, marker: takeMarker(round), ...confirms.shift()! });
  }
  // The Don's stash: one card, in any room, when there are cards enough to spare one.
  const stashMarker = withStories && input.markers.length >= 6 && freeMarkers.length > 0 ? freeMarkers.splice(Math.floor(rng() * freeMarkers.length), 1)[0] : undefined;
  const markerFor = (round: Round, d: Draft) => {
    const i = freeMarkers.findIndex((m) => roundOf(m) === round && m.roomKey !== d.roomKey);
    return i < 0 ? undefined : freeMarkers.splice(i, 1)[0];
  };
  for (const round of [1, 2, 3] as Round[]) {
    for (const d of byRound[round]) {
      const m = isSmall(d.kind) ? markerFor(round, d) : undefined;
      if (m) put({ id: id(), kind: d.kind, text: "", elim: d.elim, round, channel: "marker", markerNumber: m.number }, d);
      else if (round === 1 && d.by === 1) continue;
      else put({ id: id(), kind: d.kind, text: "", elim: d.elim, round: round === 1 ? 2 : round, channel: "tv" }, d);
    }
  }

  // 6. Red herrings at innocents who get cleared later (two in bigger games), then dead ends on the spare markers.
  const clearedIn = (sid: string) => Math.min(...placed.filter((c) => c.elim.suspects.includes(sid)).map((c) => c.round));
  // Only at someone the evidence does clear later (never at one left standing: that would never be answered).
  const herrings = shuffle(rng, innocents.filter((s) => Number.isFinite(clearedIn(s.id)) && clearedIn(s.id) > 1)).slice(0, input.suspects.length >= 10 ? 2 : 1);
  for (const h of herrings) {
    const clearRound = clearedIn(h.id);
    const i = freeMarkers.findIndex((m) => roundOf(m) < clearRound);
    const d: Draft = { kind: "herring", lines: S.herring as Line<string[]>[], deck: "h", args: [h.name], elim: NONE };
    if (i >= 0) {
      const m = freeMarkers.splice(i, 1)[0];
      put({ id: id(), kind: "herring", text: "", elim: NONE, round: roundOf(m), channel: "marker", markerNumber: m.number, pointsAt: h.id }, d);
    } else if (clearRound === 3) {
      put({ id: id(), kind: "herring", text: "", elim: NONE, round: 2, channel: "tv", pointsAt: h.id }, d);
    }
  }
  // Phase 3: the story cards (on their cards, or on the TV when the house has no card for them), the stash, at most
  // one comedy card, and every card left over backs up a cleared guest's story.
  for (const c of storyCards) {
    const facts: ClueFacts = { detail: c.detail, ...(c.breaks ? { breaks: true } : {}) };
    if (c.marker) placed.push({ id: id(), kind: "story", text: c.text, elim: NONE, round: c.round, channel: "marker", markerNumber: c.marker.number, facts });
    else placed.push({ id: id(), kind: "story", text: c.text, elim: NONE, round: c.round, channel: "tv", facts });
  }
  if (stashMarker) placed.push({ id: id(), kind: "stash", text: STASH.found, elim: NONE, round: roundOf(stashMarker), channel: "marker", markerNumber: stashMarker.number });
  const flavor = shuffle(rng, S.flavor);
  let f = 0;
  let comedy = 0;
  while (freeMarkers.length) {
    const m = freeMarkers.shift()!;
    if (withStories && (comedy >= 1 || rng() < 0.5) && confirms.length) {
      const c = confirms.shift()!;
      placed.push({ id: id(), kind: "story", text: c.text, elim: NONE, round: roundOf(m), channel: "marker", markerNumber: m.number, facts: { detail: c.detail } });
      continue;
    }
    comedy++;
    placed.push({ id: id(), kind: "flavor", text: flavor[f++ % flavor.length], elim: NONE, round: roundOf(m), channel: "marker", markerNumber: m.number });
  }
  // The twist reads last on the final drop.
  placed.push({ id: id(), kind: "twist", text: twist.text!, elim: twist.elim, round: 3, channel: "tv" });

  // 7. Oct 18: the words, now that the night is laid out. Room clears first (each says the room was sealed, or full of
  // people); then every alibi and weapon clear picks a sentence that fits them: nobody was where the Don died or was
  // found, in a sealed room, or in a room the evidence hasn't yet shown full of people.
  const night: Night = { murderRoom: sol.roomKey, bodyRoom: body.key, sealed: new Set(), crowded: new Map() };
  for (const c of placed) {
    const d = later.get(c.id);
    if (!d || c.kind !== "room") continue;
    const r = render(say, d as Required<Pick<Draft, "lines" | "deck" | "args">>, () => true);
    Object.assign(c, r);
    if (r.facts.seal) night.sealed.add(c.elim.rooms[0]);
    if (r.facts.crowd) night.crowded.set(c.elim.rooms[0], Math.min(night.crowded.get(c.elim.rooms[0]) ?? 3, c.round) as Round);
  }
  for (const c of placed) {
    const d = later.get(c.id);
    if (!d || c.kind === "room") continue;
    Object.assign(c, render(say, d as Required<Pick<Draft, "lines" | "deck" | "args">>, (l) => placesFit(input.rooms, l.at, c.round, night)));
  }

  // 8. Briefings for every phone. Oct 20: no motives (Heston: "Motives: cut them"); older screens read an empty one.
  const ex = input.exhibits.find((e) => e.id === sol.exhibitId)!;
  const room = input.rooms.find((r) => r.key === sol.roomKey)!;
  const herringClue = placed.find((c) => c.kind === "herring");
  const herringAt = herringClue?.pointsAt;
  const accompliceName = sol.accompliceId ? name.get(sol.accompliceId) : undefined;
  // Oct 17 (D5): a game too small for a jail vote doesn't mention jail.
  const noJail = (lines: string[]) => (hasJailVote(input.suspects.length) ? lines : lines.filter((l) => !/\bjail/i.test(l)));
  const briefings: Briefing[] = input.suspects.map((s) => {
    if (s.id === sol.killerId) {
      const lines = S.killerLines({
        weapon: ex.name,
        room: room.label,
        ownWeapon: ex.ownerId === s.id,
        herringName: herringAt ? name.get(herringAt) : undefined,
        accompliceName,
      });
      return { playerId: s.id, role: "killer", motive: "", lines: noJail(lines) };
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
      return { playerId: s.id, role: "accomplice", motive: "", lines: noJail(lines) };
    }
    return { playerId: s.id, role: "innocent", motive: "", lines: noJail(sol.accompliceId ? S.innocentLinesAcc : S.innocentLines) };
  });

  const open: Open = { suspects: standing.length + 1, exhibits: weaponsStanding.length + 1, rooms: roomsStanding.length + 1 };
  // 9. Phase 3: everyone's story, the debts, and the two late tips (about guests still standing after Round 2).
  const stories: Story[] = withStories
    ? input.suspects.map((s) => {
        const u = unitOf.get(s.id)!;
        const other = u.ids.find((x) => x !== s.id);
        return { playerId: s.id, spot: u.spot.key, ...(other ? { withId: other } : {}), detail: u.detail.id, ...storyWords(u, s.id, name) };
      })
    : [];
  const left = remainingAfter(input, placed, 2).suspects;
  const lateTips = withStories ? drawTips(rng, tone, input.suspects.filter((s) => left.has(s.id))) : [];
  const debts = withStories ? drawDebts(rng, input.suspects.map((s) => s.id)) : [];
  return { solution: sol, bodyRoomKey: body.key, roomOrder: order, clues: placed, tips: [], briefings, attempts: 1, open, stories, debts, lateTips };
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
  // Phase 3 (Oct 20, Heston: "yes still 3 suspects"): exactly 3 standing, the killer and two innocents (2 in games of
  // 3 or 4). The stories decide between them.
  const suspects = N <= 4 ? 2 : 3;
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
    // (Phase 3: the suspects stay at 3; only the weapons and rooms narrow.)
    if (attempt === 80 || attempt === 140) plan = { suspects: plan.suspects, exhibits: 1, rooms: 1 };
    const cf = tryBuild(full, rng, sol, plan);
    const v = validateCase(full, cf);
    if (v.ok) return { ...cf, attempts: attempt, validation: v };
    last = v;
  }
  throw new Error(`Couldn't build a solvable case: ${last?.problems.join(" ")}`);
}
