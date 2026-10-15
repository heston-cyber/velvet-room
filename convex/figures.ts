// The drawn cast: at sign-up every guest picks one of these Art Deco characters as their avatar
// (Heston, Oct 14). Each drawing can belong to one guest per game; once it's taken, it's greyed
// out for everyone else. The drawings live in public/art/<key>.webp (faces in public/art/faces).
// The Don and the masked killer are the game's own and never handed out.
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

/** Grouped only so the sign-up gallery can show them in two rows. Anyone can pick any. */
export const FIGURE_SETS: { label: string; keys: string[] }[] = [
  { label: "Women", keys: ["flapper", "lady", "sleuth", "singer", "cigarette", "heiress", "sweetheart", "owner"] },
  { label: "Men", keys: ["dapper", "bodyguard", "detective", "curls", "trumpet", "reporter", "gambler", "slick"] },
];
export const FIGURE_KEYS = FIGURE_SETS.flatMap((s) => s.keys);
export const isFigure = (k: unknown): k is string => typeof k === "string" && FIGURE_KEYS.includes(k);

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
export function anyFreeFigure(taken: Set<string>, rand: () => number = Math.random): string {
  const free = FIGURE_KEYS.filter((k) => !taken.has(k));
  const pool = free.length ? free : FIGURE_KEYS;
  return pool[Math.floor(rand() * pool.length) % pool.length];
}
