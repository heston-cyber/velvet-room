// Records the narrator's lines with ElevenLabs: every cue, for Ivy and Duke, steady and Unstable,
// in Classic and Adult. Resumable: lines already recorded are skipped.
//   npx tsx scripts/record-narration.ts [--only ivy,duke-unstable] [--cues doors,intro1] [--redo]
// Needs ELEVENLABS_API_KEY (from .env.elevenlabs). Raw takes go to $RAW_DIR; the site gets
// loudness-matched mono MP3s in public/audio/narration/<voice>/<tone>/<cue>.mp3 plus a manifest.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CUE_KEYS, HOSTS, TTS_MODEL, VOICE_SETTINGS, plain, recordingText, voiceKey, type CueKey, type HostKey, type Tone } from "../convex/narration";

const KEY = process.env.ELEVENLABS_API_KEY;
if (!KEY) throw new Error("Set ELEVENLABS_API_KEY");
const RAW = process.env.RAW_DIR ?? "/tmp/vr-raw";
const OUT = "public/audio/narration";
const arg = (n: string) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const only = arg("--only")?.split(",");
const cuesOnly = arg("--cues")?.split(",") as CueKey[] | undefined;
const redo = process.argv.includes("--redo");

type Job = { host: HostKey; unstable: boolean; tone: Tone; cue: CueKey };
const jobs: Job[] = [];
for (const host of ["ivy", "duke"] as HostKey[])
  for (const unstable of [false, true])
    for (const tone of ["classic", "adult"] as Tone[])
      for (const cue of cuesOnly ?? CUE_KEYS)
        if (!only || only.includes(voiceKey(host, unstable))) jobs.push({ host, unstable, tone, cue });

const dur = (f: string) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim());

async function tts(text: string, host: HostKey, unstable: boolean): Promise<Buffer> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${HOSTS[host].voiceId}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: TTS_MODEL, voice_settings: unstable ? VOICE_SETTINGS.unstable : VOICE_SETTINGS.steady }),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}

let chars = 0;
const report: string[] = [];
async function run(j: Job) {
  const vk = voiceKey(j.host, j.unstable);
  const rel = `${vk}/${j.tone}/${j.cue}.mp3`;
  const out = join(OUT, rel);
  if (existsSync(out) && !redo) return;
  const text = recordingText(j.cue, j.tone, j.host, j.unstable);
  // A take should last roughly as long as the words take to say (about 14 characters a second).
  const expect = plain(text).length / 14 + (text.match(/long pause/g) ?? []).length * 1.5;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const raw = join(RAW, `${rel.replaceAll("/", "__")}.take${attempt}.mp3`);
    mkdirSync(dirname(raw), { recursive: true });
    writeFileSync(raw, await tts(text, j.host, j.unstable));
    chars += text.length;
    const d = dur(raw);
    const ok = d > Math.max(0.6, expect * 0.35) && d < expect * (j.unstable ? 3.2 : 2.4) + 4;
    if (ok || attempt === 3) {
      mkdirSync(dirname(out), { recursive: true });
      // Loudness-matched, mono, small: the TV mixes these under music.
      execFileSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ac", "1", "-ar", "44100", "-b:a", "96k", out]);
      if (!ok) report.push(`kept odd take for ${rel} (${d.toFixed(1)}s, expected about ${expect.toFixed(1)}s)`);
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
      try { await run(j); } catch (e) { report.push(`FAILED ${voiceKey(j.host, j.unstable)}/${j.tone}/${j.cue}: ${(e as Error).message}`); }
    }
  });
  await Promise.all(workers);
}

await pool(4);
// manifest: every recorded line and its length, so the TV knows what it has and how long each runs
const manifest: Record<string, Record<string, Record<string, number>>> = {};
for (const host of ["ivy", "duke"] as HostKey[]) for (const unstable of [false, true]) for (const tone of ["classic", "adult"] as Tone[]) for (const cue of CUE_KEYS) {
  const f = join(OUT, voiceKey(host, unstable), tone, `${cue}.mp3`);
  if (!existsSync(f)) continue;
  ((manifest[voiceKey(host, unstable)] ??= {})[tone] ??= {})[cue] = Math.round(dur(f) * 100) / 100;
}
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
const prev = existsSync("/tmp/vr-chars.txt") ? Number(readFileSync("/tmp/vr-chars.txt", "utf8")) : 0;
writeFileSync("/tmp/vr-chars.txt", String(prev + chars));
console.log(`jobs ${jobs.length}, characters sent this run ${chars} (total so far ${prev + chars})`);
console.log(report.join("\n") || "no retakes");
