import { describe, expect, test } from "vitest";
import { INTRO_MS, REVEAL } from "../convex/shared";
import { CARD_MS } from "../src/tv/media";
import { cardNow, due, plan, type Data } from "../src/tv/timeline";

const T0 = 1_800_000_000_000;
const secs = () => 3; // every narrator line runs 3 s

function data(over: { game?: Record<string, unknown>; counts?: Record<string, number>; voice?: Record<string, unknown>; evidence?: unknown[]; results?: unknown } = {}): Data {
  const d = {
    now: T0,
    game: {
      title: "T", isTest: true, status: "lobby", round: 0, paused: false, pacing: { mode: "ready", roundMinutes: 10 }, roundEndsAt: null,
      startedAt: null, introEndsAt: null, revealAt: null, endedAt: null, doorsAt: T0, roundStartedAt: null, pausedAt: null, resumedAt: null, doneAt: null, rulesAt: null,
      tone: "classic", narrator: { host: "ivy", unstable: false }, levels: { voice: 100, music: 55, sfx: 80 }, mode: "play", search: "all", wifi: null, tvShowAll: false,
      soundCheckAt: null, lastRescue: null, bodyRoom: "", rooms: [], openRooms: [],
      ...over.game,
    },
    guests: [],
    counts: { registered: 6, here: 6, playing: 6, ready: 0, accused: 0, ...over.counts },
    exhibits: [],
    evidence: over.evidence ?? [],
    results: over.results ?? null,
    reveal: REVEAL,
    voice: { voice: "ivy", rollCall: null, body: null, rooms: {}, reveal: null, winners: null, ...over.voice },
  };
  return d as unknown as Data;
}

const ids = (p: ReturnType<typeof plan>) => p.events.map((e) => e.id);

describe("TV timeline", () => {
  test("doors: the opening card, then the welcome; reminders only while guests are missing", () => {
    let p = plan(data(), T0 + 1000, secs);
    expect(cardNow(p, T0 + 1000)?.key).toBe("opening");
    expect(p.holdUntil).toBe(T0 + CARD_MS.opening);
    expect(p.events.find((e) => e.cue === "doors")?.at).toBe(T0 + 4300);
    expect(p.events.some((e) => e.cue === "doorsReminder")).toBe(false);
    p = plan(data({ counts: { here: 4 } }), T0, secs);
    expect(p.events.filter((e) => e.cue === "doorsReminder").map((e) => e.at - T0)).toContain(5 * 60_000);
    expect(p.ambience).toEqual(["roomTone"]);
    expect(p.music).toBe("lobby");
  });

  test("house rules: five cards in order, each with a page flip; the waves version of rule 3", () => {
    const at = T0 + 60_000;
    const p = plan(data({ game: { rulesAt: at, search: "waves" } }), at, secs);
    expect(p.rules!.steps.map((s) => s.cue)).toEqual(["rules1", "rules2", "rules3Waves", "rules4", "rules5"]);
    for (let i = 1; i < 5; i++) expect(p.rules!.steps[i].at).toBe(p.rules!.steps[i - 1].until);
    expect(p.events.filter((e) => e.sfx === "cardFlip")).toHaveLength(5);
    expect(p.events.filter((e) => e.cue?.startsWith("rules")).every((e) => e.quiet)).toBe(true);
  });

  test("roll call: title card, the opener, one card per guest long enough for the line, then the closer", () => {
    const at = T0 + 120_000;
    const clip = (n: number) => ({ url: `u${n}`, caption: `c${n}`, seconds: n });
    const items = [
      { id: "a", charName: "A", realName: "Ann", photoUrl: null, line: "Line a.", clip: clip(2) },
      { id: "b", charName: "B", realName: "Bo", photoUrl: null, line: "A much longer line for b that takes its time.", clip: clip(7) },
      { id: "c", charName: "C", realName: "Cy", photoUrl: null, line: "No clip yet.", clip: null },
    ];
    const p = plan(data({ counts: { here: 3 }, voice: { rollCall: { at, items } } }), at + 500, secs);
    expect(cardNow(p, at + 500)?.key).toBe("rollcall");
    expect(p.loop).toBe("rollcall");
    const steps = p.roll!.steps;
    expect(steps.map((s) => s.item.id)).toEqual(["a", "b", "c"]);
    expect(steps[0].until - steps[0].at).toBe(5500);
    expect(steps[1].until - steps[1].at).toBe((0.9 + 7 + 1.6) * 1000);
    expect(p.events.filter((e) => e.clip).every((e) => e.quiet)).toBe(true);
    expect(p.events.filter((e) => e.clip)).toHaveLength(2);
    expect(p.events.at(-1)?.cue).toBe("rollCallClose");
    // reminders keep quiet while it plays
    expect(p.events.some((e) => e.cue === "doorsReminder" && e.at >= at && e.at <= p.roll!.end)).toBe(false);
    // and the doors come back after
    expect(plan(data({ voice: { rollCall: { at, items } } }), p.roll!.end + 1, secs).loop).toBe("doors");
  });

  test("intro: lights out, the body, the room; a skipped intro drops what it didn't reach", () => {
    const g = { status: "playing", round: 1, startedAt: T0, introEndsAt: T0 + INTRO_MS };
    const body = { url: "b", caption: "He was found in the Lounge.", seconds: 2 };
    let p = plan(data({ game: g, voice: { body } }), T0 + 500, secs);
    expect(cardNow(p, T0 + 500)?.key).toBe("lightsout");
    expect(p.loop).toBe("dark");
    expect(p.music).toBeNull();
    expect(p.events.map((e) => e.sfx ?? e.cue ?? "clip")).toEqual(["needleScratch", "lightsCut", "bodyFall", "scream", "intro1", "swell", "intro2", "clip", "intro3", "intro4"]);
    p = plan(data({ game: g, voice: { body } }), T0 + 5000, secs);
    expect(p.music).toBe("intro");
    expect(p.ambience).toEqual(["heartbeat"]);
    p = plan(data({ game: { ...g, introEndsAt: T0 + 20_000 }, voice: { body } }), T0 + 10_000, secs);
    expect(p.events.some((e) => e.cue === "intro3")).toBe(false);
  });

  test("round 3: cards land with a telegraph each, then the twist line, the twist card, and the twist", () => {
    const t = T0 + 900_000;
    const evidence = [
      { round: 3, text: "a", twist: false },
      { round: 3, text: "b", twist: false },
      { round: 3, text: "twist", twist: true },
    ];
    const p = plan(data({ game: { status: "playing", round: 3, startedAt: T0, introEndsAt: T0 + INTRO_MS, roundStartedAt: t }, evidence }), t + 100, secs);
    expect(cardNow(p, t + 100)?.key).toBe("round3");
    expect(p.events.filter((e) => e.sfx === "telegraph")).toHaveLength(2);
    const twistLine = p.events.find((e) => e.cue === "twist")!;
    const twistCard = p.cards.find((c) => c.key === "twist")!;
    expect(twistCard.at).toBeGreaterThan(twistLine.at);
    expect(p.twistAt).toBe(twistCard.at + CARD_MS.twist);
    expect(p.events.find((e) => e.sfx === "thunder")!.at).toBeGreaterThan(twistCard.at);
  });

  test("reveal: party clips when they're recorded, the generic lines when not; the right verdict sting", () => {
    const g = { status: "reveal", round: 4, revealAt: T0 };
    const c = (s: string) => ({ url: s, caption: s, seconds: 2 });
    let p = plan(data({ game: g, voice: { reveal: { killer: c("k"), exhibit: c("e"), room: c("r") } }, results: { killerWins: true } }), T0 + 100, secs);
    expect(p.events.filter((e) => e.clip).map((e) => e.clip!.url)).toEqual(["k", "e", "r"]);
    expect(p.events.some((e) => e.sfx === "sinisterBrass" && e.at === T0 + REVEAL.verdict)).toBe(true);
    expect(p.events.some((e) => e.cue === "reveal2")).toBe(false);
    p = plan(data({ game: g, results: { killerWins: false } }), T0 + REVEAL.line + 100, secs);
    expect(p.events.some((e) => e.cue === "reveal2")).toBe(true);
    expect(p.events.some((e) => e.cue === "reveal3")).toBe(true);
    expect(p.events.some((e) => e.sfx === "fanfare")).toBe(true);
    expect(p.ambience).toEqual(["drumroll"]);
  });

  test("each event fires once, and only while fresh", () => {
    const p = plan(data(), T0 + 4400, secs);
    const fired = new Set<string>();
    const first = due(p, T0 + 4400, fired);
    expect(first.map((e) => e.cue)).toEqual(["doors"]);
    for (const e of first) fired.add(e.id);
    expect(due(p, T0 + 4600, fired)).toHaveLength(0);
    // a TV opened a minute after the doors stays quiet about the welcome
    expect(due(plan(data(), T0 + 60_000, secs), T0 + 60_000, new Set())).toHaveLength(0);
    expect(ids(p)).toContain(`doors:${T0}`);
  });
});
