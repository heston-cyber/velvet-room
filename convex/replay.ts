// Play again: after the awards, the host starts game 2. It's a fresh game (everyone signs up
// again with a new character) that keeps the house setup: rooms, marker cards and where they are,
// pacing, narrator, levels and Wi-Fi. The host and TV keep their keys, so both windows just follow
// the old game's nextSlug. Phones from game 1 get a "Sign up for the next game" button.
import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { requireHost } from "./lib";

/** Sign-ups for the next game stay open this long (it's meant for the same night). */
export const REPLAY_SIGNUP_MS = 24 * 60 * 60 * 1000;

const baseSlug = (slug: string) => slug.replace(/-g\d+$/, "");
const baseTitle = (title: string) => title.replace(/\s*·\s*Game \d+$/, "");

async function freeSlug(ctx: QueryCtx, base: string, n: number): Promise<{ slug: string; n: number }> {
  for (let k = n; k < n + 50; k++) {
    const slug = `${base}-g${k}`;
    const taken = await ctx.db
      .query("games")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (!taken) return { slug, n: k };
  }
  throw new ConvexError("Couldn't name the next game. Try again.");
}

/** Host: after the awards, make the next game and close this one. Pressing twice is safe. */
export const newGame = mutation({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (game.nextSlug) return { slug: game.nextSlug };
    if (game.status !== "done") throw new ConvexError("Show the awards first, then start a new game.");
    const now = Date.now();
    const { slug: next, n } = await freeSlug(ctx, baseSlug(game.slug), (game.gameNumber ?? 1) + 1);
    const id = await ctx.db.insert("games", {
      // The house setup carries over.
      isTest: game.isTest,
      motiveMode: game.motiveMode,
      killerOptIn: game.killerOptIn,
      lookalikes: game.lookalikes,
      rooms: game.rooms,
      pacing: game.pacing,
      search: game.search,
      mode: game.mode, // a Self MC is picked again for game 2 (or the game runs itself)
      wifi: game.wifi,
      tone: game.tone,
      narrator: game.narrator,
      levels: game.levels,
      slug: next,
      title: `${baseTitle(game.title)} · Game ${n}`,
      isActive: game.isActive,
      hostKey: game.hostKey,
      tvKey: game.tvKey,
      status: "registration",
      registrationOpen: true,
      registrationClosesAt: now + REPLAY_SIGNUP_MS,
      deadlineLabel: "the doors open",
      gameNumber: n,
      createdAt: now,
    });
    // Same marker cards in the same rooms: nobody has to move anything.
    const markers = await ctx.db
      .query("markers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    for (const m of markers) await ctx.db.insert("markers", { gameId: id, number: m.number, roomKey: m.roomKey, code: m.code });
    await ctx.db.patch(game._id, { nextSlug: next, endedAt: game.endedAt ?? now, isActive: false });
    return { slug: next };
  },
});
