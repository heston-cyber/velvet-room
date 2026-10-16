#!/usr/bin/env python3
"""Phase 6 sound effects, made with ElevenLabs sound generation (Heston approved VO + SFX, Oct 14).

  set -a; . ./.env.elevenlabs; set +a; python3 scripts/make-sfx.py [--redo] [key ...]

Raw takes go to $RAW_DIR (default /tmp/vr-sfx-raw); the site gets leveled MP3s in public/audio/sfx/
(same targets as scripts/prepare-audio.py: SFX at -18 LUFS, never past -2 dBTP) and the key is added to
public/audio/media.json. The API key only ever lives in the environment.
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.environ.get("RAW_DIR", "/tmp/vr-sfx-raw")
OUT = os.path.join(ROOT, "public", "audio", "sfx")
MEDIA = os.path.join(ROOT, "public", "audio", "media.json")

# key: (prompt, seconds, loudness target)
SFX = {
    "whoosh": ("A quick soft whoosh, a coat swishing past the camera, clean, no music", 1.0, -18),
    "sneak": ("Cartoon sneaking: slow exaggerated tiptoe footsteps on a creaky old wooden floor, comedic, sparse, no music", 4.0, -20),
    "creak": ("An old wooden door slowly creaking open in a dark, quiet mansion, eerie, no music", 2.5, -19),
    # Oct 16 (Heston's play test): a hit as the jail vote, release vote, Locked Up! and reveal cards come up.
    "gavel": ("Three sharp, heavy wooden gavel bangs on a courtroom bench, close and punchy, no voices, no music", 2.0, -16),
    "keys": ("A big ring of old iron jail keys jangling, then a heavy cell lock turning and clanking open, no voices, no music", 2.5, -18),
    "jailSlam": ("A heavy iron jail cell door slamming shut with a loud metallic clang, rattling bars and an echo down a stone corridor, no music", 2.5, -15),
    "revealHit": ("A dramatic orchestral horror stinger: a huge low boom with a sharp string screech, film trailer hit, short tail, no voices", 2.5, -16),
}

spec = importlib.util.spec_from_file_location("prep", os.path.join(ROOT, "scripts", "prepare-audio.py"))
prep = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prep)


def generate(text, seconds):
    key = os.environ["ELEVENLABS_API_KEY"]
    body = json.dumps({"text": text, "duration_seconds": seconds, "prompt_influence": 0.5}).encode()
    req = urllib.request.Request(
        "https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128",
        data=body,
        headers={"xi-api-key": key, "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return r.read()


def main():
    redo = "--redo" in sys.argv
    only = [a for a in sys.argv[1:] if not a.startswith("--")]
    os.makedirs(RAW, exist_ok=True)
    made = []
    for key, (text, seconds, loud) in SFX.items():
        if only and key not in only:
            continue
        dst = os.path.join(OUT, f"{key}.mp3")
        if os.path.exists(dst) and not redo:
            continue
        raw = os.path.join(RAW, f"{key}.mp3")
        with open(raw, "wb") as f:
            f.write(generate(text, seconds))
        with tempfile.TemporaryDirectory() as tmp:
            wav = os.path.join(tmp, "a.wav")
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", raw, "-ac", "2", "-ar", "44100", wav], check=True)
            prep.level(wav, dst, loud, ["-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "160k"])
        lufs, peak = prep.measure(dst)
        made.append(key)
        print(f"{key}: {prep.secs(dst):.2f}s, {lufs:.1f} LUFS, peak {peak:.1f} dBTP")
    media = json.load(open(MEDIA))
    for key in SFX:
        if os.path.exists(os.path.join(OUT, f"{key}.mp3")) and key not in media["sfx"]:
            media["sfx"].append(key)
    json.dump(media, open(MEDIA, "w"), indent=1)
    print("made:", ", ".join(made) or "nothing new")


if __name__ == "__main__":
    main()
