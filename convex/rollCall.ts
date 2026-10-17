// The roll call: after How to play, the narrator introduces every guest in the game by name, nickname and who's
// playing (Heston, Oct 16: "the roll call is way to long. We should simplify to only the characters name, their
// nickname 'aka' and the real life name of the person playing that character"). About 3 to 4 seconds each.
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import type { CaseFile } from "./engine/types";
import { castMember, castNickname, castRealName } from "./figures";
import { narratorOf, rollWanted, scriptOf, type Wanted } from "./voiceLines";
import { readSecs, rollSlotMs } from "./show";

export type RollGuest = {
  player: Doc<"players">;
  /** The party cast member they play, if any. */
  cast: { real: string; nickname: string | null } | null;
  wanted: Wanted;
};

/** Everyone who could be in a roll call (every guest), in sign-up order. */
export async function rollGuests(ctx: QueryCtx, game: Doc<"games">, _cf: CaseFile | null): Promise<RollGuest[]> {
  const tone = scriptOf(game);
  const players = (
    await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect()
  ).sort((a, b) => a.createdAt - b.createdAt);
  return players.map((p) => {
    const m = castMember(p.figure);
    const own = { nickname: p.nickname, lastName: p.lastName };
    const cast = m ? { real: castRealName(m, own), nickname: castNickname(m, own) || null } : null;
    const wanted = rollWanted(tone, narratorOf(game), {
      id: p._id,
      charName: p.charName,
      sayAs: p.sayAs,
      realName: p.realName,
      cast: m ? { real: castRealName(m, own), nickname: castNickname(m, own), sayAs: m.sayAs } : null,
      seed: game.slug,
    });
    return { player: p, cast, wanted };
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
