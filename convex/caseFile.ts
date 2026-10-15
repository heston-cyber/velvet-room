// The sealed case file: built at Start, opened only on the server.
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import type { CaseFile } from "./engine/types";
import { unseal } from "./seal";

export async function caseFor(ctx: QueryCtx, game: Doc<"games">): Promise<CaseFile | null> {
  const box = await ctx.db
    .query("sealed")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .unique();
  return box ? await unseal<CaseFile>(box) : null;
}
