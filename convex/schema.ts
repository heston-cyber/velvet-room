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
    // v2: the host wants a killer and an accomplice (7+ players). hasAccomplice is fixed at Start: true only if the
    // game had enough players then; otherwise it drops to one killer.
    accomplice: v.optional(v.boolean()),
    hasAccomplice: v.optional(v.boolean()),
    // This party's guest look-alikes get their own named row in the sign-up drawings (convex/figures.ts).
    lookalikes: v.optional(v.boolean()),
    rooms: v.array(
      v.object({ key: v.string(), label: v.string(), houseName: v.string() }),
    ),
    // Where the body turns up: drawn at Start, public from then on. (Older games stored a default here.)
    bodyRoomKey: v.optional(v.string()),
    // The order rooms open in when searching in waves. Drawn at Start, independent of the answer.
    roomOrder: v.optional(v.array(v.string())),
    search: v.optional(v.union(v.literal("all"), v.literal("waves"))),
    // The night's weapons (Oct 16: the game draws them; guests no longer pick one). Keys from convex/weapons.ts, set
    // by the host in Options or drawn at Play. Games without it (started earlier) play their guests' picks.
    weaponKeys: v.optional(v.array(v.string())),
    // deprecated: Self MC was removed in v2; old documents may still carry it. The server ignores both fields
    // (every game is "everyone plays") and never writes them.
    mode: v.optional(v.union(v.literal("play"), v.literal("mc"))),
    mcPlayerId: v.optional(v.id("players")),
    wifi: v.optional(v.object({ name: v.string(), password: v.string() })),
    pacing: v.object({
      mode: v.union(v.literal("ready"), v.literal("timer")),
      roundMinutes: v.number(),
    }),
    createdAt: v.number(),
    // Started by a host on the site (Oct 16, anyone can host), not by Claude with a command.
    selfServe: v.optional(v.boolean()),
    round: v.optional(v.number()), // 1-3 evidence rounds, 4 = accusations
    startedAt: v.optional(v.number()),
    roundEndsAt: v.optional(v.number()), // timer pacing only
    paused: v.optional(v.boolean()),
    tone: v.optional(v.union(v.literal("classic"), v.literal("adult"))),
    // The script before Sailor mode turned it to Adult, so turning Sailor off brings it back (Oct 17, F9).
    toneBeforeSailor: v.optional(v.union(v.literal("classic"), v.literal("adult"))),
    introEndsAt: v.optional(v.number()), // the TV intro plays until then; Round 1's timer starts after it
    revealAt: v.optional(v.number()), // when the reveal sequence started on the TV
    // The reveal's steps (ms after revealAt), laid out from this game's recordings when it starts (Oct 16: slides wait
    // for the narrator). Older games use the fixed timings in shared.ts.
    revealPlan: v.optional(
      v.object({ card: v.number(), line: v.number(), name: v.number(), how: v.number(), accomplice: v.union(v.number(), v.null()), verdict: v.number() }),
    ),
    tvShowAll: v.optional(v.boolean()), // TV shows every piece of evidence released so far
    soundCheckAt: v.optional(v.number()), // bumps when the host presses Sound check
    endedAt: v.optional(v.number()), // the host closed the night
    // The TV's own key: it can only read the TV. The host screen runs the TV stage with it.
    tvKey: v.optional(v.string()),
    // The last "rescue a phone": that guest got a new link and the old one stopped working. The TV says so.
    lastRescue: v.optional(v.object({ name: v.string(), at: v.number() })),
    // Jackbox-style joining: a 4-letter code on the TV. Made when the doors open.
    roomCode: v.optional(v.string()),
    lastJoin: v.optional(v.object({ name: v.string(), at: v.number() })), // the TV announces each name claimed with the code
    // The TV stage checks in every 20 seconds (game.tvPing). Nothing shows these since the separate TV window was removed.
    tvSeenAt: v.optional(v.number()),
    tvSound: v.optional(v.boolean()), // whether sound is allowed
    tvMedia: v.optional(v.boolean()), // whether all the videos have loaded
    // When each turn of the night began, so the TV can play its title card and sounds on time.
    doorsAt: v.optional(v.number()),
    roundStartedAt: v.optional(v.number()), // rounds 2 to 4 (Round 1 starts when the intro ends)
    pausedAt: v.optional(v.number()),
    resumedAt: v.optional(v.number()),
    doneAt: v.optional(v.number()),
    // Old (before v2): the host played the roll call or How to play in the lobby. Kept so old games still load.
    rulesAt: v.optional(v.number()),
    rollCallAt: v.optional(v.number()),
    rollCallOrder: v.optional(v.array(v.id("players"))),
    // The show (v2): after Start, How to play, the intro (the Don dies), the roll call and "check your phones"
    // (convex/show.ts; introAt from Oct 16 on; before then the intro came first, at startedAt). The show ends at
    // introEndsAt. The roll call's turns are fixed when it begins (once the voices are in); phonesAt comes with them.
    show: v.optional(
      v.object({
        howAt: v.number(),
        introAt: v.optional(v.number()),
        rollAt: v.number(),
        order: v.array(v.id("players")),
        roll: v.optional(v.array(v.number())),
        phonesAt: v.optional(v.number()),
      }),
    ),
    // Phones show the roles from "check your phones" on (v2). Games without a show had them at Start.
    rolesOut: v.optional(v.boolean()),
    // Votes (Oct 16): Round 2 ends in a jail vote; Round 3 in a release vote if anyone is in jail (shared.voteAfterRound).
    // voters: the free guests when it opened (the majority is more than half of them). candidates: who can be
    // picked. When it closes: the outcome, then the verdict shows until nextAt, and the night moves on.
    vote: v.optional(
      v.object({
        kind: v.union(v.literal("jail"), v.literal("release")),
        round: v.number(),
        at: v.number(),
        endsAt: v.number(),
        voters: v.array(v.id("players")),
        candidates: v.array(v.id("players")),
        closedAt: v.optional(v.number()),
        outcome: v.optional(v.union(v.literal("jailed"), v.literal("released"), v.literal("nobody"))),
        targetId: v.optional(v.id("players")),
        nextAt: v.optional(v.number()),
        // Oct 17 (D10): the evidence had already cleared the guest in jail, so they were let out without a vote.
        auto: v.optional(v.boolean()),
        // Oct 17 (F8): while the game is paused, the vote's time left (or the verdict's, once it has closed).
        left: v.optional(v.number()),
      }),
    ),
    // When this game's jail vote opened (its ballots' voteAt): a Best Detective tie goes to whoever voted to jail the
    // killer, and Prime Suspect counts the jail votes (Oct 17).
    jailVoteAt: v.optional(v.number()),
    // The narrator: Ivy or Duke, steady or Unstable, or Sailor mode (Duke's own furious script; Oct 16). Volume
    // levels 0 to 100 (0 is off).
    narrator: v.optional(v.object({ host: v.union(v.literal("ivy"), v.literal("duke")), unstable: v.boolean(), sailor: v.optional(v.boolean()) })),
    // Picked at Start from what the host laptop heard lately (Oct 16, Heston: "a better selection system for each
    // game that picks what lines will be used, so that jokes are not repeated"): a version of each line, whether
    // tonight has a running gag (every third game on that laptop), and the heckles to keep for last.
    lines: v.optional(v.object({ picks: v.record(v.string(), v.number()), gag: v.boolean(), avoid: v.array(v.string()), gagOn: v.optional(v.string()) })),
    // Oct 20 (Heston: "I like the host setting for this"): who a gag night's insults can land on. "random" (the default):
    // every third game on the laptop, on a guest the game picks; "none": never; a guest's id: tonight, on them.
    roast: v.optional(v.union(v.literal("random"), v.literal("none"), v.id("players"))),
    levels: v.optional(v.object({ voice: v.number(), music: v.number(), sfx: v.number() })),
    // Play again: game 2 is a fresh game with the same house setup. The old game points at it.
    gameNumber: v.optional(v.number()),
    nextSlug: v.optional(v.string()),
    // Solo test mode (Oct 20): a test game with bot guests (convex/bots.ts). speed: how fast they play; voices: record
    // the narrator's lines for the bots' names too (off by default, to save credits); chain: the bots' running timer
    // (a newer one stops an older one).
    bots: v.optional(v.object({ speed: v.union(v.literal("party"), v.literal("fast")), voices: v.boolean(), chain: v.optional(v.string()) })),
  })
    .index("by_slug", ["slug"])
    .index("by_active", ["isActive"])
    .index("by_roomCode", ["roomCode"])
    .index("by_created", ["createdAt"]),

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
    // F6 (Oct 17): a mystery guest's own first name (cast members' come from the cast list).
    firstName: v.optional(v.string()),
    killerOk: v.boolean(),
    checkedIn: v.boolean(),
    exhibitLetter: v.optional(v.string()), // dealt at check-in from a shuffled pool
    weaponIn: v.optional(v.boolean()), // guest confirmed the bagged weapon went in the box
    inGame: v.optional(v.boolean()), // checked in when the draw happened
    readyRound: v.optional(v.number()), // last round this guest tapped "ready" in
    notebook: v.optional(v.array(v.string())), // the guest's own cross-offs
    claimedAt: v.optional(v.number()), // a phone has this guest: claimed with the room code, or checked in
    gender: v.optional(v.union(v.literal("woman"), v.literal("man"))), // unused (an early build picked drawings by gender)
    figure: v.optional(v.string()), // the drawing they picked as their avatar (convex/figures.ts); one per guest per game
    rumor: v.optional(v.string()), // roll call: the word on the street about their character
    sayAs: v.optional(v.string()), // how the narrator should say the character's name
    nickname: v.optional(v.string()), // party cast: their 1920s nickname, typed at sign-up ("Two-Tone")
    lastName: v.optional(v.string()), // party cast: their last name, typed at sign-up
    rollLine: v.optional(v.string()), // the host's edit of the roll-call line
    // v2 jail: voted in after a round, voted out at a release vote. Jailed guests can talk and bribe, nothing else.
    jailed: v.optional(v.boolean()),
    jailedAt: v.optional(v.number()),
    // Solo test mode (Oct 20): a bot guest, and how it plays (sharp bots reason from what they've seen).
    bot: v.optional(v.object({ style: v.union(v.literal("sharp"), v.literal("careless")) })),
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
  })
    .index("by_player", ["playerId"])
    .index("by_game", ["gameId"]),

  accusations: defineTable({
    gameId: v.id("games"),
    playerId: v.id("players"),
    suspectId: v.string(),
    exhibitId: v.string(),
    roomKey: v.string(),
    // v2: an optional guess at the accomplice (killer + accomplice games). It doesn't change who wins.
    accompliceId: v.optional(v.string()),
    at: v.number(),
  })
    .index("by_game", ["gameId"])
    .index("by_player", ["playerId"]),
  // v2: the jail and release votes, one ballot per guest per vote. targetId null is "nobody".
  ballots: defineTable({
    gameId: v.id("games"),
    voteAt: v.number(), // the vote it belongs to (games.vote.at)
    voterId: v.id("players"),
    targetId: v.union(v.id("players"), v.null()),
    at: v.number(),
  })
    .index("by_game_vote", ["gameId", "voteAt"])
    .index("by_voter", ["voterId"]),

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
    key: v.optional(v.string()), // one of the weapon pool (convex/weapons.ts); older guests typed their own
    name: v.string(),
    description: v.string(),
  })
    .index("by_player", ["playerId"])
    .index("by_game", ["gameId"]),
});
