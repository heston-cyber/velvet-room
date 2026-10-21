// Test helper: the host's Next until the game actually moves on. v2 puts the votes between rounds, so ending a
// round takes a few presses: open the vote, close it, skip the verdict.
import type { convexTest } from "convex-test";
import { api } from "../convex/_generated/api";

export async function nextRound(t: ReturnType<typeof convexTest>, slug: string, hostKey: string) {
  const now = async () => t.run(async (ctx) => {
    const g = (await ctx.db.query("games").withIndex("by_slug", (q) => q.eq("slug", slug)).unique())!;
    return `${g.status}:${g.round}`;
  });
  const start = await now();
  for (let i = 0; i < 6 && (await now()) === start; i++) await t.mutation(api.game.advanceRound, { slug, hostKey });
}

/**
 * The runoff (Oct 21): if the lock-in tied, skip the last words and have everyone vote the same way they locked in
 * (or, if that's not in the runoff, the first option that isn't themselves), so a tie stays a tie.
 */
export async function settleRunoff(t: ReturnType<typeof convexTest>, slug: string) {
  const g = await t.run(async (ctx) => (await ctx.db.query("games").withIndex("by_slug", (q) => q.eq("slug", slug)).unique())!);
  if (!g.runoff || g.runoff.closedAt) return false;
  await t.run((ctx) => ctx.db.patch(g._id, { runoff: { ...g.runoff!, voteAt: Date.now() - 1 } }));
  const players = await t.run((ctx) => ctx.db.query("players").withIndex("by_game", (q) => q.eq("gameId", g._id)).collect());
  const accs = await t.run((ctx) => ctx.db.query("accusations").withIndex("by_game", (q) => q.eq("gameId", g._id)).collect());
  for (const p of players.filter((x) => x.inGame && !x.jailed)) {
    const a = accs.find((x) => x.playerId === p._id);
    const keep = (opts: string[] | undefined, mine: string | undefined, self?: string) =>
      opts ? (mine && opts.includes(mine) && mine !== self ? mine : opts.find((o) => o !== self)) : undefined;
    await t.mutation(api.game.runoffVote, {
      token: p.token,
      who: keep(g.runoff.who, a?.suspectId, p._id),
      weapon: keep(g.runoff.weapon, a?.exhibitId),
      room: keep(g.runoff.room, a?.roomKey),
    });
  }
  return true;
}
