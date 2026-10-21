// Solo test mode (Oct 20, Heston: "build it as a feature now in the setup menu. so i can play and test the game with
// fake Bot players who make choices in game as well so i can solo test the game for real."). What a bot decides,
// from only what it could know at a real party: the TV's evidence, the cards it scanned itself, and its own role.
// Pure functions (no database), so the tests can check them directly. convex/bots.ts does the acting.
import type { CaseFile } from "./engine/types";

export type BotStyle = "sharp" | "careless";

/** How fast bots play. Each tick, every bot takes its next step with this chance. */
export const BOT_SPEEDS = {
  // About one step a minute and a half each, like a guest who's also chatting and getting a drink.
  party: { tickMs: 12_000, act: 0.14 },
  // Quick checks: rounds of a couple of minutes.
  fast: { tickMs: 2_500, act: 0.5 },
} as const;
export type BotSpeed = keyof typeof BOT_SPEEDS;

export const MIN_BOTS = 2;
/** The cast has 16 drawings; the human can always sign up as a mystery guest as well. */
export const MAX_BOTS = 15;
export const DEFAULT_BOTS = 7;
/** A bot game stops acting this long after it was made, so a forgotten test can't run up the server forever. */
export const BOT_LIFETIME_MS = 8 * 60 * 60 * 1000;

/** About six bots in ten play sharp: they reason from what they've seen. The rest guess. */
export const styleFor = (rng: () => number): BotStyle => (rng() < 0.6 ? "sharp" : "careless");

export type Known = { suspects: Set<string>; exhibits: Set<string>; rooms: Set<string> };

/** Everything a bot has seen ruled out by now: every TV clue so far, and the cards it scanned. */
export function knownElims(cf: CaseFile, round: number, scanned: Set<number>): Known {
  const out: Known = { suspects: new Set(), exhibits: new Set(), rooms: new Set() };
  for (const c of cf.clues) {
    if (c.round > round) continue;
    const seen = c.channel === "tv" || (c.markerNumber !== undefined && scanned.has(c.markerNumber));
    if (!seen) continue;
    c.elim.suspects.forEach((x) => out.suspects.add(x));
    c.elim.exhibits.forEach((x) => out.exhibits.add(x));
    c.elim.rooms.forEach((x) => out.rooms.add(x));
  }
  return out;
}

const pick = <T,>(rng: () => number, xs: T[]): T | undefined => (xs.length ? xs[Math.floor(rng() * xs.length)] : undefined);

export type Who = { self: string; killerId: string; style: BotStyle };

/**
 * Who a bot names. Sharp bots pick among the suspects their evidence hasn't cleared; careless bots pick anyone.
 * The killer names someone else, preferring people still under suspicion, so it looks like they reasoned it out.
 */
export function chooseSuspect(rng: () => number, who: Who, all: string[], known: Known): string | undefined {
  const others = all.filter((id) => id !== who.self);
  const open = others.filter((id) => !known.suspects.has(id));
  if (who.self === who.killerId) return pick(rng, open.length ? open : others);
  if (who.style === "careless") return pick(rng, others);
  return pick(rng, open.length ? open : others);
}

/** A weapon or room the same way. The killer avoids the real answer when it can (their last sabotage). */
export function chooseThing(rng: () => number, who: Who, all: string[], ruledOut: Set<string>, truth: string): string | undefined {
  const open = all.filter((x) => !ruledOut.has(x));
  if (who.self === who.killerId) {
    const wrong = open.filter((x) => x !== truth);
    return pick(rng, wrong.length ? wrong : all.filter((x) => x !== truth).length ? all.filter((x) => x !== truth) : all);
  }
  if (who.style === "careless") return pick(rng, all);
  return pick(rng, open.length ? open : all);
}

/** A jail vote: someone still under suspicion, or nobody (null) about a quarter of the time. */
export function chooseJail(rng: () => number, who: Who, candidates: string[], known: Known): string | null {
  if (rng() < (who.style === "careless" ? 0.3 : 0.25)) return null;
  const others = candidates.filter((id) => id !== who.self);
  const open = others.filter((id) => !known.suspects.has(id));
  if (who.self === who.killerId) return pick(rng, open.length ? open : others) ?? null;
  if (who.style === "careless") return pick(rng, others) ?? null;
  return pick(rng, open.length ? open : others) ?? null;
}

/**
 * How many of the cards in the open rooms a bot looks at before it taps Ready: about half, so between them the
 * bots find most of the evidence and each one knows only part of it.
 */
export const scanQuota = (openCards: number) => Math.max(1, Math.round(openCards * 0.5));
