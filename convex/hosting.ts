// Anyone can host (Heston, Oct 16): "the host goes to the host link and anyone can start a game and play. it will
// generate a code and everyone can join to play. just like jackbox.tv games work". Fully open (his pick), with one
// safety limit so a bot can't run up the narrator bill: at most HOURLY_GAME_CAP new games an hour across the site.
// Every game uses the party cast (Heston: "Your crew for everyone"). A new game needs no setup to play: no marker
// cards means Round 1's evidence goes on the TV; the host can add rooms and print cards in Options.
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { DEFAULT_ROOMS, randomCode } from "./lib";

export const HOURLY_GAME_CAP = 30;
/** Sign-ups stay open this long unless the host sets a date in Options. */
export const SIGNUP_DAYS = 60;
export const NEW_GAME_TITLE = "The Velvet Room";

/** Start a new game from /host. Returns its slug and host key; the laptop keeps the key. */
export const createGame = mutation({
  args: {},
  handler: async (ctx) => {
    const { slug, hostKey } = await insertSelfServeGame(ctx, {});
    return { slug, hostKey };
  },
});

/**
 * A new game started from /host (a real one, or a test game with bots: convex/bots.ts). Counts toward the hourly
 * limit either way.
 */
export async function insertSelfServeGame(ctx: MutationCtx, opts: { isTest?: boolean; bots?: Doc<"games">["bots"] }) {
  const now = Date.now();
  const recent = await ctx.db
    .query("games")
    .withIndex("by_created", (q) => q.gt("createdAt", now - 60 * 60 * 1000))
    .collect();
  if (recent.filter((g) => g.selfServe).length >= HOURLY_GAME_CAP) {
    throw new ConvexError("A lot of games are starting right now. Try again in a few minutes.");
  }
  let slug = "";
  for (let i = 0; i < 20 && !slug; i++) {
    const s = `party-${randomCode(6)}`;
    const taken = await ctx.db
      .query("games")
      .withIndex("by_slug", (q) => q.eq("slug", s))
      .first();
    if (!taken) slug = s;
  }
  if (!slug) throw new ConvexError("Couldn't start a game. Try again.");
  const hostKey = randomCode(16);
  const gameId = await ctx.db.insert("games", {
    slug,
    title: NEW_GAME_TITLE,
    isTest: !!opts.isTest,
    isActive: false,
    selfServe: true,
    hostKey,
    tvKey: randomCode(16),
    status: "registration",
    registrationOpen: true,
    registrationClosesAt: now + SIGNUP_DAYS * 24 * 60 * 60 * 1000,
    deadlineLabel: "the party",
    motiveMode: "game",
    killerOptIn: true,
    rooms: DEFAULT_ROOMS,
    pacing: { mode: "ready", roundMinutes: 12 },
    search: "waves",
    createdAt: now,
    ...(opts.bots ? { bots: opts.bots } : {}),
  });
  return { slug, hostKey, gameId };
}

async function bySlug(ctx: QueryCtx, slug: string) {
  return await ctx.db
    .query("games")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
}

/** A game after its replays: Game 2, Game 3 (they share the host key). */
async function newest(ctx: QueryCtx, game: Doc<"games">) {
  let g = game;
  for (let i = 0; i < 20 && g.nextSlug; i++) {
    const next = await bySlug(ctx, g.nextSlug);
    if (!next || next.hostKey !== game.hostKey) break;
    g = next;
  }
  return g;
}

/** The games this laptop hosts (from the keys it kept), newest first, each at its latest replay. */
export const myGames = query({
  args: { links: v.array(v.object({ slug: v.string(), hostKey: v.string() })) },
  handler: async (ctx, { links }) => {
    const out: { slug: string; title: string; status: Doc<"games">["status"]; over: boolean; isTest: boolean; players: number; createdAt: number; roomCode: string | null; gameNumber: number }[] = [];
    for (const l of links.slice(0, 30)) {
      const first = await bySlug(ctx, l.slug);
      if (!first || first.hostKey !== l.hostKey) continue;
      const g = await newest(ctx, first);
      if (out.some((x) => x.slug === g.slug)) continue;
      const players = await ctx.db
        .query("players")
        .withIndex("by_game", (q) => q.eq("gameId", g._id))
        .collect();
      // I9 (Oct 17): the list tells games apart by date, room code and game number.
      out.push({ slug: g.slug, title: g.title, status: g.status, over: !!g.endedAt, isTest: g.isTest, players: players.length, createdAt: g.createdAt, roomCode: g.endedAt ? null : g.roomCode ?? null, gameNumber: g.gameNumber ?? 1 });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});
