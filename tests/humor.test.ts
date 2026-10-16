// The joke rewrite (Oct 16, Heston after his play test): "Humor needs a rewrite", "more cursing and crude and
// suggestive content in adult mode", Adult D ("mixes the noisy and cussing together"), Sailor mode (Duke, "totally
// unhinged, delivered with utmost intensity and seriousness"), no repeats per host laptop, and the running gag only
// every third game.
import { describe, expect, test } from "vitest";
import { ADULT_D, CAST_INTROS, SAILOR, SAILOR_CUSTOM, cleanVersions, cueVariant, cueVersions, customText, isD, pickLines, plain, voiceKey, type CueKey } from "../convex/narration";
import { heckleLines, HECKLES, SAILOR_HECKLES } from "../convex/heckles";
import { scriptOf, variantOf } from "../convex/voiceLines";
import { howCues } from "../convex/show";

const NOISE = /\[(hiccups|burps|burps loudly|farts|sneezes|snorts|coughs|clears throat|gasps|gulps)[^\]]*\]|\b([A-Za-z])- \2-|\w- \[/i;
const SWEAR = /\b(fuck\w*|\w*shit\w*|ass\b|asses|asshole\w*|bastard\w*|bitch\w*|damn\w*|goddamn\w*|hell|crap\w*|bloody|freaking|piss\w*|prick\w*|dick\w*|wanker\w*|bollocks|douche\w*|motherfuck\w*|son of a bitch|sons of bitches|jackass|dumbass\w*|dipshit\w*|bullshit)\b/i;
// Every line the game still plays (How to play v3, the show, the rounds, votes, reveal, awards).
const ACTIVE = Object.keys(SAILOR) as CueKey[];
const guests = ["Sam", "Emily", "Josh", "Madison", "Reily", "Sophia"].map((real, i) => ({ id: `p${i}`, real, weapon: "Knife", figure: null }));

describe("the new adult script", () => {
  test("every line the game plays has A, B and C, and an Adult D with a noise and a swear", () => {
    expect(ACTIVE.length).toBeGreaterThanOrEqual(44);
    for (const cue of ACTIVE) {
      expect(cleanVersions(cue, "adult"), cue).toHaveLength(3);
      const d = ADULT_D[cue];
      expect(d, cue).toBeTruthy();
      expect(NOISE.test(d!), `${cue}: ${d}`).toBe(true);
      expect(SWEAR.test(plain(d!)), `${cue}: ${d}`).toBe(true);
      expect(isD(cue, "adult", cueVersions(cue, "adult").length - 1)).toBe(true);
    }
  });

  test("nobody gets called the C-word anywhere in Adult, and lead-ins still lead into the name", () => {
    for (const cue of ACTIVE) for (const t of cueVersions(cue, "adult")) expect(t, cue).not.toMatch(/\bcunt/i);
    for (const cue of ["reveal1", "revealAccomplice"] as CueKey[]) for (const t of [...cueVersions(cue, "adult"), ...cleanVersions(cue, "sailor")]) expect(t.trim(), cue).toMatch(/is…$/);
    for (const cue of ["awardDetective", "awardDressed", "awardLiar"] as CueKey[]) for (const t of [...cueVersions(cue, "adult"), ...cleanVersions(cue, "sailor")]) expect(t.trim(), cue).toMatch(/(to|is)…$/);
    // the rules still teach the rules
    for (const t of cueVersions("howCase", "adult")) expect(plain(t)).toMatch(/only the guilty/i);
    for (const t of [...cueVersions("howJail2", "adult"), ...cleanVersions("howJail2", "sailor")]) {
      expect(plain(t)).toMatch(/Round 2/);
      expect(plain(t)).toMatch(/nobody/i);
      expect(plain(t)).toMatch(/more than half/i);
      expect(plain(t)).toMatch(/Round 3/);
    }
  });

  test("How to play still uses the v3 cards", () => {
    for (const [cue] of howCues({ search: "waves", pacing: { mode: "ready" }, accomplice: true })) expect(ACTIVE).toContain(cue);
  });
});

describe("Sailor mode", () => {
  test("Duke's own voice set, his own script (two versions a line), and Sailor needs Adult", () => {
    expect(voiceKey("duke", false, true)).toBe("duke-sailor");
    expect(scriptOf({ tone: "adult", narrator: { host: "duke", unstable: false, sailor: true } })).toBe("sailor");
    expect(scriptOf({ tone: "adult", narrator: { host: "duke", unstable: false } })).toBe("adult");
    for (const cue of ACTIVE) {
      expect(cleanVersions(cue, "sailor"), cue).toHaveLength(2);
      expect(cueVersions(cue, "sailor"), cue).toHaveLength(2); // no noisy take, no D
      for (const t of cleanVersions(cue, "sailor")) expect(SWEAR.test(plain(t)), `${cue}: ${t}`).toBe(true);
    }
  });

  test("the C-word is never aimed at anyone", () => {
    const all = [...ACTIVE.flatMap((c) => cleanVersions(c, "sailor")), ...Object.values(SAILOR_CUSTOM).flat(), ...CAST_INTROS.sailor, ...Object.values(SAILOR_HECKLES).flat()] as string[];
    for (const t of all) expect(t, t).not.toMatch(/(you|\{real\}|\{name\}|the Don)\W+(?:\w+\W+){0,5}cunt/i);
  });

  test("per-game lines and heckles have Sailor versions", () => {
    expect(customText("killer", "sailor", { name: "Josh", seed: "g1" })).toContain("Josh");
    expect(SAILOR_CUSTOM.killer!.map((t) => t.replaceAll("{name}", "X"))).toContain(customText("killer", "sailor", { name: "X", seed: "g1" }));
    const lines = heckleLines("sailor", "g1", guests, { gag: true });
    expect(lines.some((l) => l.id.startsWith("sailor:"))).toBe(true);
    expect(customText("rooms", "sailor", { rooms: ["The Bar", "The Lounge"], seed: "g2" })).toMatch(/the Bar and the Lounge/);
  });
});

describe("no repeats on a laptop, and the running gag every third game", () => {
  test("each line starts from the version this laptop heard least lately", () => {
    const first = pickLines("adult", "game-1");
    // the laptop heard first's picks; the next game picks something else for every line
    const heard = Object.fromEntries(Object.entries(first).map(([k, v]) => [k, [v]]));
    const second = pickLines("adult", "game-2", heard);
    for (const k of Object.keys(first)) expect(second[k], k).not.toBe(first[k]);
    // after hearing A and B, it's C
    const third = pickLines("adult", "game-3", Object.fromEntries(Object.keys(first).map((k) => [k, [first[k], second[k]]])));
    for (const k of Object.keys(first)) expect(new Set([first[k], second[k], third[k]]).size, k).toBe(3);
  });

  test("the TV and the server agree on the picked version; a line that repeats moves on each time", () => {
    const lines = { picks: { oneMinute: 1, doors: 2 }, gag: false, avoid: [] };
    const g = { tone: "adult" as const, slug: "s", lines };
    // the clean version is the picked one (unless this game's dice roll a noisy take or Adult D)
    const clean = (cue: CueKey, occ = "") => {
      const v = variantOf(g, cue, occ);
      return v < cleanVersions(cue, "adult").length ? v : null;
    };
    expect([2, null]).toContain(clean("doors"));
    expect(variantOf(g, "doors")).toBe(cueVariant("adult", "doors", "s", "", { picks: lines.picks, d: true }));
    const seen = new Set(["1", "2", "3"].map((o) => clean("oneMinute", o)).filter((x) => x !== null));
    expect(seen.size).toBeGreaterThan(1);
  });

  test("Adult D plays now and then in games that picked their lines, never in older games", () => {
    let d = 0;
    let n = 0;
    for (let i = 0; i < 400; i++)
      for (const cue of ACTIVE) {
        n++;
        if (isD(cue, "adult", cueVariant("adult", cue, `g${i}`, "", { picks: {}, d: true }))) d++;
        expect(isD(cue, "adult", cueVariant("adult", cue, `g${i}`))).toBe(false);
      }
    expect(d / n).toBeGreaterThan(0.05);
    expect(d / n).toBeLessThan(0.15);
  });

  test("no running gag unless it's that night; heckles this laptop heard lately go last", () => {
    const off = heckleLines("adult", "g1", guests, { gag: false });
    expect(off.some((l) => l.gag)).toBe(false);
    expect(new Set(off.map((l) => l.target).filter(Boolean)).size).toBe(guests.length); // everyone takes turns
    const on = heckleLines("adult", "g1", guests, { gag: true });
    const gagged = on.filter((l) => l.gag);
    expect(gagged.length).toBe(8);
    expect(new Set(gagged.map((l) => l.target)).size).toBe(1);
    // the arc plays in order, from its first line to its last
    const idx = gagged.map((l) => Number(l.id.split(":").pop()));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
    expect(idx[0]).toBe(0);
    expect(idx[idx.length - 1]).toBe(HECKLES.adult.gag.length - 1);
    // older games (no setting): the gag every night, as before
    expect(heckleLines("adult", "g1", guests).some((l) => l.gag)).toBe(true);
    // the lines g1 used go to the back of the queue next time
    const heard = off.map((l) => l.id);
    const next = heckleLines("adult", "g2", guests, { gag: false, avoid: heard });
    const fresh = next.filter((l) => !heard.includes(l.id)).length;
    const poolSize = HECKLES.adult.bit.length + HECKLES.adult.jab.length + HECKLES.adult.aside.length;
    if (poolSize - heard.length >= next.length) expect(fresh).toBe(next.length);
  });
});
