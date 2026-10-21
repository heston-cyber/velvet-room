// The TV's sound: the narrator, sound effects and music beds, mixed in the browser.
// Files that aren't in the site yet (the Artlist downloads) are skipped quietly, so the
// night runs with whatever is there. /audio/media.json lists what's present.

export type SfxKey =
  | "roomTone"
  | "chime"
  | "cardFlip"
  | "lightsCut"
  | "needleScratch"
  | "scream"
  | "bodyFall"
  | "swell"
  | "heartbeat"
  | "telegraph"
  | "clockTick"
  | "thunder"
  | "drumroll"
  | "stamp"
  | "lastCall"
  | "cymbal"
  | "brassSting"
  | "fanfare"
  | "sinisterBrass"
  | "applause"
  | "whoosh"
  | "sneak"
  | "creak"
  // Oct 16 (Heston's play test: "theres no sound fx" on the jail vote, "no SFX on the reveal animation"): a hit as each
  // of those title cards comes up. Until they're made, each plays its stand-in (FALLBACK).
  | "gavel"
  | "keys"
  | "jailSlam"
  | "revealHit"
  // Phase 4 (Oct 21): someone's heat turns on (3 tags). No narration, just this, quietly (Heston, Oct 20).
  | "heat";
/** A sound that isn't on the site yet plays its stand-in. */
export const FALLBACK: Partial<Record<SfxKey, SfxKey>> = { gavel: "stamp", keys: "creak", jailSlam: "thunder", revealHit: "thunder" };
export type MusicKey = "lobby" | "intro" | "rounds" | "awards";
export type Levels = { voice: number; music: number; sfx: number };

type Media = { sfx: string[]; music: string[] };
type Manifest = Record<string, Record<string, Record<string, number>>>;

/** 0-100 on the menu slider to a gain that sounds even (quiet end is gentler). */
const gainOf = (v: number) => (v <= 0 ? 0 : Math.pow(Math.min(100, v) / 100, 2));

/** Music sits under the voice: it dips to this share while the narrator talks. */
const DUCK = 0.28;

export class SoundEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private voiceBus!: GainNode;
  private musicBus!: GainNode;
  private duckBus!: GainNode;
  private sfxBus!: GainNode;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private media: Media = { sfx: [], music: [] };
  manifest: Manifest = {};
  private loops = new Map<SfxKey, { src: AudioBufferSourceNode; gain: GainNode }>();
  private bed: { key: MusicKey; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private bedWant: MusicKey | null = null;
  private talking = 0;
  /** Whether the narrator (or a guest's clip) is talking right now. */
  get talkingNow() {
    return this.talking > 0;
  }
  private levels: Levels = { voice: 100, music: 70, sfx: 80 };
  private dimmed = false;
  ready: Promise<void>;

  constructor() {
    this.ready = Promise.all([
      fetch("/audio/media.json")
        .then((r) => (r.ok ? r.json() : null))
        .then((m) => {
          if (m) this.media = { sfx: m.sfx ?? [], music: m.music ?? [] };
        })
        .catch(() => undefined),
      fetch("/audio/narration/manifest.json")
        .then((r) => (r.ok ? r.json() : {}))
        .then((m) => {
          this.manifest = m;
        })
        .catch(() => undefined),
    ]).then(() => undefined);
  }

  get unlocked() {
    return !!this.ctx && this.ctx.state === "running";
  }

  /** Browsers only allow sound after a click. Call from a click or key press. */
  unlock(): boolean {
    try {
      if (!this.ctx) {
        const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctx();
        this.ctx = ctx;
        this.master = ctx.createGain();
        this.master.connect(ctx.destination);
        this.voiceBus = ctx.createGain();
        this.voiceBus.connect(this.master);
        this.musicBus = ctx.createGain();
        this.duckBus = ctx.createGain();
        this.musicBus.connect(this.duckBus).connect(this.master);
        this.sfxBus = ctx.createGain();
        this.sfxBus.connect(this.master);
        this.setLevels(this.levels);
        if (this.bedWant) void this.music(this.bedWant);
      }
      void this.ctx.resume();
      return true;
    } catch {
      return false;
    }
  }

  setLevels(l: Levels) {
    this.levels = l;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.voiceBus.gain.setTargetAtTime(gainOf(l.voice), t, 0.05);
    this.sfxBus.gain.setTargetAtTime(gainOf(l.sfx), t, 0.05);
    this.musicBus.gain.setTargetAtTime(gainOf(l.music) * (this.dimmed ? 0.35 : 1), t, 0.3);
  }

  /** Paused: the music drops right down until the game resumes. */
  dim(on: boolean) {
    if (this.dimmed === on) return;
    this.dimmed = on;
    this.setLevels(this.levels);
  }

  has(kind: "sfx" | "music", key: string) {
    return this.media[kind].includes(key);
  }

  narrationUrl(voice: string, tone: string, cue: string) {
    return `/audio/narration/${voice}/${tone}/${cue}.mp3`;
  }

  /** Seconds a recorded line runs, or null when it isn't recorded. */
  narrationSecs(voice: string, tone: string, cue: string): number | null {
    return this.manifest[voice]?.[tone]?.[cue] ?? null;
  }

  private load(url: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(url);
    if (!p) {
      p = fetch(url)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then((b) => (this.ctx ? this.ctx.decodeAudioData(b) : this.decodeLater(b)))
        .catch(() => null);
      this.buffers.set(url, p);
    }
    return p;
  }

  /** Before the first click there's no AudioContext: keep the bytes and decode once there is. */
  private decodeLater(b: ArrayBuffer): Promise<AudioBuffer | null> {
    return new Promise((resolve) => {
      const wait = () => (this.ctx ? this.ctx.decodeAudioData(b).then(resolve, () => resolve(null)) : window.setTimeout(wait, 500));
      wait();
    });
  }

  /** Fetch ahead so playback starts on time. */
  preload(urls: string[]) {
    for (const u of urls) void this.load(u);
  }

  sfxUrl(key: SfxKey) {
    return `/audio/sfx/${key}.mp3`;
  }

  musicUrl(key: MusicKey) {
    return `/audio/music/${key}.mp3`;
  }

  preloadMedia() {
    for (const k of this.media.sfx) void this.load(this.sfxUrl(k as SfxKey));
    for (const k of this.media.music) void this.load(this.musicUrl(k as MusicKey));
  }

  /** The line the narrator is saying now, so a new one can take over. */
  private speaking: { src: AudioBufferSourceNode; gain: GainNode } | null = null;

  /**
   * The narrator (or a party clip). Music dips underneath while it plays. One voice at a time: the TV lays the lines
   * out one after another, and if the night jumps ahead (a skip, a vote closing early) the new line takes over and
   * the old one fades out fast instead of talking over it.
   */
  async voice(url: string, gain = 1): Promise<number> {
    const buf = await this.load(url);
    if (!buf || !this.ctx) return 0;
    const t = this.ctx.currentTime;
    const takeOver = !!this.speaking;
    if (this.speaking) {
      const old = this.speaking;
      old.gain.gain.cancelScheduledValues(t);
      old.gain.gain.setValueAtTime(old.gain.gain.value, t);
      old.gain.gain.linearRampToValueAtTime(0, t + 0.12);
      try {
        old.src.stop(t + 0.13);
      } catch {
        /* already stopped */
      }
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.voiceBus);
    this.duck(1);
    const me = { src, gain: g };
    this.speaking = me;
    src.onended = () => {
      this.duck(-1);
      if (this.speaking === me) this.speaking = null;
    };
    src.start(takeOver ? t + 0.12 : t);
    return buf.duration;
  }

  private duck(d: number) {
    this.talking = Math.max(0, this.talking + d);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.duckBus.gain.cancelScheduledValues(t);
    this.duckBus.gain.setTargetAtTime(this.talking > 0 ? DUCK : 1, t, this.talking > 0 ? 0.08 : 0.6);
  }

  /** A one-shot sound effect. Missing files play nothing (the chime has a built-in fallback). */
  async sfx(key: SfxKey, gain = 1) {
    if (!this.ctx) return;
    if (!this.has("sfx", key) && FALLBACK[key] && this.has("sfx", FALLBACK[key]!)) key = FALLBACK[key]!;
    if (!this.has("sfx", key)) {
      if (key === "chime") this.synthChime();
      return;
    }
    const buf = await this.load(this.sfxUrl(key));
    if (!buf || !this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.sfxBus);
    src.start();
  }

  /** Room tone, heartbeat, clock tick, drumroll: on while the scene wants them. */
  async ambience(keys: SfxKey[]) {
    if (!this.ctx) return;
    const want = new Set(keys.filter((k) => this.has("sfx", k)));
    for (const [k, l] of this.loops) {
      if (want.has(k)) continue;
      this.fadeOut(l.gain, l.src, 0.8);
      this.loops.delete(k);
    }
    for (const k of want) {
      if (this.loops.has(k)) continue;
      const placeholder = { src: this.ctx.createBufferSource(), gain: this.ctx.createGain() };
      this.loops.set(k, placeholder);
      const buf = await this.load(this.sfxUrl(k));
      if (!buf || !this.ctx || this.loops.get(k) !== placeholder) continue;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(k === "roomTone" ? 0.45 : 0.9, this.ctx.currentTime + 1.2);
      src.connect(g).connect(this.sfxBus);
      src.start();
      this.loops.set(k, { src, gain: g });
    }
  }

  /** The music bed for the scene, crossfaded. null fades it out. */
  async music(key: MusicKey | null) {
    this.bedWant = key;
    if (!this.ctx) return;
    if (this.bed?.key === key) return;
    if (this.bed) {
      this.fadeOut(this.bed.gain, this.bed.src, key ? 1.5 : 0.4);
      this.bed = null;
    }
    if (!key || !this.has("music", key)) return;
    const buf = await this.load(this.musicUrl(key));
    if (!buf || !this.ctx || this.bedWant !== key || this.bed) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(1, this.ctx.currentTime + 1.5);
    src.connect(g).connect(this.musicBus);
    src.start();
    this.bed = { key, src, gain: g };
  }

  private fadeOut(g: GainNode, src: AudioBufferSourceNode, secs: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + secs);
    try {
      src.stop(t + secs + 0.05);
    } catch {
      /* never started */
    }
  }

  /** Three soft notes, made in the browser: the sound check before any files are in. */
  synthChime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((f, i) => {
      const o = this.ctx!.createOscillator();
      const g = this.ctx!.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.18);
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.9);
      o.connect(g).connect(this.sfxBus);
      o.start(t + i * 0.18);
      o.stop(t + i * 0.18 + 1);
    });
  }
}
