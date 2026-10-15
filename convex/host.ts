import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { MAX_ROOMS, MIN_ROOMS, openRoomsIn } from "./engine/build";
import type { CaseFile } from "./engine/types";
import { randomCode, registrationIsOpen, requireHost } from "./lib";
import { ensureAllCards } from "./cards";
import { MAX_CARDS } from "./shared";
import { unseal } from "./seal";
import { levelsOf, narratorOf } from "./voiceLines";

const started = (g: Doc<"games">) => g.status !== "registration" && g.status !== "lobby";

async function playersOf(ctx: QueryCtx, game: Doc<"games">) {
  return await ctx.db
    .query("players")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
}

/**
 * The host's view of the game. Built to hold no spoilers: characters and real
 * names only. Weapons, motives, secrets, roles and guesses are never read here,
 * apart from counts. (Self MC has its own query, mcSheet, that does show the answer.)
 */
export const roster = query({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    const players = await playersOf(ctx, game);
    const accs = started(game)
      ? await ctx.db
          .query("accusations")
          .withIndex("by_game", (q) => q.eq("gameId", game._id))
          .collect()
      : [];
    const accused = new Set(accs.map((a) => a.playerId));
    const markers = await ctx.db
      .query("markers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    const round = game.round ?? 0;
    const rows = await Promise.all(
      players
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(async (p) => ({
          id: p._id,
          charName: p.charName,
          realName: p.realName,
          who: p.who,
          signature: p.signature,
          photoUrl: p.photoId ? await ctx.storage.getUrl(p.photoId) : null,
          figure: p.figure ?? null,
          checkedIn: p.checkedIn,
          weaponIn: !!p.weaponIn,
          inGame: !!p.inGame,
          ready: !!round && p.readyRound === round,
          accused: accused.has(p._id),
          isMC: game.mcPlayerId === p._id,
          claimed: !!p.claimedAt,
          registeredAt: p.createdAt,
        })),
    );
    const playing = rows.filter((p) => p.inGame && !p.isMC);
    const label = (key?: string) => game.rooms.find((r) => r.key === key)?.label ?? "";
    return {
      game: {
        slug: game.slug,
        title: game.title,
        isTest: game.isTest,
        status: game.status,
        open: registrationIsOpen(game, Date.now()),
        registrationOpen: game.registrationOpen,
        registrationClosesAt: game.registrationClosesAt,
        deadlineLabel: game.deadlineLabel,
        motiveMode: game.motiveMode,
        killerOptIn: game.killerOptIn,
        lookalikes: !!game.lookalikes,
        rooms: game.rooms,
        pacing: game.pacing,
        tone: game.tone ?? "classic",
        mode: game.mode ?? "play",
        mcPlayerId: game.mcPlayerId ?? null,
        search: game.search ?? "all",
        wifi: game.wifi ?? { name: "", password: "" },
        narrator: narratorOf(game),
        levels: levelsOf(game),
        rulesAt: game.rulesAt ?? null,
        rollCallAt: game.rollCallAt ?? null,
        doorsAt: game.doorsAt ?? null,
        tvMedia: !!game.tvMedia,
        roomCode: game.roomCode ?? null,
        round,
        paused: !!game.paused,
        roundEndsAt: game.roundEndsAt ?? null,
        introEndsAt: game.introEndsAt ?? null,
        // v2: the show's parts (convex/show.ts), so the host can skip to the next one.
        show: game.show ? { howAt: game.show.howAt, rollAt: game.show.rollAt, phonesAt: game.show.phonesAt ?? null } : null,
        tvShowAll: !!game.tvShowAll,
        endedAt: game.endedAt ?? null,
        nextSlug: game.nextSlug ?? null,
        gameNumber: game.gameNumber ?? 1,
        tvKey: game.tvKey ?? null,
        tvSeenAt: game.tvSeenAt ?? null,
        tvSound: !!game.tvSound,
        // Public once the game starts: where the body was found, and which rooms are open now.
        bodyRoom: started(game) ? label(game.bodyRoomKey) : null,
        openRooms: started(game) && game.roomOrder ? openRoomsIn(round, game.roomOrder, game.search).map(label) : [],
      },
      players: rows,
      markers: markers.sort((a, b) => a.number - b.number).map((m) => ({ number: m.number, roomKey: m.roomKey })),
      counts: {
        total: players.length,
        optedIn: players.filter((p) => p.killerOk).length,
        checkedIn: rows.filter((p) => p.checkedIn && !p.isMC).length,
        weaponsIn: rows.filter((p) => p.checkedIn && p.weaponIn && !p.isMC).length,
        inGame: playing.length,
        ready: playing.filter((p) => p.ready).length,
        accused: playing.filter((p) => p.accused).length,
      },
    };
  },
});

const roomV = v.object({ key: v.string(), label: v.string(), houseName: v.string() });

export const updateSettings = mutation({
  args: {
    slug: v.string(),
    hostKey: v.string(),
    motiveMode: v.optional(v.union(v.literal("game"), v.literal("players"))),
    killerOptIn: v.optional(v.boolean()),
    lookalikes: v.optional(v.boolean()),
    registrationOpen: v.optional(v.boolean()),
    registrationClosesAt: v.optional(v.number()),
    deadlineLabel: v.optional(v.string()),
    rooms: v.optional(v.array(roomV)),
    pacing: v.optional(
      v.object({
        mode: v.union(v.literal("ready"), v.literal("timer")),
        roundMinutes: v.number(),
      }),
    ),
    tone: v.optional(v.union(v.literal("classic"), v.literal("adult"))),
    mode: v.optional(v.union(v.literal("play"), v.literal("mc"))),
    mcPlayerId: v.optional(v.union(v.id("players"), v.null())),
    search: v.optional(v.union(v.literal("all"), v.literal("waves"))),
    wifi: v.optional(v.object({ name: v.string(), password: v.string() })),
    narrator: v.optional(v.object({ host: v.union(v.literal("ivy"), v.literal("duke")), unstable: v.boolean() })),
    levels: v.optional(v.object({ voice: v.number(), music: v.number(), sfx: v.number() })),
  },
  handler: async (ctx, { slug, hostKey, mcPlayerId, ...patch }) => {
    const game = await requireHost(ctx, slug, hostKey);
    // Guest Wi-Fi and the volume levels can change any time (a typo shouldn't wait); everything else locks at Start.
    const anyTime = ["wifi", "levels"];
    const onlyWifi = mcPlayerId === undefined && Object.entries(patch).every(([k, val]) => anyTime.includes(k) || val === undefined);
    if (started(game) && !onlyWifi) throw new ConvexError("The game has started, so settings are locked.");
    const update: Partial<Doc<"games">> = {};
    if (patch.rooms) {
      const rooms = patch.rooms.map((r) => ({ key: r.key.trim(), label: r.label.replace(/\s+/g, " ").trim(), houseName: r.houseName.replace(/\s+/g, " ").trim() }));
      if (rooms.length < MIN_ROOMS) throw new ConvexError(`Play with at least ${MIN_ROOMS} rooms.`);
      if (rooms.length > MAX_ROOMS) throw new ConvexError(`Play with at most ${MAX_ROOMS} rooms.`);
      if (rooms.some((r) => !r.key)) throw new ConvexError("Each room needs its own key.");
      if (new Set(rooms.map((r) => r.key)).size !== rooms.length) throw new ConvexError("Each room needs its own key.");
      if (rooms.some((r) => !r.label)) throw new ConvexError("Every room needs a name.");
      if (rooms.some((r) => r.label.length > 40 || r.houseName.length > 40)) throw new ConvexError("Keep room names under 40 characters.");
      if (new Set(rooms.map((r) => r.label.toLowerCase())).size !== rooms.length) throw new ConvexError("Two rooms have the same name.");
      update.rooms = rooms;
      // Markers in a room that was removed need a new room before the game can start.
      const keys = new Set(rooms.map((r) => r.key));
      const markers = await ctx.db
        .query("markers")
        .withIndex("by_game", (q) => q.eq("gameId", game._id))
        .collect();
      for (const m of markers) if (m.roomKey && !keys.has(m.roomKey)) await ctx.db.patch(m._id, { roomKey: "" });
    }
    if (patch.pacing) {
      if (patch.pacing.roundMinutes < 3 || patch.pacing.roundMinutes > 60) throw new ConvexError("Round length must be between 3 and 60 minutes.");
      update.pacing = { mode: patch.pacing.mode, roundMinutes: Math.round(patch.pacing.roundMinutes) };
    }
    if (patch.wifi) {
      const name = patch.wifi.name.trim();
      const password = patch.wifi.password.trim();
      if (name.length > 32) throw new ConvexError("Wi-Fi names are 32 characters at most.");
      if (password.length > 63) throw new ConvexError("Wi-Fi passwords are 63 characters at most.");
      update.wifi = { name, password };
    }
    if (patch.levels) {
      const lv = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
      update.levels = { voice: lv(patch.levels.voice), music: lv(patch.levels.music), sfx: lv(patch.levels.sfx) };
    }
    if (patch.narrator) update.narrator = { host: patch.narrator.host, unstable: patch.narrator.unstable };
    if (mcPlayerId !== undefined) {
      const nextMode = patch.mode ?? game.mode ?? "play";
      if (mcPlayerId !== null && nextMode !== "mc") throw new ConvexError("Pick Self MC first, then choose the MC.");
      if (mcPlayerId === null) update.mcPlayerId = undefined;
      else {
        const p = await ctx.db.get(mcPlayerId);
        if (!p || p.gameId !== game._id) throw new ConvexError("Pick the MC from the guest list.");
        update.mcPlayerId = mcPlayerId;
      }
    }
    for (const key of ["motiveMode", "killerOptIn", "lookalikes", "registrationOpen", "registrationClosesAt", "deadlineLabel", "tone", "mode", "search"] as const) {
      if (patch[key] !== undefined) (update as Record<string, unknown>)[key] = patch[key];
    }
    // Switching back to "everyone plays" means nobody is the MC.
    if (patch.mode === "play") update.mcPlayerId = undefined;
    await ctx.db.patch(game._id, update);
    return { ok: true };
  },
});

export const removePlayer = mutation({
  args: { slug: v.string(), hostKey: v.string(), playerId: v.id("players") },
  handler: async (ctx, { slug, hostKey, playerId }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (started(game)) throw new ConvexError("The game has started, so the guest list is locked.");
    const player = await ctx.db.get(playerId);
    if (!player || player.gameId !== game._id) throw new ConvexError("Guest not found.");
    const weapons = await ctx.db
      .query("weapons")
      .withIndex("by_player", (q) => q.eq("playerId", playerId))
      .collect();
    for (const w of weapons) await ctx.db.delete(w._id);
    if (player.photoId) await ctx.storage.delete(player.photoId);
    if (game.mcPlayerId === playerId) await ctx.db.patch(game._id, { mcPlayerId: undefined });
    await ctx.db.delete(playerId);
    return { ok: true };
  },
});

/**
 * Rescue a phone: the guest gets a brand-new personal link (shown as a QR code for any phone)
 * and their old link stops working. The TV announces it, so it can't be used quietly to peek at a role.
 */
export const rescuePhone = mutation({
  args: { slug: v.string(), hostKey: v.string(), playerId: v.id("players") },
  handler: async (ctx, { slug, hostKey, playerId }) => {
    const game = await requireHost(ctx, slug, hostKey);
    const p = await ctx.db.get(playerId);
    if (!p || p.gameId !== game._id) throw new ConvexError("Guest not found.");
    let token = randomCode(10);
    while (
      await ctx.db
        .query("players")
        .withIndex("by_token", (q) => q.eq("token", token))
        .first()
    ) token = randomCode(10);
    // The name is free again: the guest can join with the room code, or scan the new link.
    await ctx.db.patch(p._id, { token, updatedAt: Date.now(), claimedAt: undefined });
    await ctx.db.patch(game._id, { lastRescue: { name: p.charName, at: Date.now() } });
    return { charName: p.charName, token };
  },
});

/** Older games were made before the TV had its own key. */
export const ensureTvKey = mutation({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (game.tvKey) return { tvKey: game.tvKey };
    const tvKey = randomCode(16);
    await ctx.db.patch(game._id, { tvKey });
    return { tvKey };
  },
});

/** Makes sure the full printed set of QR cards exists (one set for every game). */
export const ensureCards = mutation({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    await requireHost(ctx, slug, hostKey);
    await ensureAllCards(ctx);
    return { ok: true };
  },
});

/** Every printable QR card, and which ones this game uses. */
export const markerCards = query({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    const cards = await ctx.db.query("cards").collect();
    const markers = await ctx.db
      .query("markers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    return {
      title: game.title,
      complete: cards.length >= MAX_CARDS,
      cards: cards
        .filter((c) => c.number <= MAX_CARDS)
        .sort((a, b) => a.number - b.number)
        .map((c) => ({ number: c.number, code: c.code })),
      markers: markers
        .sort((a, b) => a.number - b.number)
        .map((m) => ({ number: m.number, code: m.code, room: game.rooms.find((r) => r.key === m.roomKey)?.label ?? "" })),
    };
  },
});

/**
 * Self MC only: the answer, where the body was found, and every clue in order,
 * for the one person running the night. Returns nothing in "everyone plays" mode.
 */
export const mcSheet = query({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if ((game.mode ?? "play") !== "mc" || !started(game)) return null;
    const box = await ctx.db
      .query("sealed")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .unique();
    if (!box) return null;
    const cf = await unseal<CaseFile>(box);
    const players = await playersOf(ctx, game);
    const name = (id: string) => players.find((p) => p._id === id)?.charName ?? "";
    const weapon = await ctx.db.get(cf.solution.exhibitId as Doc<"weapons">["_id"]);
    const letter = weapon ? players.find((p) => p._id === weapon.playerId)?.exhibitLetter ?? "" : "";
    const label = (key?: string) => game.rooms.find((r) => r.key === key)?.label ?? "";
    const markers = await ctx.db
      .query("markers")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    return {
      killer: name(cf.solution.killerId),
      exhibit: { letter, name: weapon?.name ?? "" },
      room: label(cf.solution.roomKey),
      bodyRoom: label(cf.bodyRoomKey),
      clues: cf.clues
        .map((c) => ({
          round: c.round,
          onTv: c.channel === "tv",
          marker: c.markerNumber ?? null,
          room: c.markerNumber ? label(markers.find((m) => m.number === c.markerNumber)?.roomKey) : "",
          twist: c.kind === "twist",
          text: c.text,
        }))
        .sort((a, b) => a.round - b.round || Number(a.onTv) - Number(b.onTv) || (a.marker ?? 0) - (b.marker ?? 0)),
    };
  },
});
