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
