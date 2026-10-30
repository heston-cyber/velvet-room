"""The round screens with the house map (Oct 29, Heston's test: in Round 2 the map ran off the right edge and so did
"Waiting on Brendan, Holden,"). Against the dev backend: 8 guests, most of them Ready so the TV names who it's waiting
on, at three TV sizes in Rounds 1, 2 and 3. Checks the map and the round bar stay on screen, and the usual overlaps.
  BASE=http://localhost:4174 python3 tests/e2e/round_map.py
Screenshots go to $OUT (default ./e2e-out/round_map).
"""
import json, os, subprocess, time
from playwright.sync_api import sync_playwright
from ui_audit import AUDIT

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = os.environ.get("SLUG", "round-map-e2e")
OUT = os.environ.get("OUT", "e2e-out/round_map")
GUESTS = int(os.environ.get("GUESTS", "8"))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.makedirs(OUT, exist_ok=True)
ENV = dict(os.environ)
for line in open(os.path.join(ROOT, ".env.local")):
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1)
        ENV[k] = v.split(" #")[0]

fails = []
def ok(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg, flush=True)
    if not cond:
        fails.append(msg)

def cx(fn, args):
    r = subprocess.run(["npx", "convex", "run", fn, json.dumps(args)], cwd=ROOT, env=ENV, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f"{fn}: {r.stderr[-400:]}")
    out = r.stdout.strip()
    starts = [i for i in (out.find("{"), out.find("[")) if i >= 0]
    if not starts:
        return out or None
    try:
        return json.loads(out[min(starts):])
    except Exception:
        return out

try:
    cx("admin:deleteTestGame", {"slug": SLUG})
except Exception:
    pass
KEY = cx("admin:createGame", {"slug": SLUG, "title": "The Velvet Room", "isTest": True, "makeActive": False,
                              "registrationClosesAt": int(time.time() * 1000) + 7 * 864e5, "deadlineLabel": "Sat, Oct 31"})["hostKey"]
cx("game:seedFakeCast", {"slug": SLUG, "guests": GUESTS, "markers": 10, "seed": 29, "checkIn": True})
guests = cx("admin:testPlayers", {"slug": SLUG})
cx("game:openDoors", {"slug": SLUG, "hostKey": KEY})
cx("game:startGame", {"slug": SLUG, "hostKey": KEY})
cx("game:skipIntro", {"slug": SLUG, "hostKey": KEY})

EDGE = """() => {
  const W = innerWidth, out = [];
  for (const sel of ['.tv-map', '.tv-roundbar', '.tv-ready', '.tv-meter', '.tv-cards']) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > W + 1 || r.left < -1)) out.push(`${sel} runs off the screen (${Math.round(r.left)} to ${Math.round(r.right)} of ${W})`);
    }
  }
  return out;
}"""

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    for rnd in (1, 2, 3):
        if rnd > 1:
            cx("game:advanceRound", {"slug": SLUG, "hostKey": KEY})
        # Most are Ready, so the TV says who it's waiting on.
        for g in guests[: GUESTS - 3]:
            cx("game:setReady", {"token": g["token"], "ready": True})
        for (w, h) in ((1920, 1080), (1366, 768), (1280, 720)):
            pg = browser.new_context(viewport={"width": w, "height": h}).new_page()
            pg.on("pageerror", lambda e: errors.append(str(e)))
            pg.goto(f"{BASE}/host?game={SLUG}&key={KEY}")
            pg.wait_for_selector(".tv-map", timeout=30000)
            pg.wait_for_timeout(9000 if rnd > 1 else 3000)
            name = f"r{rnd}-{w}x{h}.png"
            pg.screenshot(path=os.path.join(OUT, name))
            off = pg.evaluate(EDGE)
            ok(not off, f"Round {rnd} at {w}x{h}: the map and round bar stay on screen {off[:2]}")
            issues = pg.evaluate(AUDIT, "top")
            # Below 1920 wide everything on the TV scales down with it, so the size notes (small buttons, tiny text)
            # are expected there; anything on top of anything else still fails.
            small = w < 1920 and [i for i in issues if i.startswith(("small button", "tiny text"))]
            if small:
                print(f"  (note at {w}x{h}: {small[:2]})")
            issues = [i for i in issues if not (small and i in small)]
            ok(not issues, f"Round {rnd} at {w}x{h}: laid out cleanly {issues[:3]}")
            ready = pg.locator(".tv-ready").inner_text() if pg.locator(".tv-ready").count() else ""
            print(f"  ({name}: \"{ready}\")")
            pg.context.close()
    ok(not errors, f"no page errors {errors[:2]}")
    browser.close()

cx("admin:deleteTestGame", {"slug": SLUG})
print("\n" + ("all passed" if not fails else f"{len(fails)} failed: " + "; ".join(fails)))
raise SystemExit(1 if fails else 0)
