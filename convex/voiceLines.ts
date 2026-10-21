// What the narrator says that's made for this party: roll-call intros, and the names for the
// intro, the waves and the reveal. Pure functions, shared by the server (recording, the TV query)
// and the host laptop. Nothing here is secret: every guest, exhibit and room gets a clip, so the
// set of recordings never points at the answer.
import { LATER_KINDS, cueVariant, customRecordingText, customText, insultText, plain, rollNarration, sprinkle, verdictText, voiceKey, type CueKey, type GameTone, type HostKey, type Tone } from "./narration";
import { openRoomsIn } from "./engine/build";
import { castMember, shortName } from "./figures";

export type Narrator = { host: HostKey; unstable: boolean; /** Sailor mode (Oct 16): Joel, furious, his own filthy script. */ sailor?: boolean };
export type Levels = { voice: number; music: number; sfx: number };

// Oct 21 (Heston: "Duke for now"): Duke is the only voice recorded for the new and modernized lines, so a game that
// never picked a narrator gets Duke. The others get recorded after the play test if the scripts hold.
export const DEFAULT_NARRATOR: Narrator = { host: "duke", unstable: false };
export const DEFAULT_LEVELS: Levels = { voice: 100, music: 70, sfx: 80 };

export const narratorOf = (g: { narrator?: Narrator }): Narrator => g.narrator ?? DEFAULT_NARRATOR;
export const levelsOf = (g: { levels?: Levels }): Levels => g.levels ?? DEFAULT_LEVELS;
export const voiceOf = (n: Narrator) => voiceKey(n.host, n.unstable, !!n.sailor);

/** The script the narrator reads in this game: Classic, Adult, or Sailor (Joel's own, over an Adult game). */
export const scriptOf = (g: { tone?: GameTone; narrator?: Narrator }): Tone => (g.narrator?.sailor ? "sailor" : g.tone ?? "classic");

/** What a game picked at Start (Oct 16; older games have none): a version of each line, whether tonight has a running
 *  gag, and the heckles to keep for last. */
export type GameLines = { picks: Record<string, number>; gag: boolean; avoid: string[]; gagOn?: string };

/** This game's version of a line (see cueVariant): from its picks if it made them at Start. */
export const variantOf = (g: { tone?: GameTone; narrator?: Narrator; slug: string; lines?: GameLines }, cue: CueKey, occurrence = "") =>
  cueVariant(scriptOf(g), cue, g.slug, occurrence, g.lines ? { picks: g.lines.picks, d: true } : undefined);

/** The name as the narrator should say it: the guest's "say it like" when they gave one. */
export const spokenName = (p: { charName: string; sayAs?: string }) => p.sayAs?.trim() || p.charName;

export type Wanted = {
  purpose: string;
  /** What the TV shows while it plays. */
  caption: string;
  /** Exactly what goes to ElevenLabs (Unstable adds a direction). */
  text: string;
  voice: string;
};

/**
 * The caption shows names as written; the recording says them the guest's way ("say it like"). Given the game's
 * script and seed, about one recording in ten gets a noise sprinkled in (narration.ts sprinkle); captions stay clean.
 */
function make(purpose: string, caption: string, n: Narrator, spoken = caption, noise?: { tone: Tone; seed?: string }): Wanted {
  const said = noise ? sprinkle(spoken, noise.tone, `${noise.seed ?? ""}|${purpose}`) : spoken;
  // Captions never show delivery directions (Sailor's lines carry them: "[shouting] …").
  return { purpose, caption: plain(caption), text: customRecordingText(said, n.unstable), voice: voiceOf(n) };
}

/** What the roll call says about one guest: their name (and, for the party cast, their nickname). */
export type RollLine = {
  id: string;
  charName: string;
  sayAs?: string;
  realName: string;
  /** The party cast: introduced by their own name and nickname, no "played by". */
  cast?: { real: string; nickname?: string; sayAs?: string } | null;
  /** The game's seed (its slug): picks this game's versions of the wording. */
  seed?: string;
  /** Oct 18: which roll-call joke the game dealt this guest. */
  pick?: number;
};

/** One guest's roll-call line: name, a.k.a. nickname and their own joke (Oct 20: no motive). */
export function rollWanted(tone: Tone, n: Narrator, p: RollLine): Wanted {
  const extra = { seed: p.seed, pick: p.pick };
  if (p.cast) {
    const shown = rollNarration(tone, { name: p.charName, real: p.cast.real, nickname: p.cast.nickname, cast: true, ...extra });
    const said = rollNarration(tone, { name: p.charName, real: p.cast.sayAs?.trim() || p.cast.real, nickname: p.cast.nickname, cast: true, ...extra });
    return make(`roll:${p.id}`, shown.text, n, said.text, { tone, seed: p.seed });
  }
  const shown = rollNarration(tone, { name: p.charName, real: p.realName, ...extra });
  const said = rollNarration(tone, { name: spokenName(p), real: p.realName, ...extra });
  return make(`roll:${p.id}`, shown.text, n, said.text, { tone, seed: p.seed });
}

type StartInfo = {
  /** real: the first name the insults use (Oct 17); sayReal: how to say it. */
  players: { id: string; charName: string; sayAs?: string; real?: string; sayReal?: string }[];
  exhibits: { id: string; letter: string; name: string }[];
  rooms: { key: string; label: string }[];
  bodyRoomKey?: string;
  roomOrder?: string[];
  search: "all" | "waves";
  /** The game's seed (its slug): picks this game's versions of the wording. */
  seed?: string;
  /** v2: a killer + accomplice game also names the accomplice at the reveal, so every guest gets that line too. */
  accomplice?: boolean;
  /** The versions this game picked at Start ("custom:killer" and friends). */
  picks?: Record<string, number>;
};

/** Rooms that open at the start of a round when searching in waves (Round 1: the first wave). */
export function newRoomsIn(round: number, order: string[], search: "all" | "waves"): string[] {
  if (search !== "waves") return [];
  const now = openRoomsIn(round, order, search);
  const before = round <= 1 ? [] : openRoomsIn(round - 1, order, search);
  return now.filter((k) => !before.includes(k));
}

/** Every clip recorded at Start. The reveal and the awards pick from these once the answer is public. */
export function startWanted(tone: Tone, n: Narrator, s: StartInfo): Wanted[] {
  const label = (key: string) => s.rooms.find((r) => r.key === key)?.label ?? "";
  const out: Wanted[] = [];
  const nz = { tone, seed: s.seed };
  const pk = (kind: string) => s.picks?.[`custom:${kind}`];
  if (s.bodyRoomKey) out.push(make("body", customText("body", tone, { room: label(s.bodyRoomKey), seed: s.seed, pick: pk("body") }), n, undefined, nz));
  if (s.search === "waves" && s.roomOrder) {
    for (const round of [1, 2, 3]) {
      const fresh = newRoomsIn(round, s.roomOrder, s.search);
      if (fresh.length) out.push(make(`rooms:${round}`, customText("rooms", tone, { rooms: fresh.map(label), seed: s.seed, pick: pk("rooms") }), n, undefined, nz));
    }
  }
  for (const p of s.players) {
    out.push(make(`killer:${p.id}`, customText("killer", tone, { name: p.charName, seed: s.seed, pick: pk("killer") }), n, customText("killer", tone, { name: spokenName(p), seed: s.seed, pick: pk("killer") }), nz));
    if (s.accomplice) out.push(make(`accomplice:${p.id}`, customText("accomplice", tone, { name: p.charName, seed: s.seed, pick: pk("accomplice") }), n, customText("accomplice", tone, { name: spokenName(p), seed: s.seed, pick: pk("accomplice") }), nz));
    out.push(make(`winner:${p.id}`, customText("winner", tone, { name: p.charName }), n, customText("winner", tone, { name: spokenName(p) }), nz));
    // v2 votes: every guest's "going to jail" and "is free", so the verdicts have names. Oct 17: with the insult
    // layer's lines on their first name in the pool too.
    const real = p.real || p.charName;
    for (const kind of ["jailed", "released"] as const) {
      const v = { seed: s.seed, id: p.id, pick: pk(kind) };
      out.push(make(`${kind}:${p.id}`, verdictText(kind, tone, { ...v, name: p.charName, real }), n, verdictText(kind, tone, { ...v, name: spokenName(p), real: p.sayReal || real }), nz));
    }
  }
  for (const e of s.exhibits) out.push(make(`exhibit:${e.id}`, customText("exhibit", tone, { letter: e.letter, weapon: e.name }), n, undefined, nz));
  for (const r of s.rooms) out.push(make(`room:${r.key}`, customText("room", tone, { room: r.label }), n, undefined, nz));
  return out;
}

/** A guest's names for the per-game lines: the character name, and the first name the insults use (Oct 17). */
export const guestNames = (p: { _id: string; charName: string; sayAs?: string; figure?: string | null; firstName?: string | null }) => {
  const m = castMember(p.figure);
  // Oct 18: the real first name they typed at sign-up (older sign-ups: their drawing's name). The drawing's way of
  // saying a name only applies when it's the same name.
  const typed = (p.firstName ?? "").replace(/[“”"]/g, "").trim().split(/\s+/)[0] ?? "";
  const real = typed || shortName(p);
  return { id: p._id as string, charName: p.charName, sayAs: p.sayAs, real, sayReal: m && !m.mystery && real === m.name ? p.sayAs || undefined : undefined };
};

/**
 * Oct 17: the insults on real names for later moments (the jailbird kept in, the last to lock in, the killer caught or
 * free, the award winners). Recorded only when the moment comes (convex/voice.ts scope "later"), never at Start.
 */
export function laterWanted(tone: Tone, n: Narrator, s: Pick<StartInfo, "players" | "seed">): Wanted[] {
  const out: Wanted[] = [];
  const nz = { tone, seed: s.seed };
  for (const p of s.players) {
    const real = p.real || p.charName;
    for (const kind of LATER_KINDS) {
      out.push(make(`${kind}:${p.id}`, insultText(kind, tone, { real, seed: s.seed, id: p.id }), n, insultText(kind, tone, { real: p.sayReal || real, seed: s.seed, id: p.id }), nz));
    }
  }
  return out;
}

/** A recorded clip still counts only while it says what the game wants, in the voice it wants. */
export const clipMatches = (row: { text: string; voice: string; status: string } | null | undefined, w: Wanted) =>
  !!row && row.status === "ready" && row.text === w.text && row.voice === w.voice;

/** MP3 at 128 kbps: close enough to time the roll call without decoding it. */
export const secondsOfMp3 = (bytes: number) => Math.round((bytes * 8) / 128_000 * 100) / 100;
