// What the narrator's recordings are, and whether each one still says what the script says.
// Oct 21 (the lines were modernized): every recording has a fingerprint of the exact words it was made from, in
// public/audio/narration/texts.json. A recording whose words changed since is left out of manifest.json, so the TV
// shows that line as a caption only, and the recorder makes it again. Shared by record-narration.ts and
// narration-texts.ts.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { HostKey, Tone } from "../convex/narration";

export const OUT = "public/audio/narration";
export const TEXTS = join(OUT, "texts.json");
export const MANIFEST = join(OUT, "manifest.json");

export type Set = { host: HostKey; unstable: boolean; tone: Tone };
/** Every recorded set: Ivy and Duke, steady and Unstable, Classic and Adult; and Sailor mode (Mister Gruff, his own script). */
export const SETS: Set[] = [
  ...(["ivy", "duke"] as HostKey[]).flatMap((host) => [false, true].flatMap((unstable) => (["classic", "adult"] as Tone[]).map((tone) => ({ host, unstable, tone })))),
  { host: "duke", unstable: false, tone: "sailor" },
];

/** The parts of convex/narration.ts these scripts use (an older copy can be passed in for a snapshot). */
export type Narration = {
  cueFiles: (tone: Tone) => { cue: string; v: number; file: string }[];
  recordingText: (cue: never, tone: Tone, host: HostKey, unstable: boolean, v?: number) => string;
  voiceKey: (host: HostKey, unstable: boolean, sailor?: boolean) => string;
};

export const vkOf = (n: Narration, s: Set) => n.voiceKey(s.host, s.unstable, s.tone === "sailor");
export const fingerprint = (text: string) => createHash("sha1").update(text).digest("hex").slice(0, 16);

export type Texts = Record<string, Record<string, Record<string, string>>>;
export type Manifest = Record<string, Record<string, Record<string, number>>>;
export const readJson = <T>(f: string, empty: T): T => (existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as T) : empty);

/** Every recording a script calls for, with the words it should say. */
export function wanted(n: Narration) {
  return SETS.flatMap((s) =>
    n.cueFiles(s.tone).map((f) => ({ ...s, ...f, vk: vkOf(n, s), text: n.recordingText(f.cue as never, s.tone, s.host, s.unstable, f.v) })),
  );
}

const dur = (f: string) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());

/**
 * The manifest the TV and the server read: every line whose recording exists and says the script's current words,
 * with its length. Returns how many lines were left out because their words changed.
 */
/** fresh: files just recorded ("duke/adult/doors.1"), measured again instead of keeping the old length. */
export function writeManifest(n: Narration, texts: Texts, fresh: Set<string> = new Set()): { kept: number; stale: string[]; missing: number } {
  const old = readJson<Manifest>(MANIFEST, {});
  const out: Manifest = {};
  const stale: string[] = [];
  let kept = 0;
  let missing = 0;
  for (const w of wanted(n)) {
    const f = join(OUT, w.vk, w.tone, `${w.file}.mp3`);
    if (!existsSync(f)) {
      missing++;
      continue;
    }
    if (texts[w.vk]?.[w.tone]?.[w.file] !== fingerprint(w.text)) {
      stale.push(`${w.vk}/${w.tone}/${w.file}`);
      continue;
    }
    const known = fresh.has(`${w.vk}/${w.tone}/${w.file}`) ? undefined : old[w.vk]?.[w.tone]?.[w.file];
    ((out[w.vk] ??= {})[w.tone] ??= {})[w.file] = known ?? Math.round(dur(f) * 100) / 100;
    kept++;
  }
  writeFileSync(MANIFEST, JSON.stringify(out, null, 1));
  return { kept, stale, missing };
}
