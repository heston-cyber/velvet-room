// The joke rewrite (Oct 16, Heston after his play test): "Humor needs a rewrite", "more cursing and crude and
// suggestive content in adult mode", Adult D ("mixes the noisy and cussing together"), Sailor mode (Joel since Oct 17, "totally
// unhinged, delivered with utmost intensity and seriousness"), no repeats per host laptop, and the running gag only
// every third game.
import { describe, expect, test } from "vitest";
import { ADULT_CUSTOM, ADULT_D, CAST_INTROS, CUES, captionText, narratorName, recordingText, INSULTS, INSULT_KINDS, LATER_KINDS, SAILOR, SAILOR_CUSTOM, cleanVersions, cueVariant, cueVersions, customText, insultText, isD, pickLines, plain, verdictText, voiceKey, type CueKey } from "../convex/narration";
import { heckleLines, HECKLES } from "../convex/heckles";
import { laterWanted, scriptOf, startWanted, variantOf } from "../convex/voiceLines";
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
    for (const cue of ["awardDetective", "awardDressed"] as CueKey[]) for (const t of [...cueVersions(cue, "adult"), ...cleanVersions(cue, "sailor")]) expect(t.trim(), cue).toMatch(/(to|is)…$/);
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
  test("Sailor's own voice set, his own script (two versions a line), and Sailor needs Adult", () => {
    expect(voiceKey("duke", false, true)).toBe("gruff-sailor");
    expect(scriptOf({ tone: "adult", narrator: { host: "duke", unstable: false, sailor: true } })).toBe("sailor");
    expect(scriptOf({ tone: "adult", narrator: { host: "duke", unstable: false } })).toBe("adult");
    for (const cue of ACTIVE) {
      expect(cleanVersions(cue, "sailor"), cue).toHaveLength(2);
      expect(cueVersions(cue, "sailor"), cue).toHaveLength(2); // no noisy take, no D
      for (const t of cleanVersions(cue, "sailor")) expect(SWEAR.test(plain(t)), `${cue}: ${t}`).toBe(true);
    }
  });

  test("no C-word anywhere in Sailor mode (Oct 17, Heston: \"No cunt\")", () => {
    const all = [...(Object.keys(CUES) as CueKey[]).flatMap((c) => cueVersions(c, "sailor")), ...Object.values(SAILOR_CUSTOM).flat(), ...CAST_INTROS.sailor, ...HECKLES.sailor, ...JSON.stringify(INSULTS).split('","')] as string[];
    for (const t of all) expect(t, t).not.toMatch(/cunt/i);
  });

  test("Sailor's narrator is Joel (Oct 17), in the recording and the caption", () => {
    expect(narratorName("duke", "sailor")).toBe("Joel");
    expect(narratorName("duke", "adult")).toBe("Duke");
    expect(narratorName("ivy", "classic")).toBe("Ivy");
    for (const v of [0, 1]) {
      expect(recordingText("doors", "sailor", "duke", false, v)).toContain("I'm Joel");
      expect(captionText("doors", "sailor", "duke", v)).toContain("I'm Joel");
    }
    expect(captionText("doors", "adult", "duke")).toContain("I'm Duke");
  });

  test("per-game lines and heckles have Sailor versions", () => {
    expect(customText("killer", "sailor", { name: "Josh", seed: "g1" })).toContain("Josh");
    expect(SAILOR_CUSTOM.killer!.map((t) => t.replaceAll("{name}", "X"))).toContain(customText("killer", "sailor", { name: "X", seed: "g1" }));
    const lines = heckleLines("sailor", "g1", guests, { gag: true });
    expect(lines.every((l) => l.id.startsWith("sailor:insult:"))).toBe(true);
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

  test("one guest gets every insult only on a gag night; insults this laptop heard lately go last", () => {
    const off = heckleLines("adult", "g1", guests, { gag: false });
    expect(off.some((l) => l.gag)).toBe(false);
    expect(new Set(off.map((l) => l.target).filter(Boolean)).size).toBe(guests.length); // everyone takes turns
    const on = heckleLines("adult", "g1", guests, { gag: true });
    expect(on.every((l) => l.gag)).toBe(true);
    expect(new Set(on.map((l) => l.target)).size).toBe(1);
    // no setting: no gag
    expect(heckleLines("adult", "g1", guests).some((l) => l.gag)).toBe(false);
    // the lines g1 used go to the back of the queue next time
    const heard = off.map((l) => l.id);
    const next = heckleLines("adult", "g2", guests, { gag: false, avoid: heard });
    const fresh = next.filter((l) => !heard.includes(l.id)).length;
    expect(fresh).toBe(Math.min(next.length, HECKLES.adult.length - heard.length));
  });
});

// Oct 17 (Heston): Adult swearing is mild ("No hard words. Crude jokes are still fine, insults are great and
// encouraged"), with more insults on the guests' real names; Sailor mode is untouched.
describe("Oct 17: mild Adult, and insults on real names", () => {
  const HARD = /\b(fuck\w*|motherfuck\w*|bitch\w*|son of a bitch|sons of bitches|cunt\w*|goddamn\w*|bastard\w*|prick\w*|dick\w*|douche\w*|asshole\w*|piss\w*)\b/i;
  test("no hard words anywhere in the Adult or Classic scripts the night plays", () => {
    for (const cue of ACTIVE) for (const t of [...cueVersions(cue, "adult"), ...cueVersions(cue, "classic")]) expect(plain(t), cue).not.toMatch(HARD);
    for (const pool of Object.values(ADULT_CUSTOM)) for (const t of pool!) expect(t).not.toMatch(HARD);
    for (const kind of INSULT_KINDS) for (const tone of ["classic", "adult"] as const) for (const t of INSULTS[kind][tone]) expect(t, kind).not.toMatch(HARD);
    for (const t of [...HECKLES.classic, ...HECKLES.adult]) expect(t).not.toMatch(HARD);
  });

  test("every insult names the guest, and each guest gets their own version, the same all game", () => {
    for (const kind of INSULT_KINDS) for (const tone of ["classic", "adult", "sailor"] as const) for (const t of INSULTS[kind][tone]) expect(t, `${kind} ${tone}`).toContain("{real}");
    const a = insultText("bestDressed", "adult", { real: "Josh", seed: "g1", id: "p1" });
    expect(a).toContain("Josh");
    expect(insultText("bestDressed", "adult", { real: "Josh", seed: "g1", id: "p1" })).toBe(a);
    const many = new Set(["p1", "p2", "p3", "p4", "p5", "p6"].map((id) => insultText("caught", "classic", { real: "X", seed: "g1", id })));
    expect(many.size).toBeGreaterThan(1);
    // the jail verdicts mix the script's lines and the insults
    const v = new Set(["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"].map((id) => verdictText("jailed", "adult", { name: "Josh “Two-Tone” Lee", real: "Josh", seed: "g1", id })));
    expect([...v].some((t) => t.includes("Two-Tone"))).toBe(true);
    expect([...v].some((t) => !t.includes("Two-Tone") && t.includes("Josh"))).toBe(true);
  });

  test("the later lines are made for every guest but recorded only when their moment comes", () => {
    const n = { host: "duke" as const, unstable: false };
    const later = laterWanted("adult", n, { players: [{ id: "p1", charName: "Josh", real: "Josh" }], seed: "g1" });
    expect(later.map((w) => w.purpose.split(":")[0]).sort()).toEqual([...LATER_KINDS].sort());
    const start = startWanted("adult", n, { players: [{ id: "p1", charName: "Josh", real: "Josh" }], exhibits: [], rooms: [], search: "all", seed: "g1" });
    for (const k of LATER_KINDS) expect(start.some((w) => w.purpose.startsWith(`${k}:`))).toBe(false);
  });
});
