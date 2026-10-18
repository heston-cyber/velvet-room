import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { ACCOMPLICE_ON, MAX_ROOMS, MIN_ROOMS, openRoomsIn } from "./engine/build";
import { randomCode, registrationIsOpen, requireHost } from "./lib";
import { ensureAllCards } from "./cards";
import { MAX_CARDS, hasJailVote, revealTimes } from "./shared";
import { WEAPONS, checkWeaponKeys, drawWeapons, recommendedWeapons } from "./weapons";
import { secure } from "./engine/rng";
import { levelsOf, narratorOf, scriptOf } from "./voiceLines";
import { heckleWanted } from "./heckles";

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
 * apart from counts.
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
    // Award ballots cast (a count only).
    const awardVotes = game.status === "reveal" || game.status === "done"
      ? (await ctx.db
          .query("votes")
          .withIndex("by_game", (q) => q.eq("gameId", game._id))
          .collect()).filter((x) => x.dressed).length
      : 0;
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
          jailed: !!p.jailed,
          ready: !!round && p.readyRound === round,
          accused: accused.has(p._id),
          claimed: !!p.claimedAt,
          registeredAt: p.createdAt,
        })),
    );
    // v2: the free guests (not in jail) are the ones who ready up and lock in.
    const playing = rows.filter((p) => p.inGame && !p.jailed);
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
        // Oct 17 (D5): no jail vote with fewer than 5 guests in the game (before Start: the ones checked in).
        jailVote: hasJailVote(started(game) ? rows.filter((p) => p.inGame).length : rows.filter((p) => p.checkedIn).length),
        // v2: a killer and an accomplice (7+ players). hasAccomplice: what Start decided (null before Start).
        // Oct 16: the role is off (ACCOMPLICE_ON), so this reads false whatever was saved.
        accomplice: ACCOMPLICE_ON && !!game.accomplice,
        hasAccomplice: started(game) ? !!game.hasAccomplice : null,
        lookalikes: !!game.lookalikes,
        rooms: game.rooms,
        // The night's weapons (Oct 16: drawn by the game). Empty: drawn at Play, as many as recommendedWeapons says.
        weapons: game.weaponKeys ?? [],
        pacing: game.pacing,
        tone: game.tone ?? "classic",
        search: game.search ?? "all",
        wifi: game.wifi ?? { name: "", password: "" },
        narrator: narratorOf(game),
        levels: levelsOf(game),
        // What this game picked at Start, so the laptop can steer clear of it next game (Oct 16).
        heard: game.lines ? { script: scriptOf(game), lines: game.lines.picks, heckles: (await heckleWanted(ctx, game)).map((h) => h.line.id), gag: !!game.lines.gag } : null,
        rulesAt: game.rulesAt ?? null,
        rollCallAt: game.rollCallAt ?? null,
        doorsAt: game.doorsAt ?? null,
        roomCode: game.roomCode ?? null,
        round,
        paused: !!game.paused,
        roundEndsAt: game.roundEndsAt ?? null,
        introEndsAt: game.introEndsAt ?? null,
        startedAt: game.startedAt ?? null,
        // v2: the show's parts (convex/show.ts), so the host can skip to the next one.
        show: game.show ? { howAt: game.show.howAt, introAt: game.show.introAt ?? null, rollAt: game.show.rollAt, phonesAt: game.show.phonesAt ?? null } : null,
        // F7 (Oct 17): "Show the awards" waits for the reveal's verdict, so phones get to show the ballot first.
        verdictAt: game.revealAt ? game.revealAt + (game.revealPlan ?? revealTimes(!!game.hasAccomplice, game.tone ?? "classic")).verdict : null,
        // v2: this round's vote, so the host can close it or skip its verdict.
        vote: game.vote && game.vote.round === game.round ? { kind: game.vote.kind, closedAt: game.vote.closedAt ?? null, nextAt: game.vote.nextAt ?? null } : null,
        tvShowAll: !!game.tvShowAll,
        endedAt: game.endedAt ?? null,
        nextSlug: game.nextSlug ?? null,
        gameNumber: game.gameNumber ?? 1,
        tvKey: game.tvKey ?? null,
        // Public once the game starts: where the body was found, and which rooms are open now.
        bodyRoom: started(game) ? label(game.bodyRoomKey) : null,
        openRooms: started(game) && game.roomOrder ? openRoomsIn(round, game.roomOrder, game.search).map(label) : [],
      },
      players: rows,
      // Every weapon the game can draw (for the Options picker), and how many the ledger recommends for the sign-ups.
      weaponPool: WEAPONS.map((w) => ({ key: w.key, name: w.name, kind: w.kind })),
      weaponsRecommended: recommendedWeapons(players.length),
      markers: markers.sort((a, b) => a.number - b.number).map((m) => ({ number: m.number, roomKey: m.roomKey })),
      counts: {
        total: players.length,
        optedIn: players.filter((p) => p.killerOk).length,
        // Oct 17 (D8): checked-in guests who can be drawn as the killer (everyone who didn't opt out). A count, no names.
        killerPool: players.filter((p) => p.checkedIn && p.killerOk).length,
        checkedIn: rows.filter((p) => p.checkedIn).length,
        weaponsIn: rows.filter((p) => p.checkedIn && p.weaponIn).length,
        inGame: playing.length,
        ready: playing.filter((p) => p.ready).length,
        accused: playing.filter((p) => p.accused).length,
        awardVotes,
        inGameAll: rows.filter((p) => p.inGame).length,
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
    accomplice: v.optional(v.boolean()),
    lookalikes: v.optional(v.boolean()),
    registrationOpen: v.optional(v.boolean()),
    registrationClosesAt: v.optional(v.number()),
    deadlineLabel: v.optional(v.string()),
    rooms: v.optional(v.array(roomV)),
    // The night's weapons: keys from the pool; [] clears them (the game draws them at Play); drawWeapons draws n now.
    weapons: v.optional(v.array(v.string())),
    drawWeapons: v.optional(v.number()),
    pacing: v.optional(
      v.object({
        mode: v.union(v.literal("ready"), v.literal("timer")),
        roundMinutes: v.number(),
      }),
    ),
    tone: v.optional(v.union(v.literal("classic"), v.literal("adult"))),
    search: v.optional(v.union(v.literal("all"), v.literal("waves"))),
    wifi: v.optional(v.object({ name: v.string(), password: v.string() })),
    narrator: v.optional(v.object({ host: v.union(v.literal("ivy"), v.literal("duke")), unstable: v.boolean(), sailor: v.optional(v.boolean()) })),
    levels: v.optional(v.object({ voice: v.number(), music: v.number(), sfx: v.number() })),
  },
  handler: async (ctx, { slug, hostKey, ...patch }) => {
    const game = await requireHost(ctx, slug, hostKey);
    // Guest Wi-Fi and the volume levels can change any time (a typo shouldn't wait); everything else locks at Start.
    const anyTime = ["wifi", "levels"];
    const onlyWifi = Object.entries(patch).every(([k, val]) => anyTime.includes(k) || val === undefined);
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
    if (patch.weapons) {
      if (patch.weapons.length) {
        const bad = checkWeaponKeys(patch.weapons);
        if (bad) throw new ConvexError(bad);
      }
      update.weaponKeys = patch.weapons.length ? patch.weapons : undefined;
    }
    if (patch.drawWeapons !== undefined) update.weaponKeys = drawWeapons(patch.drawWeapons, secure());
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
    if (patch.narrator) {
      // Sailor mode is Joel (Mister Gruff's voice), steady (the fury is in the script), over the Adult script.
      update.narrator = patch.narrator.sailor ? { host: "duke", unstable: false, sailor: true } : { host: patch.narrator.host, unstable: patch.narrator.unstable };
      const wasSailor = !!game.narrator?.sailor;
      if (patch.narrator.sailor && !wasSailor) {
        update.tone = "adult";
        update.toneBeforeSailor = game.tone ?? "classic";
      }
      // F9 (Oct 17): turning Sailor mode off brings back the script the game had before it.
      if (!patch.narrator.sailor && wasSailor && patch.tone === undefined) {
        update.tone = game.toneBeforeSailor ?? game.tone;
        update.toneBeforeSailor = undefined;
      }
    }
    // Back to Classic turns Sailor mode off.
    if (patch.tone === "classic" && !patch.narrator && game.narrator?.sailor) update.narrator = { ...game.narrator, sailor: false };
    // The accomplice setting is ignored while the role is off (ACCOMPLICE_ON).
    if (ACCOMPLICE_ON && patch.accomplice !== undefined) update.accomplice = patch.accomplice;
    // Oct 17: guests no longer write their own motives (D9) and the killer opt-out is always on (D8), so older pages'
    // motiveMode and killerOptIn are ignored.
    for (const key of ["lookalikes", "registrationOpen", "registrationClosesAt", "deadlineLabel", "tone", "search"] as const) {
      if (patch[key] !== undefined) (update as Record<string, unknown>)[key] = patch[key];
    }
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

/**
 * F4 (Oct 17): the host marks a guest as not here (or here) before the draw, so a link left open at home can't put
 * someone in the game. Only before Start.
 */
export const setHere = mutation({
  args: { slug: v.string(), hostKey: v.string(), playerId: v.id("players"), here: v.boolean() },
  handler: async (ctx, { slug, hostKey, playerId, here }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (started(game)) throw new ConvexError("The game has started, so the guest list is locked.");
    const p = await ctx.db.get(playerId);
    if (!p || p.gameId !== game._id) throw new ConvexError("Guest not found.");
    await ctx.db.patch(p._id, { checkedIn: here, updatedAt: Date.now() });
    return { ok: true };
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
