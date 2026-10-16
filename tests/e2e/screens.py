"""Screen check (Oct 16, Heston: "some stuff was cut off out of frame (the evidence) and other stuff as well"): plays a
whole night on the dev backend with 15 guests and the longest names sign-up allows, screenshots every TV screen, and
flags anything that sticks out of the 16:9 stage or is clipped inside its box.
  BASE=http://localhost:4174 [TONE=adult] [W=1920 H=1080] python3 tests/e2e/screens.py
Screenshots and a report go to $OUT (default ./e2e-out/screens).
"""
import json, os, subprocess, time, urllib.request
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = os.environ.get("SLUG", "screens-e2e")
OUT = os.environ.get("OUT", "e2e-out/screens")
TONE = os.environ.get("TONE", "adult")
W, H = int(os.environ.get("W", "1920")), int(os.environ.get("H", "1080"))
GUESTS = int(os.environ.get("GUESTS", "15"))
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


# Anything on the stage that reaches past its edges, or text cut off inside a box that hides overflow.
AUDIT = """() => {
  const st = document.querySelector('.tv-stage'); if (!st) return ['no stage'];
  const R = st.getBoundingClientRect(); const out = [];
  const name = (el) => (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : el.tagName.toLowerCase());
  for (const el of st.querySelectorAll('*')) {
    if (el.closest('.tv-cameos, .tv-scene-out, [aria-hidden=true]')) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const pad = 1;
    if (r.bottom > R.bottom + pad || r.top < R.top - pad || r.right > R.right + pad || r.left < R.left - pad) {
      out.push(`off-stage ${name(el)} [${Math.round(r.left - R.left)},${Math.round(r.top - R.top)} ${Math.round(r.width)}x${Math.round(r.height)}] "${(el.innerText || '').slice(0, 40).replace(/\\n/g, ' ')}"`);
      continue;
    }
    const hides = /(hidden|clip)/.test(cs.overflow + cs.overflowY + cs.overflowX);
    if (hides && el.children.length + (el.innerText ? 1 : 0) > 0 && (el.scrollHeight > el.clientHeight + 3 || el.scrollWidth > el.clientWidth + 3) && !el.matches('.tv-stage, .tv-page, img')) {
      out.push(`clipped ${name(el)} (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}) "${(el.innerText || '').slice(0, 40).replace(/\\n/g, ' ')}"`);
    }
  }
  return [...new Set(out)].slice(0, 15);
}"""

report = []
try:
    cx("admin:deleteTestGame", {"slug": SLUG})
except Exception:
    pass
created = cx("admin:createGame", {"slug": SLUG, "title": "The Velvet Room", "isTest": True, "makeActive": False,
                                  "registrationClosesAt": int(time.time() * 1000) + 7 * 864e5, "deadlineLabel": "Sat, Oct 31"})
KEY = created["hostKey"]
cx("host:updateSettings", {"slug": SLUG, "hostKey": KEY, "tone": TONE, "search": "waves", "pacing": {"mode": "ready", "roundMinutes": 10}})
cx("game:seedFakeCast", {"slug": SLUG, "guests": GUESTS, "markers": 24, "seed": 77, "checkIn": True, "longNames": True})
guests = cx("admin:testPlayers", {"slug": SLUG})
roster = lambda: qry("host:roster", {"slug": SLUG, "hostKey": KEY})

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    host = browser.new_context(viewport={"width": W, "height": H}).new_page()
    host.on("pageerror", lambda e: errors.append(str(e)))
    n = [0]

    def audit(label, settle=1500):
        host.wait_for_timeout(settle)
        n[0] += 1
        fname = f"{n[0]:02d}-{label}.png"
        host.screenshot(path=os.path.join(OUT, fname))
        issues = host.evaluate(AUDIT)
        report.append({"screen": fname, "issues": issues})
        print(("OK   " if not issues else "FLAG ") + fname + ("" if not issues else "\n       " + "\n       ".join(issues)), flush=True)

    def menu(label):
        host.locator(".hs-menu-btn").click()
        host.get_by_role("button", name=label).click(timeout=5000)

    def vote_all(target):
        """Every guest who can votes for target (None is nobody); the last ballot closes the vote."""
        for gst in guests:
            try:
                mut("game:castVote", {"token": gst["token"], "targetId": None if target == gst["id"] else target})
            except Exception:
                pass

    host.goto(f"{BASE}/host?game={SLUG}&key={KEY}")
    host.get_by_role("button", name="Play").wait_for(timeout=20000)
    audit("title")
    host.get_by_role("button", name="Play").click()
    wait_for(lambda: host.locator(".hs-lobby").count() == 1)
    audit("lobby", 2500)
    host.locator(".hs-lobby button").click()
    host.locator(".hs-lobby button").click()
    wait_for(lambda: roster()["game"]["status"] == "playing", 20)
    t0 = time.time()
    for at, label in ((5, "intro-1"), (20, "intro-2"), (35, "intro-3")):
        host.wait_for_timeout(max(0, int((t0 + at - time.time()) * 1000)))
        audit(label, 0)
    kick = lambda: host.evaluate("() => document.querySelector('.tv-how .tv-kick')?.textContent || ''")
    for i in range(1, 7):
        if not wait_for(lambda: f"· {i} of" in kick(), 30):
            break
        audit(f"how-{i}", 1600)
    wait_for(lambda: host.locator(".tv-roll h2").count() == 1, 40)
    audit("roll-call", 1200)
    menu("Skip to the roles")
    audit("phones", 4500)
    cx("game:skipIntro", {"slug": SLUG, "hostKey": KEY})
    audit("round-1", 5500)

    for rnd in (1, 2, 3):
        mut("game:advanceRound", {"slug": SLUG, "hostKey": KEY})
        # a release vote first (from Round 2, if anyone's in jail), then the jail vote
        for _ in range(2):
            if not wait_for(lambda: host.get_by_text("Who goes to jail?").count() or host.get_by_text("Does anyone get out?").count(), 12):
                break
            kind = "release" if host.get_by_text("Does anyone get out?").count() else "jail"
            audit(f"r{rnd}-{kind}-vote", 5000)
            vote_all(None if kind == "release" else guests[3 + rnd]["id"])
            wait_for(lambda: host.get_by_text("The votes are in").count() == 1, 15)
            audit(f"r{rnd}-{kind}-tally", 1500)
            host.wait_for_timeout(9000)
            audit(f"r{rnd}-{kind}-verdict", 0)
            if kind == "jail":
                break
            host.wait_for_timeout(8000)
        if rnd < 3:
            wait_for(lambda: roster()["game"]["round"] == rnd + 1, 25)
            audit(f"round-{rnd + 1}", 6000)
            if rnd + 1 == 3:
                audit("round-3-twist", 9000)

    wait_for(lambda: roster()["game"]["round"] == 4, 30)
    audit("lock-in", 6000)
    board = qry("game:phone", {"token": guests[0]["token"]})["board"]
    for gst in guests:
        other = next(s["id"] for s in board["suspects"] if s["id"] != gst["id"])
        try:
            mut("game:accuse", {"token": gst["token"], "suspectId": other, "exhibitId": board["exhibits"][0]["id"], "roomKey": board["rooms"][0]["key"]})
        except Exception:
            pass
    wait_for(lambda: roster()["game"]["status"] == "reveal", 25)
    rt = time.time()
    for at, label in ((6, "reveal-line"), (16, "reveal-name"), (21, "reveal-how"), (30, "reveal-verdict"), (40, "reveal-votes")):
        host.wait_for_timeout(max(0, int((rt + at - time.time()) * 1000)))
        audit(label, 0)
    mut("game:finish", {"slug": SLUG, "hostKey": KEY})
    audit("awards", 9000)
    audit("awards-names", 12000)
    mut("game:endNight", {"slug": SLUG, "hostKey": KEY})
    audit("goodnight", 6000)
    print("page errors:", errors[:3])
    browser.close()

json.dump(report, open(os.path.join(OUT, "report.json"), "w"), indent=1)
flags = [r for r in report if r["issues"]]
print(f"\n{len(report)} screens, {len(flags)} flagged")
cx("admin:deleteTestGame", {"slug": SLUG})
