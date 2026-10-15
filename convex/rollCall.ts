// The roll call (v2): after How to play, the narrator introduces every guest in the game with their
// drawing, weapon, signature item, motive and a roast. Recorded at Start, once the motives exist.
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import type { CaseFile } from "./engine/types";
import { fillRoast, roastTemplate, rumorLead } from "./roasts";
import { narratorOf, rollWanted, type Wanted } from "./voiceLines";
import { readSecs, rollSlotMs } from "./show";

export type RollGuest = {
  player: Doc<"players">;
  weapon: { key: string; name: string } | null;
  motive: string;
  /** The guest's own "word on the street" from sign-up, and how the narrator leads into it (different per guest). */
  rumor: string;
  rumorLead: string;
  roast: string;
  /** The host rewrote this guest's roast in Options. */
  roastEdited: boolean;
  wanted: ReturnType<typeof rollWanted>;
};

/** Everyone who could be in a roll call (all guests but the MC), in sign-up order. Motives only once the case exists. */
export async function rollGuests(ctx: QueryCtx, game: Doc<"games">, cf: CaseFile | null): Promise<RollGuest[]> {
  const tone = game.tone ?? "classic";
  const players = (
    await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect()
  )
    .filter((p) => !(game.mode === "mc" && p._id === game.mcPlayerId))
    .sort((a, b) => a.createdAt - b.createdAt);
  const weapons = await ctx.db
    .query("weapons")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  return players.map((p, rank) => {
    const w = weapons.find((x) => x.playerId === p._id);
    const weapon = w?.key ? { key: w.key, name: w.name } : null;
    const own = p.rollLine?.trim();
    // Adult games roast each guest about their own weapon (convex/roasts.ts WEAPON_ROASTS).
    const roast = own || fillRoast(roastTemplate(tone, String(game._id), rank, weapon?.key), { real: p.realName, weapon: weapon?.name ?? "", fallback: p.charName });
    const lead = rumorLead(tone, String(game._id), rank, p.realName, p.charName);
    const brief = cf?.briefings.find((b) => b.playerId === p._id);
    const motive = brief?.motive ?? "";
    const motiveOwn = game.motiveMode === "players" && !!p.motive?.trim() && motive.trim() === p.motive.trim();
    const wanted = rollWanted(tone, narratorOf(game), {
      id: p._id,
      charName: p.charName,
      sayAs: p.sayAs,
      realName: p.realName,
      signature: p.signature,
      weapon: weapon?.name ?? "",
      motive,
      motiveOwn,
      rumor: p.rumor?.trim() ?? "",
      rumorLead: lead,
      roast,
    });
    return { player: p, weapon, motive, rumor: p.rumor?.trim() ?? "", rumorLead: lead, roast, roastEdited: !!own, wanted };
  });
}

/** The roll call in show order. */
export function inOrder(all: RollGuest[], order: Id<"players">[]): RollGuest[] {
  const byId = new Map(all.map((g) => [g.player._id as string, g]));
  return order.map((id) => byId.get(id)).filter((g): g is RollGuest => !!g);
}

/** How long each guest's turn runs: the recording's length when it's in, else reading speed. */
export function slotsFor(guests: RollGuest[], seconds: (w: Wanted) => number | null): number[] {
  return guests.map((g) => rollSlotMs(seconds(g.wanted) ?? readSecs(g.wanted.caption)));
}
