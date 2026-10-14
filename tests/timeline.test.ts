import { describe, expect, test } from "vitest";
import { INTRO_MS, REVEAL } from "../convex/shared";
import { CARD_MS } from "../src/tv/media";
import { cameosNow, cardNow, due, plan, type Data } from "../src/tv/timeline";

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

  test("how to play: nine illustrated cards in order, with the waves and timer versions when those are on", () => {
    const at = T0 + 60_000;
    const p = plan(data({ game: { rulesAt: at, search: "waves", pacing: { mode: "timer", roundMinutes: 10 } } }), at, secs);
    expect(p.rules!.steps.map((s) => s.cue)).toEqual(["howTo1", "howTo2", "howTo3", "howTo4Waves", "howTo5", "howTo6Timer", "howTo7", "howTo8", "howTo9"]);
    expect(p.rules!.steps.map((s) => s.art)).toEqual(["don", "killer", "flapper", "dapper", "map", "bodyguard", "lady", "detective", "killer"]);
    for (let i = 1; i < 9; i++) expect(p.rules!.steps[i].at).toBe(p.rules!.steps[i - 1].until);
    expect(p.events.filter((e) => e.id.startsWith("how:") && (e.sfx === "whoosh" || e.sfx === "cardFlip"))).toHaveLength(9);
    expect(p.events.filter((e) => e.cue?.startsWith("howTo")).every((e) => e.quiet)).toBe(true);
    const plain = plan(data({ game: { rulesAt: at } }), at, secs);
    expect(plain.rules!.steps.map((s) => s.cue)).toContain("howTo4");
    expect(plain.rules!.steps.map((s) => s.cue)).toContain("howTo6");
  });

  test("how to play follows the roll call on its own", () => {
    const at = T0 + 120_000;
    const items = [{ id: "a", charName: "A", realName: "Ann", photoUrl: null, line: "Line a.", clip: null }];
    const p = plan(data({ voice: { rollCall: { at, items } } }), at, secs);
    expect(p.rules!.steps[0].at).toBe(p.roll!.end + 1000);
    // while the roll call plays, How to play waits its turn
    expect(p.rules!.steps[0].at).toBeGreaterThan(p.roll!.steps[0].until);
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
    expect(p.events.filter((e) => e.id.startsWith("roll:")).at(-1)?.cue).toBe("rollCallClose");
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

  test("the cast: the Don greets the lobby, falls at lights out, a guest creeps by each round, the killer peeks after the twist", () => {
    let p = plan(data(), T0 + 5000, secs);
    expect(cameosNow(p, T0 + 5000, "doors", false).map((c) => c.char)).toEqual(["don"]);
    expect(cameosNow(p, T0 + 5000, "rules0", false)).toHaveLength(0);
    expect(p.cameos.some((c) => c.anim === "stroll" || c.anim === "strollBack")).toBe(true);
    const g = { status: "playing", round: 1, startedAt: T0, introEndsAt: T0 + INTRO_MS };
    p = plan(data({ game: g }), T0 + 1000, secs);
    expect(cameosNow(p, T0 + 1000, "intro0", true).map((c) => c.anim)).toEqual(["fall"]);
    const t = T0 + 900_000;
    const evidence = [{ round: 3, text: "a", twist: false }, { round: 3, text: "twist", twist: true }];
    p = plan(data({ game: { status: "playing", round: 3, startedAt: T0, introEndsAt: T0 + INTRO_MS, roundStartedAt: t }, evidence }), t + 100, secs);
    const peek = p.cameos.find((c) => c.anim === "peek")!;
    expect(peek.char).toBe("killer");
    expect(peek.at).toBeGreaterThan(p.twistAt!);
    expect(p.events.some((e) => e.sfx === "creak" && e.at === peek.at)).toBe(true);
    const creep = p.cameos.find((c) => c.id.endsWith(":creep"))!;
    expect(creep.at).toBeGreaterThan(p.holdUntil);
    expect(cameosNow(p, creep.at + 100, "r3", false).some((c) => c.id === creep.id)).toBe(true);
    expect(cameosNow(p, creep.at + 100, "r2", false).some((c) => c.id === creep.id)).toBe(false);
  });

  test("the cast: a line-up at the accusations and the masked killer at the reveal", () => {
    const t = T0 + 1_200_000;
    let p = plan(data({ game: { status: "playing", round: 4, startedAt: T0, introEndsAt: T0 + INTRO_MS, roundStartedAt: t } }), t + 6000, secs);
    const line = cameosNow(p, t + 6000, "accuse", false);
    expect(line.map((c) => c.char)).toEqual(["flapper", "dapper", "lady", "killer", "bodyguard", "sleuth", "detective"]);
    expect(line.map((c) => c.slot)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    p = plan(data({ game: { status: "reveal", round: 4, revealAt: t } }), t + REVEAL.line + 100, secs);
    expect(cameosNow(p, t + REVEAL.line + 100, "reveal0", false).map((c) => c.anim)).toEqual(["spot"]);
    expect(cameosNow(p, t + REVEAL.name + 100, "reveal1", true).map((c) => c.anim)).toEqual(["unmask"]);
  });

  test("each event fires once, and only while fresh", () => {
    const p = plan(data(), T0 + 4400, secs);
    const fired = new Set<string>();
    const first = due(p, T0 + 4400, fired);
    expect(first.map((e) => e.cue ?? e.sfx).sort()).toEqual(["doors", "whoosh"]);
    for (const e of first) fired.add(e.id);
    expect(due(p, T0 + 4600, fired)).toHaveLength(0);
    // a TV opened a minute after the doors stays quiet about the welcome
    expect(due(plan(data(), T0 + 60_000, secs), T0 + 60_000, new Set())).toHaveLength(0);
    expect(ids(p)).toContain(`doors:${T0}`);
  });
});
