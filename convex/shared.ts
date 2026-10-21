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
 * Which vote ends a round. Oct 20 (Heston: jail lasts one round, no release vote): Round 2 ends in the jail vote (games
 * with MIN_JAIL_VOTE guests or more); the jailbird sits out Round 3 and rejoins for the lock-in. anyoneJailed is kept
 * for older callers.
 */
export function voteAfterRound(round: number, _anyoneJailed: boolean, guests = Infinity): "jail" | "release" | null {
  if (round === 2) return hasJailVote(guests) ? "jail" : null;
  return null;
}

/** Older games: the last call after most guests were Ready (Oct 17, I4). Since Oct 20 a round waits for everyone. */
export const LAST_CALL_MS = 30_000;

/** Timed games: the lock-in gets a shorter clock than the evidence rounds. */
export const ACCUSE_MAX_MINUTES = 5;

/**
 * I5 (Oct 17): in timer games Round 3 is shorter (most of the house has been searched by then): three quarters of the
 * round length, 3 minutes at least. Rounds 1 and 2 run the full length.
 */
export const roundMinutesFor = (roundMinutes: number, round: number) => (round === 3 ? Math.max(3, Math.round(roundMinutes * 0.75)) : roundMinutes);

/** Rough play time shown next to the round length: intro, three rounds, accusations, reveal and awards. */
export function estimateMinutes(pacing: { mode: "ready" | "timer"; roundMinutes: number }): string {
  if (pacing.mode === "ready") return "about 60 to 80 min of play, untimed";
  const rounds = [1, 2, 3].reduce((t, r) => t + roundMinutesFor(pacing.roundMinutes, r), 0);
  return `about ${16 + rounds} min of play`;
}

/** The printable PDF holds this many QR cards. A game uses cards 1 to N, where N is set in the game menu. */
export const MAX_CARDS = 36;

/** A starting point for how many markers to use: about 3 per room. */
export function suggestedMarkers(rooms: number): number {
  return Math.min(MAX_CARDS, rooms * 3);
}
