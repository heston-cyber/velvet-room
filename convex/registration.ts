import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  LIMITS,
  charKeyOf,
  clean,
  gameBySlugOrActive,
  randomCode,
  registrationIsOpen,
  required,
} from "./lib";
import { castMember, castName, castRealName, figureSets, isFigure, takenFigures } from "./figures";
import { normalizeCode } from "./join";
import { dealLetter } from "./game";

/** Walk-ins (v2): once the doors are open, anyone with tonight's room code can sign up on the spot. */
function walkInOk(game: Doc<"games">, roomCode: string | undefined) {
  return !!roomCode && game.status === "lobby" && !game.endedAt && !!game.roomCode && game.roomCode === normalizeCode(roomCode);
}

// Oct 16 (Heston): sign-up no longer asks who you are, for a signature item, a costume photo or a weapon. Older pages
// may still send them; they're ignored (who and signature are stored empty).
const profileArgs = {
  realName: v.string(),
  charName: v.string(),
  who: v.optional(v.string()),
  signature: v.optional(v.string()),
  motive: v.optional(v.string()),
  secret: v.optional(v.string()),
  weapon: v.optional(v.string()),
  weaponDesc: v.optional(v.string()),
  killerOk: v.boolean(),
  photoId: v.optional(v.id("_storage")),
  rumor: v.optional(v.string()),
  sayAs: v.optional(v.string()),
  figure: v.optional(v.string()), // the drawing they picked as their avatar
  nickname: v.optional(v.string()), // party cast: their 1920s nickname ("Two-Tone"), optional
  lastName: v.optional(v.string()), // party cast: their last name, optional
};

type ProfileInput = {
  realName: string;
  charName: string;
  motive?: string;
  secret?: string;
  killerOk: boolean;
  rumor?: string;
  sayAs?: string;
  figure?: string;
  nickname?: string;
  lastName?: string;
};

/** A cast member's drawing comes with their first name (and how to say it), whatever the page sent; their
 *  nickname and last name are their own (Heston, Oct 16). */
function castProfile<T extends ProfileInput>(input: T, figure: string | undefined): T {
  const m = castMember(figure);
  if (!m) return input;
  const bare = (x: string) => x.replace(/[“”"]/g, "").trim();
  // The roll call adds "a.k.a." itself, so a typed "aka Long Johnson" keeps just "Long Johnson".
  const nick = (x: string) => bare(x).replace(/^(a\.?\s*k\.?\s*a\.?|also known as)\s+/i, "").trim();
  // Their own first name typed again in the last-name box ("Heston Hill") keeps just the last name.
  const first = new RegExp(`^${m.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+`, "i");
  const own = { nickname: nick(clean(input.nickname, LIMITS.nickname)), lastName: bare(clean(input.lastName, LIMITS.lastName)).replace(first, "") };
  return { ...input, ...own, charName: castName(m, own), realName: castRealName(m, own), sayAs: m.sayAs ?? "" };
}

function validateProfile(game: Doc<"games">, input: ProfileInput) {
  const out = {
    realName: required(input.realName, LIMITS.realName, "Your name"),
    charName: required(input.charName, LIMITS.charName, "Character name"),
    motive: clean(input.motive, LIMITS.motive),
    secret: clean(input.secret, LIMITS.secret),
    rumor: clean(input.rumor, LIMITS.rumor),
    sayAs: clean(input.sayAs, LIMITS.sayAs),
    nickname: clean(input.nickname, LIMITS.nickname),
    lastName: clean(input.lastName, LIMITS.lastName),
    // Oct 17 (D8): everyone is in the killer draw unless they tick "I'd rather not be the killer".
    killerOk: input.killerOk,
  };
  // Oct 17 (D9): guests no longer write their own motive and secret; the game writes them.
  if (!charKeyOf(out.charName)) throw new ConvexError("Character name needs at least one letter.");
  return out;
}

async function assertNameFree(
  ctx: MutationCtx,
  gameId: Id<"games">,
  charName: string,
  self?: Id<"players">,
) {
  const clash = await ctx.db
    .query("players")
    .withIndex("by_game_charKey", (q) => q.eq("gameId", gameId).eq("charKey", charKeyOf(charName)))
    .first();
  if (clash && clash._id !== self) {
    throw new ConvexError("Someone already took that character name. Try a twist on it.");
  }
}

/** The drawing a guest picked: one of the cast, and nobody else's in this game. */
async function checkFigure(ctx: MutationCtx, game: Doc<"games">, figure: string | undefined, self?: Id<"players">) {
  if (!figure) throw new ConvexError("Pick your character drawing.");
  if (!isFigure(figure)) throw new ConvexError("That drawing isn't one of tonight's characters. Pick another.");
  if ((await takenFigures(ctx, game._id, self)).has(figure)) throw new ConvexError("Someone just took that drawing. Pick another.");
  return figure;
}

/** The sign-up gallery: every drawing and whether another guest already has it. Nothing private. */
export const figures = query({
  args: { slug: v.optional(v.string()), token: v.optional(v.string()) },
  handler: async (ctx, { slug, token }) => {
    const me = token
      ? await ctx.db
          .query("players")
          .withIndex("by_token", (q) => q.eq("token", token))
          .unique()
      : null;
    const game = me ? await ctx.db.get(me.gameId) : await gameBySlugOrActive(ctx, slug);
    if (!game) return null;
    const taken = await takenFigures(ctx, game._id, me?._id);
    return figureSets().map((set) => ({
      label: set.label,
      figures: set.keys.map((key) => {
        const m = castMember(key)!;
        return { key, taken: taken.has(key), name: m.name, castName: castName(m) };
      }),
    }));
  },
});

/** What the registration page needs to know about the game. Nothing private. */
export const publicGame = query({
  args: { slug: v.optional(v.string()) },
  handler: async (ctx, { slug }) => {
    const game = await gameBySlugOrActive(ctx, slug);
    if (!game) return null;
    return {
      slug: game.slug,
      title: game.title,
      isTest: game.isTest,
      open: registrationIsOpen(game, Date.now()),
      deadlineLabel: game.deadlineLabel,
      motiveMode: game.motiveMode,
      killerOptIn: game.killerOptIn,
      // Party night: the landing page offers "Join with the room code".
      partyOn: game.status !== "registration" && !game.endedAt,
    };
  },
});

export const register = mutation({
  args: { slug: v.optional(v.string()), roomCode: v.optional(v.string()), ...profileArgs },
  handler: async (ctx, args) => {
    const game = await gameBySlugOrActive(ctx, args.slug);
    if (!game) throw new ConvexError("This game doesn't exist.");
    const now = Date.now();
    const walkIn = walkInOk(game, args.roomCode);
    if (!walkIn && !registrationIsOpen(game, now)) throw new ConvexError("Registration is closed.");

    const p = validateProfile(game, castProfile(args, args.figure));
    // The drawing first: in a cast game a taken face is also a taken name, and the drawing is what they tapped.
    const figure = await checkFigure(ctx, game, args.figure);
    await assertNameFree(ctx, game._id, p.charName);

    let token = randomCode(10);
    while (await ctx.db.query("players").withIndex("by_token", (q) => q.eq("token", token)).first()) {
      token = randomCode(10);
    }

    const playerId = await ctx.db.insert("players", {
      gameId: game._id,
      token,
      realName: p.realName,
      charName: p.charName,
      charKey: charKeyOf(p.charName),
      who: "",
      signature: "",
      motive: p.motive || undefined,
      secret: p.secret || undefined,
      rumor: p.rumor || undefined,
      sayAs: p.sayAs || undefined,
      nickname: p.nickname || undefined,
      lastName: p.lastName || undefined,
      figure,
      killerOk: p.killerOk,
      checkedIn: false,
      createdAt: now,
      updatedAt: now,
    });
    if (walkIn) {
      // A walk-in is in the room already: they're checked in, and the TV announces them like any join.
      await ctx.db.patch(playerId, { checkedIn: true, weaponIn: true, exhibitLetter: await dealLetter(ctx, game), claimedAt: now });
      await ctx.db.patch(game._id, { lastJoin: { name: p.charName, at: now } });
    }
    return { token };
  },
});

/** A guest's own profile. Only reachable with their personal code. */
export const me = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    if (!token) return null;
    const player = await ctx.db
      .query("players")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();
    if (!player) return null;
    const game = await ctx.db.get(player.gameId);
    if (!game) return null;
    return {
      game: {
        slug: game.slug,
        title: game.title,
        isTest: game.isTest,
        open: registrationIsOpen(game, Date.now()),
        deadlineLabel: game.deadlineLabel,
        motiveMode: game.motiveMode,
        killerOptIn: game.killerOptIn,
      },
      realName: player.realName,
      charName: player.charName,
      motive: player.motive ?? "",
      secret: player.secret ?? "",
      rumor: player.rumor ?? "",
      sayAs: player.sayAs ?? "",
      nickname: player.nickname ?? "",
      lastName: player.lastName ?? "",
      figure: player.figure ?? null,
      killerOk: player.killerOk,
    };
  },
});

export const update = mutation({
  args: { token: v.string(), ...profileArgs, removePhoto: v.optional(v.boolean()) }, // removePhoto: older pages
  handler: async (ctx, args) => {
    const player = await ctx.db
      .query("players")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!player) throw new ConvexError("That link doesn't match a guest.");
    const game = await ctx.db.get(player.gameId);
    if (!game) throw new ConvexError("This game doesn't exist.");
    if (!registrationIsOpen(game, Date.now())) {
      throw new ConvexError("Registration is closed, so changes are locked.");
    }

    // Older pages don't send the nickname or last name: keep what's there.
    const p = validateProfile(
      game,
      castProfile({ ...args, nickname: args.nickname ?? player.nickname, lastName: args.lastName ?? player.lastName }, args.figure ?? player.figure),
    );
    // A different drawing has to be free; the same one stays theirs. Checked before the name (see register).
    const figure = args.figure && args.figure !== player.figure ? await checkFigure(ctx, game, args.figure, player._id) : undefined;
    await assertNameFree(ctx, game._id, p.charName, player._id);
    await ctx.db.patch(player._id, {
      realName: p.realName,
      charName: p.charName,
      charKey: charKeyOf(p.charName),
      motive: p.motive || undefined,
      secret: p.secret || undefined,
      // Older pages don't send these: leave what's there.
      ...(args.rumor !== undefined ? { rumor: p.rumor || undefined } : {}),
      ...(args.sayAs !== undefined || !!castMember(args.figure ?? player.figure) ? { sayAs: p.sayAs || undefined } : {}),
      nickname: p.nickname || undefined,
      lastName: p.lastName || undefined,
      ...(figure ? { figure } : {}),
      killerOk: p.killerOk,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});
