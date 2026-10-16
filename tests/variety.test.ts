import { describe, expect, test } from "vitest";
import { ADULT_MORE, CUES, NOISY, captionText, cleanVersions, cueFile, cueFiles, cueVariant, cueVersions, customText, isNoisy, recordingText, sprinkle, type CueKey } from "../convex/narration";
import { HECKLES, heckleLines } from "../convex/heckles";
import { howCues } from "../convex/show";
import { REVEAL } from "../convex/shared";
import { HECKLE, plan, type Data } from "../src/tv/timeline";

// Lines the v2 night uses (the old lobby How to play and roll call opener are retired).
const RETIRED: CueKey[] = ["howTo1", "howTo2", "howTo3", "howTo5", "howTo8", "howTo9", "rollCallOpen"];
const USED = (Object.keys(CUES) as CueKey[]).filter((c) => !RETIRED.includes(c));

describe("adult script: several versions of every line, picked per game", () => {
  test("every line the night uses has at least three adult versions; classic keeps one", () => {
    for (const cue of USED) {
      expect(cleanVersions(cue, "adult").length, cue).toBeGreaterThanOrEqual(3);
      expect(cleanVersions(cue, "classic")).toHaveLength(1);
    }
    for (const lines of Object.values(ADULT_MORE)) for (const l of lines!) expect(l).not.toMatch(/marri/i);
  });

  test("a game keeps its versions; other games get others", () => {
    const pick = (seed: string) => USED.map((c) => cueVariant("adult", c, seed));
    expect(pick("velvet-2026")).toEqual(pick("velvet-2026"));
    const games = ["velvet-2026", "velvet-2026-2", "velvet-2026-3", "device-test-2"].map(pick);
    expect(new Set(games.map((g) => g.join(","))).size).toBe(4);
    // Over a few replays, every line is heard in more than one version.
    for (let i = 0; i < USED.length; i++) expect(new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((s) => cueVariant("adult", USED[i], s))).size, USED[i]).toBeGreaterThan(1);
    expect(cueVariant("classic", "howJail", "anything")).toBe(0);
  });

  test("a line that repeats in one game changes each time", () => {
    const minutes = [1, 2, 3].map((r) => cueVariant("adult", "oneMinute", "velvet-2026", String(r)));
    const reminders = Array.from({ length: 6 }, (_, k) => cueVariant("adult", "doorsReminder", "velvet-2026", String(k + 1)));
    expect(new Set([...minutes, ...reminders]).size).toBeGreaterThan(1);
  });

  test("each version has its own recording, caption and text", () => {
    expect(cueFile("howJail", 0)).toBe("howJail");
    expect(cueFile("howJail", 2)).toBe("howJail.2");
    const adult = cueFiles("adult");
    expect(adult.filter((f) => f.cue === "howJail").map((f) => f.file)).toEqual(["howJail", "howJail.1", "howJail.2", "howJail.3"]); // .3 is the noisy take
    expect(cueFiles("classic").length).toBe(Object.keys(CUES).length + Object.keys(NOISY.classic).length);
    expect(captionText("intro3", "adult", "ivy", 2)).toBe("And one of you did it. Don't look so innocent. It doesn't suit you.");
    expect(recordingText("intro3", "adult", "ivy", false, 2)).toContain("[whispers]");
    expect(captionText("howLockIn", "adult", "ivy")).not.toMatch(/marri/i);
  });

  test("the reveal and the body come in versions too, the same for every guest in a game", () => {
    const k = (seed: string, name: string) => customText("killer", "adult", { name, seed });
    expect(k("g1", "Velma").replace("Velma", "X")).toBe(k("g1", "Lou").replace("Lou", "X"));
    expect(new Set(["g1", "g2", "g3", "g4", "g5", "g6"].map((s) => k(s, "X"))).size).toBeGreaterThan(1);
    expect(customText("killer", "classic", { name: "Velma", seed: "g1" })).toBe("Velma.");
  });
});

describe("noises: an extra bank, played now and then", () => {
  const NOISE = /\[(hiccups|burps|burps loudly|farts|sneezes|snorts|coughs|clears throat)[^\]]*\]|\b([A-Za-z])- \2-/i;

  test("the clean lines have no noises; the noisy takes are a separate bank, each with one", () => {
    for (const tone of ["classic", "adult"] as const) {
      for (const cue of Object.keys(CUES) as CueKey[]) for (const t of cleanVersions(cue, tone)) expect(NOISE.test(t), `${tone} ${cue}: ${t}`).toBe(false);
      for (const [cue, t] of Object.entries(NOISY[tone])) {
        expect(NOISE.test(t!), `${tone} ${cue}`).toBe(true);
        expect(isNoisy(cue as CueKey, tone, cueVersions(cue as CueKey, tone).length - 1)).toBe(true);
      }
    }
    expect(Object.values(NOISY.classic).some((t) => /farts/.test(t!))).toBe(false);
  });

  test("about one line in ten heard is a noisy take", () => {
    for (const tone of ["classic", "adult"] as const) {
      let heard = 0;
      let noisy = 0;
      for (let g = 0; g < 400; g++) {
        for (const cue of USED) {
          heard++;
          if (isNoisy(cue, tone, cueVariant(tone, cue, `game-${g}`))) noisy++;
        }
      }
      expect(noisy / heard, tone).toBeGreaterThan(0.07);
      expect(noisy / heard, tone).toBeLessThan(0.13);
    }
  });

  test("per-game lines (roll call, heckles, names) get a noise about one time in ten; captions stay clean", () => {
    const line = "Introducing Velma, played by Ana. Weapon: the rope. Ana has a heart of gold.";
    const out = Array.from({ length: 1000 }, (_, i) => sprinkle(line, "adult", `game|roll:${i}`));
    const changed = out.filter((t) => t !== line);
    expect(changed.length / out.length).toBeGreaterThan(0.06);
    expect(changed.length / out.length).toBeLessThan(0.14);
    expect(changed.every((t) => NOISE.test(t))).toBe(true);
    expect(out.filter((t) => /farts/.test(t)).length).toBeGreaterThan(0);
    expect(Array.from({ length: 1000 }, (_, i) => sprinkle(line, "classic", `g|${i}`)).some((t) => /farts/.test(t))).toBe(false);
  });
});

describe("heckles in the lulls", () => {
  const guests = ["Ana Ruiz", "Ben Cho", "Cy Park", "Dee Lane", "Eli Moss", "Flo Gray"].map((real, i) => ({ id: `p${i}`, real, weapon: ["Rope", "Lawn Gnome", "Knife", "Wrench", "Poison", "Trophy"][i], figure: `fig${i}` }));

  test("one guest is the night's running gag, and keeps coming back, a little worse each time", () => {
    const lines = heckleLines("adult", "velvet-2026", guests);
    expect(lines.length).toBeGreaterThanOrEqual(14);
    const gag = lines.filter((l) => l.gag);
    expect(gag.length).toBeGreaterThanOrEqual(5);
    expect(new Set(gag.map((l) => l.target)).size).toBe(1);
    const name = guests.find((g) => g.id === gag[0].target)!.real.split(" ")[0];
    expect(gag.every((l) => l.text.includes(name))).toBe(true);
    expect(gag.map((l) => l.text)).toEqual(HECKLES.adult.gag.map((t) => t.replaceAll("{real}", name)));
    // The rest roast everyone else around, by first name, and nothing repeats.
    const roasted = new Set(lines.filter((l) => !l.gag && l.target).map((l) => l.target));
    expect(roasted.size).toBe(guests.length - 1);
    expect(new Set(lines.map((l) => l.text)).size).toBe(lines.length);
    expect(lines.every((l) => !/[{}]/.test(l.text) && !/\b(Ruiz|Cho)\b|Cy Park/.test(l.text))).toBe(true);
    expect(lines.filter((l) => !l.target).length).toBeGreaterThanOrEqual(3); // asides about the night
    expect(lines.some((l) => l.text.split(" ").length <= 6)).toBe(true); // short, punchy ones
  });

  test("every replay picks a different running gag and different lines", () => {
    const a = heckleLines("adult", "velvet-2026", guests);
    const b = heckleLines("adult", "velvet-2026-2", guests);
    expect(a.map((l) => l.text)).not.toEqual(b.map((l) => l.text));
    const gagOf = (seed: string) => heckleLines("classic", seed, guests).find((l) => l.gag)!.target;
    expect(new Set(["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"].map(gagOf)).size).toBeGreaterThan(2);
  });

  const T0 = 1_800_000_000_000;
  const data = (game: Record<string, unknown>, heckles: unknown[]) =>
    ({
      now: T0,
      game: {
        title: "T", isTest: true, slug: "velvet-2026", status: "playing", round: 1, paused: false, pacing: { mode: "timer", roundMinutes: 10 }, roundEndsAt: null,
        startedAt: T0 - 600_000, introEndsAt: T0, revealAt: null, endedAt: null, doorsAt: null, roundStartedAt: null, pausedAt: null, resumedAt: null, doneAt: null, rulesAt: null,
        tone: "adult", narrator: { host: "ivy", unstable: false }, levels: { voice: 100, music: 55, sfx: 80 }, search: "all", wifi: null, tvShowAll: false,
        soundCheckAt: null, lastRescue: null, bodyRoom: "", rooms: [], openRooms: [], show: null, ...game,
      },
      guests: [],
      counts: { registered: 6, here: 6, playing: 6, ready: 0, accused: 0 },
      exhibits: [],
      weapons: [],
      evidence: [],
      results: null,
      reveal: REVEAL,
      voice: { voice: "ivy", rollCall: null, body: null, rooms: {}, reveal: null, winners: null, heckles },
      map: { rooms: [], markers: [] },
    }) as unknown as Data;
  const hk = Array.from({ length: 14 }, (_, i) => ({ id: `heckle:${i}`, figure: i % 3 === 1 ? "flapper" : null, gag: i % 3 === 1, clip: { url: `h${i}`, caption: `Heckle ${i}`, seconds: 4 } }));
  const secs = () => 3;

  test("while searching: a minute and a bit in, then every two and a half minutes, clear of the one-minute warning", () => {
    const p = plan(data({ roundEndsAt: T0 + 600_000 }, hk), T0 + 1000, secs);
    const hs = p.events.filter((e) => e.id.startsWith("heckle:"));
    expect(hs.map((e) => e.at - p.holdUntil)).toEqual([HECKLE.roundFirst, HECKLE.roundFirst + HECKLE.roundEvery, HECKLE.roundFirst + 2 * HECKLE.roundEvery]);
    expect(hs.map((e) => e.clip!.url)).toEqual(["h0", "h1", "h2"]);
    const minute = p.events.find((e) => e.cue === "oneMinute")!;
    expect(hs.every((e) => e.at + 4000 < minute.at)).toBe(true);
    // the roasted guest's drawing leans in while it plays
    expect(p.cameos.some((c) => c.id.startsWith("heckle:") && c.char === "flapper" && c.anim === "peek")).toBe(true);
    // Round 2 picks up where Round 1 left off in the night's order.
    const p2 = plan(data({ round: 2, roundStartedAt: T0, roundEndsAt: T0 + 600_000 }, hk), T0 + 1000, secs);
    expect(p2.events.find((e) => e.id.startsWith("heckle:"))!.clip!.url).toBe("h5");
    // Nothing while paused, and nothing when no heckles are recorded.
    expect(plan(data({ paused: true, pausedAt: T0, roundEndsAt: -300_000 }, hk), T0 + 1000, secs).events.some((e) => e.id.startsWith("heckle:"))).toBe(false);
    expect(plan(data({ roundEndsAt: T0 + 600_000 }, []), T0 + 1000, secs).events.some((e) => e.id.startsWith("heckle:"))).toBe(false);
  });

  test("during the lock-in and the Best Dressed and Best Liar votes", () => {
    const acc = plan(data({ round: 4, roundStartedAt: T0, roundEndsAt: T0 + 300_000 }, hk), T0 + 1000, secs);
    const a = acc.events.filter((e) => e.id.startsWith("heckle:"));
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(a[0].clip!.url).toBe("h1"); // 15 % 14
    const rev = plan(data({ status: "reveal", revealAt: T0 }, hk), T0 + 1000, secs);
    const vote = rev.events.find((e) => e.cue === "votePrompt")!;
    const r = rev.events.filter((e) => e.id.startsWith("heckle:"));
    expect(r).toHaveLength(4);
    expect(r[0].at).toBe(vote.at + 3000 + HECKLE.voteFirst);
  });

  test("How to play in an adult game shows this game's version of each card", () => {
    const g = { search: "all" as const, pacing: { mode: "ready" as const } };
    const cues = howCues(g).map(([c]) => c);
    const p = plan(data({ startedAt: T0, introEndsAt: T0 + 400_000, show: { howAt: T0 + 40_000, rollAt: T0 + 300_000, phonesAt: null }, pacing: { mode: "ready", roundMinutes: 10 } }, []), T0 + 41_000, secs);
    expect(p.rules!.steps.map((s) => s.cue)).toEqual(cues);
    expect(p.rules!.steps.map((s) => s.v)).toEqual(cues.map((c) => cueVariant("adult", c, "velvet-2026")));
    const ev = p.events.filter((e) => e.id.startsWith("how:") && e.cue);
    expect(ev.map((e) => e.v)).toEqual(cues.map((c) => cueVariant("adult", c, "velvet-2026")));
  });
});
