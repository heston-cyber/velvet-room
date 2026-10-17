// The party cast: drawings of the real guests, and the only characters in the game (Heston, Oct 16: "All the
// generic characters should all be gone, replaced by all the custom characters across the board"). At sign-up each
// guest taps their own face and goes by their own name and a 1920s nickname ("Josh “Two-Tone” Lee") on screen and
// in the narration. Each drawing belongs to one guest per game; whoever picks a character plays. Test guests are the
// cast too. The drawings live in public/art/<key>.webp (faces in public/art/faces). The Don and the masked killer are
// the story's own and never handed out (since Oct 16 the Don is Ray Sanders, drawn from his photo: "Don Ray Sanders"). (The old 16 drawings stay in public/art only so games from before still show.)
//
// Add someone: art in public/art(/faces) via scripts/process-art.py, a line here, and their face in FACE_X
// (src/lib/figure.ts). `sayAs` only if the narrator gets the name wrong.
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export type CastMember = { key: string; name: string; sex: "m" | "f"; last?: string; nickname?: string; sayAs?: string; mystery?: boolean };
export const CAST: CastMember[] = [
  { key: "heston", name: "Heston", sex: "m" },
  { key: "emily", name: "Emily", sex: "f" },
  { key: "miranda", name: "Miranda", sex: "f" },
  { key: "sam", name: "Sam", sex: "m" },
  { key: "reily", name: "Reily", sex: "m" },
  { key: "madison", name: "Madison", sex: "f" },
  { key: "josh", name: "Josh", sex: "m" },
  { key: "sophia", name: "Sophia", sex: "f" },
  { key: "chrissie", name: "Chrissie", sex: "f" },
  { key: "brayden", name: "Brayden", sex: "m" },
  { key: "holden", name: "Holden", sex: "m" },
  { key: "brian", name: "Brian", sex: "m" },
  { key: "brianna", name: "Brianna", sex: "f" },
  { key: "sienna", name: "Sienna", sex: "f" },
  { key: "cameron", name: "Cameron", sex: "f" },
  { key: "brendan", name: "Brendan", sex: "m" },
];
export const CAST_KEYS = CAST.map((l) => l.key);
/**
 * F6 (Oct 17): a plus-one or anyone not in the cast signs up as a mystery guest, a man or a woman in silhouette, with
 * their own first name typed in. Any number of guests can use them; the name is what tells them apart.
 */
export const MYSTERY: CastMember[] = [
  { key: "mystery-m", name: "Mystery guest", sex: "m", mystery: true },
  { key: "mystery-f", name: "Mystery guest", sex: "f", mystery: true },
];
export const MYSTERY_KEYS = MYSTERY.map((l) => l.key);
export const isMystery = (key: string | null | undefined) => !!key && MYSTERY_KEYS.includes(key);
export const castMember = (key: string | null | undefined) => (key ? CAST.find((l) => l.key === key) ?? MYSTERY.find((l) => l.key === key) ?? null : null);
/** The nickname and last name each guest types at sign-up (Heston, Oct 16: "the players can fill that in when they
 *  register"); the cast list itself leaves them empty. A mystery guest types their first name too. */
export type Own = { nickname?: string | null; lastName?: string | null; firstName?: string | null };
const tidy = (s: string | null | undefined) => (s ?? "").replace(/[“”"]/g, "").replace(/\s+/g, " ").trim();
/** A cast member's first name; a mystery guest's own. */
export const firstOf = (m: CastMember, own: Own = {}) => (m.mystery ? tidy(own.firstName) || m.name : m.name);
/** What a cast member goes by: first name, “nickname”, last name ("Josh “Two-Tone” Lee"), with whatever's in. */
export const castName = (m: CastMember, own: Own = {}) => {
  const nick = tidy(own.nickname ?? m.nickname);
  return [firstOf(m, own), nick ? `“${nick}”` : "", tidy(own.lastName ?? m.last)].filter(Boolean).join(" ");
};
/** Their own name without the nickname ("Josh Lee"), for "a.k.a." lines. */
export const castRealName = (m: CastMember, own: Own = {}) => [firstOf(m, own), tidy(own.lastName ?? m.last)].filter(Boolean).join(" ");
export const castNickname = (m: CastMember, own: Own = {}) => tidy(own.nickname ?? m.nickname);

/** The short name: a cast member's first name (unique in the cast), else the character name. For the evidence, the
 *  votes and anywhere names stack up on screen; the full "Josh “Two-Tone” Lee" is for the roll call, the lobby and the
 *  reveal. */
export const shortName = (p: { figure?: string | null; charName: string; firstName?: string | null }) => {
  const m = castMember(p.figure);
  return m ? (m.mystery ? tidy(p.firstName) || p.charName : m.name) : p.charName;
};

/** Every drawing a game can hand out (for preloading art). */
export const ALL_FIGURE_KEYS = [...CAST_KEYS, ...MYSTERY_KEYS];

/** The sign-up gallery's rows: the guys, then the girls, each face with its name; then the mystery guests (F6). */
export function figureSets(): { label: string; keys: string[] }[] {
  const row = (label: string, sex: "m" | "f") => ({ label, keys: CAST.filter((l) => l.sex === sex).map((l) => l.key) });
  return [row("The guys", "m"), row("The girls", "f"), { label: "Not in the cast? A plus-one?", keys: MYSTERY_KEYS }];
}
export const isFigure = (k: unknown): k is string => typeof k === "string" && (CAST_KEYS.includes(k) || MYSTERY_KEYS.includes(k));

/** Test guests are cast members too (the real people, by name). */
export const fakeGuestPool = () => CAST_KEYS;

/** Drawings that stand in on the TV (How to play, the accomplice card, the awards, empty line-ups): this game's
 *  own guests first, then the rest of the cast. */
export function standIns(guestFigures: string[]): string[] {
  const mine = [...new Set(guestFigures.filter((f) => !!castMember(f)))];
  return [...mine, ...CAST_KEYS.filter((k) => !mine.includes(k))];
}

/** Which way a drawing faces, so walkers on the TV face where they're going. Drawings face
 *  front or to the left unless listed here. */
export const FACES_RIGHT: string[] = [];

/** The drawings already picked in this game (optionally not counting one guest's own). */
export async function takenFigures(ctx: QueryCtx, gameId: Id<"games">, except?: Id<"players">): Promise<Set<string>> {
  const players = await ctx.db
    .query("players")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
  // Mystery guests (F6) are never taken: any number of guests can use them.
  return new Set(players.filter((p) => p._id !== except && p.figure && !isMystery(p.figure)).map((p) => p.figure!));
}

/** A free drawing at random (test guests), or a repeat when all are taken. */
export function anyFreeFigure(taken: Set<string>, rand: () => number = Math.random, from: string[] = CAST_KEYS): string {
  const free = from.filter((k) => !taken.has(k));
  const pool = free.length ? free : from;
  return pool[Math.floor(rand() * pool.length) % pool.length];
}
