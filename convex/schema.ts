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
    round: v.optional(v.number()), // 1-3 evidence rounds, 4 = accusations
    startedAt: v.optional(v.number()),
    roundEndsAt: v.optional(v.number()), // timer pacing only
    paused: v.optional(v.boolean()),
    tone: v.optional(v.union(v.literal("classic"), v.literal("adult"))),
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
    exhibitLetter: v.optional(v.string()), // dealt at check-in from a shuffled pool
    weaponIn: v.optional(v.boolean()), // guest confirmed the bagged weapon went in the box
    inGame: v.optional(v.boolean()), // checked in when the draw happened
    readyRound: v.optional(v.number()), // last round this guest tapped "ready" in
    notebook: v.optional(v.array(v.string())), // the guest's own cross-offs
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_game", ["gameId"])
    .index("by_game_charKey", ["gameId", "charKey"]),

  // Numbered evidence markers placed around the house. The code goes in the QR card.
  markers: defineTable({
    gameId: v.id("games"),
    number: v.number(),
    roomKey: v.string(),
    code: v.string(),
  })
    .index("by_game", ["gameId"])
    .index("by_code", ["code"]),

  // The whole case file (answer, clues, tips, briefings), encrypted with SEAL_KEY.
  // Nothing in here is readable from the dashboard without the key.
  sealed: defineTable({
    gameId: v.id("games"),
    iv: v.string(),
    data: v.string(),
  }).index("by_game", ["gameId"]),

  // Which markers each guest has found.
  scans: defineTable({
    gameId: v.id("games"),
    playerId: v.id("players"),
    markerNumber: v.number(),
    at: v.number(),
  }).index("by_player", ["playerId"]),

  accusations: defineTable({
    gameId: v.id("games"),
    playerId: v.id("players"),
    suspectId: v.string(),
    exhibitId: v.string(),
    roomKey: v.string(),
    at: v.number(),
  })
    .index("by_game", ["gameId"])
    .index("by_player", ["playerId"]),

  votes: defineTable({
    gameId: v.id("games"),
    playerId: v.id("players"),
    dressed: v.optional(v.id("players")),
    liar: v.optional(v.id("players")),
  })
    .index("by_game", ["gameId"])
    .index("by_player", ["playerId"]),

  weapons: defineTable({
    gameId: v.id("games"),
    playerId: v.id("players"),
    name: v.string(),
    description: v.string(),
  })
    .index("by_player", ["playerId"])
    .index("by_game", ["gameId"]),
});
