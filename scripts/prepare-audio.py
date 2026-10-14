#!/usr/bin/env python3
"""Turns Heston's Artlist downloads into the TV's sound files.

    python3 scripts/prepare-audio.py <folder with the downloads> [--map slot=file ...] [--dry]

Finds each pick by its Artlist title words in the file names (WAV or MP3), trims and levels it,
and writes web MP3s to public/audio/sfx/<slot>.mp3 and public/audio/music/<slot>.mp3, then
public/audio/media.json, which tells the TV what it has. Anything not found is listed and skipped:
the TV plays without it. Needs ffmpeg. Never touches the source files.
"""
import json, os, re, subprocess, sys, tempfile

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "audio")

# slot: (Artlist ID, title, kind, start offset s, max length s)
#   shot: one-shot, trimmed and faded   loop: seamless loop (crossfaded end into start)   raw: loops as delivered
SFX = {
    "roomTone": ("108348", "Newcastle Ambiences English Pub at Lunchtime Atmosphere Close to Bar People Chatting", "loop", 107, 30),
    "chime": ("60685", "Domestic Doorbell House Bell Ringing", "shot", 0, 4),
    "cardFlip": ("56391", "Board Games Picking Up a Card", "shot", 0, 1.5),
    "lightsCut": ("109248", "The Attic Pulling Light Cord", "shot", 0, 1.5),
    "needleScratch": ("69726", "Cartoon Elements DJ Scratch Record Needle Glitch", "shot", 0, 2),
    "scream": ("93443", "Universal Emotes Female Woman Scream Hysterical", "shot", 0, 4.5),
    "bodyFall": ("45519", "Body Falling on Wooden Surface", "shot", 0, 2),
    "swell": ("129717", "Tonal Risers Long Strings Riser", "shot", 0, 5),
    "heartbeat": ("84364", "Real Heartbeats Slow Pulse Loop 69 BPM", "raw", 0, 0),
    "telegraph": ("71598", "Filmmaking Props Telegraph Beeps Morse Code", "shot", 0, 1.6),
    "clockTick": ("120899", "Antique Clocks Pocket Watch Ticking", "loop", 0, 12),
    "thunder": ("39191", "Thunder Bursting Booming and Rumbling Moderate Rainfall", "shot", 38, 6),
    "drumroll": ("87869", "Flourish Short Snare Drum Roll", "loop", 0, 2.6),
    "stamp": ("118168", "Bureaucracy Rubber Stamp", "shot", 0, 1.2),
    "lastCall": ("47780", "Small Hand Bell Ringing Pitch D7", "shot", 7, 4),
    "cymbal": ("57286", "Marching Drums Orchestral Cymbals Single Crash", "shot", 0, 5),
    "brassSting": ("69219", "Big Band Brass Cartoonish Beware Danger Ahead Lick", "shot", 0, 2.5),
    "fanfare": ("36879", "Cinematic Logos Trumpet Phrase Victory Fanfare", "shot", 0, 5),
    "sinisterBrass": ("112023", "Jump Scares Quick Orchestra Impact", "shot", 0, 5),
    "applause": ("69847", "Energetic Crowds Small Audience Applause Moderate Cheering Shouts Clapping", "shot", 0, 8),
}
MUSIC = {
    "lobby": [("114812", "Hesitation Blues"), ("6001832", "Julies Corner")],
    "intro": [("6001878", "In Darkness Creative Cut Strings")],
    "rounds": [("127840", "Keep Your Head Down")],
    "awards": [("137875", "Swing Force")],
}

STOP = {"a", "an", "and", "the", "of", "on", "to", "at", "in"}
words = lambda s: {w for w in re.findall(r"[a-z0-9]+", s.lower()) if w not in STOP}


def find(files, song_id, title):
    """The download for one pick: its Artlist ID in the name, else the best title match."""
    for f in files:
        if re.search(rf"(^|\D){song_id}(\D|$)", os.path.basename(f)):
            return f
    want = words(title)
    best, score = None, 0.0
    for f in files:
        have = words(os.path.splitext(os.path.basename(f))[0])
        s = len(want & have) / len(want)
        if s > score:
            best, score = f, s
    return best if score >= 0.6 else None


def run(args):
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", *args], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr[-400:])


def secs(f):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], capture_output=True, text=True).stdout.strip() or 0)


def make(src, dst, kind, start, length, loud):
    enc = ["-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "160k"]
    norm = f"loudnorm=I={loud}:TP=-1.5:LRA=11"
    if kind == "raw":
        run(["-i", src, "-af", norm, *enc, dst])
    elif kind == "shot":
        fade = min(0.4, length / 4)
        run(["-ss", str(start), "-t", str(length), "-i", src, "-af",
             f"silenceremove=start_periods=1:start_threshold=-50dB,{norm},afade=t=out:st={max(0, length - fade - 0.05)}:d={fade}", *enc, dst])
    else:  # seamless loop: the last X seconds crossfade into the first X
        total = secs(src)
        length = min(length or total, total - start)
        x = min(2.0, length / 4)
        with tempfile.TemporaryDirectory() as tmp:
            seg = os.path.join(tmp, "seg.wav")
            run(["-ss", str(start), "-t", str(length + x), "-i", src, "-af", norm, seg])
            # (two inputs, not asplit: acrossfade reads all of the first before the second)
            run(["-i", seg, "-i", seg, "-filter_complex",
                 f"[0:a]atrim=start={x},asetpts=PTS-STARTPTS[body];[1:a]atrim=0:{x},asetpts=PTS-STARTPTS[head];"
                 f"[body][head]acrossfade=d={x}:c1=tri:c2=tri[o]", "-map", "[o]", *enc, dst])


def main():
    argv = sys.argv[1:]
    if not argv:
        print(__doc__)
        sys.exit(1)
    src_dir = argv[0]
    dry = "--dry" in argv
    forced = dict(a.split("=", 1) for a in argv[1:] if "=" in a)
    files = [os.path.join(dp, f) for dp, _, fs in os.walk(src_dir) for f in fs if f.lower().endswith((".wav", ".mp3", ".aif", ".aiff", ".m4a", ".flac"))]
    os.makedirs(os.path.join(OUT, "sfx"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "music"), exist_ok=True)
    have = {"sfx": [], "music": []}
    missing = []
    for slot, (sid, title, kind, start, length) in SFX.items():
        f = forced.get(slot) or find(files, sid, title)
        if not f:
            missing.append(f"sfx {slot} (Artlist {sid}: {title})")
            continue
        print(f"sfx   {slot:<14} <- {os.path.basename(f)}")
        if not dry:
            make(f, os.path.join(OUT, "sfx", f"{slot}.mp3"), kind, start, length, -18)
        have["sfx"].append(slot)
    for slot, options in MUSIC.items():
        f = forced.get(slot)
        for sid, title in options:
            f = f or find(files, sid, title)
        if not f:
            missing.append(f"music {slot} ({' or '.join(t for _, t in options)})")
            continue
        print(f"music {slot:<14} <- {os.path.basename(f)}")
        if not dry:
            make(f, os.path.join(OUT, "music", f"{slot}.mp3"), "loop", 0, 0, -20)
        have["music"].append(slot)
    if not dry:
        with open(os.path.join(OUT, "media.json"), "w") as fh:
            json.dump(have, fh, indent=1)
    print(f"\n{len(have['sfx'])} of {len(SFX)} sound effects, {len(have['music'])} of {len(MUSIC)} music beds")
    if missing:
        print("Not found (the TV plays without them):\n  " + "\n  ".join(missing))


if __name__ == "__main__":
    main()
