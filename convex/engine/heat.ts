// Phase 4 (Oct 21): the heat, the Round 2 pick and the killer's plant. Pure: no database.
// Decided Oct 20 (claude/velvet-room-rebuild-plan.md, sections 1, 2 and 4):
// - Each guest has one heat tag. Three or more tags on someone puts the heat on them (the TV shows it, with a sound),
//   at every group size. Tags stay until moved or dropped, and the heat goes away the moment someone drops below 3.
// - Tags are anonymous. A tag on a guest the evidence has cleared quietly drops: here, the public evidence (the TV's
//   clues so far), since a card's words stay on the phone that scanned it.
// - The heat shows in Rounds 1 to 3 only; it goes away at the lock-in.
// - Round 2: every phone gets the same "pick one" prompt. Innocents move their tag (or keep it); the killer may frame
//   someone. Framing is optional and can change until the late tips land (when the jail vote opens).
// - The two late tips land at the end of Round 2. If the killer framed someone, one of them is the plant, worded like
//   the real ones; it replaces the real tip that already names that guest, or else one of the two at random.
import { shuffle } from "./rng";
import { TIPS } from "./stories";
import type { CaseFile, Rng } from "./types";
import type { LateTip } from "./stories";

/** Tags it takes to put the heat on someone. */
export const HEAT_AT = 3;

/** Guests the public evidence has cleared by this round: everyone a TV clue has ruled out so far. */
export function publiclyCleared(cf: CaseFile, round: number): Set<string> {
  const out = new Set<string>();
  for (const c of cf.clues) if (c.channel === "tv" && c.round <= round) c.elim.suspects.forEach((id) => out.add(id));
  return out;
}

export type Tag = { from: string; to: string | undefined; at?: number };

/**
 * The tags that count: from a guest in the game, on another guest in the game the evidence hasn't cleared. A tag on a
 * cleared guest drops (the tagger's phone says so and they can tag someone else).
 */
export function liveTags(tags: Tag[], inGame: Set<string>, cleared: Set<string>): Tag[] {
  return tags.filter((t) => t.to && t.to !== t.from && inGame.has(t.from) && inGame.has(t.to) && !cleared.has(t.to));
}

/** Who has the heat, and since when: the moment the third of their current tags landed. */
export function heatOn(tags: Tag[]): { id: string; tags: number; since: number }[] {
  const by = new Map<string, number[]>();
  for (const t of tags) by.set(t.to!, [...(by.get(t.to!) ?? []), t.at ?? 0]);
  return [...by]
    .filter(([, at]) => at.length >= HEAT_AT)
    .map(([id, at]) => ({ id, tags: at.length, since: at.sort((a, b) => a - b)[HEAT_AT - 1] }))
    .sort((a, b) => a.since - b.since);
}

/** The heat shows during Rounds 1 to 3 of a game in play, and never at the lock-in. */
export const heatShows = (status: string, round: number) => status === "playing" && round >= 1 && round <= 3;

/** A late tip as it lands on the TV. plant: the killer's (never sent to a phone or the TV before the reveal). */
export type ShownTip = { aboutId: string; text: string; plant: boolean };

/**
 * The two late tips with the killer's plant swapped in. frame: who the killer framed (null: no plant tonight). The
 * plant uses a tip template neither real tip uses, in the game's script, so its wording gives nothing away.
 */
export function plantTips(
  real: LateTip[],
  tone: "classic" | "adult",
  frame: { id: string; name: string } | null,
  names: Map<string, string>,
  rng: Rng,
): ShownTip[] {
  const out: ShownTip[] = real.map((t) => ({ aboutId: t.aboutId, text: t.text, plant: false }));
  if (!frame) return out;
  const templates = TIPS[tone];
  // Which template each real tip used (so the plant never repeats one).
  const usedBy = (t: ShownTip) => templates.findIndex((f) => f(names.get(t.aboutId) ?? "") === t.text);
  let at = out.findIndex((t) => t.aboutId === frame.id);
  if (at < 0) at = out.length ? Math.floor(rng() * out.length) : 0;
  const keep = out.filter((_, i) => i !== at);
  const used = new Set(out.map(usedBy));
  const free = shuffle(
    rng,
    templates.map((_, i) => i).filter((i) => !used.has(i)),
  );
  const pick = free[0] ?? Math.floor(rng() * templates.length);
  const plant = { aboutId: frame.id, text: templates[pick](frame.name), plant: true };
  // The plant takes the replaced tip's place, so the order says nothing either.
  const shown = [...keep];
  shown.splice(Math.min(at, shown.length), 0, plant);
  return shown;
}

/** The phone's debt lines for one guest: what they owe and what they're owed. Always true, the killer's too. */
export function debtLines(debts: { fromId: string; toId: string; amount: number }[], me: string, name: (id: string) => string): string[] {
  const out: string[] = [];
  for (const d of debts) {
    if (d.fromId === me) out.push(`You owe ${name(d.toId)} $${d.amount}.`);
    else if (d.toId === me) out.push(`${name(d.fromId)} owes you $${d.amount}.`);
  }
  return out;
}
