// The TV's running order: which loop plays, which title card shows, and what the narrator,
// the sound effects and the music do, worked out from the game's state and the time.
// Pure: same game and same clock, same answer. The TV fires each event once, while it's fresh,
// so a TV opened mid-scene doesn't replay what already happened.
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import type { CueKey } from "../../convex/narration";
import { INTRO_MS, REVEAL } from "../../convex/shared";
import { CARD_MS, type CardKey, type LoopKey } from "./media";
import type { MusicKey, SfxKey } from "./sound";

export type Data = FunctionReturnType<typeof api.game.tv>;
export type Clip = { url: string; caption: string; seconds: number } | null;
type RollItem = NonNullable<Data["voice"]["rollCall"]>["items"][number];

export type Ev = {
  id: string;
  at: number;
  secs: number;
  cue?: CueKey;
  clip?: { url: string; caption: string };
  sfx?: SfxKey;
  /** Roll-call clips: the guest's card already shows the line. */
  quiet?: boolean;
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
  rules: { steps: { cue: CueKey; at: number; until: number }[]; end: number } | null;
  roll: { titleUntil: number; steps: { item: RollItem; at: number; until: number }[]; end: number } | null;
};

/** How long a line takes: the recording's length when we have it, else reading speed. */
export type Secs = (cue: CueKey) => number;

const S = 1000;
/** A fired event must be this fresh; older ones belong to a moment the TV missed. */
export const FRESH_MS = 3_000;
const REMIND_EVERY = 5 * 60 * S;

export function plan(d: Data, now: number, secs: Secs): Plan {
  const g = d.game;
  const events: Ev[] = [];
  const cards: Plan["cards"] = [];
  const out: Plan = { loop: "doors", music: "lobby", ambience: [], cards, events, holdUntil: 0, twistAt: null, awardsAt: [], rules: null, roll: null };

  const vo = (id: string, cue: CueKey, at: number, quiet = false) => {
    const s = secs(cue);
    events.push({ id, at, secs: s, cue, quiet });
    return at + s * S;
  };
  const clip = (id: string, c: Clip | undefined, at: number, quiet = false) => {
    if (!c) return at;
    events.push({ id, at, secs: c.seconds, clip: { url: c.url, caption: c.caption }, quiet });
    return at + c.seconds * S;
  };
  const fx = (id: string, sfx: SfxKey, at: number) => events.push({ id, at, secs: 0, sfx });
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
    out.music = "lobby";
    return out;
  }

  // ---- before the game: sign-ups, doors, house rules, roll call ----
  if (g.status === "registration" || g.status === "lobby") {
    out.loop = "doors";
    out.music = "lobby";
    if (g.status === "lobby" && g.doorsAt) {
      const t = g.doorsAt;
      out.ambience = ["roomTone"];
      out.holdUntil = card("opening", t);
      vo(`doors:${t}`, "doors", t + 4.3 * S);
      if (d.counts.here < d.counts.registered) {
        for (let k = 1; k <= 12; k++) vo(`remind:${t}:${k}`, "doorsReminder", t + k * REMIND_EVERY);
      }
    }
    if (g.rulesAt) {
      let t = g.rulesAt;
      const steps: NonNullable<Plan["rules"]>["steps"] = [];
      const cues: CueKey[] = ["rules1", "rules2", g.search === "waves" ? "rules3Waves" : "rules3", "rules4", "rules5"];
      for (const cue of cues) {
        fx(`rules:${g.rulesAt}:${cue}:flip`, "cardFlip", t);
        const end = vo(`rules:${g.rulesAt}:${cue}`, cue, t + 0.5 * S, true);
        steps.push({ cue, at: t, until: end + 1.4 * S });
        t = end + 1.4 * S;
      }
      out.rules = { steps, end: t };
      if (now < t) out.ambience = [];
    }
    const rc = d.voice.rollCall;
    if (rc) {
      const t0 = rc.at;
      const titleUntil = card("rollcall", t0);
      let t = vo(`roll:${t0}:open`, "rollCallOpen", titleUntil + 0.3 * S) + 0.8 * S;
      const steps: NonNullable<Plan["roll"]>["steps"] = [];
      for (const item of rc.items) {
        fx(`roll:${t0}:${item.id}:flip`, "cardFlip", t);
        const talk = item.clip ? item.clip.seconds : 2.5 + item.line.length / 16;
        clip(`roll:${t0}:${item.id}`, item.clip ?? undefined, t + 0.9 * S, true);
        const until = t + Math.max(5.5, 0.9 + talk + 1.6) * S;
        steps.push({ item, at: t, until });
        t = until;
      }
      const end = vo(`roll:${t0}:close`, "rollCallClose", t + 0.2 * S) + 1.5 * S;
      out.roll = { titleUntil, steps, end };
      if (now < end) {
        out.loop = "rollcall";
        out.ambience = [];
      }
    }
    // Arrival reminders keep quiet while the rules or the roll call play.
    const busy = [out.rules && [g.rulesAt!, out.rules.end], out.roll && [rc!.at, out.roll.end]].filter(Boolean) as [number, number][];
    out.events = events.filter((e) => !e.id.startsWith("remind:") || !busy.some(([a, b]) => e.at >= a - 10 * S && e.at <= b + 10 * S));
    return out;
  }

  // ---- the game ----
  if (g.status === "playing") {
    const round = g.round;
    if (g.paused && g.pausedAt) {
      fx(`pause:${g.pausedAt}`, "needleScratch", g.pausedAt);
      vo(`pause:${g.pausedAt}:vo`, "paused", g.pausedAt + 0.6 * S);
    }
    if (!g.paused && g.resumedAt) vo(`resume:${g.resumedAt}`, "resumed", g.resumedAt + 0.2 * S);

    // The intro: lights out, the body, "one of you did it", check your phone.
    if (round === 1 && g.startedAt && g.introEndsAt && now < g.introEndsAt) {
      const t = g.startedAt;
      const beat = INTRO_MS / 4;
      out.loop = "dark";
      out.holdUntil = card("lightsout", t);
      fx(`intro:${t}:scratch`, "needleScratch", t);
      fx(`intro:${t}:switch`, "lightsCut", t + 0.95 * S);
      fx(`intro:${t}:fall`, "bodyFall", t + 1.6 * S);
      fx(`intro:${t}:scream`, "scream", t + 2.3 * S);
      vo(`intro:${t}:1`, "intro1", t + 3.4 * S);
      fx(`intro:${t}:swell`, "swell", t + beat - 4.8 * S); // a 5 s riser that peaks on "The Don is dead"
      const e2 = vo(`intro:${t}:2`, "intro2", t + beat + 1.2 * S);
      clip(`intro:${t}:body`, d.voice.body ?? undefined, e2 + 0.3 * S);
      vo(`intro:${t}:3`, "intro3", t + 2 * beat + 0.8 * S);
      vo(`intro:${t}:4`, "intro4", t + 3 * beat + 0.6 * S);
      out.music = now < t + 3 * S ? null : "intro";
      out.ambience = now < t + 3 * S ? [] : ["heartbeat"];
      // A skipped intro drops whatever it didn't get to.
      out.events = events.filter((e) => e.at < g.introEndsAt!);
      return out;
    }

    out.music = "rounds";
    const timed = g.pacing.mode === "timer" && !g.paused && g.roundEndsAt !== null && g.roundEndsAt > 0;
    const left = timed ? g.roundEndsAt! - now : Infinity;

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
      if (timed) {
        vo(`r${round}:${t}:1min`, "oneMinute", g.roundEndsAt! - 60 * S);
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
    out.loop = "spotlight";
    out.music = now < t + REVEAL.verdict ? null : "lobby";
    out.holdUntil = card("reveal", t);
    vo(`rev:${t}:1`, "reveal1", t + REVEAL.line);
    if (now >= t + REVEAL.line && now < t + REVEAL.name) out.ambience = ["drumroll"];
    fx(`rev:${t}:cymbal`, "cymbal", t + REVEAL.name);
    if (r?.killer) clip(`rev:${t}:killer`, r.killer, t + REVEAL.name + 0.3 * S);
    else vo(`rev:${t}:2`, "reveal2", t + REVEAL.name + 0.3 * S);
    fx(`rev:${t}:sting`, "brassSting", t + REVEAL.how);
    if (r?.exhibit && r.room) {
      const e = clip(`rev:${t}:exhibit`, r.exhibit, t + REVEAL.how + 0.3 * S);
      clip(`rev:${t}:room`, r.room, e + 0.1 * S);
    } else vo(`rev:${t}:3`, "reveal3", t + REVEAL.how + 0.3 * S);
    const killerWins = !!d.results?.killerWins;
    fx(`rev:${t}:verdict`, killerWins ? "sinisterBrass" : "fanfare", t + REVEAL.verdict);
    const e = vo(`rev:${t}:verdict:vo`, killerWins ? "verdictKiller" : "verdictDetectives", t + REVEAL.verdict + 0.8 * S);
    vo(`rev:${t}:vote`, "votePrompt", e + 1 * S);
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
