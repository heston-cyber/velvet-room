// Timings shared by the server and the TV screen. Pure constants, safe to import anywhere.

/**
 * The reveal on the TV, in ms from the moment it starts: the title card, "The killer is…",
 * the name, the exhibit and room, (v2) the accomplice in a killer + accomplice game, then the verdict.
 * Phones keep the answer hidden until the verdict.
 */
export type RevealTimes = { card: number; line: number; name: number; how: number; accomplice: number | null; verdict: number };
// Each step waits for the longest recorded version of the line before it (Oct 16, after lines ran into each other):
// classic "The killer is…" runs up to 4.9 s, adult up to 8.8 s; the accomplice lead-in up to 3.4 s / 6.9 s.
export const REVEAL: RevealTimes = { card: 0, line: 4_300, name: 9_800, how: 14_500, accomplice: null, verdict: 20_500 };
export const REVEAL_ADULT: RevealTimes = { card: 0, line: 4_300, name: 13_600, how: 19_000, accomplice: null, verdict: 25_500 };
/** With an accomplice: their name after the weapon and the room, then the verdict. */
export const REVEAL_ACC: RevealTimes = { ...REVEAL, accomplice: 20_500, verdict: 27_500 };
export const REVEAL_ACC_ADULT: RevealTimes = { ...REVEAL_ADULT, accomplice: 25_500, verdict: 36_000 };
export const revealTimes = (accomplice: boolean, tone: "classic" | "adult" = "classic"): RevealTimes =>
  tone === "adult" ? (accomplice ? REVEAL_ACC_ADULT : REVEAL_ADULT) : accomplice ? REVEAL_ACC : REVEAL;

/** The Locked Up! card after a jail verdict (src/tv/media.ts CARD_MS.lockedup). */
export const LOCKED_UP_MS = 3_000;

/** The TV title cards are 4 seconds (Lights Out is 3). Scenes fade in after them. */
export const CARD_MS = 4_000;
export const LIGHTS_OUT_MS = 3_000;

/**
 * The jail and release votes (v2): how long the phones stay open, and, after it closes, when the TV shows who
 * voted for whom, the verdict, and when the night moves on.
 */
// autoVerdictMs (Oct 17): when the evidence already cleared the guest in jail, the release vote doesn't happen; the
// TV shows the Release card and the verdict straight away (D10).
export const VOTE = { ms: 90_000, lastCallMs: 15_000, tallyMs: 0, verdictAtMs: 7_500, nextMs: 16_000, autoVerdictMs: 4_500, autoNextMs: 11_000 } as const;

/** The fewest guests in the game for a jail vote (Heston, Oct 17, D5: "no jail vote under 5 guests"). */
export const MIN_JAIL_VOTE = 5;
export const hasJailVote = (guests: number) => guests >= MIN_JAIL_VOTE;

/**
 * Which vote ends a round (Heston, Oct 16: "jail vote only can happen on round 2, no votes to release. round 3 no
 * voting to put anyone in jail, but we can vote to release. (so its rnd 2 vote to lock up, rnd 3 vote to release)").
 * Round 1 ends with no vote; Round 3's release vote comes at its end, right before the lock-in, and only if someone is
 * in jail. Jailing is never required: nobody is always on the ballot. Games with fewer than MIN_JAIL_VOTE guests in
 * them have no votes at all (Oct 17).
 */
export function voteAfterRound(round: number, anyoneJailed: boolean, guests = Infinity): "jail" | "release" | null {
  if (round === 2) return hasJailVote(guests) ? "jail" : null;
  if (round === 3 && anyoneJailed) return "release";
  return null;
}

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
