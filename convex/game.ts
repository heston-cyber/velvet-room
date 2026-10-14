import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { buildCase, checkInput } from "./engine/build";
import { secure, seeded, shuffle } from "./engine/rng";
import { FAKE_GUESTS, LETTERS } from "./engine/fake";
import type { CaseFile, CaseInput } from "./engine/types";
import { randomCode, requireHost } from "./lib";
import { seal, unseal } from "./seal";

async function playerByToken(ctx: QueryCtx, token: string) {
  if (!token) return null;
  return await ctx.db
    .query("players")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();
}

async function caseFor(ctx: QueryCtx, game: Doc<"games">): Promise<CaseFile | null> {
  const box = await ctx.db
    .query("sealed")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .unique();
  return box ? await unseal<CaseFile>(box) : null;
}

/** Builds the engine's input from who actually showed up. */
async function caseInput(ctx: QueryCtx, game: Doc<"games">): Promise<CaseInput> {
  const players = (
    await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect()
  ).filter((p) => p.checkedIn);
  const weapons = await ctx.db
    .query("weapons")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  const markers = await ctx.db
    .query("markers")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  const byId = new Map(players.map((p) => [p._id, p]));
  return {
    suspects: players.map((p) => ({ id: p._id, name: p.charName, signature: p.signature, who: p.who, killerOk: p.killerOk })),
    exhibits: weapons
      .filter((w) => {
        const p = byId.get(w.playerId);
        return p && p.weaponIn && p.exhibitLetter;
      })
      .map((w) => ({
        id: w._id,
        letter: byId.get(w.playerId)!.exhibitLetter!,
        name: w.name,
        description: w.description,
        ownerId: w.playerId,
      })),
    rooms: game.rooms.map((r) => ({ key: r.key, label: r.label })),
    bodyRoomKey: game.bodyRoomKey,
    markers: markers.map((m) => ({ number: m.number, roomKey: m.roomKey })),
    playerMotives: Object.fromEntries(players.map((p) => [p._id, { motive: p.motive, secret: p.secret }])),
  };
}

/** Deals a random unused exhibit letter, so letters can't reveal arrival order. */
async function dealLetter(ctx: MutationCtx, game: Doc<"games">): Promise<string> {
  const players = await ctx.db
    .query("players")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  const used = new Set(players.map((p) => p.exhibitLetter).filter(Boolean));
  const size = Math.max(players.length, used.size + 1);
  let pool = LETTERS.slice(0, size).filter((l) => !used.has(l));
  if (!pool.length) pool = LETTERS.filter((l) => !used.has(l));
  return shuffle(secure(), pool)[0];
}

/** Party night: a guest checks in on their phone and gets the letter for their bagged weapon. */
export const checkIn = mutation({
  args: { token: v.string(), weaponIn: v.boolean() },
  handler: async (ctx, { token, weaponIn }) => {
    const player = await playerByToken(ctx, token);
    if (!player) throw new ConvexError("That link doesn't match a guest.");
    const game = (await ctx.db.get(player.gameId))!;
    if (game.status !== "registration" && game.status !== "lobby") {
      throw new ConvexError("The game has already started, so new check-ins can't join.");
    }
    const letter = player.exhibitLetter ?? (await dealLetter(ctx, game));
    await ctx.db.patch(player._id, { checkedIn: true, weaponIn, exhibitLetter: letter });
    return { exhibitLetter: letter };
  },
});

/** Host: log the numbered markers and the room each one is in. Codes stay stable per number. */
export const saveMarkers = mutation({
  args: {
    slug: v.string(),
    hostKey: v.string(),
    markers: v.array(v.object({ number: v.number(), roomKey: v.string() })),
  },
  handler: async (ctx, { slug, hostKey, markers }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (game.status !== "registration" && game.status !== "lobby") throw new ConvexError("The game has started, so markers are locked.");
    const rooms = new Set(game.rooms.map((r) => r.key));
    const numbers = new Set<number>();
    for (const m of markers) {
      if (!rooms.has(m.roomKey)) throw new ConvexError(`Marker ${m.number} is in a room that isn't in play.`);
      if (numbers.has(m.number)) throw new ConvexError(`Marker ${m.number} is listed twice.`);
      numbers.add(m.number);
    }
    const existing = await ctx.db
      .query("markers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    const byNumber = new Map(existing.map((m) => [m.number, m]));
    for (const m of existing) if (!numbers.has(m.number)) await ctx.db.delete(m._id);
    for (const m of markers) {
      const old = byNumber.get(m.number);
      if (old) await ctx.db.patch(old._id, { roomKey: m.roomKey });
      else await ctx.db.insert("markers", { gameId: game._id, number: m.number, roomKey: m.roomKey, code: randomCode(6) });
    }
    return { ok: true };
  },
});

/** Host: the secret draw. Builds and seals the case. Returns counts only, never the answer. */
export const startGame = mutation({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (game.status !== "registration" && game.status !== "lobby") throw new ConvexError("This game has already started.");
    const input = await caseInput(ctx, game);
    const problems = checkInput(input);
    if (problems.length) throw new ConvexError(problems.join(" "));
    let cf: CaseFile;
    try {
      cf = buildCase(input, secure());
    } catch (err) {
      throw new ConvexError(`The draw failed: ${(err as Error).message}`);
    }
    const { validation: _v, ...file } = cf as CaseFile & { validation?: unknown };
    const box = await seal(file);
    await ctx.db.insert("sealed", { gameId: game._id, ...box });
    await ctx.db.patch(game._id, { status: "playing", round: 1, startedAt: Date.now(), registrationOpen: false });
    return { suspects: input.suspects.length, exhibits: input.exhibits.length, markers: input.markers.length };
  },
});

/** A guest's own private screen once the game is on: role, motive, secret, tip. */
export const myBriefing = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const player = await playerByToken(ctx, token);
    if (!player) return null;
    const game = (await ctx.db.get(player.gameId))!;
    if (game.status !== "playing" && game.status !== "reveal" && game.status !== "done") return { started: false as const };
    const cf = await caseFor(ctx, game);
    if (!cf) return { started: false as const };
    const b = cf.briefings.find((x) => x.playerId === player._id);
    if (!b) return { started: true as const, inGame: false as const };
    const tip = cf.tips.find((t) => t.playerId === player._id);
    return {
      started: true as const,
      inGame: true as const,
      role: b.role,
      motive: b.motive,
      secret: b.secret,
      lines: b.lines,
      tip: tip?.text ?? null,
      exhibitLetter: player.exhibitLetter ?? null,
    };
  },
});

/** A guest scans a marker's QR card. Only works for checked-in guests once the game has started. */
export const readMarker = query({
  args: { token: v.string(), code: v.string() },
  handler: async (ctx, { token, code }) => {
    const player = await playerByToken(ctx, token);
    if (!player) return { error: "Open your personal link first, then scan again." };
    const marker = await ctx.db
      .query("markers")
      .withIndex("by_code", (q) => q.eq("code", code))
      .unique();
    if (!marker || marker.gameId !== player.gameId) return { error: "That card isn't part of this game." };
    const game = (await ctx.db.get(player.gameId))!;
    if (game.status === "registration" || game.status === "lobby") return { error: "Nothing here yet. The game hasn't started." };
    const cf = await caseFor(ctx, game);
    const clue = cf?.clues.find((c) => c.channel === "marker" && c.markerNumber === marker.number);
    const room = game.rooms.find((r) => r.key === marker.roomKey);
    return { number: marker.number, room: room?.label ?? "", text: clue?.text ?? "Nothing useful here." };
  },
});

/** Evidence released to everyone on the TV so far. Public by design. */
export const evidence = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!game || !game.round || game.round < 2) return [];
    const cf = await caseFor(ctx, game);
    if (!cf) return [];
    return cf.clues
      .filter((c) => c.channel === "tv" && c.round <= game.round!)
      .map((c) => ({ round: c.round, text: c.text, twist: c.kind === "twist" }));
  },
});

// ---------- test mode (internal: CLI or dashboard only) ----------

/** Fills a TEST game with fake guests, checks them in, and logs markers. */
export const seedFakeCast = internalMutation({
  args: { slug: v.string(), guests: v.number(), markers: v.number(), seed: v.optional(v.number()) },
  handler: async (ctx, { slug, guests, markers, seed }) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!game) throw new ConvexError("No such game.");
    if (!game.isTest) throw new ConvexError("Fake guests only go in test games.");
    const rng = seed ? seeded(seed) : secure();
    const now = Date.now();
    for (const g of shuffle(rng, FAKE_GUESTS).slice(0, guests)) {
      const playerId = await ctx.db.insert("players", {
        gameId: game._id,
        token: randomCode(10),
        realName: `Test ${g.name.split(" ")[0]}`,
        charName: g.name,
        charKey: g.name.toLowerCase().replace(/[^a-z0-9]+/g, ""),
        who: g.who,
        signature: g.signature,
        killerOk: rng() < 0.8,
        checkedIn: false,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("weapons", { gameId: game._id, playerId, name: g.weapon, description: g.weaponDesc });
    }
    const players = await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    const letters = shuffle(rng, LETTERS.slice(0, players.length));
    for (const [i, p] of players.entries()) {
      await ctx.db.patch(p._id, { checkedIn: true, weaponIn: true, exhibitLetter: p.exhibitLetter ?? letters[i] });
    }
    const old = await ctx.db
      .query("markers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    for (const m of old) await ctx.db.delete(m._id);
    for (let n = 1; n <= markers; n++) {
      await ctx.db.insert("markers", { gameId: game._id, number: n, roomKey: game.rooms[(n - 1) % game.rooms.length].key, code: randomCode(6) });
    }
    return { players: players.length, markers };
  },
});

/** Puts a TEST game back before the draw so it can be played again. */
export const resetTestGame = internalMutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!game || !game.isTest) throw new ConvexError("Only test games can be reset.");
    const boxes = await ctx.db
      .query("sealed")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    for (const b of boxes) await ctx.db.delete(b._id);
    await ctx.db.patch(game._id, { status: "registration", round: undefined, startedAt: undefined, registrationOpen: true });
    return { ok: true };
  },
});
