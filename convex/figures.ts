// The drawn cast: at sign-up every guest picks one of these Art Deco characters as their avatar
// (Heston, Oct 14). Each drawing can belong to one guest per game; once it's taken, it's greyed
// out for everyone else. The drawings live in public/art/<key>.webp (faces in public/art/faces).
// The Don and the masked killer are the game's own and never handed out.
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/** The main cast (final Oct 14): every game offers these. Grouped only so the sign-up gallery can
 *  show them in two rows. Anyone can pick any. */
export const FIGURE_SETS: { label: string; keys: string[] }[] = [
  { label: "Women", keys: ["flapper", "lady", "sleuth", "singer", "cigarette", "heiress", "sweetheart", "owner"] },
  { label: "Men", keys: ["dapper", "bodyguard", "detective", "curls", "trumpet", "reporter", "gambler", "slick"] },
];
export const FIGURE_KEYS = FIGURE_SETS.flatMap((s) => s.keys);

/** This party's look-alikes (Heston, Oct 14): drawings of the real guests. A game with
 *  `lookalikes` on shows them in their own "Tonight's guests" row, each labeled with the person's
 *  name (honor system: anyone could tap one, the label says whose it is). A main-cast drawing can
 *  stand in for someone (curls is Heston's until his own look-alike is final): in a look-alike game
 *  it moves up to this row, and in other games it's a regular character again.
 *  Add a guest: art in public/art(/faces), then a line here. */
export const LOOKALIKES: { key: string; name: string }[] = [
  { key: "curls", name: "Heston" },
  { key: "emily", name: "Emily" },
  { key: "miranda", name: "Miranda" },
  { key: "sam", name: "Sam" },
  { key: "reily", name: "Reily" },
  { key: "madison", name: "Madison" },
  { key: "josh", name: "Josh" },
  { key: "sophia", name: "Sophia" },
  { key: "chrissie", name: "Chrissie" },
];
const LOOKALIKE_KEYS = LOOKALIKES.map((l) => l.key);
export const lookalikeName = (key: string) => LOOKALIKES.find((l) => l.key === key)?.name ?? null;

/** Every drawing any game can hand out (for preloading art). */
export const ALL_FIGURE_KEYS = [...new Set([...FIGURE_KEYS, ...LOOKALIKE_KEYS])];

/** The sign-up gallery's rows for a game. */
export function figureSets(lookalikes: boolean): { label: string; keys: string[]; guests: boolean }[] {
  const main = FIGURE_SETS.map((s) => ({ label: s.label, keys: lookalikes ? s.keys.filter((k) => !LOOKALIKE_KEYS.includes(k)) : s.keys, guests: false }));
  return lookalikes ? [{ label: "Tonight's guests", keys: LOOKALIKE_KEYS, guests: true }, ...main] : main;
}
export const figureKeysFor = (lookalikes: boolean) => figureSets(lookalikes).flatMap((s) => s.keys);
export const isFigure = (k: unknown, lookalikes = false): k is string => typeof k === "string" && figureKeysFor(lookalikes).includes(k);

/** Test guests never take a real guest's look-alike. */
export const fakeGuestPool = (lookalikes: boolean) => (lookalikes ? FIGURE_KEYS.filter((k) => !LOOKALIKE_KEYS.includes(k)) : FIGURE_KEYS);

/** Which way a drawing faces, so walkers on the TV face where they're going. Drawings face
 *  front or to the left unless listed here (none at the moment: dapper was redrawn facing front). */
export const FACES_RIGHT: string[] = [];

/** The drawings already picked in this game (optionally not counting one guest's own). */
export async function takenFigures(ctx: QueryCtx, gameId: Id<"games">, except?: Id<"players">): Promise<Set<string>> {
  const players = await ctx.db
    .query("players")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
  return new Set(players.filter((p) => p._id !== except && p.figure).map((p) => p.figure!));
}

/** A free drawing at random (test guests), or a repeat when all are taken. */
export function anyFreeFigure(taken: Set<string>, rand: () => number = Math.random, from: string[] = FIGURE_KEYS): string {
  const free = from.filter((k) => !taken.has(k));
  const pool = free.length ? free : from;
  return pool[Math.floor(rand() * pool.length) % pool.length];
}
