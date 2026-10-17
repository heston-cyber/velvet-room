// The murder weapons. Oct 15: every guest picked one at sign-up. Oct 16 (Heston: "We should get rid of players picking
// weapons at sign up. Because it's pointless", and weapons are never tied to a guest: "It would all but solve the
// mystery"): the game draws the night's weapons from this pool, 6 for up to 9 guests, 8 for 10 to 16, 10 for 17 or
// more, and the host can change them in Options. Weapons are known to everyone, like Clue.
// Art: public/art/weapons/<key>.webp (scripts/process-art.py --weapon).
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import type { Rng, WeaponKind } from "./engine/types";
import { LETTERS } from "./engine/fake";
import { shuffle } from "./engine/rng";
import { RECOMMENDED } from "./engine/setup";

export const WEAPONS: { key: string; name: string; kind: WeaponKind }[] = [
  { key: "candlestick", name: "Candlestick", kind: "blunt" },
  { key: "knife", name: "Knife", kind: "blade" },
  { key: "leadpipe", name: "Lead Pipe", kind: "blunt" },
  { key: "revolver", name: "Revolver", kind: "gun" },
  { key: "rope", name: "Rope", kind: "cord" },
  { key: "wrench", name: "Wrench", kind: "blunt" },
  { key: "poison", name: "Poison", kind: "other" },
  { key: "horseshoe", name: "Horseshoe", kind: "blunt" },
  { key: "axe", name: "Hatchet", kind: "blade" }, // Heston's list: "Axe / Hatchet"; the drawing is a hatchet
  { key: "trophy", name: "Trophy", kind: "blunt" },
  { key: "dumbbell", name: "Dumbbell", kind: "blunt" },
  { key: "bat", name: "Baseball Bat", kind: "blunt" },
  { key: "flaregun", name: "Flare Gun", kind: "gun" },
  { key: "fishingline", name: "Fishing Line", kind: "cord" },
  { key: "hammer", name: "Hammer", kind: "blunt" },
  { key: "racquet", name: "Tennis Racquet", kind: "blunt" },
  { key: "gnome", name: "Lawn Gnome", kind: "blunt" },
  { key: "bucket", name: "Water Bucket", kind: "other" },
  { key: "shears", name: "Garden Shears", kind: "blade" },
  { key: "blunderbuss", name: "Blunderbuss", kind: "gun" },
  { key: "crowbar", name: "Crowbar", kind: "blunt" },
  { key: "gloves", name: "Gloves", kind: "cord" },
];
export const WEAPON_KEYS = WEAPONS.map((w) => w.key);
export const isWeapon = (k: unknown): k is string => typeof k === "string" && WEAPON_KEYS.includes(k);
export const weaponName = (key: string) => WEAPONS.find((w) => w.key === key)?.name ?? null;
/** What the weapon does to a body, for the coroner's report (v3 evidence). Gloves strangle; the bucket drowns. */
export const weaponKind = (key: string | undefined): WeaponKind | undefined => WEAPONS.find((w) => w.key === key)?.kind;

/** How many weapons a night plays with: the ledger's number (engine/setup.ts RECOMMENDED). */
export const recommendedWeapons = (guests: number) => (RECOMMENDED.find((r) => guests <= r.guests[1]) ?? RECOMMENDED[RECOMMENDED.length - 1]).weapons;
export const MIN_WEAPONS = 3;

/**
 * The night's weapons, drawn at random: n of them, with at least three kinds when n allows, so the coroner's report
 * always has something to rule out.
 */
export function drawWeapons(n: number, rng: Rng): string[] {
  const want = Math.max(MIN_WEAPONS, Math.min(WEAPONS.length, Math.round(n)));
  for (let tries = 0; tries < 50; tries++) {
    const keys = shuffle(rng, WEAPON_KEYS).slice(0, want);
    if (new Set(keys.map((k) => weaponKind(k))).size >= Math.min(3, want)) return keys;
  }
  return shuffle(rng, WEAPON_KEYS).slice(0, want);
}

/** A list of weapon keys the host may save: real weapons, no repeats. (At least three to start: game.startGame.) */
export function checkWeaponKeys(keys: string[]): string | null {
  if (keys.some((k) => !isWeapon(k))) return "Pick weapons from the list.";
  if (new Set(keys).size !== keys.length) return "Each weapon only once.";
  return null;
}

export type GameWeapon = { id: string; key: string | null; name: string; letter: string; kind?: WeaponKind };

/**
 * The weapons in play. Games from Oct 16 on keep the drawn ones on the game (weaponKeys; a weapon's id is its key).
 * A game that started before that plays the ones its guests picked at sign-up.
 */
export async function gameWeapons(ctx: QueryCtx, game: Doc<"games">): Promise<GameWeapon[]> {
  if (game.weaponKeys?.length) return game.weaponKeys.map((k, i) => ({ id: k, key: k, name: weaponName(k) ?? k, letter: LETTERS[i] ?? String(i + 1), kind: weaponKind(k) }));
  if (game.status === "registration" || game.status === "lobby") return [];
  const players = await ctx.db
    .query("players")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  const byId = new Map(players.map((p) => [p._id as Id<"players">, p]));
  const rows = await ctx.db
    .query("weapons")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  return rows
    .filter((w) => {
      const p = byId.get(w.playerId);
      return p?.inGame && p.weaponIn && p.exhibitLetter;
    })
    .map((w) => ({ id: w._id as string, key: w.key ?? null, name: w.name, letter: byId.get(w.playerId)!.exhibitLetter!, kind: weaponKind(w.key) }))
    .sort((a, b) => a.letter.localeCompare(b.letter));
}
