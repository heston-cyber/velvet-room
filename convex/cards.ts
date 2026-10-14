// The QR cards. One set of codes for every game, printed once: card N always carries the same code.
// A game uses cards 1 to N; the rest are "not in play tonight" and get no clue.
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { randomCode } from "./lib";
import { MAX_CARDS } from "./shared";

/** Creates any missing cards 1..MAX_CARDS, each with its own unique code. */
export async function ensureAllCards(ctx: MutationCtx): Promise<Map<number, string>> {
  const existing = await ctx.db.query("cards").collect();
  const byNumber = new Map(existing.map((c) => [c.number, c.code]));
  const used = new Set(existing.map((c) => c.code));
  for (let n = 1; n <= MAX_CARDS; n++) {
    if (byNumber.has(n)) continue;
    let code = randomCode(6);
    while (used.has(code)) code = randomCode(6);
    used.add(code);
    await ctx.db.insert("cards", { number: n, code });
    byNumber.set(n, code);
  }
  return byNumber;
}

/** The marker a scanned code points at in this game, or which card it is if that card isn't in play. */
export async function markerForCode(
  ctx: QueryCtx,
  gameId: Id<"games">,
  rawCode: string,
): Promise<{ marker: Doc<"markers"> | null; cardNumber: number | null }> {
  const code = rawCode.trim().toLowerCase();
  if (!code) return { marker: null, cardNumber: null };
  const card = await ctx.db
    .query("cards")
    .withIndex("by_code", (q) => q.eq("code", code))
    .first();
  const markers = await ctx.db
    .query("markers")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
  if (card) {
    const marker = markers.find((m) => m.number === card.number) ?? null;
    return { marker, cardNumber: card.number };
  }
  // Older games made their own codes per marker.
  return { marker: markers.find((m) => m.code === code) ?? null, cardNumber: null };
}
