// Phase 3 (Oct 20): the stories engine. Thousands of simulated nights at 4, 6, 8 and 10 guests (and 16), checked by
// the engine's own rules and by an independent reader that works only from the words on the phones and the cards, plus
// a mutation check that proves both catch a broken story.
import { describe, expect, test } from "vitest";
import { buildCase, openRound, storyProblems } from "../convex/engine/build";
import { fakeCast, roomsN, ROOMS_5 } from "../convex/engine/fake";
import { seeded } from "../convex/engine/rng";
import { setupFor } from "../convex/engine/setup";
import { SPOTS } from "../convex/engine/stories";
import type { CaseFile, CaseInput } from "../convex/engine/types";

// ---------- an independent reader ----------

/** What's still possible after a round's public evidence (written apart from the engine). */
function standingAfter(input: CaseInput, cf: CaseFile, round: number) {
  const out = new Set(input.suspects.map((s) => s.id));
  for (const c of cf.clues) if (c.round <= round) c.elim.suspects.forEach((id) => out.delete(id));
  return out;
}

/** Spots that can't be in a game with a room of this kind (by the room's name). */
const ROOM_WORDS: Record<string, RegExp> = {
  kitchen: /kitchen|pantry/i,
  cardTable: /\bcards?\b|gaming|casino|poker|craps/i,
  coatCheck: /coat|cloak|foyer|entry|entrance|front|hall/i,
  hallway: /coat|cloak|foyer|entry|entrance|front|hall/i,
  restroom: /bath|powder|wash|restroom|lavatory/i,
  cellar: /cellar|basement/i,
  backStairs: /stair/i,
  roof: /roof|terrace/i,
  garage: /garage|carriage/i,
};

/** Details whose deciding card would contradict another detail's story (written apart from the engine's topics). */
const CLASHES: [string, string][] = [
  ["curb-uber", "ride-fare"],
  ["curb-uber", "ride-singing"],
  ["ride-fare", "ride-singing"],
];

type Read = { id: string; spotKey: string; partner: string | null; detail: string };

/** Reads every story from its words: where, alone or with whom, and the detail. */
function readStories(input: CaseInput, cf: CaseFile): { reads: Read[]; problems: string[] } {
  const problems: string[] = [];
  const reads: Read[] = [];
  for (const s of input.suspects) {
    const st = cf.stories?.find((x) => x.playerId === s.id);
    const m = st?.text.match(/^When the lights went out, you were (.+), (alone|with (.+?))\. (.+)$/);
    if (!m) {
      problems.push(`${s.name}: no story, or it doesn't read right`);
      continue;
    }
    const [, at, , partnerName, detailWords] = m;
    const spot = SPOTS.find((x) => x.at === at);
    const detail = spot?.details.find((d) => d.story === detailWords);
    if (!spot || !detail) {
      problems.push(`${s.name}: a spot or detail that isn't in the catalog`);
      continue;
    }
    const partner = partnerName ? input.suspects.find((x) => x.name === partnerName)?.id ?? "?" : null;
    reads.push({ id: s.id, spotKey: spot.key, partner, detail: detail.id });
  }
  return { reads, problems };
}

function independentProblems(input: CaseInput, cf: CaseFile): string[] {
  const { reads, problems: out } = readStories(input, cf);
  if (out.length) return out;
  const killer = cf.solution.killerId;
  const name = (id: string) => input.suspects.find((x) => x.id === id)!.name;
  const read = (id: string) => reads.find((r) => r.id === id)!;
  const end = standingAfter(input, cf, 3);
  const cleared = input.suspects.filter((s) => !end.has(s.id)).map((s) => s.id);
  // Spots: never a room in play, one guest each or a pair who name each other.
  for (const r of reads) {
    const words = ROOM_WORDS[r.spotKey];
    if (words && input.rooms.some((x) => words.test(x.label))) out.push(`${name(r.id)}'s story is in one of the game's rooms`);
    const there = reads.filter((x) => x.spotKey === r.spotKey);
    if (there.length > 2) out.push(`three at ${r.spotKey}`);
    if (there.length === 2 && !(r.partner && there.some((x) => x.id === r.partner) && read(r.partner).partner === r.id)) out.push(`two at ${r.spotKey} who aren't together`);
    if (r.partner && !there.some((x) => x.id === r.partner)) out.push(`${name(r.id)}'s partner was somewhere else`);
  }
  // Who's alone.
  if (read(killer).partner) out.push("the killer isn't alone");
  for (const id of end) if (read(id).partner) out.push(`${name(id)} is left standing with a partner`);
  for (const r of reads) if (r.partner && (end.has(r.id) || end.has(r.partner))) out.push("a pair with someone never cleared");
  const lone = cleared.filter((id) => !read(id).partner).length;
  if (lone < Math.min(cleared.length, input.suspects.length <= 6 ? 1 : 2)) out.push("too few cleared guests alone");
  // The cards, by their words.
  const confirmOf = new Map(SPOTS.flatMap((s) => s.details.flatMap((d) => d.confirm.map((t) => [t, d.id] as const))));
  const breakOf = new Map(SPOTS.flatMap((s) => s.details.map((d) => [d.breaks, d.id] as const)));
  const breaking = cf.clues.filter((c) => breakOf.has(c.text));
  if (breaking.length !== 1) out.push(`${breaking.length} cards break a story`);
  for (const c of breaking) {
    const d = breakOf.get(c.text)!;
    if (d !== read(killer).detail) out.push("the deciding card breaks an innocent's story");
    if (c.round < 2) out.push("the deciding card is out in Round 1");
    for (const r of reads) if (r.id !== killer && (r.detail === d || CLASHES.some(([a, b]) => (a === d && b === r.detail) || (b === d && a === r.detail)))) out.push(`the deciding card contradicts ${name(r.id)}'s true story`);
  }
  const backups = (id: string) => cf.clues.filter((c) => confirmOf.get(c.text) === read(id).detail).length;
  if (backups(killer)) out.push("a card backs up the killer's cover");
  const innocentsLeft = [...end].filter((id) => id !== killer);
  const backed = innocentsLeft.filter((id) => backups(id) > 0);
  if (backed.length !== 1) out.push(`${backed.length} innocents left standing are backed up`);
  if (backed.some((id) => backups(id) !== 1)) out.push("the backed-up innocent has more than one card");
  for (const id of innocentsLeft.filter((x) => backups(x) === 0)) {
    if (reads.some((r) => r.id !== id && r.detail === read(id).detail)) out.push("another guest backs up the unconfirmed innocent");
  }
  for (const c of cf.clues.filter((x) => confirmOf.has(x.text) || breakOf.has(x.text))) {
    if (input.suspects.some((s) => c.text.includes(s.name))) out.push("a story card names a guest");
  }
  // Alibis say where people were, the same as their stories, and clear a pair together.
  for (const c of cf.clues.filter((x) => ["suspect", "suspectPair", "suspectTrio"].includes(x.kind))) {
    for (const id of c.elim.suspects) {
      const r = read(id);
      const at = SPOTS.find((s) => s.key === r.spotKey)!.at;
      if (!c.text.includes(name(id)) || !c.text.includes(at)) out.push(`an alibi for ${name(id)} doesn't say ${at}`);
      if (r.partner && !c.elim.suspects.includes(r.partner)) out.push(`an alibi clears ${name(id)} without their partner`);
    }
  }
  // Late tips and debts.
  const afterR2 = standingAfter(input, cf, 2);
  const tips = cf.lateTips ?? [];
  if (tips.length !== 2) out.push(`${tips.length} late tips`);
  if (new Set(tips.map((t) => t.aboutId)).size !== tips.length) out.push("both tips about one guest");
  for (const t of tips) {
    if (!afterR2.has(t.aboutId)) out.push("a tip about someone already cleared");
    if (!t.text.includes(name(t.aboutId))) out.push("a tip that doesn't name its guest");
    if (SPOTS.some((s) => t.text.includes(s.at))) out.push("a tip says where someone was");
  }
  const debts = cf.debts ?? [];
  if (debts.length < 2 || debts.length > 3) out.push(`${debts.length} debts`);
  for (const d of debts) if (d.fromId === d.toId || ![100, 200, 300].includes(d.amount)) out.push("a bad debt");
  if (new Set(debts.map((d) => [d.fromId, d.toId].sort().join())).size !== debts.length) out.push("two debts between the same guests");
  return out;
}

// ---------- the simulations ----------

const SIZES: [number, number][] = [
  [4, 5000],
  [6, 5000],
  [8, 5000],
  [10, 5000],
  [16, 1000],
];

describe("Phase 3: the stories engine", () => {
  test(`${SIZES.reduce((n, [, k]) => n + k, 0).toLocaleString()} simulated nights at 4, 6, 8, 10 and 16 guests: every story rule holds, read two ways`, () => {
    const failures: string[] = [];
    let decidingR2 = 0;
    let decidingBoth = 0;
    let pairs = 0;
    let guestsTotal = 0;
    for (const [guests, n] of SIZES) {
      for (let seed = 1; seed <= n; seed++) {
        const rng = seeded(seed * 7907 + guests * 13);
        const setup = setupFor(guests);
        const rooms = seed % 3 === 0 ? roomsN(Math.min(8, setup.rooms + 1)) : seed % 3 === 1 ? ROOMS_5 : roomsN(setup.rooms);
        const input: CaseInput = { ...fakeCast({ rng, guests, rooms, markers: setup.markers }), search: "waves", tone: seed % 2 ? "adult" : "classic" };
        let cf: CaseFile;
        try {
          cf = buildCase(input, rng);
        } catch (e) {
          failures.push(`${guests}g/${seed}: ${(e as Error).message}`);
          continue;
        }
        const tag = `${guests}g/${rooms.length}r/seed${seed}`;
        for (const p of storyProblems(input, cf)) failures.push(`${tag} (engine): ${p}`);
        for (const p of independentProblems(input, cf)) failures.push(`${tag} (reader): ${p}`);
        // exactly 3 standing (2 in games of 3 or 4)
        const end = standingAfter(input, cf, 3);
        if (end.size !== (guests <= 4 ? 2 : 3)) failures.push(`${tag}: ${end.size} left standing`);
        // the card mix at the recommended setup: one stash, at most one comedy card, story cards in Rounds 2 and 3
        const cards = cf.clues.filter((c) => c.channel === "marker");
        if (cards.filter((c) => c.kind === "stash").length !== 1) failures.push(`${tag}: no stash card`);
        if (cards.filter((c) => c.kind === "flavor").length > 1) failures.push(`${tag}: more than one comedy card`);
        const opens = (m: number) => openRound(input.markers.find((x) => x.number === m)!.roomKey, cf.roomOrder, "waves");
        for (const round of [2, 3]) {
          const roomHasCards = input.markers.some((m) => openRound(m.roomKey, cf.roomOrder, "waves") === round);
          if (roomHasCards && !cards.some((c) => c.kind === "story" && opens(c.markerNumber!) === round)) failures.push(`${tag}: no story card in Round ${round}`);
        }
        // where the deciding card lands
        const dec = cf.clues.find((c) => c.facts?.breaks)!;
        const both = [2, 3].every((r) => input.markers.some((m) => openRound(m.roomKey, cf.roomOrder, "waves") === r));
        if (both && dec.channel === "marker") {
          decidingBoth++;
          if (dec.round === 2) decidingR2++;
        }
        pairs += (cf.stories ?? []).filter((s) => s.withId).length;
        guestsTotal += guests;
      }
    }
    expect(failures.slice(0, 15)).toEqual([]);
    // The deciding card is in a Round 2 room about 1 game in 3.
    expect(decidingR2 / decidingBoth).toBeGreaterThan(0.25);
    expect(decidingR2 / decidingBoth).toBeLessThan(0.42);
    // Plenty of guests pair up.
    expect(pairs / guestsTotal).toBeGreaterThan(0.2);
  }, 240_000);

  test("mutation check: a broken story is caught by both the engine's rules and the independent reader", () => {
    const rng = seeded(4242);
    const input: CaseInput = { ...fakeCast({ rng, guests: 10, rooms: ROOMS_5, markers: 12 }), search: "waves" };
    const base = buildCase(input, rng);
    expect(storyProblems(input, base)).toEqual([]);
    expect(independentProblems(input, base)).toEqual([]);
    const clone = (): CaseFile => JSON.parse(JSON.stringify(base));
    const killer = base.solution.killerId;
    const end = [...standingAfter(input, base, 3)];
    const story = (cf: CaseFile, id: string) => cf.stories!.find((s) => s.playerId === id)!;
    const innocentLeft = end.filter((id) => id !== killer);
    const unbacked = innocentLeft.find((id) => !base.clues.some((c) => c.kind === "story" && !c.facts?.breaks && c.facts?.detail === story(base, id).detail))!;
    const someCleared = input.suspects.find((s) => !end.includes(s.id) && !story(base, s.id).withId)!.id;
    const detailOf = (id: string) => SPOTS.flatMap((s) => s.details).find((d) => d.id === story(base, id).detail)!;

    const mutations: [string, (cf: CaseFile) => void][] = [
      [
        "an innocent at the killer's spot",
        (cf) => {
          const k = story(cf, killer);
          Object.assign(story(cf, someCleared), { spot: k.spot, detail: k.detail, text: k.text });
        },
      ],
      [
        "the killer with a partner",
        (cf) => {
          const k = story(cf, killer);
          k.withId = someCleared;
          k.text = k.text.replace(", alone.", `, with ${input.suspects.find((s) => s.id === someCleared)!.name}.`);
        },
      ],
      [
        "no deciding card",
        (cf) => {
          const c = cf.clues.find((x) => x.facts?.breaks)!;
          c.kind = "flavor";
          c.text = "A bent hairpin on the stairs. Half the room wears them. It proves nothing.";
          delete c.facts;
        },
      ],
      [
        "a card backing up the unconfirmed innocent",
        (cf) => {
          cf.clues.push({ id: "x1", kind: "story", text: detailOf(unbacked).confirm[0], elim: { suspects: [], exhibits: [], rooms: [] }, round: 3, channel: "tv", facts: { detail: story(cf, unbacked).detail } });
        },
      ],
      [
        "the deciding card breaks an innocent's story",
        (cf) => {
          const c = cf.clues.find((x) => x.facts?.breaks)!;
          c.text = detailOf(unbacked).breaks;
          c.facts = { detail: story(cf, unbacked).detail, breaks: true };
        },
      ],
      [
        "an alibi says the wrong place",
        (cf) => {
          const c = cf.clues.find((x) => x.facts?.spots)!;
          const [pid] = Object.keys(c.facts!.spots!);
          const mine = SPOTS.find((s) => s.key === story(cf, pid).spot)!;
          const other = SPOTS.find((s) => !cf.stories!.some((x) => x.spot === s.key))!;
          c.text = c.text.replace(mine.at, other.at);
          c.facts!.spots![pid] = other.key;
        },
      ],
      [
        "a story card names a guest",
        (cf) => {
          const c = cf.clues.find((x) => x.kind === "story" && !x.facts?.breaks)!;
          c.text = `${c.text} ${input.suspects[0].name} saw it.`;
        },
      ],
      [
        "both late tips about one guest",
        (cf) => {
          cf.lateTips![1] = { ...cf.lateTips![1], aboutId: cf.lateTips![0].aboutId, text: cf.lateTips![0].text };
        },
      ],
      [
        "the deciding card in Round 1",
        (cf) => {
          cf.clues.find((x) => x.facts?.breaks)!.round = 1;
        },
      ],
    ];
    for (const [what, mutate] of mutations) {
      const cf = clone();
      mutate(cf);
      expect(storyProblems(input, cf).length, `engine misses: ${what}`).toBeGreaterThan(0);
      expect(independentProblems(input, cf).length, `reader misses: ${what}`).toBeGreaterThan(0);
    }
  });
});
