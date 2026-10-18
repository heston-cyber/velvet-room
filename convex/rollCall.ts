// The roll call: after How to play, the narrator introduces every guest in the game by name, nickname and who's
// playing (Heston, Oct 16: "the roll call is way to long. We should simplify to only the characters name, their
// nickname 'aka' and the real life name of the person playing that character"). Oct 18: each with their own joke
// (dealt so nobody in a game shares one) and their motive, read out for everyone.
import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import type { CaseFile } from "./engine/types";
import { castMember, castNickname, castRealName } from "./figures";
import { narratorOf, rollWanted, scriptOf, type Wanted } from "./voiceLines";
import { CAST_INTROS } from "./narration";
import { readSecs, rollSlotMs } from "./show";

export type RollGuest = {
  player: Doc<"players">;
  /** The party cast member they play, if any. */
  cast: { real: string; nickname: string | null } | null;
  /** Oct 18: their motive, as the roll call reads it ("The Don owed them…"). */
  motive: string | null;
  wanted: Wanted;
};

/** The order a game deals its roll-call jokes in: the same for the same game, different for the next. */
function dealOrder(n: number, seed: string): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  let h = [...seed].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7) || 1;
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Everyone who could be in a roll call (every guest), in sign-up order. */
export async function rollGuests(ctx: QueryCtx, game: Doc<"games">, cf: CaseFile | null): Promise<RollGuest[]> {
  const tone = scriptOf(game);
  const deal = dealOrder(CAST_INTROS[tone].length, `${game.slug}|roll`);
  const players = (
    await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect()
  ).sort((a, b) => a.createdAt - b.createdAt);
  return players.map((p, i) => {
    const m = castMember(p.figure);
    const own = { nickname: p.nickname, lastName: p.lastName, firstName: p.firstName };
    const cast = m ? { real: castRealName(m, own), nickname: castNickname(m, own) || null } : null;
    const b = cf?.briefings.find((x) => x.playerId === p._id);
    const motive = b?.motiveThey || null;
    const wanted = rollWanted(tone, narratorOf(game), {
      id: p._id,
      charName: p.charName,
      sayAs: p.sayAs,
      realName: p.realName,
      cast: m ? { real: castRealName(m, own), nickname: castNickname(m, own), sayAs: m.sayAs } : null,
      seed: game.slug,
      pick: deal[i % deal.length],
      motive: motive ?? undefined,
    });
    return { player: p, cast, motive, wanted };
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
