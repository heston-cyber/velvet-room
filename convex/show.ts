// The show (v2, Oct 15): what plays on the TV between "Everyone is in" and Round 1.
//   Since Oct 31, 17:30 (Heston: "it goes short welcome to the velvet room, soon someone is going to die, but first lets
//   meet tonights guests: goes into roll call, then how to play, then the don dies and the game starts"): the roll call
//   (opened by the welcome) → How to play and Gameplay → the intro (lights out, the Don dies, "one of you did it") →
//   "check your phones". Oct 16–30 games played How to play first; games before Oct 16 the intro first. showParts()
//   reads every order from the start times.
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
 *  behind bars and the vote), "win" (who + with what + where), "round" (Ready faces, or the clock); Oct 30: "scan" (an
 *  evidence card and a phone scanning it), "map" (the house map with Round 1's open rooms and the sealed ones), and any
 *  drawing by name ("don", "killer", "detective"). */
export type HowArt = string;

/**
 * How to play, v5 (Oct 30, Heston: "explains the game like it would to a 2 year old. This is a roudy party and needs to
 * be simple"): the whole night in order, one small idea per card. Someone dies · (the helper) · your phone · only the
 * killer lies · where were you · find the cards · (open rooms only, when rooms open in waves) · three rounds (Done
 * searching, or the clock) · point the finger · late tips · chips · pick who did it · who wins. `jailVote` is kept for
 * old callers; there's no jail vote since Oct 29.
 */
export function howCues(g: { search: "all" | "waves"; pacing: { mode: "ready" | "timer" }; accomplice?: boolean; jailVote?: boolean }): [CueKey, HowArt][] {
  const waves = g.search === "waves";
  const cues: [CueKey, HowArt][] = [["playDies", "don"]];
  if (g.accomplice) cues.push(["playAccomplice", "pair"]);
  cues.push(["playPhone", "phone"], ["playLie", "suspects"], ["playStory", "story"], ["playCards", waves ? "scan" : "search"]);
  if (waves) cues.push(["playRooms", "map"]);
  cues.push(
    [g.pacing.mode === "timer" ? "playRoundsTimer" : "playRounds", "round"],
    ["playHeat", "detective"],
    ["playTips", "tips"],
    ["playChips", "chips"],
    ["playLock", "win"],
    ["playWin", "killer"],
  );
  return [...cues, ...GAMEPLAY];
}

/**
 * Gameplay (Oct 31, Heston: "a gameplay section after the rules to explain how the game works and how to play" → "both
 * the round walkthrough and phone tour"): the night round by round, then the phone's tabs over real phone screens
 * (public/img/tour). Plays inside How to play's part, after its cards, with its own headings.
 */
export const GAMEPLAY: [CueKey, HowArt][] = [
  ["nightR1", "map"],
  ["nightR2", "map2"],
  ["nightR3", "tips"],
  ["nightLock", "win"],
  ["tourCase", "tab:case"],
  ["tourScan", "tab:scan"],
  ["tourEvidence", "tab:evidence"],
  ["tourNotebook", "tab:notebook"],
  ["tourBetting", "tab:book"],
];
const NIGHT: CueKey[] = ["nightR1", "nightR2", "nightR3", "nightLock"];

/** The small heading over a card: which section it's in, and where in that section ("How to play · 3 of 12"). */
export function howKicker(cues: CueKey[], i: number): string {
  const group = (c: CueKey) => (NIGHT.includes(c) ? "How the night goes" : c.startsWith("tour") ? "Your phone" : "How to play");
  const g = group(cues[i]);
  const mine = cues.filter((c) => group(c) === g);
  return `${g} · ${mine.indexOf(cues[i]) + 1} of ${mine.length}`;
}

/** The headline on each How to play card: a few words, big enough to read across a loud room. */
export const HOW_TITLE: Partial<Record<CueKey, string>> = {
  playDies: "Someone dies",
  playDiesV: "Someone dies",
  playAccomplice: "The helper",
  playPhone: "Your phone",
  playLie: "The killer lies",
  playStory: "Where were you?",
  playCards: "Find the cards",
  playRooms: "Open rooms only",
  playRounds: "Three rounds",
  playRoundsTimer: "Three rounds",
  playHeat: "Point the finger",
  playTips: "Late tips",
  playChips: "Chips",
  playLock: "Pick who did it",
  playWin: "Who wins",
  nightR1: "Round 1",
  nightR2: "Round 2",
  nightR3: "Round 3",
  nightLock: "The lock-in",
  tourCase: "Case",
  tourScan: "Scan",
  tourEvidence: "Evidence",
  tourNotebook: "Notebook",
  tourBetting: "Betting",
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

/** The roll call from its start: the card, the opener, each guest, the closer; then afterMs of show (since Oct 31: How
 *  to play, Gameplay and the murder) before "check your phone". afterMs is 0 for games where the roll call came last.
 *  howAt: when the roll call is over. opener: the welcome since Oct 31 ("the doors are locked" before). */
export function rollLayout(at: number, slots: number[], secs: (c: CueKey) => number, afterMs = 0, opener: CueKey = "rollLocked") {
  const openAt = at + SHOW.rollCardMs + 0.3 * S;
  let t = openAt + secs(opener) * S + 0.8 * S;
  const steps = slots.map((ms) => {
    const step = { at: t, voiceAt: t + SHOW.rollLead, until: t + ms };
    t += ms;
    return step;
  });
  const closeAt = t + 0.2 * S;
  const howAt = closeAt + secs("rollCallClose") * S + 0.6 * S;
  const phonesAt = howAt + afterMs;
  const end = phonesAt + Math.max(SHOW.phonesHold, secs("intro4") * S + 8 * S);
  return { openAt, steps, closeAt, howAt, phonesAt, end };
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

/** True for games from Oct 31 on: How to play (and Gameplay) after the roll call. */
export const howAfterRoll = (s: ShowTimes) => s.introAt != null && s.howAt > s.rollAt;
/** Since Oct 31, 17:30: the roll call first (with the welcome), How to play, then the murder. */
export const rollFirst = (s: ShowTimes) => howAfterRoll(s) && s.introAt! > s.howAt;
/** The intro's length (the Don dies), with the body line's estimated length. */
export const introMs = (secs: (c: CueKey) => number) => introLayout(0, secs).end;

/** The parts before "check your phones", in the order this game plays them, each with its start. Before Oct 16 the
 *  intro came first (at startedAt); Oct 16–30, How to play first; since Oct 31, the intro, the roll call, How to play. */
export function showParts(s: ShowTimes, startedAt: number): { part: "how" | "intro" | "roll"; at: number }[] {
  if (s.introAt == null)
    return [
      { part: "intro", at: startedAt },
      { part: "how", at: s.howAt },
      { part: "roll", at: s.rollAt },
    ];
  if (rollFirst(s))
    return [
      { part: "roll", at: s.rollAt },
      { part: "how", at: s.howAt },
      { part: "intro", at: s.introAt! },
    ];
  return howAfterRoll(s)
    ? [
        { part: "intro", at: s.introAt },
        { part: "roll", at: s.rollAt },
        { part: "how", at: s.howAt },
      ]
    : [
        { part: "how", at: s.howAt },
        { part: "intro", at: s.introAt },
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

/** Oct 31: from "back to the Lounge" to Round 3's twist. */
export const TWIST_CALL_MS = 30 * S;

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
