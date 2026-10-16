import { describe, expect, test } from "vitest";
import { REVEAL, revealTimes, VOTE } from "../convex/shared";
const INTRO_MS = 60_000;
import { CARD_MS } from "../src/tv/media";
import { readFileSync } from "node:fs";
import { cueFile } from "../convex/narration";
import { cameosNow, cardNow, due, plan, sequence, VOICE_GAP_MS, type Data, type Secs } from "../src/tv/timeline";

const T0 = 1_800_000_000_000;
const secs = () => 3; // every narrator line runs 3 s

function data(over: { game?: Record<string, unknown>; counts?: Record<string, number>; voice?: Record<string, unknown>; evidence?: unknown[]; results?: unknown } = {}): Data {
  const d = {
    now: T0,
    game: {
      title: "T", isTest: true, status: "lobby", round: 0, paused: false, pacing: { mode: "ready", roundMinutes: 10 }, roundEndsAt: null,
      startedAt: null, introEndsAt: null, revealAt: null, endedAt: null, doorsAt: T0, roundStartedAt: null, pausedAt: null, resumedAt: null, doneAt: null, rulesAt: null,
      tone: "classic", narrator: { host: "ivy", unstable: false }, levels: { voice: 100, music: 55, sfx: 80 }, search: "all", wifi: null, tvShowAll: false,
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

  // The show (v2): Start → intro → How to play → roll call → check your phones → Round 1.
  const HOW = T0 + 40_000;
  const ROLL = HOW + 10 * (600 + 3000 + 1200); // ten How to play cards, 3 s lines
  const item = (id: string, clipSecs: number | null) => ({
    id, charName: id.toUpperCase(), realName: `Real ${id}`, photoUrl: null, figure: "flapper", who: "Who.", signature: "A hat",
    weapon: { key: "rope", name: "Rope" }, motive: "He owed you money.", roast: "A roast.", line: `Introducing ${id}. Weapon: the rope.`,
    marks: { signature: 0.3, weapon: 0.5, motive: 0.7, roast: 0.9 },
    clip: clipSecs === null ? null : { url: `u-${id}`, caption: `c-${id}`, seconds: clipSecs },
  });
  const slots = [8000, 0.9 * 1000 + 7000 + 1600, 8000];
  const OPEN = ROLL + 4000 + 300;
  const FIRST = OPEN + 3000 + 800;
  const CLOSE = FIRST + slots[0] + slots[1] + slots[2] + 200;
  const PHONES = CLOSE + 3000 + 600;
  const END = PHONES + 12_000;
  const showGame = (over: Record<string, unknown> = {}) => ({
    status: "playing", round: 1, startedAt: T0, introEndsAt: END, search: "waves", pacing: { mode: "timer", roundMinutes: 10 },
    show: { howAt: HOW, rollAt: ROLL, phonesAt: null }, ...over,
  });
  const showVoice = (items = [item("a", 2), item("b", 7), item("c", null)]) => ({
    body: { url: "b", caption: "He was found in the Lounge.", seconds: 2 },
    rollCall: { at: ROLL, items, slots, frozen: false },
  });

  test("the show: the intro, How to play, the roll call, then check your phones, each part at its fixed time", () => {
    let p = plan(data({ game: showGame(), voice: showVoice() }), T0 + 500, secs);
    expect(p.part).toBe("intro");
    expect(cardNow(p, T0 + 500)?.key).toBe("lightsout");
    expect(p.loop).toBe("dark");
    expect(p.music).toBeNull();
    const intro = p.events.filter((e) => e.id.startsWith("intro:")).map((e) => e.sfx ?? e.cue ?? "clip");
    expect(intro).toEqual(["needleScratch", "lightsCut", "bodyFall", "scream", "intro1", "swell", "intro2", "clip", "intro3"]);
    p = plan(data({ game: showGame(), voice: showVoice() }), T0 + 5000, secs);
    expect(p.music).toBe("intro");
    expect(p.ambience).toEqual(["heartbeat"]);

    // How to play: ten cards, the waves and timer versions, read quietly (the card shows the line).
    p = plan(data({ game: showGame(), voice: showVoice() }), HOW + 100, secs);
    expect(p.part).toBe("how");
    expect(p.loop).toBe("rollcall");
    expect(p.rules!.steps.map((s) => s.cue)).toEqual(["howKiller", "howRoles", "howWeapons", "howTo4Waves", "howTo6Timer", "howJail", "howRelease", "howTo7", "howLockIn", "howWin"]);
    expect(p.rules!.steps.map((s) => s.art)).toEqual(["killer", "flapper", "weapons", "map", "dapper", "bars", "bodyguard", "lady", "detective", "don"]);
    for (let i = 1; i < 10; i++) expect(p.rules!.steps[i].at).toBe(p.rules!.steps[i - 1].until);
    expect(p.rules!.end).toBe(ROLL);
    expect(p.events.filter((e) => e.id.startsWith("how:") && e.cue).every((e) => e.quiet)).toBe(true);

    // The roll call: the card, "the doors are locked", each guest's turn, "remember these faces".
    p = plan(data({ game: showGame(), voice: showVoice() }), ROLL + 500, secs);
    expect(p.part).toBe("roll");
    expect(cardNow(p, ROLL + 500)?.key).toBe("rollcall");
    expect(p.events.find((e) => e.cue === "rollLocked")?.at).toBe(OPEN);
    const steps = p.roll!.steps;
    expect(steps.map((s) => s.item.id)).toEqual(["a", "b", "c"]);
    expect(steps[0].at).toBe(FIRST);
    expect(steps.map((s) => s.until - s.at)).toEqual(slots);
    expect(steps.map((s) => s.voiceAt - s.at)).toEqual([900, 900, 900]);
    expect(p.events.filter((e) => e.clip && e.id.startsWith("roll:"))).toHaveLength(2);
    expect(p.events.filter((e) => e.clip && e.id.startsWith("roll:")).every((e) => e.quiet)).toBe(true);
    expect(p.events.find((e) => e.cue === "rollCallClose")?.at).toBe(CLOSE);
    expect(p.roll!.phonesAt).toBe(PHONES);

    // Check your phones, then Round 1.
    p = plan(data({ game: showGame(), voice: showVoice() }), PHONES + 100, secs);
    expect(p.part).toBe("phones");
    expect(p.loop).toBe("dark");
    // the Check Your Phones card (v2), then the line
    expect(cardNow(p, PHONES + 100)?.key).toBe("phones");
    expect(p.events.find((e) => e.cue === "intro4")?.at).toBe(PHONES + CARD_MS.phones + 300);
    p = plan(data({ game: showGame(), voice: showVoice() }), END + 10, secs);
    expect(p.part).toBeNull();
    expect(cardNow(p, END + 10)?.key).toBe("round1");
  });

  test("the show: a skipped part drops what it didn't reach; a voice too long for its fixed turn stays quiet", () => {
    // The host skipped the intro 10 s in: How to play starts then, and the intro's later lines never play.
    let p = plan(data({ game: showGame({ show: { howAt: T0 + 10_000, rollAt: ROLL - 30_000, phonesAt: null } }), voice: showVoice() }), T0 + 10_100, secs);
    expect(p.part).toBe("how");
    expect(p.events.some((e) => e.cue === "intro3")).toBe(false);
    // Skipped from the roll call to the roles: the guests after that point don't play.
    const cut = FIRST + 3000;
    p = plan(data({ game: showGame({ show: { howAt: HOW, rollAt: ROLL, phonesAt: cut } }), voice: showVoice() }), cut + 100, secs);
    expect(p.part).toBe("phones");
    expect(p.events.some((e) => e.clip?.url === "u-b")).toBe(false);
    expect(p.events.some((e) => e.cue === "rollCallClose")).toBe(false);
    expect(p.events.find((e) => e.cue === "intro4")?.at).toBe(cut + CARD_MS.phones + 300);
    // Turns were fixed before b's voice came in, and it's longer than b's turn: the card shows, the voice doesn't play.
    const late = showVoice([item("a", 2), item("b", 30), item("c", null)]);
    p = plan(data({ game: showGame(), voice: { ...late, rollCall: { ...late.rollCall, frozen: true } } }), ROLL + 500, secs);
    expect(p.events.some((e) => e.clip?.url === "u-b")).toBe(false);
    expect(p.events.some((e) => e.clip?.url === "u-a")).toBe(true);
  });

  test("before Start, the TV stays on the doors (the roll call and How to play moved into the show)", () => {
    const p = plan(data({ game: { rulesAt: T0 + 1000 } }), T0 + 2000, secs);
    expect(p.rules).toBeNull();
    expect(p.roll).toBeNull();
    expect(p.loop).toBe("doors");
  });

  test("votes: the opener, heckles while votes come in, the last call; once closed, who voted for whom, then the verdict", () => {
    const V = T0 + 2_000_000;
    const hk = [0, 1, 2].map((i) => ({ id: `heckle:${i}`, figure: null, gag: false, clip: { url: `h${i}`, caption: `H${i}`, seconds: 3 } }));
    const vote = { kind: "jail", round: 2, at: V, endsAt: V + 90_000, closedAt: null, nextAt: null, outcome: null, target: null, candidates: [], voters: 5, voted: 2, tally: null };
    const g = { status: "playing", round: 2, startedAt: T0, introEndsAt: T0 + 60_000, roundStartedAt: T0 + 1_000_000 };
    let p = plan(data({ game: g, voice: { heckles: hk } }) as never as Data & { vote: unknown }, V + 1000, secs);
    // (the vote rides on the data the TV query returns)
    p = plan({ ...data({ game: g, voice: { heckles: hk } }), vote } as unknown as Data, V + 1000, secs);
    // v2: the vote loop and the Jail Vote card, then the narrator
    expect(p.loop).toBe("vote");
    expect(cardNow(p, V + 1000)?.key).toBe("jailvote");
    expect(p.events.find((e) => e.cue === "voteJail")?.at).toBe(V + CARD_MS.jailvote + 300);
    expect(p.events.filter((e) => e.id.startsWith("heckle:vote")).length).toBe(2);
    expect(p.events.find((e) => e.cue === "voteLastCall")?.at).toBe(V + 75_000);
    // closed early (everyone voted) with a verdict: the open vote's leftovers drop, the tally and the verdict play
    const closed = { ...vote, closedAt: V + 20_000, nextAt: V + 34_000, outcome: "jailed", target: { id: "p1", name: "Velma", figure: "lady" } };
    const verdict = { url: "v", caption: "Velma is going to jail.", seconds: 2 };
    p = plan({ ...data({ game: g, voice: { heckles: hk, verdict } }), vote: closed } as unknown as Data, V + 21_000, secs);
    expect(p.events.some((e) => e.cue === "voteLastCall")).toBe(false);
    expect(p.events.filter((e) => e.id.startsWith("heckle:vote")).every((e) => e.at < V + 20_000)).toBe(true);
    expect(p.events.find((e) => e.cue === "voteTally")?.at).toBe(V + 20_400);
    // jailed: the Locked Up! card, then the name
    expect(cardNow(p, V + 20_000 + VOTE.verdictAtMs + 500)?.key).toBe("lockedup");
    expect(p.events.find((e) => e.clip?.url === "v")?.at).toBe(V + 20_000 + VOTE.verdictAtMs + CARD_MS.lockedup + 100);
    // a release vote opens with its own card
    p = plan({ ...data({ game: g, voice: { heckles: hk } }), vote: { ...vote, kind: "release" } } as unknown as Data, V + 1000, secs);
    expect(cardNow(p, V + 1000)?.key).toBe("release");
    // nobody: the narrator says so
    p = plan({ ...data({ game: g, voice: { heckles: hk } }), vote: { ...closed, outcome: "nobody", target: null } } as unknown as Data, V + 21_000, secs);
    expect(p.events.some((e) => e.cue === "jailNobody")).toBe(true);
    // after the verdict: back to the round's own plan (Round 3 will start)
    p = plan({ ...data({ game: g }), vote: closed } as unknown as Data, V + 40_000, secs);
    expect(p.events.some((e) => e.id.startsWith("vote:"))).toBe(false);
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

  test("never two narrator lines at once, with the real recordings (the longest take of each line)", () => {
    const man = JSON.parse(readFileSync("public/audio/narration/manifest.json", "utf8")) as Record<string, Record<string, Record<string, number>>>;
    for (const tone of ["classic", "adult"] as const) {
      const longest: Secs = (cue, v = 0) => Math.max(...Object.values(man).map((t) => t[tone]?.[cueFile(cue, v).replace(/\.mp3$/, "")] ?? 3));
      const tg = (game: Record<string, unknown>) => ({ ...game, tone });
      const clean = (p: ReturnType<typeof plan>) => {
        const talk = p.events.filter((e) => !e.sfx && (e.cue || e.clip)).sort((a, b) => a.at - b.at);
        for (let i = 1; i < talk.length; i++) {
          const prev = talk[i - 1];
          expect(talk[i].at, `${tone}: ${talk[i].id} starts while ${prev.id} is still talking`).toBeGreaterThanOrEqual(prev.at + prev.secs * 1000);
        }
      };
      const hk = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: `heckle:${i}`, figure: "lady", gag: false, clip: { url: `h${i}`, caption: `H${i}`, seconds: 9 } }));
      const c = (s: string, n = 4) => ({ url: s, caption: s, seconds: n });
      // the intro, with a long body line
      clean(plan(data({ game: tg(showGame()), voice: { ...showVoice(), body: c("body", 5) } }), T0 + 500, longest));
      // a timed round with heckles all the way to the one-minute warning
      const t = T0 + 900_000;
      const evidence = [{ round: 3, text: "a", twist: false }, { round: 3, text: "twist", twist: true }];
      clean(plan(data({ game: tg({ status: "playing", round: 3, startedAt: T0, introEndsAt: T0 + INTRO_MS, roundStartedAt: t, pacing: { mode: "timer", roundMinutes: 6 }, roundEndsAt: t + 6 * 60_000 }), evidence, voice: { heckles: hk } }), t + 100, longest));
      // a vote that closed early while a heckle was due, then the verdict
      const V = T0 + 2_000_000;
      const vote = { kind: "jail", round: 2, at: V, endsAt: V + 90_000, closedAt: V + 27_000, nextAt: V + 27_000 + VOTE.nextMs, outcome: "jailed", target: { id: "p1", name: "Josh", figure: "josh" }, candidates: [], voters: 5, voted: 5, tally: null };
      clean(plan({ ...data({ game: tg({ status: "playing", round: 2, startedAt: T0, introEndsAt: T0 + 60_000, roundStartedAt: T0 + 1_000_000 }), voice: { heckles: hk, verdict: c("v", 4) } }), vote } as unknown as Data, V + 28_000, longest));
      // the reveal, with an accomplice, long names
      for (const acc of [false, true]) {
        const R = revealTimes(acc, tone);
        const p = plan(
          { ...data({ game: tg({ status: "reveal", round: 4, revealAt: T0 }), voice: { heckles: hk, reveal: { killer: c("k", 3.5), exhibit: c("e", 2.5), room: c("r", 2.5), accomplice: acc ? c("a", 3) : null } }, results: { killerWins: true, accomplice: acc ? { name: "Emily", figure: "emily" } : null } }), reveal: R } as unknown as Data,
          T0 + 100,
          longest,
        );
        clean(p);
        // nothing still talking when the verdict lands
        const talk = p.events.filter((e) => !e.sfx && (e.cue || e.clip) && e.at < T0 + R.verdict);
        for (const e of talk) expect(e.at + e.secs * 1000, `${tone} ${acc}: ${e.id} runs into the verdict`).toBeLessThanOrEqual(T0 + R.verdict + 800);
      }
    }
  });

  test("a heckle with no room is dropped, along with its drawing", () => {
    const p = { loop: "vote", music: null, ambience: [], cards: [], holdUntil: 0, twistAt: null, awardsAt: [], part: null, rules: null, roll: null,
      events: [
        { id: "a", at: 0, secs: 10, cue: "voteJail" },
        { id: "heckle:x", at: 5000, secs: 9, clip: { url: "h", caption: "h" }, filler: true },
        { id: "b", at: 12_000, secs: 5, cue: "voteLastCall" },
        { id: "c", at: 16_000, secs: 20, cue: "voteTally" },
      ],
      cameos: [{ id: "heckle:x:peek", char: "lady", anim: "peek", at: 4600, until: 11_600 }],
    } as unknown as ReturnType<typeof plan>;
    const out = sequence(p);
    // a line never moves earlier; one that would start on top of the line before waits for it
    expect(out.events.find((e) => e.id === "b")!.at).toBe(12_000);
    expect(out.events.find((e) => e.id === "c")!.at).toBe(17_000 + VOICE_GAP_MS);
    expect(out.events.some((e) => e.id === "heckle:x")).toBe(false);
    expect(out.cameos).toHaveLength(0);
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
