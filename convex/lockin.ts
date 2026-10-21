// The lock-in's count (Oct 20, Heston: "across the board it's whatever has the most votes wins except for jailing
// someone, that takes a majority ... it should be who what where each respectively gets the most votes each").
// Pure functions, shared by the server and the tests.

/** How many lock-ins named each pick, most first. */
export function countPicks(picks: string[]): { pick: string; n: number }[] {
  const c = new Map<string, number>();
  for (const p of picks) c.set(p, (c.get(p) ?? 0) + 1);
  return [...c.entries()].map(([pick, n]) => ({ pick, n })).sort((a, b) => b.n - a.n);
}

/** The picks tied for the most votes (one when there's a clear winner, none when nobody picked). */
export function topPicks(picks: string[]): string[] {
  const counted = countPicks(picks);
  if (!counted.length) return [];
  return counted.filter((x) => x.n === counted[0].n).map((x) => x.pick);
}

export type PartResult = { top: string[]; won: boolean; tied: boolean };

/** One part of the lock-in (who, the weapon or the room): the most votes wins; a tie for the most is undecided. */
export function partResult(picks: string[], truth: string): PartResult {
  const top = topPicks(picks);
  return { top, won: top.length === 1 && top[0] === truth, tied: top.length > 1 };
}

// ---------- the runoff (Phase "the ending", Oct 21) ----------
// Heston, Oct 20: "If it's a tie on the person it starts the runoff, and the runoff vote is only on the person";
// "revote the tied part" (a weapon or room tie); "Killer walks yes" (a tie in the runoff); last words "only on a two
// person runoff, not the first lockin", and "they all go to a 3 way runnoff and they all get last words"; "30 seconds
// for non timed games" (the only clock in an untimed game).

/** The TV says it's a tie before the first last words. */
export const RUNOFF_INTRO_MS = 6_000;
/** Each guest in a runoff on who gets 30 seconds of last words. */
export const LAST_WORDS_MS = 30_000;
/** A timed game's runoff vote. */
export const RUNOFF_VOTE_MS = 90_000;

export type Tied = { who?: string[]; weapon?: string[]; room?: string[] };

/** The parts of the lock-in tied for the most votes, and what's tied in each. Empty: no runoff. */
export function tiedParts(accs: { suspectId: string; exhibitId: string; roomKey: string }[]): Tied {
  const out: Tied = {};
  const who = topPicks(accs.map((a) => a.suspectId));
  const weapon = topPicks(accs.map((a) => a.exhibitId));
  const room = topPicks(accs.map((a) => a.roomKey));
  if (who.length > 1) out.who = who;
  if (weapon.length > 1) out.weapon = weapon;
  if (room.length > 1) out.room = room;
  return out;
}

export const hasTie = (t: Tied) => !!(t.who || t.weapon || t.room);

/** When the runoff's vote opens: after the intro and everyone's last words (none when only a weapon or room tied). */
export const runoffVoteAt = (at: number, words: number) => at + RUNOFF_INTRO_MS + words * LAST_WORDS_MS;

/** Whose last words are on now (index into the order), or -1 before the first and after the last. */
export function speakingNow(at: number, words: number, now: number): number {
  const t = now - at - RUNOFF_INTRO_MS;
  if (t < 0) return -1;
  const i = Math.floor(t / LAST_WORDS_MS);
  return i < words ? i : -1;
}

/** A guest's final answer: their runoff vote for each part that went to a runoff, their lock-in for the rest. */
export function finalAnswer(
  acc: { suspectId: string; exhibitId: string; roomKey: string },
  vote: { who?: string; weapon?: string; room?: string } | undefined,
  tied: Tied | undefined,
) {
  return {
    suspectId: (tied?.who && vote?.who) || acc.suspectId,
    exhibitId: (tied?.weapon && vote?.weapon) || acc.exhibitId,
    roomKey: (tied?.room && vote?.room) || acc.roomKey,
  };
}

/**
 * The group's result on each part: the lock-in's most votes, or for a part that went to a runoff, the runoff's. A tie
 * that stays tied is undecided, and the killer walks.
 */
export function finalParts(
  accs: { suspectId: string; exhibitId: string; roomKey: string }[],
  votes: { who?: string; weapon?: string; room?: string }[],
  tied: Tied | undefined,
  truth: { killerId: string; exhibitId: string; roomKey: string },
) {
  const pickOf = (part: "who" | "weapon" | "room", lockin: string[], t: string) => {
    if (!tied?.[part]) return partResult(lockin, t);
    const r = partResult(votes.map((v) => v[part]).filter((x): x is string => !!x), t);
    return { ...r, runoff: true as const };
  };
  return {
    who: pickOf("who", accs.map((a) => a.suspectId), truth.killerId),
    weapon: pickOf("weapon", accs.map((a) => a.exhibitId), truth.exhibitId),
    room: pickOf("room", accs.map((a) => a.roomKey), truth.roomKey),
  };
}
