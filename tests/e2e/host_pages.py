"""Laptop look-over (Oct 20, Heston: "give the UI and interface a good look over"): the host's own pages at common laptop
sizes. /host (start a game, start a test game with bots), the title screen and Options, checked top and bottom for
sideways scrolling, cut-off text, things on top of each other and small buttons.
  BASE=http://localhost:4174 python3 tests/e2e/host_pages.py
Screenshots and a report go to $OUT (default ./e2e-out/host-pages).
"""
import json, os, subprocess
from playwright.sync_api import sync_playwright
from ui_audit import AUDIT

BASE = os.environ.get("BASE", "http://localhost:4173")
OUT = os.environ.get("OUT", "e2e-out/host-pages")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.makedirs(OUT, exist_ok=True)
ENV = dict(os.environ)
for line in open(os.path.join(ROOT, ".env.local")):
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1)
        ENV[k] = v.split(" #")[0]
SIZES = [("1024", 1024, 768), ("1280", 1280, 800), ("1440", 1440, 900), ("1920", 1920, 1080)]
report = []


def cx(fn, args):
    r = subprocess.run(["npx", "convex", "run", fn, json.dumps(args)], cwd=ROOT, env=ENV, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f"{fn}: {r.stderr[-400:]}")


def look(pg, label):
    pg.wait_for_timeout(900)
    pg.evaluate("() => document.querySelectorAll('details').forEach((d) => d.open = true)")
    pg.wait_for_timeout(300)
    for end in ("top", "bottom"):
        # The page, and any panel that scrolls on its own (Options scrolls inside the screen).
        pg.evaluate("""(end) => {
          window.scrollTo(0, end === 'top' ? 0 : document.documentElement.scrollHeight);
          for (const el of document.querySelectorAll('body *')) {
            const cs = getComputedStyle(el);
            if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) el.scrollTop = end === 'top' ? 0 : el.scrollHeight;
          }
        }""", end)
        pg.wait_for_timeout(300)
        # A mouse, not a thumb: small buttons are fine on the laptop.
        issues = [i for i in pg.evaluate(AUDIT, end) if not i.startswith(("tiny text", "small button"))]
        name = f"{label}-{end}.png"
        pg.screenshot(path=os.path.join(OUT, name))
        report.append({"screen": name, "issues": issues})
        print(("OK   " if not issues else "FLAG ") + name + ("" if not issues else "\n       " + "\n       ".join(issues)), flush=True)
        if pg.evaluate("() => document.documentElement.scrollHeight <= window.innerHeight + 2 && ![...document.querySelectorAll('body *')].some((el) => /(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight + 4)"):
            break


slugs = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    for size, w, h in SIZES:
        pg = browser.new_context(viewport={"width": w, "height": h}).new_page()
        pg.goto(f"{BASE}/host")
        pg.get_by_text("Test it solo, with bots").wait_for(timeout=20000)
        look(pg, f"01-host-{size}")
        if size == "1280":
            pg.get_by_role("button", name="Start a test game with 7 bots").click()
            pg.get_by_role("button", name="Play").wait_for(timeout=20000)
            slugs.append(pg.evaluate("() => JSON.parse(localStorage.getItem('velvet-room:host-current'))"))
            look(pg, f"02-title-{size}")
            pg.get_by_role("button", name="Options").click()
            pg.locator(".hx-bots").wait_for(timeout=10000)
            look(pg, f"03-options-{size}")
            opts = pg.url
            for s2, w2, h2 in SIZES:
                if s2 == size:
                    continue
                q = browser.new_context(viewport={"width": w2, "height": h2}).new_page()
                q.add_init_script(f"localStorage.setItem('velvet-room:host-keys', {json.dumps(pg.evaluate('() => localStorage.getItem(`velvet-room:host-keys`)'))}); localStorage.setItem('velvet-room:host-current', {json.dumps(pg.evaluate('() => localStorage.getItem(`velvet-room:host-current`)'))});")
                q.goto(opts)
                q.get_by_role("button", name="Options").click(timeout=20000)
                q.locator(".hx-bots").wait_for(timeout=10000)
                look(q, f"03-options-{s2}")
    browser.close()

json.dump(report, open(os.path.join(OUT, "report.json"), "w"), indent=1)
print(f"\n{len(report)} screens, {len([r for r in report if r['issues']])} flagged")
for s in slugs:
    try:
        cx("admin:deleteTestGame", {"slug": s})
    except Exception as e:
        print("cleanup:", e)
