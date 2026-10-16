// Slides wait for the narrator (Heston, Oct 16: "VO lines need to end before the next slides appear with reveals. The
// previous announcement is still being made when the reveal happens."). Every voice, both scripts, the longest version
// of every line (noisy takes included), and long per-game clips: no slide changes while a line is still playing.
import { describe, expect, test } from "vitest";
import manifest from "../public/audio/narration/manifest.json";
import type { CueKey } from "../convex/narration";
import { howCues, howLayout, introLayout, revealLayout } from "../convex/show";
import { revealTimes } from "../convex/shared";
import { plan, type Data } from "../src/tv/timeline";

type M = Record<string, Record<string, Record<string, number>>>;
const M = manifest as M;
const S = 1000;
/** The longest recorded version of a line in this voice and script. */
const longest = (voice: string, tone: string) => (cue: CueKey) => {
  const files = Object.entries(M[voice][tone]).filter(([f]) => f === cue || f.startsWith(`${cue}.`));
  return Math.max(0, ...files.map(([, secs]) => secs));
};
const VOICES = Object.keys(M);
/** The scripts each voice set has (Sailor mode: Duke's own set, only the sailor script). */
const tonesOf = (voice: string) => Object.keys(M[voice]);
/** Long per-game clips: a name with a long nickname and last name, a long weapon, a long room. */
const LONG = { body: 6, killer: 6.5, exhibit: 3.5, room: 3.5, accomplice: 6.5 };

describe("slides wait for the narrator", () => {
  for (const voice of VOICES)
    for (const tone of tonesOf(voice)) {
      const secs = longest(voice, tone);
      test(`${voice} ${tone}: the Don dies (each of its three slides waits for the lines before it)`, () => {
        const L = introLayout(0, secs, LONG.body);
        expect(L.line1 + secs("intro1") * S).toBeLessThanOrEqual(L.beats[1]);
        expect(L.line2 + secs("intro2") * S).toBeLessThanOrEqual(L.bodyAt);
        expect(L.bodyAt + LONG.body * S).toBeLessThanOrEqual(L.beats[2]);
        expect(L.line3 + secs("intro3") * S).toBeLessThanOrEqual(L.end);
      });
      test(`${voice} ${tone}: How to play (each card waits for its line)`, () => {
        for (const accomplice of [false, true]) {
          const how = howLayout(0, howCues({ search: "waves", pacing: { mode: "ready" }, accomplice }), secs);
          for (const st of how.steps) expect(st.voiceAt + secs(st.cue) * S).toBeLessThanOrEqual(st.until);
        }
      });
      for (const accomplice of [false, true])
        test(`${voice} ${tone}${accomplice ? " with an accomplice" : ""}: the reveal (each step waits for the line before it)`, () => {
          const R = revealLayout(revealTimes(accomplice, tone === "classic" ? "classic" : "adult"), secs, LONG);
          expect(R.line + secs("reveal1") * S).toBeLessThanOrEqual(R.name);
          expect(R.name + 0.3 * S + LONG.killer * S).toBeLessThanOrEqual(R.how);
          const howEnd = R.how + 0.3 * S + (LONG.exhibit + 0.1 + LONG.room) * S;
          if (accomplice) {
            expect(howEnd).toBeLessThanOrEqual(R.accomplice!);
            expect(R.accomplice! + 0.4 * S + secs("revealAccomplice") * S + 0.2 * S + LONG.accomplice * S).toBeLessThanOrEqual(R.verdict);
          } else expect(howEnd).toBeLessThanOrEqual(R.verdict);
        });
    }

  test("on the TV: no intro line is still playing when its next slide comes up (adult Ivy, the longest takes)", () => {
    const T0 = 1_800_000_000_000;
    const secs = longest("ivy", "adult");
    const how = howLayout(T0, howCues({ search: "waves", pacing: { mode: "ready" } }), secs);
    const intro = introLayout(how.end, secs, LONG.body);
    const d = {
      now: T0,
      game: {
        title: "T", isTest: true, status: "playing", round: 1, paused: false, pacing: { mode: "ready", roundMinutes: 10 }, roundEndsAt: null,
        startedAt: T0, introEndsAt: intro.end + 120_000, revealAt: null, endedAt: null, doorsAt: T0, roundStartedAt: null, pausedAt: null, resumedAt: null, doneAt: null, rulesAt: null,
        tone: "adult", narrator: { host: "ivy", unstable: false }, levels: { voice: 100, music: 55, sfx: 80 }, search: "waves", wifi: null, tvShowAll: false,
        soundCheckAt: null, lastRescue: null, bodyRoom: "the Bar", rooms: [], openRooms: [], slug: "timing",
        show: { howAt: T0, introAt: how.end, rollAt: intro.end, phonesAt: null },
      },
      guests: [], counts: { registered: 6, here: 6, playing: 6, ready: 0, accused: 0 }, exhibits: [], weapons: [], evidence: [], results: null,
      reveal: revealTimes(false, "adult"), standIns: [],
      voice: { voice: "ivy", rollCall: null, body: { url: "body", caption: "In the Bar.", seconds: LONG.body }, rooms: {}, reveal: null, winners: null, heckles: [] },
    } as unknown as Data;
    // the longest take of every line, whichever version this game picked
    const p = plan(d, how.end + 1000, (cue: CueKey) => secs(cue));
    expect(p.part).toBe("intro");
    const talk = p.events.filter((e) => (e.cue || e.clip) && e.id.startsWith("intro:"));
    expect(talk.length).toBe(4);
    for (const b of p.intro!.beats.slice(1)) for (const e of talk) if (e.at < b) expect(e.at + e.secs * S).toBeLessThanOrEqual(b);
    // How to play: no card's line runs into the next card
    for (const st of p.rules!.steps) for (const e of p.events.filter((x) => x.id.startsWith("how:") && x.cue)) if (e.at < st.at) expect(e.at + e.secs * S).toBeLessThanOrEqual(st.at);
  });
});
