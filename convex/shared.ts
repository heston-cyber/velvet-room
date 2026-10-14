// Timings shared by the server and the TV screen. Pure constants, safe to import anywhere.

/** The TV intro after Start: four beats. Round 1's timer starts when it ends (or when the host skips it). */
export const INTRO_MS = 60_000;
export const INTRO_BEATS = 4;

/**
 * The reveal on the TV, in ms from the moment it starts: the title card, "The killer is…",
 * the name, the exhibit and room, then the verdict. Phones keep the answer hidden until the verdict.
 */
export const REVEAL = { card: 0, line: 4_300, name: 9_000, how: 14_000, verdict: 20_000 } as const;
export const REVEAL_VERDICT_MS = REVEAL.verdict;

/** The TV title cards are 4 seconds (Lights Out is 3). Scenes fade in after them. */
export const CARD_MS = 4_000;
export const LIGHTS_OUT_MS = 3_000;

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
