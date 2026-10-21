// Records the narrator's lines with ElevenLabs: every cue, for Ivy and Duke, steady and Unstable,
// in Classic and Adult (and Duke's Sailor mode script), and every version of each line (<cue>.mp3, <cue>.1.mp3, …).
// Resumable: lines already recorded are skipped, unless their words changed since (Oct 21: texts.json keeps a
// fingerprint of the words each recording was made from; see narration-sets.ts), so re-running after a script
// edit records only the changed lines.
//   npx tsx scripts/record-narration.ts [--only ivy,duke-unstable] [--cues doors,intro1] [--redo] [--dry]
// --dry: list what would be recorded and how many characters it sends, without calling ElevenLabs.
// Needs ELEVENLABS_API_KEY (from .env.elevenlabs). Raw takes go to $RAW_DIR; the site gets
// loudness-matched mono MP3s in public/audio/narration/<voice>/<tone>/<cue>.mp3 plus a manifest.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import * as narration from "../convex/narration";
import { TTS_MODEL, cueFiles, plain, recordingText, settingsFor, voiceIdFor, voiceKey, type CueKey, type HostKey, type Tone } from "../convex/narration";
import { OUT, SETS, TEXTS, fingerprint, readJson, writeManifest, type Narration, type Texts } from "./narration-sets";

const dry = process.argv.includes("--dry");
const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY && !dry) throw new Error("Set ELEVENLABS_API_KEY");
const RAW = process.env.RAW_DIR ?? "/tmp/vr-raw";
const texts = readJson<Texts>(TEXTS, {});
const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const only = arg("--only")?.split(",");
const cuesOnly = arg("--cues")?.split(",") as CueKey[] | undefined;
const redo = process.argv.includes("--redo");

type Job = { host: HostKey; unstable: boolean; tone: Tone; cue: CueKey; v: number; file: string };
const vkOf = (s: { host: HostKey; unstable: boolean; tone: Tone }) => voiceKey(s.host, s.unstable, s.tone === "sailor");
const jobs: Job[] = [];
for (const set of SETS)
  for (const f of cueFiles(set.tone))
    if ((!cuesOnly || cuesOnly.includes(f.cue)) && (!only || only.includes(vkOf(set)))) jobs.push({ ...set, ...f });

const dur = (f: string) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());

async function tts(text: string, host: HostKey, vk: string): Promise<Buffer> {
  void host;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceIdFor(vk)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: TTS_MODEL, voice_settings: settingsFor(vk) }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

let chars = 0;
const report: string[] = [];
const fresh = new Set<string>();
const planned: string[] = [];
async function run(j: Job) {
  const vk = vkOf(j);
  const rel = `${vk}/${j.tone}/${j.file}.mp3`;
  const out = join(OUT, rel);
  const text = recordingText(j.cue, j.tone, j.host, j.unstable, j.v);
  // Already recorded with these exact words: nothing to do.
  if (existsSync(out) && !redo && texts[vk]?.[j.tone]?.[j.file] === fingerprint(text)) return;
  if (dry) {
    planned.push(rel);
    chars += text.length;
    return;
  }
  // A take should last roughly as long as the words take to say (about 14 characters a second).
  const expect = plain(text).length / 14 + (text.match(/long pause/g) ?? []).length * 1.5;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const raw = join(RAW, `${rel.replaceAll("/", "__")}.take${attempt}.mp3`);
    mkdirSync(dirname(raw), { recursive: true });
    writeFileSync(raw, await tts(text, j.host, vk));
    chars += text.length;
    const d = dur(raw);
    const ok = d > Math.max(0.6, expect * 0.35) && d < expect * (j.unstable ? 3.2 : 2.4) + 4;
    if (ok || attempt === 3) {
      mkdirSync(dirname(out), { recursive: true });
      // Loudness-matched, mono, small: the TV mixes these under music.
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ac", "1", "-ar", "44100", "-b:a", "96k", out]);
      if (!ok) report.push(`kept odd take for ${rel} (${d.toFixed(1)}s, expected about ${expect.toFixed(1)}s)`);
      ((texts[vk] ??= {})[j.tone] ??= {})[j.file] = fingerprint(text);
      writeFileSync(TEXTS, JSON.stringify(texts, null, 1));
      fresh.add(`${vk}/${j.tone}/${j.file}`);
      return;
    }
    report.push(`retake ${rel}: ${d.toFixed(1)}s, expected about ${expect.toFixed(1)}s`);
  }
}

async function pool(n: number) {
  let i = 0;
  const workers = Array.from({ length: n }, async () => {
    while (i < jobs.length) {
      const j = jobs[i++];
      try { await run(j); } catch (e) { report.push(`FAILED ${vkOf(j)}/${j.tone}/${j.file}: ${(e as Error).message}`); }
    }
  });
  await Promise.all(workers);
}

await pool(dry ? 1 : 4);
if (dry) {
  console.log(planned.join("\n"));
  console.log(`would record ${planned.length} lines, ${chars} characters`);
  process.exit(0);
}
// manifest: every line recorded with its current words, and its length, so the TV knows what it has and how long each runs
const m = writeManifest(narration as unknown as Narration, texts, fresh);
console.log(`manifest: ${m.kept} lines current, ${m.stale.length} out of date, ${m.missing} never recorded`);
const prev = existsSync("/tmp/vr-chars.txt") ? Number(readFileSync("/tmp/vr-chars.txt", "utf8")) : 0;
writeFileSync("/tmp/vr-chars.txt", String(prev + chars));
console.log(`jobs ${jobs.length}, characters sent this run ${chars} (total so far ${prev + chars})`);
console.log(report.join("\n") || "no retakes");
