"""The joke systems (Oct 16, Heston after his play test): Sailor mode from the voice setup (Duke's own script and
voice set), no repeated lines on one host laptop, and the running gag only every third game started on that laptop.
  BASE=http://localhost:4174 python3 tests/e2e/jokes.py
"""
import json, os, subprocess, time, urllib.request
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
    host.locator(".hs-lobby button").click()
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
    ok(all(len({h1["lines"][k], h2["lines"][k], h3["lines"][k]}) == 3 for k in multi), "game 3 hears the third one")
    ok(not any(":gag:" in i for i in h1["heckles"] + h2["heckles"]), "no running gag in games 1 and 2")
    ok(sum(":gag:" in i for i in h3["heckles"]) >= 6, "game 3 has the running gag")
    ok(not set(h2["heckles"]) & set(h1["heckles"]), "game 2's heckles are all new")
    stored = host.evaluate("() => JSON.parse(localStorage.getItem('velvet-room:heard'))")
    ok(stored and len(stored["games"]) == 3, "the laptop remembers three games")

    # Sailor mode from the voice setup
    slug = SLUGS[3]
    host.goto(f"{BASE}/host?game={slug}&key={keys[slug]}")
    host.get_by_role("button", name="Options").wait_for(timeout=20000)
    host.get_by_role("button", name="Options").click()
    sw = host.locator("#set-sailor")
    sw.scroll_into_view_if_needed()
    host.wait_for_timeout(500)
    host.screenshot(path=os.path.join(OUT, "01-voice-setup.png"))
    host.locator("label[for=set-sailor], #set-sailor").first.click()
    ok(wait_for(lambda: roster(slug)["game"]["narrator"].get("sailor") is True, 10), "the Sailor mode switch turns it on")
    g = roster(slug)["game"]
    ok(g["narrator"]["host"] == "duke" and g["tone"] == "adult", "Sailor mode is Duke over the Adult script")
    host.wait_for_timeout(800)
    host.screenshot(path=os.path.join(OUT, "02-sailor-on.png"))
    host.get_by_role("button", name="Back").first.click()
    audio = []
    host.on("request", lambda r: audio.append(r.url) if "/audio/narration/" in r.url else None)
    hs = start(host, slug)
    ok(hs["script"] == "sailor", "the game reads the Sailor script")
    ok(wait_for(lambda: any("/duke-sailor/sailor/" in u for u in audio), 30), "the TV plays Duke's Sailor recordings")
    ok(wait_for(lambda: host.locator(".tv-how").count() == 1, 20), "How to play is on")
    host.wait_for_timeout(4000)
    cap = host.locator(".tv-caption").inner_text() if host.locator(".tv-caption").count() else ""
    print("caption:", cap)
    ok("[" not in cap, "captions show no delivery directions")
    host.screenshot(path=os.path.join(OUT, "03-sailor-how.png"))
    clips = cx("voice:clipsOf", {"slug": slug})
    ok(wait_for(lambda: all(c["status"] == "ready" for c in cx("voice:clipsOf", {"slug": slug}) if c["purpose"].startswith(("killer:", "heckle:"))), 400), "the per-game lines record in Duke's Sailor voice")
    clips = cx("voice:clipsOf", {"slug": slug})
    late = [(c["purpose"], c["status"], c["error"]) for c in clips if c["status"] != "ready"]
    if late:
        print("not ready:", late[:8])
    ok(all(c["voice"] == "duke-sailor" for c in clips), "every per-game clip is Sailor Duke")
    browser.close()

for s in SLUGS:
    cx("admin:deleteTestGame", {"slug": s})
print("\n" + ("all passed" if not fails else f"{len(fails)} failed: " + "; ".join(fails)))
raise SystemExit(1 if fails else 0)

