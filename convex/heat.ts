// Phase 4 (Oct 21): heat tags, the Round 2 "pick one" prompt (the killer's frame) and the late tips. The rules are in
// convex/engine/heat.ts; this is where they meet the database.
import { ConvexError, v } from "convex/values";
import { mutation, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { caseFor } from "./caseFile";
import { shortName } from "./figures";
import { heatOn, heatShows, liveTags, plantTips, publiclyCleared, type ShownTip } from "./engine/heat";
import { secure } from "./engine/rng";
import type { CaseFile } from "./engine/types";
import { isPlaying, playersOf, requirePlayer, voteOf } from "./game";

/** Whether the Round 2 prompt is open: Round 2, the roles are out, and the late tips haven't landed yet. */
export const pickOpen = (game: Doc<"games">) => isPlaying(game) && game.round === 2 && !!game.rolesOut && !game.lateTipsAt && !voteOf(game);

/** The heat right now: who has it (3 or more live tags), and since when. Empty outside Rounds 1 to 3. */
export function heatNow(game: Doc<"games">, all: Doc<"players">[], cf: CaseFile | null) {
  const round = game.round ?? 0;
  if (!cf || !heatShows(game.status, round) || !game.rolesOut) return [];
  const inGame = new Set(all.filter((p) => p.inGame).map((p) => p._id as string));
  const tags = liveTags(
    all.map((p) => ({ from: p._id, to: p.tag, at: p.tagAt })),
    inGame,
    publiclyCleared(cf, round),
  );
  return heatOn(tags);
}

/** A guest's own tag, if it still counts (null when it's dropped because the evidence cleared them). */
export function myTag(game: Doc<"games">, player: Doc<"players">, cf: CaseFile | null) {
  if (!player.tag || !cf) return { tag: null as string | null, dropped: false };
  const cleared = publiclyCleared(cf, game.round ?? 0);
  return cleared.has(player.tag) ? { tag: null, dropped: true } : { tag: player.tag as string, dropped: false };
}

async function checkTarget(ctx: QueryCtx, game: Doc<"games">, player: Doc<"players">, targetId: Id<"players"> | null) {
  if (!targetId) return;
  if (targetId === player._id) throw new ConvexError("Pick someone other than yourself.");
  const t = await ctx.db.get(targetId);
  if (!t || t.gameId !== game._id || !t.inGame) throw new ConvexError("Pick someone who's playing tonight.");
}

/** Moves (or drops, with null) a guest's heat tag. Shared with the bots. */
export async function setTag(ctx: MutationCtx, player: Doc<"players">, targetId: Id<"players"> | null) {
  await ctx.db.patch(player._id, { tag: targetId ?? undefined, tagAt: Date.now() });
}

/**
 * Answers Round 2's prompt. An innocent's pick moves their heat tag (null keeps it). The killer's pick is the frame
 * (null: nobody), and it moves their tag too, so the heat behaves the same whoever picked. Shared with the bots.
 */
export async function applyPick(ctx: MutationCtx, game: Doc<"games">, player: Doc<"players">, targetId: Id<"players"> | null) {
  const cf = await caseFor(ctx, game);
  const killer = cf?.solution.killerId === player._id;
  if (killer) await ctx.db.patch(game._id, { frame: { targetId: targetId ?? undefined, at: Date.now() } });
  if (targetId) await setTag(ctx, player, targetId);
  await ctx.db.patch(player._id, { picked: 2 });
}

/** A guest tags someone they suspect (or drops their tag). Rounds 1 to 3; the jailbird can too. */
export const tag = mutation({
  args: { token: v.string(), targetId: v.union(v.id("players"), v.null()) },
  handler: async (ctx, { token, targetId }) => {
    const { player, game } = await requirePlayer(ctx, token);
    if (!heatShows(game.status, game.round ?? 0) || !game.rolesOut) throw new ConvexError("Tags are for the rounds. The heat is off now.");
    if (!player.inGame) throw new ConvexError("You're not in tonight's game.");
    await checkTarget(ctx, game, player, targetId);
    await setTag(ctx, player, targetId);
    return { ok: true };
  },
});

/** Round 2's prompt, on every phone at once: "Who's feeling the heat?" (innocents) or "Who takes the fall?" (the killer). */
export const pick = mutation({
  args: { token: v.string(), targetId: v.union(v.id("players"), v.null()) },
  handler: async (ctx, { token, targetId }) => {
    const { player, game } = await requirePlayer(ctx, token);
    if (!pickOpen(game)) throw new ConvexError(game.lateTipsAt ? "The late tips are in, so the picks are locked." : "The pick opens in Round 2.");
    if (!player.inGame) throw new ConvexError("You're not in tonight's game.");
    if (game.paused) throw new ConvexError("The host paused the game.");
    await checkTarget(ctx, game, player, targetId);
    await applyPick(ctx, game, player, targetId);
    return { ok: true };
  },
});

/**
 * The end of Round 2: the two late tips land (the jail vote opens next, or Round 3 in a game without one). The
 * killer's frame becomes the plant, replacing a real tip, and nothing can change it after this.
 */
export async function landTips(ctx: MutationCtx, game: Doc<"games">) {
  if (game.lateTipsAt) return;
  const cf = await caseFor(ctx, game);
  if (!cf) return;
  const all = await playersOf(ctx, game._id);
  const names = new Map(all.map((p) => [p._id as string, shortName(p)]));
  const target = game.frame?.targetId ? all.find((p) => p._id === game.frame!.targetId && p.inGame) : undefined;
  const shown: ShownTip[] = plantTips(cf.lateTips ?? [], game.tone ?? "classic", target ? { id: target._id, name: shortName(target) } : null, names, secure());
  await ctx.db.patch(game._id, {
    lateTips: shown.map((t) => ({ aboutId: t.aboutId as Id<"players">, text: t.text, plant: t.plant })),
    lateTipsAt: Date.now(),
  });
}

/** What phones and the TV may see of the late tips: the words only, never which is the plant. */
export const publicTips = (game: Doc<"games">) => (game.lateTips ?? []).map((t) => t.text);

/** After the reveal: who the killer framed, and the plant's words (or no plant tonight). */
export function plantReveal(game: Doc<"games">, all: Doc<"players">[]) {
  if (!game.lateTipsAt) return null;
  const plant = (game.lateTips ?? []).find((t) => t.plant);
  if (!plant) return { planted: false as const };
  const p = all.find((x) => x._id === plant.aboutId);
  return { planted: true as const, about: p ? shortName(p) : "", text: plant.text };
}
