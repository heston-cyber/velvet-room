// The murder weapons (Heston, Oct 15): at sign-up every guest picks one from this pool, like the
// drawings: one guest per weapon per game, taken ones greyed out. Weapons are known to everyone,
// like Clue. The murder weapon is always one of the weapons the guests in the game picked.
// Art: public/art/weapons/<key>.webp (scripts/process-art.py --weapon).
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import type { WeaponKind } from "./engine/types";

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

/** The weapons already picked in this game (optionally not counting one guest's own). */
export async function takenWeapons(ctx: QueryCtx, gameId: Id<"games">, except?: Id<"players">): Promise<Set<string>> {
  const rows = await ctx.db
    .query("weapons")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
  return new Set(rows.filter((w) => w.playerId !== except && w.key).map((w) => w.key!));
}

/** A free weapon at random (test guests), or a repeat when all are taken. */
export function anyFreeWeapon(taken: Set<string>, rand: () => number): string {
  const free = WEAPON_KEYS.filter((k) => !taken.has(k));
  const pool = free.length ? free : WEAPON_KEYS;
  return pool[Math.floor(rand() * pool.length) % pool.length];
}
