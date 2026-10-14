import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { registrationIsOpen, requireHost } from "./lib";

/**
 * The host's view of the game. Built to hold no spoilers: characters and real
 * names only. Weapons, motives, secrets and killer opt-ins are never read here,
 * apart from a single opt-in count.
 */
export const roster = query({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    const rows = await Promise.all(
      players
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(async (p) => ({
          id: p._id,
          charName: p.charName,
          realName: p.realName,
          who: p.who,
          signature: p.signature,
          photoUrl: p.photoId ? await ctx.storage.getUrl(p.photoId) : null,
          checkedIn: p.checkedIn,
          registeredAt: p.createdAt,
        })),
    );
    return {
      game: {
        slug: game.slug,
        title: game.title,
        isTest: game.isTest,
        status: game.status,
        open: registrationIsOpen(game, Date.now()),
        registrationOpen: game.registrationOpen,
        registrationClosesAt: game.registrationClosesAt,
        deadlineLabel: game.deadlineLabel,
        motiveMode: game.motiveMode,
        killerOptIn: game.killerOptIn,
        rooms: game.rooms,
        bodyRoomKey: game.bodyRoomKey,
        pacing: game.pacing,
        tone: game.tone ?? "classic",
      },
      players: rows,
      counts: {
        total: players.length,
        optedIn: players.filter((p) => p.killerOk).length,
      },
    };
  },
});

export const updateSettings = mutation({
  args: {
    slug: v.string(),
    hostKey: v.string(),
    motiveMode: v.optional(v.union(v.literal("game"), v.literal("players"))),
    killerOptIn: v.optional(v.boolean()),
    registrationOpen: v.optional(v.boolean()),
    registrationClosesAt: v.optional(v.number()),
    deadlineLabel: v.optional(v.string()),
    rooms: v.optional(
      v.array(v.object({ key: v.string(), label: v.string(), houseName: v.string() })),
    ),
    bodyRoomKey: v.optional(v.string()),
    pacing: v.optional(
      v.object({
        mode: v.union(v.literal("ready"), v.literal("timer")),
        roundMinutes: v.number(),
      }),
    ),
    tone: v.optional(v.union(v.literal("classic"), v.literal("adult"))),
  },
  handler: async (ctx, { slug, hostKey, ...patch }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (game.status !== "registration" && game.status !== "lobby") {
      throw new ConvexError("The game has started, so settings are locked.");
    }
    const rooms = patch.rooms ?? game.rooms;
    if (patch.rooms) {
      if (rooms.length < 2) throw new ConvexError("Play with at least 2 rooms.");
      const keys = new Set(rooms.map((r) => r.key));
      if (keys.size !== rooms.length) throw new ConvexError("Each room needs its own key.");
      if (rooms.some((r) => !r.label.trim())) throw new ConvexError("Every room needs a name.");
    }
    const bodyRoomKey = patch.bodyRoomKey ?? game.bodyRoomKey;
    if (!rooms.some((r) => r.key === bodyRoomKey)) {
      throw new ConvexError("The room where the body is found must be one of the rooms in play.");
    }
    if (patch.pacing && (patch.pacing.roundMinutes < 3 || patch.pacing.roundMinutes > 60)) {
      throw new ConvexError("Round length must be between 3 and 60 minutes.");
    }
    const clean = Object.fromEntries(Object.entries(patch).filter(([, val]) => val !== undefined));
    await ctx.db.patch(game._id, { ...clean, rooms, bodyRoomKey });
    return { ok: true };
  },
});

export const removePlayer = mutation({
  args: { slug: v.string(), hostKey: v.string(), playerId: v.id("players") },
  handler: async (ctx, { slug, hostKey, playerId }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (game.status !== "registration" && game.status !== "lobby") {
      throw new ConvexError("The game has started, so the guest list is locked.");
    }
    const player = await ctx.db.get(playerId);
    if (!player || player.gameId !== game._id) throw new ConvexError("Guest not found.");
    const weapons = await ctx.db
      .query("weapons")
      .withIndex("by_player", (q) => q.eq("playerId", playerId))
      .collect();
    for (const w of weapons) await ctx.db.delete(w._id);
    if (player.photoId) await ctx.storage.delete(player.photoId);
    await ctx.db.delete(playerId);
    return { ok: true };
  },
});
