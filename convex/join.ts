// Joining with the room code, Jackbox style: the TV shows a 4-letter code, a guest types it on
// any phone and taps their own character. Each name can be claimed once (checking in counts too),
// and the TV announces every claim, so taking someone else's name happens in front of everyone.
// The host frees a name with "Rescue a phone", which also cuts off the old link.
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

/** No vowels, so a code never spells a word; no letters that read like others. */
export const ROOM_LETTERS = "BCDFGHJKLMNPQRSTVWXZ";
export const ROOM_CODE_LENGTH = 4;

export const normalizeCode = (code: string) => code.toUpperCase().replace(/[^A-Z]/g, "").slice(0, ROOM_CODE_LENGTH);

function randomRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ROOM_LETTERS[b % ROOM_LETTERS.length]).join("");
}

/** A fresh code no other game is using. */
export async function newRoomCode(ctx: QueryCtx): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const code = randomRoomCode();
    const clash = await ctx.db
      .query("games")
      .withIndex("by_roomCode", (q) => q.eq("roomCode", code))
      .first();
    if (!clash) return code;
  }
  throw new ConvexError("Couldn't make a room code. Try again.");
}

/** Codes work from Open the doors until the host ends the night. */
const joinable = (g: Doc<"games">) => g.status !== "registration" && !g.endedAt;

async function gameForCode(ctx: QueryCtx, code: string) {
  const c = normalizeCode(code);
  if (c.length !== ROOM_CODE_LENGTH) return null;
  return await ctx.db
    .query("games")
    .withIndex("by_roomCode", (q) => q.eq("roomCode", c))
    .first();
}

const firstName = (n: string) => n.trim().split(/\s+/)[0] ?? "";

/** The join page: the game behind a code, and every guest with whether their name is taken. */
export const room = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const game = await gameForCode(ctx, code);
    if (!game) return { ok: false as const, reason: "That code doesn't match a game. Check the TV and try again." };
    if (!joinable(game)) return { ok: false as const, reason: game.endedAt ? "This game is over for the night." : "The doors aren't open yet." };
    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    const guests = await Promise.all(
      players
        .sort((a, b) => a.charName.localeCompare(b.charName))
        .map(async (p) => ({
          id: p._id,
          charName: p.charName,
          firstName: firstName(p.realName),
          photoUrl: p.photoId ? await ctx.storage.getUrl(p.photoId) : null,
          taken: !!p.claimedAt,
        })),
    );
    return { ok: true as const, slug: game.slug, title: game.title, isTest: game.isTest, guests };
  },
});

/** A phone claims a guest. Returns that guest's personal link code. */
export const claim = mutation({
  args: { code: v.string(), playerId: v.id("players") },
  handler: async (ctx, { code, playerId }) => {
    const game = await gameForCode(ctx, code);
    if (!game) throw new ConvexError("That code doesn't match a game. Check the TV and try again.");
    if (!joinable(game)) throw new ConvexError(game.endedAt ? "This game is over for the night." : "The doors aren't open yet.");
    const p = await ctx.db.get(playerId);
    if (!p || p.gameId !== game._id) throw new ConvexError("Pick your name from the list.");
    if (p.claimedAt) throw new ConvexError(`Someone already joined as ${p.charName}. If that's you, ask the host to free your name.`);
    const now = Date.now();
    await ctx.db.patch(p._id, { claimedAt: now });
    await ctx.db.patch(game._id, { lastJoin: { name: p.charName, at: now } });
    return { token: p.token, slug: game.slug };
  },
});

/** Opening the doors makes the code (older games get one the same way). */
export async function ensureRoomCode(ctx: MutationCtx, game: Doc<"games">): Promise<string> {
  if (game.roomCode) return game.roomCode;
  const roomCode = await newRoomCode(ctx);
  await ctx.db.patch(game._id, { roomCode });
  return roomCode;
}
