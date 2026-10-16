// The TV's running order: which loop plays, which title card shows, and what the narrator,
// the sound effects and the music do, worked out from the game's state and the time.
// Pure: same game and same clock, same answer. The TV fires each event once, while it's fresh,
// so a TV opened mid-scene doesn't replay what already happened.
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import { cueVariant, type CueKey } from "../../convex/narration";
import { VOTE } from "../../convex/shared";
import { BODY_SECS_EST, howCues, howLayout, introLayout, readSecs, rollLayout, showPartAt, showParts, SHOW, type HowArt, type ShowPart } from "../../convex/show";
import { CARD_MS, type CardKey, type LoopKey } from "./media";
import { CAST_KEYS } from "../../convex/figures";
import type { MusicKey, SfxKey } from "./sound";

export type Data = FunctionReturnType<typeof api.game.tv>;
export type Clip = { url: string; caption: string; seconds: number } | null;
type RollItem = NonNullable<Data["voice"]["rollCall"]>["items"][number];

export type Ev = {
  id: string;
  at: number;
  secs: number;
  cue?: CueKey;
  /** Which version of the line this game plays (adult lines come in several). */
  v?: number;
  clip?: { url: string; caption: string };
  sfx?: SfxKey;
  /** Roll-call clips: the guest's card already shows the line. */
  quiet?: boolean;
  /** A heckle: plays only in a gap it fits (see sequence). */
  filler?: boolean;
};

export type Plan = {
  loop: LoopKey;
  music: MusicKey | null;
  ambience: SfxKey[];
  cards: { key: CardKey; at: number }[];
  events: Ev[];
  /** The scene's own content waits until the title card has finished. */
  holdUntil: number;
  twistAt: number | null;
  awardsAt: number[];
  /** The show's part right now (v2: between Start and Round 1), else null. */
  part: ShowPart | null;
  /** The intro's three slides (the Don dies): when each starts, from its lines (convex/show.ts introLayout). */
  intro?: { beats: [number, number, number] } | null;
  /** How to play: one illustrated card per line. */
  rules: { steps: { cue: CueKey; v: number; art: HowArt; at: number; voiceAt: number; until: number }[]; end: number } | null;
  /** The roll call: each guest's turn, then the closer, then "check your phones". */
  roll: { titleUntil: number; steps: { item: RollItem; at: number; voiceAt: number; until: number; talk: number }[]; closeAt: number; phonesAt: number; end: number } | null;
  /** The drawn characters stepping onto the screen. */
  cameos: Cameo[];
};

/** A drawing in /art: "don", "killer", or one of the guests' characters (convex/figures.ts). */
export type CharKey = string;
/** Where How to play, the accomplice card and the awards put a guest's drawing: slot n is the game's nth stand-in
 *  (its own guests first, then the rest of the cast; convex/figures.ts standIns). */
const DECO = ["guest1", "guest2", "guest3", "guest4", "guest5", "guest6"];
/** A decorative drawing as this game shows it: "guest2" is this game's second stand-in. */
export function dress<T extends string>(d: Pick<Data, "standIns">, art: T): T | CharKey {
  const i = DECO.indexOf(art);
  if (i < 0) return art;
  const stand = d.standIns?.length ? d.standIns : CAST_KEYS;
  return stand[i % stand.length];
}
export type CameoAnim =
  | "stand" // slides in from the side and stays
  | "standRight"
  | "stroll" // walks across the bottom, left to right
  | "strollBack" // right to left
  | "creep" // tiptoes across, left to right
  | "creepBack"
  | "peek" // leans in from the right edge, then away
  | "fall" // the Don's toast, the lights cut, and down he goes
  | "lineup" // one of a row along the bottom
  | "spot" // stands in a spotlight
  | "unmask" // vanishes in a flash
  | "unmasked"; // appears out of the flash: the real killer's drawing
export type Cameo = {
  id: string;
  char: CharKey;
  anim: CameoAnim;
  at: number;
  until: number;
  /** Only on this scene (by key prefix), so a cameo never wanders into the wrong moment. */
  on?: string;
  /** Position in a line-up, and how many stand in it. */
  slot?: number;
  count?: number;
  /** A name under the figure (line-ups). */
  label?: string;
  /** Above the title cards (the lights-out gag plays over the lights-out card). */
  over?: boolean;
};
const FOREVER = 12 * 60 * 60 * 1000;

/** How long a line takes (version v of it): the recording's length when we have it, else reading speed. */
export type Secs = (cue: CueKey, v?: number) => number;

const S = 1000;
/** A fired event must be this fresh; older ones belong to a moment the TV missed. */
export const FRESH_MS = 3_000;
const REMIND_EVERY = 5 * 60 * S;
/** When heckles fill the lulls: while searching, at the lock-in, and during the votes. */
export const HECKLE = { roundFirst: 80 * S, roundEvery: 150 * S, lockFirst: 35 * S, lockEvery: 60 * S, voteFirst: 12 * S, voteEvery: 32 * S, voteOpenFirst: 24 * S, voteOpenEvery: 30 * S };

/** The breath between two narrator lines. */
export const VOICE_GAP_MS = 350;
/** How far a heckle may slide to find a gap before it's dropped. */
const FILLER_SLIDE_MS = 20 * 1000;

/**
 * Never two narrator lines at once (Heston, Oct 16: "sometimes it would overlap with the next line"). The lines play
 * in order, each waiting for the one before it plus a breath; a heckle only plays where it fits whole (sliding a
 * little if it has to), else it's dropped, and its drawing goes with it.
 */
export function sequence(p: Plan): Plan {
  const talks = (e: Ev) => !e.sfx && !!(e.cue || e.clip);
  const byTime = (a: Ev, b: Ev) => a.at - b.at;
  const lines = p.events.filter((e) => talks(e) && !e.filler).sort(byTime);
  const busy: [number, number][] = [];
  let end = -Infinity;
  for (const e of lines) {
    if (e.at < end + VOICE_GAP_MS) e.at = end + VOICE_GAP_MS;
    end = e.at + e.secs * S;
    busy.push([e.at, end]);
  }
  const moved = new Map<string, number>();
  const dropped = new Set<string>();
  for (const e of p.events.filter((x) => talks(x) && x.filler).sort(byTime)) {
    const len = e.secs * S;
    const fits = (s: number) => busy.every(([a, b]) => s + len + VOICE_GAP_MS <= a || s >= b + VOICE_GAP_MS);
    const tries = [e.at, ...busy.map(([, b]) => b + VOICE_GAP_MS).filter((s) => s > e.at && s <= e.at + FILLER_SLIDE_MS).sort((a, b) => a - b)];
    const at = tries.find(fits);
    if (at === undefined) {
      dropped.add(e.id);
      continue;
    }
    if (at !== e.at) moved.set(e.id, at - e.at);
    e.at = at;
    busy.push([at, at + len]);
  }
  p.events = p.events.filter((e) => !dropped.has(e.id));
  // A heckle's drawing (`<id>:peek`) leans in with it, or not at all.
  p.cameos = p.cameos
    .filter((c) => !(c.id.endsWith(":peek") && dropped.has(c.id.slice(0, -5))))
    .map((c) => {
      const dt = c.id.endsWith(":peek") ? moved.get(c.id.slice(0, -5)) : undefined;
      return dt ? { ...c, at: c.at + dt, until: c.until + dt } : c;
    });
  return p;
}

export function plan(d: Data, now: number, secs: Secs): Plan {
  return sequence(planRaw(d, now, secs));
}

function planRaw(d: Data, now: number, secs: Secs): Plan {
  const g = d.game;
  const events: Ev[] = [];
  const cards: Plan["cards"] = [];
  const cameos: Cameo[] = [];
  const out: Plan = { loop: "doors", music: "lobby", ambience: [], cards, events, holdUntil: 0, twistAt: null, awardsAt: [], part: null, rules: null, roll: null, cameos };
  const cameo = (c: Cameo) => cameos.push(c);
  // The guests' own drawings: who's here (or in the game), falling back to the stand-ins.
  const withFigure = (list: Data["guests"]) => list.filter((x) => !!x.figure) as (Data["guests"][number] & { figure: string })[];
  const present = withFigure(d.guests.filter((x) => x.here));
  const pool: CharKey[] = (present.length ? present : withFigure(d.guests)).map((x) => x.figure);
  const stand = d.standIns?.length ? d.standIns : CAST_KEYS;
  const walkers = pool.length ? pool : stand;
  /** Someone crosses the screen every few minutes while a scene sits still. */
  const strollers = (id: string, from: number, every: number, on: string, creep: boolean, sfx?: SfxKey) => {
    for (let k = 1; k <= 30; k++) {
      const at = from + k * every;
      const char = walkers[(k + id.length) % walkers.length];
      cameo({ id: `${id}:${k}`, char, anim: creep ? (k % 2 ? "creepBack" : "creep") : k % 2 ? "strollBack" : "stroll", at, until: at + 9 * S, on });
      if (sfx) fx(`${id}:${k}:sfx`, sfx, at + 0.4 * S);
    }
  };

  // This game's version of each line; a line that repeats in one game passes which time it is.
  const pick = (cue: CueKey, occurrence = "") => cueVariant(g.script ?? g.tone, cue, g.slug ?? "", occurrence, g.lines ? { picks: g.lines.picks, d: true } : undefined);
  const cs = (cue: CueKey) => secs(cue, pick(cue));
  const vo = (id: string, cue: CueKey, at: number, quiet = false, occurrence = "") => {
    const v = pick(cue, occurrence);
    const s = secs(cue, v);
    events.push({ id, at, secs: s, cue, v, quiet });
    return at + s * S;
  };
  const clip = (id: string, c: Clip | undefined, at: number, quiet = false, filler = false) => {
    if (!c) return at;
    events.push({ id, at, secs: c.seconds, clip: { url: c.url, caption: c.caption }, quiet, ...(filler ? { filler } : {}) });
    return at + c.seconds * S;
  };
  const fx = (id: string, sfx: SfxKey, at: number) => events.push({ id, at, secs: 0, sfx });
  // Heckles (convex/heckles.ts): in the lulls the narrator roasts a guest (their drawing leans in) or says something
  // about the night. Each lull takes the next ones in the night's order, so the running gag comes back on cue.
  const heckles = d.voice.heckles ?? [];
  const heckle = (id: string, n: number, at: number, on: string) => {
    if (!heckles.length || g.paused) return;
    const h = heckles[n % heckles.length];
    clip(`heckle:${id}`, h.clip, at, false, true);
    if (h.figure) cameo({ id: `heckle:${id}:peek`, char: h.figure, anim: "peek", at: at - 0.4 * S, until: at + 6.6 * S, on });
  };
  const card = (key: CardKey, at: number) => {
    cards.push({ key, at });
    return at + CARD_MS[key];
  };

  // ---- night over ----
  if (g.endedAt) {
    const t = g.endedAt;
    out.loop = "lastcall";
    out.holdUntil = card("lastcall", t);
    fx(`end:bell:${t}`, "lastCall", t + 0.3 * S);
    vo(`end:vo:${t}`, "goodnight", t + 4.3 * S);
    cameo({ id: `end:don:${t}`, char: "don", anim: "standRight", at: out.holdUntil, until: t + FOREVER, on: "goodnight" });
    out.music = "lobby";
    return out;
  }

  // ---- before the game: sign-ups and the doors ----
  if (g.status === "registration" || g.status === "lobby") {
    out.loop = "doors";
    out.music = "lobby";
    if (g.status === "registration") {
      // Sign-ups on the TV (the replay's main screen): everyone signed up so far lines up along the
      // bottom with their name; stand-ins fill the row until there are six.
      const signed = withFigure(d.guests).slice(0, 10).map((x) => ({ char: x.figure, label: x.short ?? x.charName }));
      const fill = stand.filter((f) => !signed.some((x) => x.char === f)).slice(0, Math.max(0, 6 - signed.length)).map((char) => ({ char, label: undefined }));
      const row = [...signed, ...fill];
      row.forEach((x, i) => cameo({ id: `signup:${i}:${x.char}`, char: x.char, label: x.label, anim: "lineup", slot: i, count: row.length, at: 0, until: Infinity, on: "waiting" }));
    }
    if (g.status === "lobby" && g.doorsAt) {
      const t = g.doorsAt;
      out.ambience = ["roomTone"];
      out.holdUntil = card("opening", t);
      vo(`doors:${t}`, "doors", t + 4.3 * S);
      // The Don greets his guests; now and then one of them strolls past.
      fx(`doors:${t}:whoosh`, "whoosh", out.holdUntil);
      cameo({ id: `doors:don:${t}`, char: "don", anim: "stand", at: out.holdUntil, until: t + FOREVER, on: "doors" });
      strollers(`doors:${t}:walk`, t, 75 * S, "doors", false);
      if (d.counts.here < d.counts.registered) {
        for (let k = 1; k <= 12; k++) vo(`remind:${t}:${k}`, "doorsReminder", t + k * REMIND_EVERY, false, String(k));
      }
    }
    return out;
  }

  // ---- the game ----
  if (g.status === "playing") {
    const round = g.round;
    if (g.paused && g.pausedAt) {
      fx(`pause:${g.pausedAt}`, "needleScratch", g.pausedAt);
      vo(`pause:${g.pausedAt}:vo`, "paused", g.pausedAt + 0.6 * S, false, String(g.pausedAt));
    }
    if (!g.paused && g.resumedAt) vo(`resume:${g.resumedAt}`, "resumed", g.resumedAt + 0.2 * S, false, String(g.resumedAt));

    // The show (v2): the intro, How to play, the roll call, "check your phones". Then Round 1.
    if (round === 1 && g.startedAt && g.introEndsAt && now < g.introEndsAt) return show(d, now, cs, out, { vo, clip, fx, card, cameo, pick });
    out.music = "rounds";
    const timed = g.pacing.mode === "timer" && !g.paused && g.roundEndsAt !== null && g.roundEndsAt > 0;
    const left = timed ? g.roundEndsAt! - now : Infinity;

    // The votes after a round (v2): the jail vote, and from Round 2 a release vote first if anyone is in jail.
    const vt = d.vote;
    if (round >= 1 && round <= 3 && vt && vt.round === round && (!vt.closedAt || now < (vt.nextAt ?? Infinity))) {
      const t = vt.at;
      const id = `vote:${t}`;
      out.loop = "vote";
      out.music = "rounds";
      // The Jail Vote / The Release Vote title card (a gavel, or the keys), then the narrator.
      out.holdUntil = card(vt.kind === "jail" ? "jailvote" : "release", t);
      fx(`${id}:card`, vt.kind === "jail" ? "gavel" : "keys", t + 0.15 * S);
      vo(`${id}:open`, vt.kind === "jail" ? "voteJail" : "voteRelease", t + 4.3 * S, false, `${round}`);
      // Heckles while the votes come in, then the last call.
      heckle(`${id}:0`, 23 + round * 3 + (vt.kind === "jail" ? 0 : 2), t + HECKLE.voteOpenFirst, "vote");
      heckle(`${id}:1`, 24 + round * 3 + (vt.kind === "jail" ? 0 : 2), t + HECKLE.voteOpenFirst + HECKLE.voteOpenEvery, "vote");
      vo(`${id}:last`, "voteLastCall", vt.endsAt - VOTE.lastCallMs, false, `${round}:${vt.kind}`);
      if (vt.closedAt) {
        // Closed: who voted for whom, then the verdict. Whatever the open vote still had queued doesn't play.
        const c = vt.closedAt;
        fx(`${id}:stamp`, "stamp", c);
        vo(`${id}:tally`, "voteTally", c + 0.4 * S, false, `${round}:${vt.kind}`);
        const at = c + VOTE.verdictAtMs;
        if (vt.outcome === "nobody") vo(`${id}:verdict`, vt.kind === "jail" ? "jailNobody" : "releaseNobody", at + 0.3 * S, false, `${round}`);
        else if (vt.outcome === "jailed") {
          // Locked Up!: the bars slam down on the card, then the name over the drawing behind bars.
          fx(`${id}:door`, "jailSlam", at + 0.1 * S);
          const shown = card("lockedup", at);
          clip(`${id}:verdict`, d.voice.verdict ?? undefined, shown + 0.1 * S);
        } else {
          fx(`${id}:door`, vt.outcome === "released" ? "keys" : "chime", at);
          clip(`${id}:verdict`, d.voice.verdict ?? undefined, at + 0.5 * S);
        }
        const openPart = (e: Ev) => e.id === `${id}:open` || e.id === `${id}:last` || e.id.startsWith(`heckle:${id}`);
        out.events = events.filter((e) => !openPart(e) || e.at < c);
      }
      return out;
    }

    if (round >= 1 && round <= 3) {
      const t = round === 1 ? g.introEndsAt ?? g.startedAt ?? 0 : g.roundStartedAt ?? 0;
      out.loop = round === 1 ? "search" : "evidence";
      out.holdUntil = card(round === 1 ? "round1" : round === 2 ? "round2" : "round3", t);
      const waves = g.search === "waves";
      let e = vo(`r${round}:${t}`, round === 1 ? (waves ? "round1Waves" : "round1") : round === 2 ? "round2" : "round3", t + 4.3 * S);
      if (waves && round > 1) e = vo(`r${round}:${t}:open`, "roomsOpen", e + 0.5 * S);
      if (waves) e = clip(`r${round}:${t}:rooms`, d.voice.rooms[round] ?? undefined, e + 0.3 * S);
      if (round >= 2) {
        const cardsIn = d.evidence.filter((c) => c.round === round && !c.twist);
        cardsIn.forEach((_, i) => fx(`r${round}:${t}:ev${i}`, "telegraph", t + CARD_MS.round2 + i * 0.35 * S));
        if (round === 3 && d.evidence.some((c) => c.round === 3 && c.twist)) {
          const at = Math.max(e + 1 * S, t + CARD_MS.round3 + cardsIn.length * 0.35 * S + 2.5 * S);
          const said = vo(`r3:${t}:twist`, "twist", at);
          const c = card("twist", said + 0.2 * S);
          fx(`r3:${t}:thunder`, "thunder", said + 0.45 * S);
          out.twistAt = c;
        }
      }
      // A guest tiptoes past as the round opens, and again every few minutes.
      const first = walkers[round % walkers.length];
      cameo({ id: `r${round}:${t}:creep`, char: first, anim: round === 2 ? "creepBack" : "creep", at: out.holdUntil + 1.5 * S, until: out.holdUntil + 10.5 * S, on: `r${round}` });
      fx(`r${round}:${t}:sneak`, "sneak", out.holdUntil + 1.9 * S);
      strollers(`r${round}:${t}:creep`, out.holdUntil + 1.5 * S, 4 * 60 * S, `r${round}`, true, "sneak");
      if (out.twistAt) {
        cameo({ id: `r3:${t}:peek`, char: "killer", anim: "peek", at: out.twistAt + 0.6 * S, until: out.twistAt + 7.6 * S, on: "r3" });
        fx(`r3:${t}:creak`, "creak", out.twistAt + 0.6 * S);
      }
      // Heckles while everyone searches: the first after a minute and a bit, then every two and a half minutes,
      // clear of the one-minute warning.
      for (let k = 0; k < 8; k++) {
        const at = out.holdUntil + HECKLE.roundFirst + k * HECKLE.roundEvery;
        if (timed && at > g.roundEndsAt! - 75 * S) break;
        heckle(`r${round}:${t}:${k}`, (round - 1) * 5 + k, at, `r${round}`);
      }
      if (timed) {
        vo(`r${round}:${t}:1min`, "oneMinute", g.roundEndsAt! - 60 * S, false, String(round));
        if (left > 0 && left <= 60 * S) out.ambience = ["clockTick"];
      }
      return out;
    }

    // Accusations.
    const t = g.roundStartedAt ?? 0;
    out.loop = "accuse";
    out.holdUntil = card("accuse", t);
    fx(`acc:${t}:stamp`, "stamp", t + 1.0 * S);
    vo(`acc:${t}`, "accuse", t + 4.3 * S);
    // The suspects line up along the bottom in their drawings, with the masked one in the middle (a small party only:
    // with more than 8 guests the line-up would sit on top of the lock-in grid).
    const suspects = d.guests.length > 8 ? [] : withFigure(d.guests).slice(0, 10).map((x) => ({ char: x.figure, label: (x.short ?? x.charName) as string | undefined }));
    const line = suspects.length || d.guests.length > 8 ? suspects : stand.slice(0, 6).map((char) => ({ char, label: undefined as string | undefined }));
    if (line.length) line.splice(Math.floor(line.length / 2), 0, { char: "killer", label: undefined });
    line.forEach((x, i) =>
      cameo({ id: `acc:${t}:line:${i}:${x.char}`, char: x.char, label: x.label, anim: "lineup", slot: i, count: line.length, at: out.holdUntil + i * 0.18 * S, until: t + FOREVER, on: "accuse" }),
    );
    // Heckles while everyone decides.
    for (let k = 0; k < 4; k++) {
      const at = out.holdUntil + HECKLE.lockFirst + k * HECKLE.lockEvery;
      if (timed && at > g.roundEndsAt! - 45 * S) break;
      heckle(`acc:${t}:${k}`, 15 + k, at, "accuse");
    }
    const waitingOnFew = d.counts.playing > 1 && d.counts.accused >= d.counts.playing - 1 && d.counts.accused < d.counts.playing;
    if (timed) {
      const lc = vo(`acc:${t}:lastcall`, "accuseLastCall", g.roundEndsAt! - 30 * S);
      card("lastcall", lc + 0.2 * S);
      fx(`acc:${t}:bell`, "lastCall", lc + 0.3 * S);
    }
    if (now > t + 4 * S && (waitingOnFew || (timed && left <= 30 * S))) out.ambience = ["drumroll"];
    return out;
  }

  // ---- the reveal ----
  if (g.status === "reveal" && g.revealAt) {
    const t = g.revealAt;
    const r = d.voice.reveal;
    // The server's timings: a killer + accomplice game names the accomplice before the verdict.
    const REVEAL = d.reveal;
    out.loop = "spotlight";
    out.music = now < t + REVEAL.verdict ? null : "lobby";
    out.holdUntil = card("reveal", t);
    fx(`rev:${t}:card`, "revealHit", t + 0.15 * S);
    vo(`rev:${t}:1`, "reveal1", t + REVEAL.line);
    cameo({ id: `rev:${t}:spot`, char: "killer", anim: "spot", at: t + REVEAL.line - 0.3 * S, until: t + REVEAL.name, on: "reveal0" });
    cameo({ id: `rev:${t}:unmask`, char: "killer", anim: "unmask", at: t + REVEAL.name, until: t + REVEAL.name + 1.6 * S, over: true });
    // ...and out of the flash steps the real killer, in their own drawing.
    if (d.results?.killerFigure) cameo({ id: `rev:${t}:unmasked`, char: d.results.killerFigure, anim: "unmasked", at: t + REVEAL.name + 0.2 * S, until: t + REVEAL.verdict, on: "reveal" });
    if (now >= t + REVEAL.line && now < t + REVEAL.name) out.ambience = ["drumroll"];
    fx(`rev:${t}:cymbal`, "cymbal", t + REVEAL.name);
    if (r?.killer) clip(`rev:${t}:killer`, r.killer, t + REVEAL.name + 0.3 * S);
    else vo(`rev:${t}:2`, "reveal2", t + REVEAL.name + 0.3 * S);
    fx(`rev:${t}:sting`, "brassSting", t + REVEAL.how);
    if (r?.exhibit && r.room) {
      const e = clip(`rev:${t}:exhibit`, r.exhibit, t + REVEAL.how + 0.3 * S);
      clip(`rev:${t}:room`, r.room, e + 0.1 * S);
    } else vo(`rev:${t}:3`, "reveal3", t + REVEAL.how + 0.3 * S);
    // The accomplice: "And the accomplice who helped them is…", their name, and their drawing steps in.
    if (REVEAL.accomplice !== null) {
      const at = t + REVEAL.accomplice;
      fx(`rev:${t}:acc`, "creak", at);
      const said = vo(`rev:${t}:acc:vo`, "revealAccomplice", at + 0.4 * S);
      if (r?.accomplice) clip(`rev:${t}:acc:name`, r.accomplice, said + 0.2 * S);
      const fig = d.results?.accomplice?.figure;
      if (fig) cameo({ id: `rev:${t}:acc:fig`, char: fig, anim: "stand", at: said, until: t + REVEAL.verdict, on: "reveal3" });
    }
    const killerWins = !!d.results?.killerWins;
    fx(`rev:${t}:verdict`, killerWins ? "sinisterBrass" : "fanfare", t + REVEAL.verdict);
    const e = vo(`rev:${t}:verdict:vo`, killerWins ? "verdictKiller" : "verdictDetectives", t + REVEAL.verdict + 0.8 * S);
    const voted = vo(`rev:${t}:vote`, "votePrompt", e + 1 * S);
    // Heckles while everyone votes for Best Dressed and Best Liar.
    for (let k = 0; k < 4; k++) heckle(`rev:${t}:${k}`, 19 + k, voted + HECKLE.voteFirst + k * HECKLE.voteEvery, "reveal");
    return out;
  }

  // ---- the awards ----
  if (g.status === "done" && g.doneAt) {
    const t = g.doneAt;
    const w = d.voice.winners;
    out.loop = "awards";
    out.music = "awards";
    out.holdUntil = card("awards", t);
    fx(`aw:${t}:applause`, "applause", t + 0.2 * S);
    cameo({ id: `aw:${t}:detective`, char: dress(d, "guest1"), anim: "stand", at: out.holdUntil + 0.4 * S, until: t + FOREVER, on: "awards" });
    cameo({ id: `aw:${t}:flapper`, char: dress(d, "guest2"), anim: "standRight", at: out.holdUntil + 0.8 * S, until: t + FOREVER, on: "awards" });
    let e = vo(`aw:${t}`, "awards", t + 4.3 * S);
    const order: [CueKey, Clip | undefined][] = [
      ["awardDetective", w?.detective ?? undefined],
      ["awardDressed", w?.dressed ?? undefined],
      ["awardLiar", w?.liar ?? undefined],
    ];
    for (const [cue, c] of order) {
      const said = vo(`aw:${t}:${cue}`, cue, e + 0.8 * S);
      out.awardsAt.push(said);
      const named = clip(`aw:${t}:${cue}:name`, c, said + 0.2 * S);
      fx(`aw:${t}:${cue}:clap`, "applause", named + 0.1 * S);
      e = named + 1.6 * S;
    }
    return out;
  }

  // Reveal or awards from an older game without their timestamps.
  out.loop = g.status === "done" ? "awards" : "spotlight";
  out.music = g.status === "done" ? "awards" : null;
  return out;
}

type Tools = {
  vo: (id: string, cue: CueKey, at: number, quiet?: boolean, occurrence?: string) => number;
  pick: (cue: CueKey, occurrence?: string) => number;
  clip: (id: string, c: Clip | undefined, at: number, quiet?: boolean) => number;
  fx: (id: string, sfx: SfxKey, at: number) => void;
  card: (key: CardKey, at: number) => number;
  cameo: (c: Cameo) => void;
};

/**
 * Between Start and Round 1. The server fixes when each part starts (convex/show.ts); inside a part the lines
 * are laid out the same way the server laid them out. A skipped part drops whatever it didn't get to.
 * Since Oct 16: How to play → the intro (the Don dies) → the roll call → check your phones (older games: intro first).
 */
/** secs here gives this game's version of each line (cs in plan). */
function show(d: Data, now: number, secs: (cue: CueKey) => number, out: Plan, { vo, clip, fx, card, cameo, pick }: Tools): Plan {
  const g = d.game;
  const end = g.introEndsAt!;
  const times = { howAt: g.show?.howAt ?? end, introAt: g.show?.introAt ?? null, rollAt: g.show?.rollAt ?? end, phonesAt: g.show?.phonesAt ?? null };
  const parts = showParts(times, g.startedAt!);
  /** When the part after this one starts (a part's moments stop there). */
  const until = (part: "how" | "intro" | "roll") => {
    const i = parts.findIndex((x) => x.part === part);
    return parts[i + 1]?.at ?? Infinity;
  };
  const rollAt = times.rollAt;
  const rc = d.voice.rollCall;
  const lay = rc ? rollLayout(rollAt, rc.slots, secs) : null;
  const phonesAt = Math.min(end, g.show?.phonesAt ?? lay?.phonesAt ?? end);
  const part: ShowPart = showPartAt(times, g.startedAt!, phonesAt, now);
  out.part = part;

  // How to play.
  const howAt = times.howAt;
  const how = howLayout(howAt, howCues(g), secs);
  for (const st of how.steps) {
    fx(`how:${howAt}:${st.cue}:flip`, st.art === "map" ? "cardFlip" : "whoosh", st.at);
    vo(`how:${howAt}:${st.cue}`, st.cue, st.voiceAt, true);
  }
  out.rules = { steps: how.steps.filter((st) => st.at < until("how")).map((st) => ({ ...st, art: dress(d, st.art), v: pick(st.cue) })), end: Math.min(how.end, until("how")) };

  // The intro: lights out, the Don falls, the body, "one of you did it". Its slides wait for its lines (introLayout).
  const t = times.introAt ?? g.startedAt!;
  const intro = introLayout(t, secs, d.voice.body?.seconds ?? BODY_SECS_EST);
  out.intro = { beats: intro.beats };
  const lightsOff = card("lightsout", t);
  cameo({ id: `intro:${t}:don`, char: "don", anim: "fall", at: t, until: t + 2.8 * S, over: true });
  fx(`intro:${t}:scratch`, "needleScratch", t);
  fx(`intro:${t}:switch`, "lightsCut", t + 0.95 * S);
  fx(`intro:${t}:fall`, "bodyFall", t + 1.6 * S);
  fx(`intro:${t}:scream`, "scream", t + 2.3 * S);
  vo(`intro:${t}:1`, "intro1", intro.line1);
  fx(`intro:${t}:swell`, "swell", intro.beats[1] - 4.3 * S); // the riser peaks 4.25 s in, on "The Don is dead"
  const e2 = vo(`intro:${t}:2`, "intro2", intro.line2);
  clip(`intro:${t}:body`, d.voice.body ?? undefined, e2 + 0.3 * S);
  vo(`intro:${t}:3`, "intro3", intro.line3);

  // The roll call: "the doors are locked", then each guest, then "remember these faces".
  let titleUntil = rollAt;
  if (rc && lay) {
    titleUntil = card("rollcall", rollAt);
    vo(`roll:${rollAt}:open`, "rollLocked", lay.openAt);
    const steps = rc.items.map((item, i) => {
      const st = lay.steps[i];
      fx(`roll:${rollAt}:${item.id}:flip`, "cardFlip", st.at);
      // A voice that came in after the turns were fixed only plays if it fits its turn.
      const fits = !!item.clip && st.voiceAt + item.clip.seconds * S <= st.until + 0.3 * S;
      if (fits) clip(`roll:${rollAt}:${item.id}`, item.clip!, st.voiceAt, true);
      return { item, at: st.at, voiceAt: st.voiceAt, until: st.until, talk: fits ? item.clip!.seconds : readSecs(item.line) };
    });
    vo(`roll:${rollAt}:close`, "rollCallClose", lay.closeAt);
    out.roll = { titleUntil, steps, closeAt: lay.closeAt, phonesAt, end };
  }

  // Check your phones: the roles are out (the Check Your Phones card, then the line). Round 1 follows.
  const phonesCard = card("phones", phonesAt);
  vo(`phones:${phonesAt}`, "intro4", phonesCard + 0.3 * S);

  if (part === "intro") {
    out.loop = "dark";
    out.holdUntil = lightsOff;
    out.music = now < t + 3 * S ? null : "intro";
    out.ambience = now < t + 3 * S ? [] : ["heartbeat"];
  } else if (part === "phones") {
    out.loop = "dark";
    out.music = "intro";
    out.ambience = ["heartbeat"];
    out.holdUntil = phonesCard;
  } else {
    out.loop = "rollcall";
    out.music = "lobby";
    out.ambience = [];
    if (part === "roll") out.holdUntil = titleUntil;
  }
  // Each part keeps only its own moments, so a skip never plays leftovers.
  out.events = out.events.filter((e) =>
    e.id.startsWith("intro:") ? e.at < until("intro") : e.id.startsWith("how:") ? e.at < until("how") : e.id.startsWith("roll:") ? e.at < phonesAt : e.at < end,
  );
  return out;
}

/** The cameos on screen now for this scene. */
export function cameosNow(p: Plan, now: number, sceneKey: string, over: boolean) {
  return p.cameos.filter((c) => c.at <= now && now < c.until && !!c.over === over && (!c.on || sceneKey.startsWith(c.on)));
}

/** The title card on screen now, if any. */
export function cardNow(p: Plan, now: number) {
  let best: { key: CardKey; at: number } | null = null;
  for (const c of p.cards) if (c.at <= now && now < c.at + CARD_MS[c.key] && (!best || c.at > best.at)) best = c;
  return best;
}

/** Events due now that haven't fired yet. */
export function due(p: Plan, now: number, fired: Set<string>) {
  return p.events.filter((e) => !fired.has(e.id) && e.at <= now && now - e.at < FRESH_MS);
}
