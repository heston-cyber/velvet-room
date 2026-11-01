// The narrator's custom lines for this party, recorded on the server with ElevenLabs.
// The API key lives only in the Convex environment (ELEVENLABS_API_KEY): never in the site, never on phones.
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { voiceIdFor, TTS_MODEL, settingsFor } from "./narration";
import { requireHost } from "./lib";
import { clipMatches, guestNames, laterWanted, narratorOf, scriptOf, secondsOfMp3, startWanted, voiceOf, type Wanted } from "./voiceLines";
import { caseFor } from "./caseFile";
import { inOrder, rollGuests } from "./rollCall";
import { heckleWanted } from "./heckles";
import { gameWeapons } from "./weapons";

const CLAIM_MS = 90_000; // a pending recording older than this is treated as stuck

const before = (g: Doc<"games">) => g.status === "registration" || g.status === "lobby";

async function playersOf(ctx: QueryCtx, gameId: Id<"games">) {
  return await ctx.db
    .query("players")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
}

async function clipRows(ctx: QueryCtx, gameId: Id<"games">) {
  const rows = await ctx.db
    .query("clips")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
  return new Map(rows.map((r) => [r.purpose, r]));
}

/** Everything the game wants recorded right now, for one scope. */
async function wantedFor(ctx: QueryCtx, game: Doc<"games">, scope: Scope): Promise<Wanted[]> {
  // Solo test mode (Oct 20): lines that say a bot's name aren't recorded unless the host turns bot voices on, so a
  // test night doesn't spend the party's credits. The TV runs fine without them.
  const quiet = game.isTest && game.bots && !game.bots.voices ? (await playersOf(ctx, game._id)).filter((p) => p.bot).map((p) => p._id as string) : [];
  const all = await wantedAll(ctx, game, scope, new Set(quiet));
  return quiet.length ? all.filter((w) => !quiet.some((id) => w.purpose.includes(id))) : all;
}

async function wantedAll(ctx: QueryCtx, game: Doc<"games">, scope: Scope, quiet: Set<string>): Promise<Wanted[]> {
  const players = await playersOf(ctx, game._id);
  if (before(game)) return [];
  // Oct 17: the insults for later moments, recorded one by one when they're needed.
  if (scope === "later") return laterWanted(scriptOf(game), narratorOf(game), { players: players.filter((p) => p.inGame).map(guestNames), seed: game.slug });
  // The roll call (v2) is recorded at Start: it reads each guest's motive, which comes from the case.
  if (scope === "roll") {
    if (!game.show) return [];
    return inOrder(await rollGuests(ctx, game, await caseFor(ctx, game)), game.show.order).map(({ wanted: w }) => ({ purpose: w.purpose, caption: w.caption, text: w.text, voice: w.voice }));
  }
  const inGame = players.filter((p) => p.inGame);
  const exhibits = (await gameWeapons(ctx, game)).map((w) => ({ id: w.id, letter: w.letter, name: w.name }));
  const lines = startWanted(scriptOf(game), narratorOf(game), {
    players: inGame.map(guestNames),
    exhibits,
    rooms: game.rooms,
    bodyRoomKey: game.bodyRoomKey,
    victim: game.victim ?? null,
    roomOrder: game.roomOrder,
    search: game.search ?? "all",
    seed: game.slug,
    accomplice: !!game.hasAccomplice,
    picks: game.lines?.picks,
  });
  // The night's heckles (convex/heckles.ts) record with the names for the reveal.
  return [...lines, ...(await heckleWanted(ctx, game)).filter(({ line }) => !line.target || !quiet.has(line.target)).map(({ line: _l, ...w }) => w)];
}

type Scope = "roll" | "start" | "later";
const scopeV = v.union(v.literal("roll"), v.literal("start"), v.literal("later"));


// ---------- recording (internal) ----------

/** Claims the lines that still need recording, so two runs never pay for the same line. */
export const claim = internalMutation({
  args: { gameId: v.id("games"), scope: scopeV, only: v.optional(v.array(v.string())) },
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
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceIdFor(voice)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: TTS_MODEL, voice_settings: settingsFor(voice) }),
  });
  if (!res.ok) throw new Error(`ElevenLabs said ${res.status}`);
  return await res.arrayBuffer();
}

/** "Too many at once" and server hiccups from the voice service: worth trying again. */
const BUSY = /said (429|500|502|503)/;
const RETRY_PASSES = 6;
const RETRY_MS = 20_000;

/** The voice service turns requests away when too many arrive at once (two games starting together, say): wait and
 *  try again, up to three times. */
async function ttsRetry(text: string, voice: string): Promise<ArrayBuffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await tts(text, voice);
    } catch (err) {
      const busy = BUSY.test((err as Error).message);
      if (!busy || attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 2000 * attempt + Math.random() * 1000));
    }
  }
}

/** Records every line in the scope that isn't recorded yet (four at a time). */
export const record = internalAction({
  args: {
    gameId: v.id("games"),
    scope: scopeV,
    only: v.optional(v.array(v.string())),
    then: v.optional(scopeV),
    /** Which pass this is: lines the voice service turned away get another go a little later. */
    pass: v.optional(v.number()),
  },
  handler: async (ctx, { gameId, scope, only, then, pass }): Promise<{ recorded: number }> => {
    const todo: Wanted[] = await ctx.runMutation(internal.voice.claim, { gameId, scope, only });
    let i = 0;
    let turnedAway = 0;
    const worker = async () => {
      while (i < todo.length) {
        const w = todo[i++];
        try {
          const audio = await ttsRetry(w.text, w.voice);
          const storageId = await ctx.storage.store(new Blob([audio], { type: "audio/mpeg" }));
          await ctx.runMutation(internal.voice.saveClip, { gameId, purpose: w.purpose, text: w.text, voice: w.voice, storageId, seconds: secondsOfMp3(audio.byteLength) });
        } catch (err) {
          if (BUSY.test((err as Error).message)) turnedAway++;
          await ctx.runMutation(internal.voice.saveClip, { gameId, purpose: w.purpose, text: w.text, voice: w.voice, error: (err as Error).message.slice(0, 160) });
        }
      }
    };
    // Four at a time (VOICE_WORKERS=1 in tests: the test harness can't store files in parallel).
    const n = Math.max(1, Number(process.env.VOICE_WORKERS ?? 4));
    await Promise.all(Array.from({ length: n }, worker));
    // Busy (several games starting at once, Oct 16): another pass over what's missing in a little while, up to
    // RETRY_PASSES; the next scope waits for it. One scope after another, so the voice service never gets more than
    // four lines at once from one game.
    const p = pass ?? 1;
    if (turnedAway && p < RETRY_PASSES) await ctx.scheduler.runAfter(RETRY_MS * p, internal.voice.record, { gameId, scope, only, then, pass: p + 1 });
    else if (then) await ctx.scheduler.runAfter(0, internal.voice.record, { gameId, scope: then });
    return { recorded: todo.length };
  },
});

/** Called from the game when the cast is set (Start) or when the host asks. */
export async function scheduleRecording(ctx: MutationCtx, gameId: Id<"games">, scope: Scope, only?: string[], then?: Scope) {
  await ctx.scheduler.runAfter(0, internal.voice.record, { gameId, scope, only, then });
}

// ---------- the host laptop ----------

/** The roll call in the game menu: every guest's roast, and (once the game starts) whether their voice is recorded. */
export const rollCallSheet = query({
  args: { slug: v.string(), hostKey: v.string() },
  handler: async (ctx, { slug, hostKey }) => {
    const game = await requireHost(ctx, slug, hostKey);
    const started = !before(game);
    const rows = await clipRows(ctx, game._id);
    const all = await rollGuests(ctx, game, started ? await caseFor(ctx, game) : null);
    const guests = started && game.show ? inOrder(all, game.show.order) : all;
    const list = await Promise.all(
      guests.map(async (g) => {
        const p = g.player;
        const w = g.wanted;
        const row = rows.get(w.purpose);
        const ok = started && clipMatches(row, w);
        return {
          id: p._id,
          charName: p.charName,
          realName: p.realName,
          photoUrl: p.photoId ? await ctx.storage.getUrl(p.photoId) : null,
          figure: p.figure ?? null,
          checkedIn: p.checkedIn,
          line: g.wanted.caption,
          voice: !started ? "later" : ok ? "ready" : row && row.text === w.text && row.voice === w.voice ? row.status : "none",
          error: row && !ok && row.status === "failed" ? row.error ?? "" : "",
          seconds: ok ? row!.seconds ?? 0 : 0,
          clipUrl: ok && row!.storageId ? await ctx.storage.getUrl(row!.storageId) : null,
        };
      }),
    );
    return {
      voice: voiceOf(narratorOf(game)),
      started,
      guests: list,
      counts: { total: list.length, ready: list.filter((g) => g.voice === "ready").length, pending: list.filter((g) => g.voice === "pending").length, failed: list.filter((g) => g.voice === "failed").length },
    };
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
