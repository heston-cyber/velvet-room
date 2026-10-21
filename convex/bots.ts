// Solo test mode (Oct 20, Heston: "build it as a feature now in the setup menu. so i can play and test the game with
// fake Bot players who make choices in game as well so i can solo test the game for real.").
//
// A test game with bot guests, started from /host. The host joins on their own phone like any guest (the room code,
// then sign up at the door), and the bots play the rest of the table: they search and scan the cards in the open rooms
// at a human pace, tap Ready, vote in the jail vote and lock in; in the lobby they vote Best Dressed. Sharp bots reason from the TV's
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
  betFor,
  betsOf,
  bookOdds,
  cardText,
  caseInput,
  castRunoffVote,
  claimStash,
  closeVote,
  dealLetter,
  fakeGuestsFor,
  isPlaying,
  maybeAdvanceOnReady,
  maybeRevealOnAccusations,
  playersOf,
  requirePlayer,
  runoffVotesOf,
  voteOf,
} from "./game";
import { caseFor } from "./caseFile";
import { applyPick, pickOpen, setTag } from "./heat";
import { publiclyCleared } from "./engine/heat";
import { BET_AMOUNTS } from "./book";
import { charKeyOf, randomCode, requireHost } from "./lib";
import { takenFigures } from "./figures";
import { secure } from "./engine/rng";
import { openRoomsIn } from "./engine/build";
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

async function act(ctx: MutationCtx, gameAtStart: Doc<"games">, chance: number) {
  let game = gameAtStart;
  const rng = secure();
  const now = Date.now();
  const players = await playersOf(ctx, game._id);

  // The lobby: Best Dressed (Oct 20), for anyone else who's here.
  if (game.status === "lobby") {
    const votes = await ctx.db
      .query("votes")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    for (const b of players.filter((p) => p.bot && p.checkedIn)) {
      if (votes.some((x) => x.playerId === b._id && x.dressed) || rng() >= chance) continue;
      const others = players.filter((p) => p.checkedIn && p._id !== b._id);
      const pick = others[Math.floor(rng() * others.length)];
      if (!pick) continue;
      const mine = votes.find((x) => x.playerId === b._id);
      if (mine) await ctx.db.patch(mine._id, { dressed: pick._id });
      else await ctx.db.insert("votes", { gameId: game._id, playerId: b._id, dressed: pick._id });
    }
    return;
  }

  const bots = players.filter((p) => p.bot && p.inGame);
  if (!bots.length) return;
  const cf = await caseFor(ctx, game);
  if (!cf) return;
  const who = (b: Doc<"players">): Who => ({ self: b._id, killerId: cf.solution.killerId, style: b.bot!.style });

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
    // Phase 4 (Oct 21): Round 2's pick, then heat tags now and then. The killer bot frames someone still standing about
    // 8 times in 10 and keeps its tag on them; the others tag whoever their evidence hasn't cleared (careless ones guess).
    const ids = (await caseInput(ctx, game)).suspects.map((x) => x.id);
    const cleared = publiclyCleared(cf, round);
    if (pickOpen(game)) {
      for (const b of bots) {
        if (b.picked === 2 || rng() >= chance) continue;
        const killer = b._id === cf.solution.killerId;
        const standing = ids.filter((id) => id !== b._id && !cleared.has(id));
        const target = killer
          ? rng() < 0.8 ? standing[Math.floor(rng() * standing.length)] : undefined
          : rng() < 0.7 ? chooseSuspect(rng, who(b), ids, knownElims(cf, round, await scannedBy(ctx, b._id))) : undefined;
        await applyPick(ctx, game, b, (target as Id<"players"> | undefined) ?? null);
      }
      game = (await ctx.db.get(game._id))!;
    }
    for (const b of bots) {
      const fresh = (await ctx.db.get(b._id))!;
      const dropped = !!fresh.tag && cleared.has(fresh.tag);
      if ((fresh.tag && !dropped) || rng() >= chance * 0.3) continue;
      const framed = b._id === cf.solution.killerId ? game.frame?.targetId : undefined;
      const target = framed && !cleared.has(framed) ? framed : chooseSuspect(rng, who(b), ids.filter((id) => !cleared.has(id)), knownElims(cf, round, await scannedBy(ctx, b._id)));
      if (target) await setTag(ctx, fresh, target as Id<"players">);
    }
    // Searching: scan cards in the open rooms, then tap Ready.
    const markers = await ctx.db
      .query("markers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    const open = new Set(openRoomsIn(round, game.roomOrder ?? game.rooms.map((r) => r.key), game.search));
    const openCards = markers.filter((m) => m.roomKey && open.has(m.roomKey));
    let readied = false;
    // The book (Oct 21): about 6 bots in 10 place one bet at some point before the lock-in, on someone their cards
    // haven't cleared (the killer bot bets as cover).
    if (bookOdds(game) !== null) {
      const bets = await betsOf(ctx, game._id);
      for (const b of bots) {
        if (b.jailed || bets.some((x) => x.playerId === b._id) || !betsAtAll(b._id) || rng() >= chance * 0.25) continue;
        const target = chooseSuspect(rng, who(b), ids, knownElims(cf, round, await scannedBy(ctx, b._id)));
        if (target) await betFor(ctx, game, b, target, BET_AMOUNTS[Math.floor(rng() * BET_AMOUNTS.length)]);
      }
    }
    for (const b of bots) {
      if (b.jailed || b.readyRound === round || rng() >= chance) continue;
      const mine = await scannedBy(ctx, b._id);
      const left = openCards.filter((m) => !mine.has(m.number));
      if (left.length && openCards.length - left.length < scanQuota(openCards.length)) {
        const m = left[Math.floor(rng() * left.length)];
        await ctx.db.insert("scans", { gameId: game._id, playerId: b._id, markerNumber: m.number, at: now });
        // Phase 3: a bot can find the Don's stash first, the same as a guest.
        game = await claimStash(ctx, game, cf?.clues.find((c) => c.channel === "marker" && c.markerNumber === m.number), b._id);
      } else {
        await ctx.db.patch(b._id, { readyRound: round });
        readied = true;
      }
    }
    if (readied) await maybeAdvanceOnReady(ctx, (await ctx.db.get(game._id))!);
    return;
  }

  // The runoff (Oct 21): once the last words are over, each bot votes on what's tied, never itself.
  const ro = game.runoff;
  if (ro) {
    if (ro.closedAt || now < ro.voteAt) return;
    const votes = await runoffVotesOf(ctx, game._id);
    for (const b of bots) {
      if (b.jailed || votes.some((x) => x.playerId === b._id) || rng() >= chance) continue;
      const known = knownElims(cf, 3, await scannedBy(ctx, b._id));
      const w = who(b);
      const pick = {
        who: ro.who ? chooseSuspect(rng, w, ro.who, known) ?? ro.who.find((id) => id !== b._id) : undefined,
        weapon: ro.weapon ? chooseThing(rng, w, ro.weapon, known.exhibits, cf.solution.exhibitId) ?? ro.weapon[0] : undefined,
        room: ro.room ? chooseThing(rng, w, ro.room, known.rooms, cf.solution.roomKey) ?? ro.room[0] : undefined,
      };
      const fresh = (await ctx.db.get(game._id))!;
      if (!fresh.runoff || fresh.runoff.closedAt) return;
      await castRunoffVote(ctx, fresh, b, { who: pick.who ?? undefined, weapon: pick.weapon ?? undefined, room: pick.room ?? undefined });
    }
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
    // Phase 3: "Where were you?" The bot tells its story (the killer bot, its cover).
    const story = cf.stories?.find((s) => s.playerId === bot._id)?.told ?? null;
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
          text: cardText(game, cf.clues.find((c) => c.channel === "marker" && c.markerNumber === s.markerNumber), bot._id),
        };
      });
    return { name: bot.charName, story, found };
  },
});

/** Whether a bot bets at all this game: about 6 in 10, the same answer every time for the same bot. */
function betsAtAll(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h % 10 < 6;
}
