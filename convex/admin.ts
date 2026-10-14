import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { DEFAULT_ROOMS, randomCode } from "./lib";

// Internal functions: only callable from the Convex CLI or dashboard with a deploy key,
// never from a browser.

export const createGame = internalMutation({
  args: {
    slug: v.string(),
    title: v.string(),
    isTest: v.boolean(),
    makeActive: v.boolean(),
    registrationClosesAt: v.number(),
    deadlineLabel: v.string(),
    motiveMode: v.optional(v.union(v.literal("game"), v.literal("players"))),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("games")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (existing) throw new ConvexError(`A game called ${args.slug} already exists.`);
    if (args.makeActive) {
      const active = await ctx.db
        .query("games")
        .withIndex("by_active", (q) => q.eq("isActive", true))
        .collect();
      for (const g of active) await ctx.db.patch(g._id, { isActive: false });
    }
    const hostKey = randomCode(16);
    await ctx.db.insert("games", {
      slug: args.slug,
      title: args.title,
      isTest: args.isTest,
      isActive: args.makeActive,
      hostKey,
      status: "registration",
      registrationOpen: true,
      registrationClosesAt: args.registrationClosesAt,
      deadlineLabel: args.deadlineLabel,
      motiveMode: args.motiveMode ?? "game",
      killerOptIn: true,
      rooms: DEFAULT_ROOMS,
      bodyRoomKey: "lounge",
      pacing: { mode: "ready", roundMinutes: 15 },
      createdAt: Date.now(),
    });
    return { slug: args.slug, hostKey };
  },
});

export const listGames = internalQuery({
  args: {},
  handler: async (ctx) => {
    const games = await ctx.db.query("games").collect();
    return games.map((g) => ({
      slug: g.slug,
      title: g.title,
      isTest: g.isTest,
      isActive: g.isActive,
      status: g.status,
      hostKey: g.hostKey,
    }));
  },
});

/** Deletes a test game and everything in it. Refuses real games. */
export const deleteTestGame = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!game) return { deleted: 0 };
    if (!game.isTest) throw new ConvexError("Only test games can be deleted this way.");
    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    for (const p of players) {
      if (p.photoId) await ctx.storage.delete(p.photoId);
      await ctx.db.delete(p._id);
    }
    const weapons = await ctx.db
      .query("weapons")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    for (const w of weapons) await ctx.db.delete(w._id);
    await ctx.db.delete(game._id);
    return { deleted: players.length };
  },
});
