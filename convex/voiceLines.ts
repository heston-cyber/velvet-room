// What the narrator says that's made for this party: roll-call intros, and the names for the
// intro, the waves and the reveal. Pure functions, shared by the server (recording, the TV query)
// and the host laptop. Nothing here is secret: every guest, exhibit and room gets a clip, so the
// set of recordings never points at the answer.
import { customRecordingText, customText, rollNarration, sprinkle, voiceKey, type HostKey, type Tone } from "./narration";
import { openRoomsIn } from "./engine/build";

export type Narrator = { host: HostKey; unstable: boolean };
export type Levels = { voice: number; music: number; sfx: number };

export const DEFAULT_NARRATOR: Narrator = { host: "ivy", unstable: false };
export const DEFAULT_LEVELS: Levels = { voice: 100, music: 70, sfx: 80 };

export const narratorOf = (g: { narrator?: Narrator }): Narrator => g.narrator ?? DEFAULT_NARRATOR;
export const levelsOf = (g: { levels?: Levels }): Levels => g.levels ?? DEFAULT_LEVELS;
export const voiceOf = (n: Narrator) => voiceKey(n.host, n.unstable);

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
  return { purpose, caption, text: customRecordingText(said, n.unstable), voice: voiceOf(n) };
}

/** What the roll call says about one guest (v2): the caption as written, the recording the guest's way. */
export type RollLine = {
  id: string;
  charName: string;
  sayAs?: string;
  realName: string;
  signature: string;
  weapon: string;
  motive: string;
  motiveOwn: boolean;
  rumor: string;
  rumorLead: string;
  roast: string;
  /** The game's seed (its slug): picks this game's versions of the wording. */
  seed?: string;
};

/** One guest's roll-call intro: name, played by, signature, weapon, motive, word on the street, roast. */
export function rollWanted(tone: Tone, n: Narrator, p: RollLine): Wanted & { marks: ReturnType<typeof rollNarration>["marks"] } {
  const base = { real: p.realName, signature: p.signature, weapon: p.weapon, motive: p.motive, motiveOwn: p.motiveOwn, rumor: p.rumor, rumorLead: p.rumorLead, roast: p.roast, seed: p.seed };
  const shown = rollNarration(tone, { ...base, name: p.charName });
  const said = rollNarration(tone, { ...base, name: spokenName(p) });
  return { ...make(`roll:${p.id}`, shown.text, n, said.text, { tone, seed: p.seed }), marks: shown.marks };
}

type StartInfo = {
  players: { id: string; charName: string; sayAs?: string }[];
  exhibits: { id: string; letter: string; name: string }[];
  rooms: { key: string; label: string }[];
  bodyRoomKey?: string;
  roomOrder?: string[];
  search: "all" | "waves";
  /** The game's seed (its slug): picks this game's versions of the wording. */
  seed?: string;
  /** v2: a killer + accomplice game also names the accomplice at the reveal, so every guest gets that line too. */
  accomplice?: boolean;
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
  if (s.bodyRoomKey) out.push(make("body", customText("body", tone, { room: label(s.bodyRoomKey), seed: s.seed }), n, undefined, nz));
  if (s.search === "waves" && s.roomOrder) {
    for (const round of [1, 2, 3]) {
      const fresh = newRoomsIn(round, s.roomOrder, s.search);
      if (fresh.length) out.push(make(`rooms:${round}`, customText("rooms", tone, { rooms: fresh.map(label), seed: s.seed }), n, undefined, nz));
    }
  }
  for (const p of s.players) {
    out.push(make(`killer:${p.id}`, customText("killer", tone, { name: p.charName, seed: s.seed }), n, customText("killer", tone, { name: spokenName(p), seed: s.seed }), nz));
    if (s.accomplice) out.push(make(`accomplice:${p.id}`, customText("accomplice", tone, { name: p.charName, seed: s.seed }), n, customText("accomplice", tone, { name: spokenName(p), seed: s.seed }), nz));
    out.push(make(`winner:${p.id}`, customText("winner", tone, { name: p.charName }), n, customText("winner", tone, { name: spokenName(p) }), nz));
    // v2 votes: every guest's "going to jail" and "is free", so the verdicts have names.
    out.push(make(`jailed:${p.id}`, customText("jailed", tone, { name: p.charName, seed: s.seed }), n, customText("jailed", tone, { name: spokenName(p), seed: s.seed }), nz));
    out.push(make(`released:${p.id}`, customText("released", tone, { name: p.charName, seed: s.seed }), n, customText("released", tone, { name: spokenName(p), seed: s.seed }), nz));
  }
  for (const e of s.exhibits) out.push(make(`exhibit:${e.id}`, customText("exhibit", tone, { letter: e.letter, weapon: e.name }), n, undefined, nz));
  for (const r of s.rooms) out.push(make(`room:${r.key}`, customText("room", tone, { room: r.label }), n, undefined, nz));
  return out;
}

/** A recorded clip still counts only while it says what the game wants, in the voice it wants. */
export const clipMatches = (row: { text: string; voice: string; status: string } | null | undefined, w: Wanted) =>
  !!row && row.status === "ready" && row.text === w.text && row.voice === w.voice;

/** MP3 at 128 kbps: close enough to time the roll call without decoding it. */
export const secondsOfMp3 = (bytes: number) => Math.round((bytes * 8) / 128_000 * 100) / 100;
