// The show (v2, Oct 15): what plays on the TV between "Everyone is in" and Round 1.
//   the intro (lights out, the body, "one of you did it") → How to play → the roll call → "check your phones".
// Pure layout, shared by the server (which fixes the times, so Round 1's clock and the phones agree)
// and the TV (which lays out the lines inside each part the same way).
import manifest from "../public/audio/narration/manifest.json";
import { captionText, cueFile, type CueKey, type HostKey, type Tone } from "./narration";

const S = 1000;

export const SHOW = {
  /** The cinematic intro: three beats of 15 s, then a breath. */
  introMs: 40 * S,
  introBeatMs: 15 * S,
  /** How to play: the art flips in, the line starts a beat later, a pause after it. */
  howLead: 0.6 * S,
  howTail: 1.2 * S,
  /** The Roll Call title card, then the narrator's opener. */
  rollCardMs: 4 * S,
  /** Each guest: the card flips, the narrator starts, a pause after. Never shorter than rollMin. */
  rollLead: 0.9 * S,
  rollTail: 1.6 * S,
  rollMin: 8 * S,
  /** "Check your phone", then time to read the role before Round 1. */
  phonesHold: 12 * S,
} as const;

type Manifest = Record<string, Record<string, Record<string, number>>>;
const RECORDED = manifest as Manifest;

/** Reading speed for a line nobody has recorded yet (the TV's live reader, or a missing clip). */
export const readSecs = (text: string) => text.length / 14 + 0.4;

/** How long a narrator line runs (version v of it): the recording's length, else reading speed. */
export function cueSecs(voice: string, tone: Tone, host: HostKey, cue: CueKey, v = 0, rec: Manifest = RECORDED): number {
  return rec[voice]?.[tone]?.[cueFile(cue, v)] ?? readSecs(captionText(cue, tone, host, v));
}

/** A drawing in /art, the house map, the jail bars, a fan of weapon cards, or "pair" (the killer and the accomplice). */
export type HowArt = string;

/**
 * How to play, v2: one illustrated card per line. A killer + accomplice game adds the accomplice card (the masked
 * killer with a second drawing at their shoulder) and says the accomplice may lie too.
 */
export function howCues(g: { search: "all" | "waves"; pacing: { mode: "ready" | "timer" }; accomplice?: boolean }): [CueKey, HowArt][] {
  return [
    ["howKiller", "killer"],
    ...(g.accomplice ? [["howAccomplice", "pair"] as [CueKey, HowArt]] : []),
    ["howRoles", "flapper"],
    ["howWeapons", "weapons"],
    [g.search === "waves" ? "howTo4Waves" : "howTo4", "map"],
    [g.pacing.mode === "timer" ? "howTo6Timer" : "howTo6", "dapper"],
    ["howJail", "bars"],
    ["howRelease", "bodyguard"],
    [g.accomplice ? "howTo7Acc" : "howTo7", "lady"],
    ["howLockIn", "detective"],
    ["howWin", "don"],
  ];
}

export function howLayout(at: number, cues: [CueKey, HowArt][], secs: (c: CueKey) => number) {
  let t = at;
  const steps = cues.map(([cue, art]) => {
    const voiceAt = t + SHOW.howLead;
    const until = voiceAt + secs(cue) * S + SHOW.howTail;
    const step = { cue, art, at: t, voiceAt, until };
    t = until;
    return step;
  });
  return { steps, end: t };
}

/** One guest's turn in the roll call, from the narrator's line length. */
export const rollSlotMs = (talkSecs: number) => Math.max(SHOW.rollMin, SHOW.rollLead + talkSecs * S + SHOW.rollTail);

/** The roll call from its start: the card, the opener, each guest, the closer, then "check your phone". */
export function rollLayout(at: number, slots: number[], secs: (c: CueKey) => number) {
  const openAt = at + SHOW.rollCardMs + 0.3 * S;
  let t = openAt + secs("rollLocked") * S + 0.8 * S;
  const steps = slots.map((ms) => {
    const step = { at: t, voiceAt: t + SHOW.rollLead, until: t + ms };
    t += ms;
    return step;
  });
  const closeAt = t + 0.2 * S;
  const phonesAt = closeAt + secs("rollCallClose") * S + 0.6 * S;
  const end = phonesAt + Math.max(SHOW.phonesHold, secs("intro4") * S + 8 * S);
  return { openAt, steps, closeAt, phonesAt, end };
}

/** The parts of the show, by start time. A skip jumps to the next one. */
export type ShowPart = "intro" | "how" | "roll" | "phones";
export const PART_LABEL: Record<ShowPart | "round", string> = {
  intro: "The intro",
  how: "How to play",
  roll: "The roll call",
  phones: "Check your phones",
  round: "Round 1",
};
