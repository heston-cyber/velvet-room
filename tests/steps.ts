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
