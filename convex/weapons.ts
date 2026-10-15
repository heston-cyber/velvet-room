// The murder weapons (Heston, Oct 15): at sign-up every guest picks one from this pool, like the
// drawings: one guest per weapon per game, taken ones greyed out. Weapons are known to everyone,
// like Clue. The murder weapon is always one of the weapons the guests in the game picked.
// Art: public/art/weapons/<key>.webp (scripts/process-art.py --weapon).
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export const WEAPONS: { key: string; name: string }[] = [
  { key: "candlestick", name: "Candlestick" },
  { key: "knife", name: "Knife" },
  { key: "leadpipe", name: "Lead Pipe" },
  { key: "revolver", name: "Revolver" },
  { key: "rope", name: "Rope" },
  { key: "wrench", name: "Wrench" },
  { key: "poison", name: "Poison" },
  { key: "horseshoe", name: "Horseshoe" },
  { key: "axe", name: "Hatchet" }, // Heston's list: "Axe / Hatchet"; the drawing is a hatchet
  { key: "trophy", name: "Trophy" },
  { key: "dumbbell", name: "Dumbbell" },
  { key: "bat", name: "Baseball Bat" },
  { key: "flaregun", name: "Flare Gun" },
  { key: "fishingline", name: "Fishing Line" },
  { key: "hammer", name: "Hammer" },
  { key: "racquet", name: "Tennis Racquet" },
  { key: "gnome", name: "Lawn Gnome" },
  { key: "bucket", name: "Water Bucket" },
  { key: "shears", name: "Garden Shears" },
  { key: "blunderbuss", name: "Blunderbuss" },
  { key: "crowbar", name: "Crowbar" },
  { key: "gloves", name: "Gloves" },
];
export const WEAPON_KEYS = WEAPONS.map((w) => w.key);
export const isWeapon = (k: unknown): k is string => typeof k === "string" && WEAPON_KEYS.includes(k);
export const weaponName = (key: string) => WEAPONS.find((w) => w.key === key)?.name ?? null;

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
