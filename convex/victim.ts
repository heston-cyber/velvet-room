// Oct 31 (Heston: "the game kills a player that is not in the game (uses don ray sanders as a back up if all players
// full)"): the victim is a cast member nobody plays tonight, drawn at Start; Don Ray Sanders only when every cast
// drawing is taken. The Don stays the club's owner either way: his stash, Escalade, safe and cigars stay his. Every
// sentence about the death names the victim instead, with her pronouns when she's a woman.
// Pure: shared by the server (the case file, the tips) and the TV and phones.

export type Victim = { key: string; name: string; sex: "m" | "f" };
export const DON_VICTIM: Victim = { key: "don", name: "Don Ray Sanders", sex: "m" };
export const isDon = (v?: Victim | null) => !v || v.key === "don";

/** The cast drawing nobody plays tonight that dies, picked with r in [0, 1); the Don when every one is taken. */
export function pickVictim(cast: { key: string; name: string; sex: "m" | "f" }[], taken: Set<string>, r: number): Victim {
  const free = cast.filter((c) => !taken.has(c.key));
  if (!free.length) return DON_VICTIM;
  const c = free[Math.min(free.length - 1, Math.floor(r * free.length))];
  return { key: c.key, name: c.name, sex: c.sex };
}

/** Sentences about the Don as the club's owner (alive), which keep saying "the Don". */
const OWNER = /stash|Escalade|office safe|driver|tequila|unpaid tabs|cigar|gun case|display case|favorite song|hair plugs|chair/;
const DON = /Don Ray Sanders|\b[Tt]he Don\b/;

/** A line about the Don's death, rewritten for tonight's victim (unchanged when it's the Don). */
export function forVictim(text: string, v?: Victim | null): string {
  if (isDon(v) || !DON.test(text) || OWNER.test(text)) return text;
  let s = text
    .replace(/Don Ray Sanders/g, v!.name)
    .replace(/\b[Tt]he Don\b/g, v!.name)
    // Real people: no jokes about their bodies.
    .replace(/his fat ass/g, "the body")
    .replace(/his heavy ass/g, "the body")
    .replace(/the poor guy/g, "the poor thing");
  if (v!.sex === "f")
    s = s
      .replace(/\bhimself\b/g, "herself")
      .replace(/\bhe\b/g, "she")
      .replace(/\bHe\b/g, "She")
      .replace(/\bhis\b/g, "her")
      .replace(/\bHis\b/g, "Her")
      .replace(/\bhim\b/g, "her");
  return s;
}

/** Every string in a case file (clues, stories, briefings, tips), rewritten for tonight's victim. */
export function deepVictim<T>(x: T, v?: Victim | null): T {
  if (isDon(v)) return x;
  const walk = (y: unknown): unknown => {
    if (typeof y === "string") return forVictim(y, v);
    if (Array.isArray(y)) return y.map(walk);
    if (y && typeof y === "object") return Object.fromEntries(Object.entries(y as Record<string, unknown>).map(([k, val]) => [k, walk(val)]));
    return y;
  };
  return walk(x) as T;
}
