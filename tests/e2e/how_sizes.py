"""How to play v5 (Oct 30) at three TV sizes, against the dev backend: 8 guests, the show starts, and every card is
checked for overlaps and for anything running off the screen at 1920x1080, 1366x768 and 1280x720.
  BASE=http://localhost:4174 python3 tests/e2e/how_sizes.py
Screenshots go to $OUT (default ./e2e-out/how_sizes). Takes about 3 minutes.
"""
import json, os, subprocess, time
from playwright.sync_api import sync_playwright
from ui_audit import AUDIT

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = os.environ.get("SLUG", "how-sizes-e2e")
OUT = os.environ.get("OUT", "e2e-out/how_sizes")
TONE = os.environ.get("TONE", "classic")
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
cx("game:seedFakeCast", {"slug": SLUG, "guests": 8, "markers": 10, "seed": 30, "checkIn": True})
cx("host:updateSettings", {"slug": SLUG, "hostKey": KEY, "tone": TONE})
cx("game:openDoors", {"slug": SLUG, "hostKey": KEY})
cx("game:startGame", {"slug": SLUG, "hostKey": KEY})

# Anything that runs off the screen (the audit's off-stage check covers the drawings; this covers the cards' parts).
EDGE = """() => {
  const W = innerWidth, H = innerHeight, out = [];
  for (const sel of ['.tv-how-art', '.tv-how-text', '.tv-how-title', '.tv-how .tv-rule', '.tv-how .tv-map', '.tv-how-scan']) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (r.width && (r.right > W + 1 || r.left < -1 || r.bottom > H + 1 || r.top < -1)) out.push(`${sel} runs off the screen (${Math.round(r.left)},${Math.round(r.top)} to ${Math.round(r.right)},${Math.round(r.bottom)} of ${W}x${H})`);
    }
  }
  return out;
}"""

SIZES = ((1920, 1080), (1366, 768), (1280, 720))
with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    pages = []
    for (w, h) in SIZES:
        pg = browser.new_context(viewport={"width": w, "height": h}).new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"{BASE}/host?game={SLUG}&key={KEY}")
        pages.append(((w, h), pg))
    for _, pg in pages:
        pg.wait_for_selector(".tv-how", timeout=30000)
    titles = []
    end = time.time() + 240
    while time.time() < end:
        main = pages[0][1]
        if not main.locator(".tv-how").count():
            if titles:
                break
            time.sleep(0.3)
            continue
        t = main.locator(".tv-how-title")
        title = t.inner_text().strip() if t.count() else ""
        if title and (not titles or titles[-1] != title):
            titles.append(title)
            for (w, h), pg in pages:
                pg.wait_for_timeout(1400 if (w, h) == SIZES[0] else 200)
                name = f"{len(titles):02d}-{w}x{h}.png"
                pg.screenshot(path=os.path.join(OUT, name))
                off = pg.evaluate(EDGE)
                issues = pg.evaluate(AUDIT, "top")
                small = w < 1920 and [i for i in issues if i.startswith(("small button", "tiny text"))]
                issues = [i for i in issues if not (small and i in small)]
                # The "?" sits on the masked killer's face on purpose (screens.py's TV check counts the face as one piece).
                issues = [i for i in issues if i != 'img over text: img "" / b "?"']
                ok(not off and not issues, f"{title} at {w}x{h}: on screen and laid out cleanly {(off + issues)[:3]}")
        time.sleep(0.3)
    ok(len(titles) == 12, f"12 cards seen: {titles}")
    ok(not errors, f"no page errors {errors[:2]}")
    browser.close()

cx("admin:deleteTestGame", {"slug": SLUG})
print("\n" + ("all passed" if not fails else f"{len(fails)} failed: " + "; ".join(fails)))
raise SystemExit(1 if fails else 0)
