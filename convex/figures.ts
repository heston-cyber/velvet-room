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

/** The party cast (Heston, Oct 15: "fill up a full 16 character roster with even amount of girls and guys"):
 *  drawings of the real guests, each going by their first name and a 1920s nickname ("Josh “Two-Tone”"),
 *  on screen and in the narration. A game with `lookalikes` on is a cast game: sign-up shows the cast first
 *  (tap your face and your name fills in; honor system, the label says whose it is), and the old drawings
 *  only behind "Not on the list?" for anyone who isn't one of them. Whoever picks a character plays.
 *  Test guests in a cast game are cast members too (Heston: "Use their names").
 *  Add someone: art in public/art(/faces) via scripts/process-art.py, a line here, and their face in FACE_X
 *  (src/lib/figure.ts). `sayAs` only if the narrator gets the name wrong. */
export type CastMember = { key: string; name: string; sex: "m" | "f"; nickname?: string; sayAs?: string };
export const LOOKALIKES: CastMember[] = [
  { key: "heston", name: "Heston", sex: "m" },
  { key: "emily", name: "Emily", sex: "f" },
  { key: "miranda", name: "Miranda", sex: "f" },
  { key: "sam", name: "Sam", sex: "m" },
  { key: "reily", name: "Reily", sex: "m" },
  { key: "madison", name: "Madison", sex: "f" },
  { key: "josh", name: "Josh", sex: "m" },
  { key: "sophia", name: "Sophia", sex: "f" },
  { key: "chrissie", name: "Chrissie", sex: "f" },
];
const LOOKALIKE_KEYS = LOOKALIKES.map((l) => l.key);
export const castMember = (key: string | null | undefined) => (key ? LOOKALIKES.find((l) => l.key === key) ?? null : null);
export const lookalikeName = (key: string) => castMember(key)?.name ?? null;
/** What a cast member goes by: "Josh “Two-Tone”" (just "Josh" until the nickname is in). */
export const castName = (m: CastMember) => (m.nickname ? `${m.name} “${m.nickname}”` : m.name);

/** Every drawing any game can hand out (for preloading art). */
export const ALL_FIGURE_KEYS = [...new Set([...FIGURE_KEYS, ...LOOKALIKE_KEYS])];

/** The sign-up gallery's rows for a game. In a cast game the old drawings are `extra`: "Not on the list?". */
export function figureSets(lookalikes: boolean): { label: string; keys: string[]; guests: boolean; extra: boolean }[] {
  const main = FIGURE_SETS.map((s) => ({ label: s.label, keys: lookalikes ? s.keys.filter((k) => !LOOKALIKE_KEYS.includes(k)) : s.keys, guests: false, extra: lookalikes }));
  if (!lookalikes) return main;
  const row = (label: string, sex: "m" | "f") => ({ label, keys: LOOKALIKES.filter((l) => l.sex === sex).map((l) => l.key), guests: true, extra: false });
  return [row("The guys", "m"), row("The girls", "f"), ...main];
}
export const figureKeysFor = (lookalikes: boolean) => figureSets(lookalikes).flatMap((s) => s.keys);
export const isFigure = (k: unknown, lookalikes = false): k is string => typeof k === "string" && figureKeysFor(lookalikes).includes(k);
/** A cast member's drawing, in a cast game. */
export const isCastFigure = (k: string | null | undefined, lookalikes: boolean) => lookalikes && !!castMember(k);

/** Test guests: in a cast game they're cast members (the real people, by name); otherwise the old drawings. */
export const fakeGuestPool = (lookalikes: boolean) => (lookalikes ? LOOKALIKE_KEYS : FIGURE_KEYS);

/** Drawings that stand in on the TV (How to play, the accomplice card, the awards, empty line-ups): in a cast
 *  game the game's own guests first, then the rest of the cast; otherwise the old drawings. */
export function standIns(lookalikes: boolean, guestFigures: string[]): string[] {
  if (!lookalikes) return FIGURE_KEYS;
  const mine = [...new Set(guestFigures.filter((f) => !!castMember(f)))];
  return [...mine, ...LOOKALIKE_KEYS.filter((k) => !mine.includes(k))];
}

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
