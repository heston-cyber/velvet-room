import { ConvexError } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";

export const LIMITS = {
  realName: 60,
  charName: 60,
  who: 280,
  signature: 120,
  motive: 280,
  secret: 280,
  weapon: 80,
  weaponDesc: 280,
} as const;

export const DEFAULT_ROOMS = [
  { key: "lounge", label: "The Lounge", houseName: "Living room" },
  { key: "bar", label: "The Bar", houseName: "Kitchen" },
  { key: "office", label: "The Back Office", houseName: "Office" },
  { key: "private", label: "The Private Room", houseName: "Guest room" },
  { key: "conservatory", label: "The Conservatory", houseName: "Plant room" },
];

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Unguessable code for personal links and host keys. */
export function randomCode(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/** Trim and enforce a length limit. Returns "" for empty input. */
export function clean(value: string | undefined, max: number): string {
  const v = (value ?? "").replace(/\s+/g, " ").trim();
  if (v.length > max) {
    throw new ConvexError(`Keep it under ${max} characters.`);
  }
  return v;
}

export function required(value: string | undefined, max: number, label: string): string {
  const v = clean(value, max);
  if (!v) throw new ConvexError(`${label} is required.`);
  return v;
}

export function charKeyOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function registrationIsOpen(game: Doc<"games">, now: number): boolean {
  return game.registrationOpen && game.status === "registration" && now <= game.registrationClosesAt;
}

export async function gameBySlugOrActive(
  ctx: QueryCtx,
  slug: string | undefined,
): Promise<Doc<"games"> | null> {
  if (slug) {
    return await ctx.db
      .query("games")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
  }
  return await ctx.db
    .query("games")
    .withIndex("by_active", (q) => q.eq("isActive", true))
    .first();
}

export async function requireHost(
  ctx: QueryCtx,
  slug: string,
  hostKey: string,
): Promise<Doc<"games">> {
  const game = await ctx.db
    .query("games")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (!game || !hostKey || game.hostKey !== hostKey) {
    throw new ConvexError("That host link isn't valid.");
  }
  return game;
}
