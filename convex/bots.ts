// Solo test mode (Oct 20, Heston: "build it as a feature now in the setup menu. so i can play and test the game with
// fake Bot players who make choices in game as well so i can solo test the game for real.").
//
// A test game with bot guests, started from /host. The host joins on their own phone like any guest (the room code,
// then sign up at the door), and the bots play the rest of the table: they search and scan the cards in the open rooms
// at a human pace, tap Ready, vote in the jail vote, lock in and vote for the awards. Sharp bots reason from the TV's
// evidence and the cards they scanned themselves; careless ones guess; the killer bot points at someone else.
// A test game is always its own game, so a real party never gets bots. What they decide lives in convex/botBrain.ts.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { insertSelfServeGame } from "./hosting";
import {
  ballotsOf,
  caseInput,
  closeVote,
  dealLetter,
  fakeGuestsFor,
  isPlaying,
  maybeAdvanceOnReady,
  maybeRevealOnAccusations,
  playersOf,
  requirePlayer,
  voteOf,
} from "./game";
import { caseFor } from "./caseFile";
import { charKeyOf, randomCode, requireHost } from "./lib";
import { takenFigures } from "./figures";
import { secure } from "./engine/rng";
import { openRoomsIn } from "./engine/build";
import { revealTimes } from "./shared";
import { BOT_LIFETIME_MS, BOT_SPEEDS, MAX_BOTS, MIN_BOTS, chooseJail, chooseSuspect, chooseThing, knownElims, scanQuota, styleFor, type Who } from "./botBrain";

const speedV = v.union(v.literal("party"), v.literal("fast"));
const before = (g: Doc<"games">) => g.status === "registration" || g.status === "lobby";

/** /host: a new test game with this many bots. Returns its slug and host key, like a new game. */
export const createBotGame = mutation({
  args: { bots: v.number(), speed: speedV },
  handler: async (ctx, { bots, speed }) => {
    const n = Math.round(bots);
    if (!(n >= MIN_BOTS && n <= MAX_BOTS)) throw new ConvexError(`Pick ${MIN_BOTS} to ${MAX_BOTS} bots.`);
    const { slug, hostKey, gameId } = await insertSelfServeGame(ctx, { isTest: true, bots: { speed, voices: false } });
    await addBots(ctx, gameId, n);
    return { slug, hostKey };
  },
});

/** Bots sign up already checked in, with a name nobody else can claim with the room code. */
async function addBots(ctx: MutationCtx, gameId: Id<"games">, n: number) {
  const rng = secure();
  const players = await playersOf(ctx, gameId);
  const names = new Set(players.map((p) => p.charKey));
  const now = Date.now();
  for (const g of fakeGuestsFor(await takenFigures(ctx, gameId), names, rng).slice(0, n)) {
    const game = (await ctx.db.get(gameId))!;
    await ctx.db.insert("players", {
      gameId,
      figure: g.figure,
      token: randomCode(10),
      realName: `${g.first} (bot)`,
      firstName: g.first,
      charName: g.name,
      charKey: charKeyOf(g.name),
      who: "",
      signature: "",
      killerOk: true,
      checkedIn: true,
      weaponIn: true,
      exhibitLetter: await dealLetter(ctx, game),
      claimedAt: now,
      bot: { style: styleFor(rng) },
      createdAt: now,
      updatedAt: now,
    });
  }
}

/** Options in a bot game: how many bots (before the game starts), how fast they play, and their voice lines. */
export const updateBots = mutation({
  args: { slug: v.string(), hostKey: v.string(), count: v.optional(v.number()), speed: v.optional(speedV), voices: v.optional(v.boolean()) },
  handler: async (ctx, { slug, hostKey, count, speed, voices }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (!game.isTest || !game.bots) throw new ConvexError("Only test games with bots have bot settings.");
    if (count !== undefined) {
      if (!before(game)) throw new ConvexError("The game has started, so the bots are set for tonight.");
      const n = Math.round(count);
      if (!(n >= MIN_BOTS && n <= MAX_BOTS)) throw new ConvexError(`Pick ${MIN_BOTS} to ${MAX_BOTS} bots.`);
      const bots = (await playersOf(ctx, game._id)).filter((p) => p.bot).sort((a, b) => a.createdAt - b.createdAt);
      if (n > bots.length) await addBots(ctx, game._id, n - bots.length);
      for (const b of bots.slice(n)) await ctx.db.delete(b._id);
    }
    if (speed !== undefined || voices !== undefined) {
      await ctx.db.patch(game._id, { bots: { ...game.bots, ...(speed ? { speed } : {}), ...(voices !== undefined ? { voices } : {}) } });
    }
    return { ok: true };
  },
});

/** Starts the bots' timer (the doors opened, or the game started). A new one stops any older one. */
export const wake = internalMutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const game = await ctx.db.get(gameId);
    if (!game || !game.isTest || !game.bots) return;
    const chain = randomCode(8);
    await ctx.db.patch(gameId, { bots: { ...game.bots, chain } });
    await ctx.scheduler.runAfter(1000, internal.bots.tick, { gameId, chain });
  },
});

/** One beat of the bots: each one may take its next step. Runs while the night is on. */
export const tick = internalMutation({
  args: { gameId: v.id("games"), chain: v.string() },
  handler: async (ctx, { gameId, chain }) => {
    const game = await ctx.db.get(gameId);
    if (!game || !game.isTest || !game.bots || game.bots.chain !== chain) return;
    // Nothing to do before the doors open or after the night; a forgotten test stops on its own.
    if (game.status === "registration" || game.status === "done" || game.endedAt || Date.now() - game.createdAt > BOT_LIFETIME_MS) return;
    const speed = BOT_SPEEDS[game.bots.speed];
    if (!game.paused) await act(ctx, game, speed.act);
    await ctx.scheduler.runAfter(speed.tickMs, internal.bots.tick, { gameId, chain });
  },
});

async function scannedBy(ctx: MutationCtx, playerId: Id<"players">) {
  const rows = await ctx.db
    .query("scans")
    .withIndex("by_player", (q) => q.eq("playerId", playerId))
    .collect();
  return new Set(rows.map((s) => s.markerNumber));
}

async function act(ctx: MutationCtx, game: Doc<"games">, chance: number) {
  const rng = secure();
  const now = Date.now();
  const players = await playersOf(ctx, game._id);
  const bots = players.filter((p) => p.bot && p.inGame);
  if (!bots.length) return;
  const cf = await caseFor(ctx, game);
  if (!cf) return;
  const who = (b: Doc<"players">): Who => ({ self: b._id, killerId: cf.solution.killerId, style: b.bot!.style });

  // The awards: Best Dressed, once the verdict is on the TV.
  if (game.status === "reveal") {
    const verdictAt = (game.revealAt ?? now) + (game.revealPlan ?? revealTimes(!!game.hasAccomplice, game.tone ?? "classic")).verdict;
    if (now < verdictAt) return;
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    for (const b of bots) {
      if (votes.some((x) => x.playerId === b._id && x.dressed) || rng() >= chance) continue;
      const others = players.filter((p) => p.inGame && p._id !== b._id);
      const pick = others[Math.floor(rng() * others.length)];
      if (!pick) continue;
      const mine = votes.find((x) => x.playerId === b._id);
      if (mine) await ctx.db.patch(mine._id, { dressed: pick._id });
      else await ctx.db.insert("votes", { gameId: game._id, playerId: b._id, dressed: pick._id });
    }
    return;
  }

  if (!isPlaying(game) || !game.rolesOut || (game.introEndsAt ?? 0) > now) return;
  const round = game.round ?? 1;

  if (round <= 3) {
    const vt = voteOf(game);
    if (vt) {
      // A vote is open: bots who haven't voted yet do, now and then.
      if (vt.closedAt) return;
      const ballots = await ballotsOf(ctx, game._id, vt.at);
      for (const b of bots) {
        if (!vt.voters.includes(b._id) || ballots.some((x) => x.voterId === b._id) || rng() >= chance) continue;
        const target = chooseJail(rng, who(b), vt.candidates.map(String), knownElims(cf, round, await scannedBy(ctx, b._id)));
        await ctx.db.insert("ballots", { gameId: game._id, voteAt: vt.at, voterId: b._id, targetId: (target as Id<"players"> | null) ?? null, at: now });
      }
      if ((await ballotsOf(ctx, game._id, vt.at)).length >= vt.voters.length) await closeVote(ctx, (await ctx.db.get(game._id))!);
      return;
    }
    // Searching: scan cards in the open rooms, then tap Ready.
    const markers = await ctx.db
      .query("markers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    const open = new Set(openRoomsIn(round, game.roomOrder ?? game.rooms.map((r) => r.key), game.search));
    const openCards = markers.filter((m) => m.roomKey && open.has(m.roomKey));
    let readied = false;
    for (const b of bots) {
      if (b.jailed || b.readyRound === round || rng() >= chance) continue;
      const mine = await scannedBy(ctx, b._id);
      const left = openCards.filter((m) => !mine.has(m.number));
      if (left.length && openCards.length - left.length < scanQuota(openCards.length)) {
        const m = left[Math.floor(rng() * left.length)];
        await ctx.db.insert("scans", { gameId: game._id, playerId: b._id, markerNumber: m.number, at: now });
      } else {
        await ctx.db.patch(b._id, { readyRound: round });
        readied = true;
      }
    }
    if (readied) await maybeAdvanceOnReady(ctx, (await ctx.db.get(game._id))!);
    return;
  }

  // The lock-in.
  const input = await caseInput(ctx, game);
  const accs = await ctx.db
    .query("accusations")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  let locked = false;
  for (const b of bots) {
    if (b.jailed || accs.some((a) => a.playerId === b._id) || rng() >= chance) continue;
    const known = knownElims(cf, round, await scannedBy(ctx, b._id));
    const w = who(b);
    const suspectId = chooseSuspect(rng, w, input.suspects.map((s) => s.id), known);
    const exhibitId = chooseThing(rng, w, input.exhibits.map((e) => e.id), known.exhibits, cf.solution.exhibitId);
    const roomKey = chooseThing(rng, w, input.rooms.map((r) => r.key), known.rooms, cf.solution.roomKey);
    if (!suspectId || !exhibitId || !roomKey) continue;
    await ctx.db.insert("accusations", { gameId: game._id, playerId: b._id, suspectId, exhibitId, roomKey, at: now });
    locked = true;
  }
  if (locked) await maybeRevealOnAccusations(ctx, (await ctx.db.get(game._id))!);
}

/**
 * Ask a bot (test games only): what a guest would tell you if you asked them at a party. Where they were (from the
 * stories, once they're built) and the cards they've found.
 */
export const askBot = query({
  args: { token: v.string(), botId: v.id("players") },
  handler: async (ctx, { token, botId }) => {
    const { game } = await requirePlayer(ctx, token);
    if (!game.isTest) throw new ConvexError("Only test games have bots.");
    const bot = await ctx.db.get(botId);
    if (!bot || bot.gameId !== game._id || !bot.bot) throw new ConvexError("That's not one of the bots.");
    const cf = before(game) ? null : await caseFor(ctx, game);
    if (!cf) return { name: bot.charName, story: null as string | null, found: [] as { number: number; room: string; text: string }[] };
    const scans = await ctx.db
      .query("scans")
      .withIndex("by_player", (q) => q.eq("playerId", bot._id))
      .collect();
    const markers = await ctx.db
      .query("markers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    const found = scans
      .sort((a, b) => a.at - b.at)
      .map((s) => {
        const m = markers.find((x) => x.number === s.markerNumber);
        return {
          number: s.markerNumber,
          room: game.rooms.find((r) => r.key === m?.roomKey)?.label ?? "",
          text: cf.clues.find((c) => c.channel === "marker" && c.markerNumber === s.markerNumber)?.text ?? "Nothing useful here.",
        };
      });
    return { name: bot.charName, story: null as string | null, found };
  },
});
