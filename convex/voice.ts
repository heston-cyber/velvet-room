// The narrator's custom lines for this party, recorded on the server with ElevenLabs.
// The API key lives only in the Convex environment (ELEVENLABS_API_KEY): never in the site, never on phones.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { HOSTS, TTS_MODEL, VOICE_SETTINGS } from "./narration";
import { requireHost } from "./lib";
import { secure, shuffle } from "./engine/rng";
import { clipMatches, narratorOf, rollWanted, secondsOfMp3, startWanted, voiceOf, type Wanted } from "./voiceLines";
import { rollLineFor } from "./narration";

const ROLL_LINE_MAX = 200;
const CLAIM_MS = 90_000; // a pending recording older than this is treated as stuck

const before = (g: Doc<"games">) => g.status === "registration" || g.status === "lobby";

async function playersOf(ctx: QueryCtx, gameId: Id<"games">) {
  return await ctx.db
    .query("players")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
}

/** Guests in the roll call: everyone signed up except the MC, in the order they signed up. */
const rollGuests = (g: Doc<"games">, ps: Doc<"players">[]) =>
  ps.filter((p) => !(g.mode === "mc" && p._id === g.mcPlayerId)).sort((a, b) => a.createdAt - b.createdAt);

const rollOf = (g: Doc<"games">, p: Doc<"players">) =>
  rollWanted(g.tone ?? "classic", narratorOf(g), {
    id: p._id,
    charName: p.charName,
    sayAs: p.sayAs,
    realName: p.realName,
    rumor: p.rumor,
    rollLine: p.rollLine,
    who: p.who,
  });

async function clipRows(ctx: QueryCtx, gameId: Id<"games">) {
  const rows = await ctx.db
    .query("clips")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
  return new Map(rows.map((r) => [r.purpose, r]));
}

/** Everything the game wants recorded right now, for one scope. */
async function wantedFor(ctx: QueryCtx, game: Doc<"games">, scope: "roll" | "start"): Promise<Wanted[]> {
  const players = await playersOf(ctx, game._id);
  if (scope === "roll") return rollGuests(game, players).map((p) => rollOf(game, p));
  if (before(game)) return [];
  const inGame = players.filter((p) => p.inGame);
  const byId = new Map(players.map((p) => [p._id as string, p]));
  const weapons = await ctx.db
    .query("weapons")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  const exhibits = weapons
    .filter((w) => {
      const p = byId.get(w.playerId);
      return p?.inGame && p.weaponIn && p.exhibitLetter;
    })
    .map((w) => ({ id: w._id as string, letter: byId.get(w.playerId)!.exhibitLetter!, name: w.name }));
  return startWanted(game.tone ?? "classic", narratorOf(game), {
    players: inGame.map((p) => ({ id: p._id, charName: p.charName, sayAs: p.sayAs })),
    exhibits,
    rooms: game.rooms,
    bodyRoomKey: game.bodyRoomKey,
    roomOrder: game.roomOrder,
    search: game.search ?? "all",
  });
}

// ---------- recording (internal) ----------

/** Claims the lines that still need recording, so two runs never pay for the same line. */
export const claim = internalMutation({
  args: { gameId: v.id("games"), scope: v.union(v.literal("roll"), v.literal("start")), only: v.optional(v.array(v.string())) },
  handler: async (ctx, { gameId, scope, only }) => {
    const game = await ctx.db.get(gameId);
    if (!game) return [];
    const rows = await clipRows(ctx, gameId);
    const now = Date.now();
    const todo: Wanted[] = [];
    for (const w of await wantedFor(ctx, game, scope)) {
      if (only && !only.includes(w.purpose)) continue;
      const row = rows.get(w.purpose);
      if (clipMatches(row, w)) continue;
      if (row && row.status === "pending" && row.text === w.text && row.voice === w.voice && now - row.updatedAt < CLAIM_MS) continue;
      if (row) await ctx.db.patch(row._id, { text: w.text, voice: w.voice, status: "pending", error: undefined, updatedAt: now });
      else await ctx.db.insert("clips", { gameId, purpose: w.purpose, text: w.text, voice: w.voice, status: "pending", updatedAt: now });
      todo.push(w);
    }
    return todo;
  },
});

export const saveClip = internalMutation({
  args: {
    gameId: v.id("games"),
    purpose: v.string(),
    text: v.string(),
    voice: v.string(),
    storageId: v.optional(v.id("_storage")),
    seconds: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const row = await ctx.db
      .query("clips")
      .withIndex("by_game_purpose", (q) => q.eq("gameId", a.gameId).eq("purpose", a.purpose))
      .unique();
    // The line changed again while this one was recording: keep the newer claim, drop this take.
    if (!row || row.text !== a.text || row.voice !== a.voice) {
      if (a.storageId) await ctx.storage.delete(a.storageId);
      return;
    }
    if (row.storageId && row.storageId !== a.storageId) await ctx.storage.delete(row.storageId);
    await ctx.db.patch(row._id, {
      status: a.storageId ? "ready" : "failed",
      storageId: a.storageId,
      seconds: a.seconds,
      error: a.error,
      updatedAt: Date.now(),
    });
  },
});

async function tts(text: string, voice: string): Promise<ArrayBuffer> {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("The server has no ElevenLabs key yet.");
  const host = voice.startsWith("duke") ? "duke" : "ivy";
  const unstable = voice.endsWith("-unstable");
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${HOSTS[host].voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: TTS_MODEL, voice_settings: unstable ? VOICE_SETTINGS.unstable : VOICE_SETTINGS.steady }),
  });
  if (!res.ok) throw new Error(`ElevenLabs said ${res.status}`);
  return await res.arrayBuffer();
}

/** Records every line in the scope that isn't recorded yet (four at a time). */
export const record = internalAction({
  args: { gameId: v.id("games"), scope: v.union(v.literal("roll"), v.literal("start")), only: v.optional(v.array(v.string())) },
  handler: async (ctx, { gameId, scope, only }): Promise<{ recorded: number }> => {
    const todo: Wanted[] = await ctx.runMutation(internal.voice.claim, { gameId, scope, only });
    let i = 0;
    const worker = async () => {
      while (i < todo.length) {
        const w = todo[i++];
        try {
          const audio = await tts(w.text, w.voice);
          const storageId = await ctx.storage.store(new Blob([audio], { type: "audio/mpeg" }));
          await ctx.runMutation(internal.voice.saveClip, { gameId, purpose: w.purpose, text: w.text, voice: w.voice, storageId, seconds: secondsOfMp3(audio.byteLength) });
        } catch (err) {
          await ctx.runMutation(internal.voice.saveClip, { gameId, purpose: w.purpose, text: w.text, voice: w.voice, error: (err as Error).message.slice(0, 160) });
        }
      }
    };
    // Four at a time (VOICE_WORKERS=1 in tests: the test harness can't store files in parallel).
    const n = Math.max(1, Number(process.env.VOICE_WORKERS ?? 4));
    await Promise.all(Array.from({ length: n }, worker));
    return { recorded: todo.length };
  },
});

/** Called from the game when the cast is set (Start) or when the host asks. */
export async function scheduleRecording(ctx: MutationCtx, gameId: Id<"games">, scope: "roll" | "start", only?: string[]) {
  await ctx.scheduler.runAfter(0, internal.voice.record, { gameId, scope, only });
}

// ---------- the host laptop ----------

/** The roll call in the game menu: every guest's line, and whether its voice is recorded. */
export const rollCallSheet = query({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    const rows = await clipRows(ctx, game._id);
    const guests = rollGuests(game, await playersOf(ctx, game._id));
    const list = await Promise.all(
      guests.map(async (p) => {
        const w = rollOf(game, p);
        const row = rows.get(w.purpose);
        const ok = clipMatches(row, w);
        return {
          id: p._id,
          charName: p.charName,
          realName: p.realName,
          photoUrl: p.photoId ? await ctx.storage.getUrl(p.photoId) : null,
          figure: p.figure ?? null,
          checkedIn: p.checkedIn,
          rumor: p.rumor ?? "",
          line: rollLineFor(p),
          edited: !!p.rollLine?.trim(),
          spoken: w.caption,
          voice: ok ? "ready" : row && row.text === w.text && row.voice === w.voice ? row.status : "none",
          error: row && !ok && row.status === "failed" ? row.error ?? "" : "",
          seconds: ok ? row!.seconds ?? 0 : 0,
          clipUrl: ok && row!.storageId ? await ctx.storage.getUrl(row!.storageId) : null,
        };
      }),
    );
    return {
      voice: voiceOf(narratorOf(game)),
      rollCallAt: game.rollCallAt ?? null,
      rulesAt: game.rulesAt ?? null,
      guests: list,
      counts: { total: list.length, ready: list.filter((g) => g.voice === "ready").length, pending: list.filter((g) => g.voice === "pending").length, failed: list.filter((g) => g.voice === "failed").length },
    };
  },
});

/** The host rewrites a guest's roll-call line (empty goes back to what the guest wrote). */
export const setRollLine = mutation({
  args: { slug: v.string(), hostKey: v.string(), playerId: v.id("players"), line: v.string() },
  handler: async (ctx, { slug, hostKey, playerId, line }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (!before(game)) throw new ConvexError("The roll call is over once the game starts.");
    const p = await ctx.db.get(playerId);
    if (!p || p.gameId !== game._id) throw new ConvexError("Guest not found.");
    const clean = line.replace(/\s+/g, " ").trim();
    if (clean.length > ROLL_LINE_MAX) throw new ConvexError(`Keep it under ${ROLL_LINE_MAX} characters.`);
    await ctx.db.patch(playerId, { rollLine: clean || undefined });
    return { ok: true };
  },
});

/** Records every roll-call line that isn't recorded yet. */
export const recordRollCall = mutation({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    await scheduleRecording(ctx, game._id, "roll");
    return { ok: true };
  },
});

/** The roll call on the TV, right before the murder. Guests who are here, in a shuffled order. */
export const playRollCall = mutation({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (!before(game)) throw new ConvexError("The roll call plays before the game starts.");
    const guests = rollGuests(game, await playersOf(ctx, game._id));
    const here = guests.filter((p) => p.checkedIn);
    const cast = here.length ? here : guests;
    if (!cast.length) throw new ConvexError("Nobody's signed up yet.");
    const order = shuffle(secure(), cast.map((p) => p._id));
    await ctx.db.patch(game._id, { rollCallAt: Date.now(), rollCallOrder: order, rulesAt: undefined });
    await scheduleRecording(ctx, game._id, "roll");
    return { guests: order.length };
  },
});

/** How to play on the TV by itself: nine illustrated cards, read by the narrator. (It also follows the roll call on its own.) */
export const playRules = mutation({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    if (!before(game)) throw new ConvexError("The rules play before the game starts.");
    await ctx.db.patch(game._id, { rulesAt: Date.now(), rollCallAt: undefined });
    return { ok: true };
  },
});

/** Stops the rules or the roll call; the TV goes back to the doors. */
export const stopSegment = mutation({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    await ctx.db.patch(game._id, { rulesAt: undefined, rollCallAt: undefined });
    return { ok: true };
  },
});

/** For the CLI and tests: what's recorded for a game. */
export const clipsOf = internalQuery({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!game) return [];
    const rows = await ctx.db
      .query("clips")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    return rows.map((r) => ({ purpose: r.purpose, status: r.status, voice: r.voice, seconds: r.seconds ?? null, error: r.error ?? null }));
  },
});
