// Timings shared by the server and the TV screen. Pure constants, safe to import anywhere.

/** The TV intro after Start: four beats. Round 1's timer starts when it ends (or when the host skips it). */
export const INTRO_MS = 60_000;
export const INTRO_BEATS = 4;

/**
 * The reveal on the TV, in ms from the moment it starts: the title card, "The killer is…",
 * the name, the exhibit and room, (v2) the accomplice in a killer + accomplice game, then the verdict.
 * Phones keep the answer hidden until the verdict.
 */
export type RevealTimes = { card: number; line: number; name: number; how: number; accomplice: number | null; verdict: number };
export const REVEAL: RevealTimes = { card: 0, line: 4_300, name: 9_000, how: 14_000, accomplice: null, verdict: 20_000 };
/**
 * With an accomplice: their name after the weapon and the room, then the verdict. The adult script's lead-in and
 * names run longer, so it gets a few more seconds.
 */
export const REVEAL_ACC: RevealTimes = { ...REVEAL, accomplice: 20_000, verdict: 27_000 };
export const REVEAL_ACC_ADULT: RevealTimes = { ...REVEAL_ACC, verdict: 31_000 };
export const revealTimes = (accomplice: boolean, tone: "classic" | "adult" = "classic"): RevealTimes =>
  !accomplice ? REVEAL : tone === "adult" ? REVEAL_ACC_ADULT : REVEAL_ACC;
export const REVEAL_VERDICT_MS = REVEAL.verdict;

/** The TV title cards are 4 seconds (Lights Out is 3). Scenes fade in after them. */
export const CARD_MS = 4_000;
export const LIGHTS_OUT_MS = 3_000;

/**
 * The jail and release votes (v2): how long the phones stay open, and, after it closes, when the TV shows who
 * voted for whom, the verdict, and when the night moves on.
 */
export const VOTE = { ms: 90_000, lastCallMs: 15_000, tallyMs: 0, verdictAtMs: 6_000, nextMs: 14_000 } as const;

/** Accusations get a shorter clock than the evidence rounds. */
export const ACCUSE_MAX_MINUTES = 5;

/** Rough play time shown next to the round length: intro, three rounds, accusations, reveal and awards. */
export function estimateMinutes(pacing: { mode: "ready" | "timer"; roundMinutes: number }): string {
  if (pacing.mode === "ready") return "about 45 to 60 min of play";
  return `about ${16 + 3 * pacing.roundMinutes} min of play`;
}

/** The printable PDF holds this many QR cards. A game uses cards 1 to N, where N is set in the game menu. */
export const MAX_CARDS = 36;

/** A starting point for how many markers to use: about 3 per room. */
export function suggestedMarkers(rooms: number): number {
  return Math.min(MAX_CARDS, rooms * 3);
}
