"""The joke systems (Oct 16, Heston after his play test): Sailor mode from the voice setup (Duke's own script and
voice set), no repeated lines on one host laptop, and the running gag only every third game started on that laptop.
  BASE=http://localhost:4174 python3 tests/e2e/jokes.py
"""
import json, os, re, subprocess, time, urllib.request
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173")
OUT = os.environ.get("OUT", "e2e-out/jokes")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.makedirs(OUT, exist_ok=True)
ENV = dict(os.environ)
for line in open(os.path.join(ROOT, ".env.local")):
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1)
        ENV[k] = v.split(" #")[0]
URL = ENV["VITE_CONVEX_URL"].rstrip("/")


def cx(fn, args):
    r = subprocess.run(["npx", "convex", "run", fn, json.dumps(args)], cwd=ROOT, env=ENV, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f"{fn}: {r.stderr[-400:]}")
    out = r.stdout.strip()
    starts = [i for i in (out.find("{"), out.find("[")) if i >= 0]
    return json.loads(out[min(starts):]) if starts else (out or None)


def call(kind, path, args):
    """A public query or mutation over HTTP (much faster than the CLI)."""
    req = urllib.request.Request(f"{URL}/api/{kind}", data=json.dumps({"path": path, "args": args, "format": "json"}).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = json.loads(r.read())
    if body.get("status") != "success":
        raise RuntimeError(f"{path}: {body.get('errorMessage')}")
    return body["value"]


mut = lambda path, args: call("mutation", path, args)
qry = lambda path, args: call("query", path, args)


def wait_for(fn, secs=15):
    end = time.time() + secs
    while time.time() < end:
        try:
            if fn():
                return True
        except Exception:
            pass
        time.sleep(0.3)
    return False



fails = []
def ok(cond, what):
    print(("PASS " if cond else "FAIL ") + what, flush=True)
    if not cond:
        fails.append(what)

SLUGS = ["jokes-e2e-1", "jokes-e2e-2", "jokes-e2e-3", "jokes-e2e-sailor"]
def make(slug):
    try:
        cx("admin:deleteTestGame", {"slug": slug})
    except Exception:
        pass
    key = cx("admin:createGame", {"slug": slug, "title": "The Velvet Room", "isTest": True, "makeActive": False, "registrationClosesAt": int(time.time() * 1000) + 7 * 864e5, "deadlineLabel": "Sat"})["hostKey"]
    cx("host:updateSettings", {"slug": slug, "hostKey": key, "tone": "adult", "search": "waves", "pacing": {"mode": "ready", "roundMinutes": 10}})
    cx("game:seedFakeCast", {"slug": slug, "guests": 8, "markers": 10, "seed": 3, "checkIn": True})
    return key
keys = {s: make(s) for s in SLUGS}
roster = lambda slug: qry("host:roster", {"slug": slug, "hostKey": keys[slug]})

def start(host, slug):
    host.goto(f"{BASE}/host?game={slug}&key={keys[slug]}")
    host.get_by_role("button", name="Play").wait_for(timeout=20000)
    host.get_by_role("button", name="Play").click()
    wait_for(lambda: host.locator(".hs-lobby").count() == 1)
    host.locator(".hs-lobby button").click()
    host.locator(".hs-lobby button").first.click()  # Oct 17: "Yes, begin" (the QR cards are hidden)
    ok(wait_for(lambda: roster(slug)["game"]["status"] == "playing", 20), f"{slug} starts")
    ok(wait_for(lambda: roster(slug)["game"]["heard"] is not None, 20), f"{slug} picked its lines at Start")
    host.wait_for_timeout(1500)  # the laptop remembers them
    return roster(slug)["game"]["heard"]

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900})  # one laptop
    host = ctx.new_page()
    # three games on one laptop: different versions each time, and the gag only in the third
    h1 = start(host, SLUGS[0])
    h2 = start(host, SLUGS[1])
    h3 = start(host, SLUGS[2])
    multi = [k for k in h1["lines"] if not k.startswith("custom:")]
    ok(len(multi) >= 40, f"each game picks a version of every line ({len(multi)})")
    ok(all(h2["lines"][k] != h1["lines"][k] for k in multi), "game 2 hears a different version of every line than game 1")
    # Phase 6 (Oct 21): new lines have 2 Adult versions, so game 3 hears the third version where there is one, and
    # otherwise the one heard longest ago (game 1's).
    counts = json.loads(subprocess.run(["npx", "tsx", "-e", "import { CUE_KEYS, cleanVersions } from './convex/narration'; console.log(JSON.stringify(Object.fromEntries(CUE_KEYS.map((c) => [c, cleanVersions(c, 'adult').length]))))"], cwd=ROOT, capture_output=True, text=True).stdout.strip().splitlines()[-1])
    ok(all(len({h1["lines"][k], h2["lines"][k], h3["lines"][k]}) == min(3, counts.get(k, 3)) for k in multi), "game 3 hears the third one, where a line has three")
    ok(all(h3["lines"][k] != h2["lines"][k] for k in multi), "and never game 2's again")
    # Oct 18: the gag night (every third game) sends every insult to one guest.
    ok(not h1["gag"] and not h2["gag"], "no gag night in games 1 and 2")
    ok(h3["gag"], "game 3 is the gag night")
    ok(all(":insult:" in i for i in h1["heckles"] + h2["heckles"] + h3["heckles"]), "every heckle is an insult (no jokes or asides)")
    # 30 insults a script and 24 dealt a night: game 2 gets the 6 game 1 didn't deal first, then the rest.
    fresh = [x for x in h2["heckles"] if x not in h1["heckles"]]
    ok(len(fresh) >= 6 and h2["heckles"][:len(fresh)] == fresh, f"game 2 deals the insults game 1 didn't first ({len(fresh)} new)")
    stored = host.evaluate("() => JSON.parse(localStorage.getItem('velvet-room:heard'))")
    ok(stored and len(stored["games"]) == 3, "the laptop remembers three games")

    # Sailor mode from the voice setup
    slug = SLUGS[3]
    host.goto(f"{BASE}/host?game={slug}&key={keys[slug]}")
    host.get_by_role("button", name="Options").wait_for(timeout=20000)
    host.get_by_role("button", name="Options").click()
    # S6 (Oct 17): one picker for the narrator and the script.
    sw = host.get_by_role("radio", name=re.compile("Sailor mode"))
    sw.scroll_into_view_if_needed()
    host.wait_for_timeout(500)
    host.screenshot(path=os.path.join(OUT, "01-voice-setup.png"))
    sw.click()
    ok(wait_for(lambda: roster(slug)["game"]["narrator"].get("sailor") is True, 10), "picking Sailor mode turns it on")
    g = roster(slug)["game"]
    ok(g["narrator"]["host"] == "duke" and g["tone"] == "adult", "Sailor mode is Duke over the Adult script")
    host.wait_for_timeout(800)
    host.screenshot(path=os.path.join(OUT, "02-sailor-on.png"))
    host.get_by_role("button", name="Back").first.click()
    audio = []
    host.on("request", lambda r: audio.append(r.url) if "/audio/narration/" in r.url else None)
    hs = start(host, slug)
    ok(hs["script"] == "sailor", "the game reads the Sailor script")
    ok(wait_for(lambda: any("/gruff-sailor/sailor/" in u for u in audio), 30), "the TV plays Mister Gruff's Sailor recordings")
    ok(wait_for(lambda: host.locator(".tv-how").count() == 1, 20), "How to play is on")
    host.wait_for_timeout(4000)
    cap = host.locator(".tv-caption").inner_text() if host.locator(".tv-caption").count() else ""
    print("caption:", cap)
    ok("[" not in cap, "captions show no delivery directions")
    host.screenshot(path=os.path.join(OUT, "03-sailor-how.png"))
    clips = cx("voice:clipsOf", {"slug": slug})
    # The per-game lines are made by ElevenLabs on the backend: checked with VOICES=1 (dev has no key otherwise).
    if os.environ.get("VOICES"):
        ok(wait_for(lambda: all(c["status"] == "ready" for c in cx("voice:clipsOf", {"slug": slug}) if c["purpose"].startswith(("killer:", "heckle:"))), 400), "the per-game lines record in Duke's Sailor voice")
    clips = cx("voice:clipsOf", {"slug": slug})
    late = [(c["purpose"], c["status"], c["error"]) for c in clips if c["status"] != "ready"]
    if late:
        print("not ready:", late[:8])
    ok(all(c["voice"] == "gruff-sailor" for c in clips), "every per-game clip is Mister Gruff")
    browser.close()

for s in SLUGS:
    cx("admin:deleteTestGame", {"slug": s})
print("\n" + ("all passed" if not fails else f"{len(fails)} failed: " + "; ".join(fails)))
raise SystemExit(1 if fails else 0)

