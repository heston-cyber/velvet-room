// The show (v2, Oct 15): what plays on the TV between "Everyone is in" and Round 1.
//   Since Oct 16 (Heston: "Different order 1. rules 2. don dies 3. Roll call"): How to play → the intro (lights out,
//   the Don dies, "one of you did it") → the roll call → "check your phones". Games started before then ran the
//   intro first; showParts() reads either.
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
  rollLead: 0.5 * S,
  rollTail: 0.7 * S,
  rollMin: 3.5 * S,
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

/** What each How to play card shows: "suspects" (the guests' faces with the masked killer among them), "pair" (the
 *  killer and the accomplice), "weapons" (a fan of the weapons in play), "search" (the map and a scan), "jail" (a guest
 *  behind bars and the vote), "win" (who + with what + where), "round" (Ready faces, or the clock). */
export type HowArt = string;

/**
 * How to play, v4 (Phase 6, Oct 21; the rebuild plan's six cards): one of you did it; your story; search (how a round
 * ends folded in, for this game's pacing and search); the late tips and the jail vote (the late tips alone in a game
 * too small for a jail vote); chips; locking in. Each card has a picture of the rule. The weapons card is gone (the
 * weapons stay across the top of the TV). A killer + accomplice game adds the accomplice card after the first.
 */
export function howCues(g: { search: "all" | "waves"; pacing: { mode: "ready" | "timer" }; accomplice?: boolean; jailVote?: boolean }): [CueKey, HowArt][] {
  return [
    ["howCase", "suspects"],
    ...(g.accomplice ? [["howAccomplice", "pair"] as [CueKey, HowArt]] : []),
    // Oct 29: what the phone is for, before the rules that use it.
    ["howPhone", "phone"],
    ["howStory", "story"],
    [roundCue(g), "search"],
    // Oct 17 (D5): games with fewer than 5 guests have no jail vote; the late tips still land.
    g.jailVote === false ? ["howTips", "tips"] : ["howJail2", "jail"],
    ["howChips", "chips"],
    ["howWin2", "win"],
  ];
}

/** W14 (Oct 17): the How to play card that says how a round ends: Ready or the clock, rooms in waves or all open. */
export function roundCue(g: { search: "all" | "waves"; pacing: { mode: "ready" | "timer" } }): CueKey {
  const timer = g.pacing.mode === "timer";
  if (g.search === "waves") return timer ? "howRoundTimer" : "howRound";
  return timer ? "howRoundTimerAll" : "howRoundAll";
}

/** The headline on each How to play card. */
export const HOW_TITLE: Partial<Record<CueKey, string>> = {
  howCase: "One of you did it",
  howAccomplice: "The accomplice",
  howStory: "Where you were",
  howRound: "Search and scan",
  howRoundTimer: "Search and scan",
  howRoundAll: "Search and scan",
  howRoundTimerAll: "Search and scan",
  howJail2: "Late tips and jail",
  howTips: "Late tips",
  howChips: "Chips",
  howPhone: "Your phone",
  howWin2: "Lock it in",
};

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

/** Where the body was found: a per-game clip recorded at Start, so its length is estimated until it's in. */
export const BODY_SECS_EST = 4;

/**
 * The intro (the Don dies), laid out from its lines so no slide changes while the narrator is still talking (Heston,
 * Oct 16: "VO lines need to end before the next slides appear"). Three slides: "New York City · October 31, 2026" (lights
 * out, the fall, the scream, then the first line), "The Don is dead" (the second line, then where the body was found)
 * and "One of you did it" (the third line, over the weapons). Each slide lasts at least introBeatMs.
 */
export function introLayout(at: number, secs: (c: CueKey) => number, bodySecs: number = BODY_SECS_EST) {
  const line1 = at + 3.4 * S;
  const b1 = Math.max(at + SHOW.introBeatMs, line1 + secs("intro1") * S + 1.2 * S);
  const line2 = b1 + 1.2 * S;
  const bodyAt = line2 + secs("intro2") * S + 0.3 * S;
  const b2 = Math.max(b1 + SHOW.introBeatMs, bodyAt + bodySecs * S + 1.2 * S);
  const line3 = b2 + 0.8 * S;
  const end = Math.max(b2 + 10 * S, line3 + secs("intro3") * S + 3 * S);
  return { beats: [at, b1, b2] as [number, number, number], line1, line2, bodyAt, line3, end };
}

/** The show's start times, as the server keeps them (introAt from Oct 16 on). */
export type ShowTimes = { howAt: number; rollAt: number; introAt?: number | null; phonesAt?: number | null };

/** The parts before "check your phones", in the order this game plays them, each with its start. */
export function showParts(s: ShowTimes, startedAt: number): { part: "how" | "intro" | "roll"; at: number }[] {
  return s.introAt != null
    ? [
        { part: "how", at: s.howAt },
        { part: "intro", at: s.introAt },
        { part: "roll", at: s.rollAt },
      ]
    : [
        { part: "intro", at: startedAt },
        { part: "how", at: s.howAt },
        { part: "roll", at: s.rollAt },
      ];
}

/** Which part of the show is on at `now` (phonesAt: when "check your phones" starts). */
export function showPartAt(s: ShowTimes, startedAt: number, phonesAt: number, now: number): ShowPart {
  if (now >= phonesAt) return "phones";
  let part: ShowPart = showParts(s, startedAt)[0].part;
  for (const x of showParts(s, startedAt)) if (now >= x.at) part = x.part;
  return part;
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

/**
 * The reveal, laid out from this game's recordings so each step waits for the line before it (Heston, Oct 16: "VO
 * lines need to end before the next slides appear with reveals"): "The killer is…" (this game's version), the killer's
 * name, the weapon and the room, (with an accomplice) "And the accomplice who helped them is…" and their name, then the
 * verdict. Seconds of the per-game clips; a missing clip counts as a few seconds. Never quicker than the classic timings.
 */
export function revealLayout(
  base: { card: number; line: number; name: number; how: number; accomplice: number | null; verdict: number },
  secs: (c: CueKey) => number,
  clips: { killer?: number | null; exhibit?: number | null; room?: number | null; accomplice?: number | null },
  /** Phase 6: the plant line after the weapon and room ("One of tonight's late tips was planted…", or no plant). */
  plant: CueKey | null = null,
) {
  const gap = 0.8 * S;
  const line = base.line;
  const name = Math.max(base.name, line + secs("reveal1") * S + gap);
  const how = Math.max(base.how, name + 0.3 * S + (clips.killer ?? 3.5) * S + gap);
  const howEnd = how + 0.3 * S + ((clips.exhibit ?? 2.5) + 0.1 + (clips.room ?? 2.5)) * S + (plant ? 0.4 * S + secs(plant) * S : 0);
  if (base.accomplice === null) return { ...base, line, name, how, accomplice: null, verdict: Math.max(base.verdict, howEnd + gap) };
  const accomplice = Math.max(base.accomplice, howEnd + gap);
  const accEnd = accomplice + 0.4 * S + secs("revealAccomplice") * S + 0.2 * S + (clips.accomplice ?? 3.5) * S;
  return { ...base, line, name, how, accomplice, verdict: Math.max(base.verdict, accEnd + gap) };
}
