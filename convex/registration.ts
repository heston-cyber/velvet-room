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
import { figureSets, isFigure, lookalikeName, takenFigures } from "./figures";
import { WEAPONS, isWeapon, takenWeapons, weaponName } from "./weapons";
import { normalizeCode } from "./join";
import { dealLetter } from "./game";

/** Walk-ins (v2): once the doors are open, anyone with tonight's room code can sign up on the spot. */
function walkInOk(game: Doc<"games">, roomCode: string | undefined) {
  return !!roomCode && game.status === "lobby" && !game.endedAt && !!game.roomCode && game.roomCode === normalizeCode(roomCode);
}

const profileArgs = {
  realName: v.string(),
  charName: v.string(),
  who: v.string(),
  signature: v.string(),
  motive: v.optional(v.string()),
  secret: v.optional(v.string()),
  weapon: v.string(), // a key from the weapon pool (convex/weapons.ts)
  weaponDesc: v.optional(v.string()), // older pages still send a description; it's ignored
  killerOk: v.boolean(),
  photoId: v.optional(v.id("_storage")),
  rumor: v.optional(v.string()),
  sayAs: v.optional(v.string()),
  figure: v.optional(v.string()), // the drawing they picked as their avatar
};

type ProfileInput = {
  realName: string;
  charName: string;
  who: string;
  signature: string;
  motive?: string;
  secret?: string;
  weapon: string;
  killerOk: boolean;
  rumor?: string;
  sayAs?: string;
  figure?: string;
};

function validateProfile(game: Doc<"games">, input: ProfileInput) {
  const out = {
    realName: required(input.realName, LIMITS.realName, "Your name"),
    charName: required(input.charName, LIMITS.charName, "Character name"),
    who: required(input.who, LIMITS.who, "Who they are"),
    signature: required(input.signature, LIMITS.signature, "Signature item or habit"),
    motive: clean(input.motive, LIMITS.motive),
    secret: clean(input.secret, LIMITS.secret),
    rumor: clean(input.rumor, LIMITS.rumor),
    sayAs: clean(input.sayAs, LIMITS.sayAs),
    // When the game menu turns the opt-in off, everyone is eligible.
    killerOk: game.killerOptIn ? input.killerOk : true,
  };
  if (game.motiveMode === "players") {
    if (!out.motive) throw new ConvexError("Motive is required.");
    if (!out.secret) throw new ConvexError("Secret is required.");
  }
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
  if (!isFigure(figure, !!game.lookalikes)) throw new ConvexError("That drawing isn't one of tonight's characters. Pick another.");
  if ((await takenFigures(ctx, game._id, self)).has(figure)) throw new ConvexError("Someone just took that drawing. Pick another.");
  return figure;
}

/** The weapon a guest picked: one from the pool, and nobody else's in this game. */
async function checkWeapon(ctx: MutationCtx, game: Doc<"games">, weapon: string | undefined, self?: Id<"players">) {
  if (!weapon) throw new ConvexError("Pick your weapon.");
  if (!isWeapon(weapon)) throw new ConvexError("Pick a weapon from the list.");
  if ((await takenWeapons(ctx, game._id, self)).has(weapon)) throw new ConvexError("Someone just took that weapon. Pick another.");
  return weapon;
}

/** The sign-up weapon rack: every weapon and whether another guest already has it. Nothing private. */
export const weapons = query({
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
    const taken = await takenWeapons(ctx, game._id, me?._id);
    return WEAPONS.map((w) => ({ key: w.key, name: w.name, taken: taken.has(w.key) }));
  },
});

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
    return figureSets(!!game.lookalikes).map((set) => ({
      label: set.label,
      figures: set.keys.map((key) => ({ key, taken: taken.has(key), name: set.guests ? lookalikeName(key) : null })),
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

export const generateUploadUrl = mutation({
  args: { slug: v.optional(v.string()), roomCode: v.optional(v.string()) },
  handler: async (ctx, { slug, roomCode }) => {
    const game = await gameBySlugOrActive(ctx, slug);
    if (!game || !(registrationIsOpen(game, Date.now()) || walkInOk(game, roomCode))) {
      throw new ConvexError("Registration is closed.");
    }
    return await ctx.storage.generateUploadUrl();
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

    const p = validateProfile(game, args);
    await assertNameFree(ctx, game._id, p.charName);
    const figure = await checkFigure(ctx, game, args.figure);
    const weapon = await checkWeapon(ctx, game, args.weapon);

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
      who: p.who,
      signature: p.signature,
      photoId: args.photoId,
      motive: p.motive || undefined,
      secret: p.secret || undefined,
      rumor: p.rumor || undefined,
      sayAs: p.sayAs || undefined,
      figure,
      killerOk: p.killerOk,
      checkedIn: false,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("weapons", { gameId: game._id, playerId, key: weapon, name: weaponName(weapon)!, description: "" });
    if (walkIn) {
      // A walk-in is in the room already: they're checked in, and the TV announces them like any join.
      await ctx.db.patch(playerId, { checkedIn: true, weaponIn: true, exhibitLetter: await dealLetter(ctx, game), claimedAt: now });
      await ctx.db.patch(game._id, { lastJoin: { name: p.charName, at: now } });
    }
    return { token };
  },
});

/** A guest's own profile, weapon included. Only reachable with their personal code. */
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
    const weapon = await ctx.db
      .query("weapons")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .unique();
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
      who: player.who,
      signature: player.signature,
      photoUrl: player.photoId ? await ctx.storage.getUrl(player.photoId) : null,
      motive: player.motive ?? "",
      secret: player.secret ?? "",
      rumor: player.rumor ?? "",
      sayAs: player.sayAs ?? "",
      figure: player.figure ?? null,
      killerOk: player.killerOk,
      // The pool key ("" for a guest who typed their own weapon before the pool, so they pick again).
      weapon: weapon?.key ?? "",
      weaponName: weapon?.name ?? "",
    };
  },
});

export const update = mutation({
  args: { token: v.string(), ...profileArgs, removePhoto: v.optional(v.boolean()) },
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

    const p = validateProfile(game, args);
    await assertNameFree(ctx, game._id, p.charName, player._id);
    const weapon = await ctx.db
      .query("weapons")
      .withIndex("by_player", (q) => q.eq("playerId", player._id))
      .unique();
    // A different weapon has to be free; the same one stays theirs.
    const weaponKey = args.weapon === weapon?.key ? args.weapon : await checkWeapon(ctx, game, args.weapon, player._id);

    let photoId = player.photoId;
    if (args.photoId && args.photoId !== player.photoId) {
      if (player.photoId) await ctx.storage.delete(player.photoId);
      photoId = args.photoId;
    } else if (args.removePhoto && player.photoId) {
      await ctx.storage.delete(player.photoId);
      photoId = undefined;
    }

    await ctx.db.patch(player._id, {
      realName: p.realName,
      charName: p.charName,
      charKey: charKeyOf(p.charName),
      who: p.who,
      signature: p.signature,
      photoId,
      motive: p.motive || undefined,
      secret: p.secret || undefined,
      // Older pages don't send these: leave what's there.
      ...(args.rumor !== undefined ? { rumor: p.rumor || undefined } : {}),
      ...(args.sayAs !== undefined ? { sayAs: p.sayAs || undefined } : {}),
      // A different drawing has to be free; the same one stays theirs.
      ...(args.figure && args.figure !== player.figure ? { figure: await checkFigure(ctx, game, args.figure, player._id) } : {}),
      killerOk: p.killerOk,
      updatedAt: Date.now(),
    });
    const row = { key: weaponKey, name: weaponName(weaponKey)!, description: "" };
    if (weapon) await ctx.db.patch(weapon._id, row);
    else await ctx.db.insert("weapons", { gameId: game._id, playerId: player._id, ...row });
    return { ok: true };
  },
});
