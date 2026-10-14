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
    // Where the body turns up: drawn at Start, public from then on. (Older games stored a default here.)
    bodyRoomKey: v.optional(v.string()),
    // The order rooms open in when searching in waves. Drawn at Start, independent of the answer.
    roomOrder: v.optional(v.array(v.string())),
    search: v.optional(v.union(v.literal("all"), v.literal("waves"))),
    // "play": the game runs itself and the host plays. "mc": one person runs the night and sees the answer.
    mode: v.optional(v.union(v.literal("play"), v.literal("mc"))),
    mcPlayerId: v.optional(v.id("players")), // a signed-up guest who is the MC (not a suspect)
    wifi: v.optional(v.object({ name: v.string(), password: v.string() })),
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
    introEndsAt: v.optional(v.number()), // the TV intro plays until then; Round 1's timer starts after it
    revealAt: v.optional(v.number()), // when the reveal sequence started on the TV
    tvShowAll: v.optional(v.boolean()), // TV shows every piece of evidence released so far
    soundCheckAt: v.optional(v.number()), // bumps when the host presses Sound check
    endedAt: v.optional(v.number()), // the host closed the night
    // The TV's own key: it can only run the TV, so it's safe in the TV window's address bar.
    tvKey: v.optional(v.string()),
    // The last "rescue a phone": that guest got a new link and the old one stopped working. The TV says so.
    lastRescue: v.optional(v.object({ name: v.string(), at: v.number() })),
    // Jackbox-style joining: a 4-letter code on the TV. Made when the doors open.
    roomCode: v.optional(v.string()),
    lastJoin: v.optional(v.object({ name: v.string(), at: v.number() })), // the TV announces each name claimed with the code
    tvSeenAt: v.optional(v.number()), // the TV window checks in every 20 seconds
    tvSound: v.optional(v.boolean()), // and says whether sound is allowed
    tvMedia: v.optional(v.boolean()), // and whether all the videos have loaded
    // When each turn of the night began, so the TV can play its title card and sounds on time.
    doorsAt: v.optional(v.number()),
    roundStartedAt: v.optional(v.number()), // rounds 2 to 4 (Round 1 starts when the intro ends)
    pausedAt: v.optional(v.number()),
    resumedAt: v.optional(v.number()),
    doneAt: v.optional(v.number()),
    // Before the murder: the host plays the house rules and the roll call on the TV.
    rulesAt: v.optional(v.number()),
    rollCallAt: v.optional(v.number()),
    rollCallOrder: v.optional(v.array(v.id("players"))),
    // The narrator: Ivy or Duke, steady or Unstable. Volume levels 0 to 100 (0 is off).
    narrator: v.optional(v.object({ host: v.union(v.literal("ivy"), v.literal("duke")), unstable: v.boolean() })),
    levels: v.optional(v.object({ voice: v.number(), music: v.number(), sfx: v.number() })),
  })
    .index("by_slug", ["slug"])
    .index("by_active", ["isActive"])
    .index("by_roomCode", ["roomCode"]),

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
    claimedAt: v.optional(v.number()), // a phone has this guest: claimed with the room code, or checked in
    rumor: v.optional(v.string()), // roll call: the word on the street about their character
    sayAs: v.optional(v.string()), // how the narrator should say the character's name
    rollLine: v.optional(v.string()), // the host's edit of the roll-call line
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
    roomKey: v.string(), // "" until the host logs which room it's in
    code: v.string(),
  })
    .index("by_game", ["gameId"])
    .index("by_code", ["code"]),

  // The printed QR cards: one set of codes for every game. Card N always has the same code.
  cards: defineTable({
    number: v.number(),
    code: v.string(),
  })
    .index("by_number", ["number"])
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

  // Lines recorded for this party with ElevenLabs: roll call intros, and names for the
  // intro, waves and reveal. One row per purpose ("roll:<player>", "killer:<player>", "room:<key>"…).
  // A clip only counts while its text and voice still match what the game wants to say.
  clips: defineTable({
    gameId: v.id("games"),
    purpose: v.string(),
    text: v.string(), // exactly what was sent, delivery tags included
    voice: v.string(), // ivy, ivy-unstable, duke, duke-unstable
    status: v.union(v.literal("pending"), v.literal("ready"), v.literal("failed")),
    storageId: v.optional(v.id("_storage")),
    seconds: v.optional(v.number()),
    error: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_game", ["gameId"])
    .index("by_game_purpose", ["gameId", "purpose"]),

  weapons: defineTable({
    gameId: v.id("games"),
    playerId: v.id("players"),
    name: v.string(),
    description: v.string(),
  })
    .index("by_player", ["playerId"])
    .index("by_game", ["gameId"]),
});
