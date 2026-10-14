import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Weapons live in their own table so that no query built for the host or the
// TV ever has a reason to touch them. Only a player's own view and the engine read them.
export default defineSchema({
  games: defineTable({
    slug: v.string(),
    title: v.string(),
    isTest: v.boolean(),
    isActive: v.boolean(),
    hostKey: v.string(),
    status: v.union(
      v.literal("registration"),
      v.literal("lobby"),
      v.literal("playing"),
      v.literal("reveal"),
      v.literal("done"),
    ),
    registrationOpen: v.boolean(),
    registrationClosesAt: v.number(), // epoch ms
    deadlineLabel: v.string(), // e.g. "Sat, Oct 24"
    motiveMode: v.union(v.literal("game"), v.literal("players")),
    killerOptIn: v.boolean(),
    rooms: v.array(
      v.object({ key: v.string(), label: v.string(), houseName: v.string() }),
    ),
    bodyRoomKey: v.string(),
    pacing: v.object({
      mode: v.union(v.literal("ready"), v.literal("timer")),
      roundMinutes: v.number(),
    }),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_active", ["isActive"]),

  players: defineTable({
    gameId: v.id("games"),
    token: v.string(),
    realName: v.string(),
    charName: v.string(),
    charKey: v.string(),
    who: v.string(),
    signature: v.string(),
    photoId: v.optional(v.id("_storage")),
    motive: v.optional(v.string()),
    secret: v.optional(v.string()),
    killerOk: v.boolean(),
    checkedIn: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_game", ["gameId"])
    .index("by_game_charKey", ["gameId", "charKey"]),

  weapons: defineTable({
    gameId: v.id("games"),
    playerId: v.id("players"),
    name: v.string(),
    description: v.string(),
  })
    .index("by_player", ["playerId"])
    .index("by_game", ["gameId"]),
});
