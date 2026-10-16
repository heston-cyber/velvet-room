"""Anyone can host (Heston, Oct 16: "the host goes to the host link and anyone can start a game and play. it will
generate a code and everyone can join to play. just like jackbox.tv games work"). A stranger's first night, on the
dev backend: the main page, Host a game, Start a new game, its own sign-up link, a guest signing up ahead with it,
Switch game, a test game's link, Play, the room code, a walk-in at the door. Plus a laptop that kept the old single
host link.
  BASE=http://localhost:4174 python3 tests/e2e/host_start.py
Screenshots go to $OUT (default ./e2e-out/host_start).
"""
import json, os, re, subprocess, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173")
OUT = os.environ.get("OUT", "e2e-out/host_start")
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
    return json.loads(out[min(starts):]) if starts else (out or None)

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

text = lambda pg: pg.evaluate("() => document.body.textContent")
shot = lambda pg, name: pg.screenshot(path=os.path.join(OUT, name))
TEST = "hoststart-test"
try:
    cx("admin:deleteTestGame", {"slug": TEST})
except Exception:
    pass
far = int(time.time() * 1000) + 7 * 864e5
T = cx("admin:createGame", {"slug": TEST, "title": "Rehearsal Night (test 3)", "isTest": True, "makeActive": False, "registrationClosesAt": far, "deadlineLabel": "Sat, Oct 31"})

def sign_up(pg, last):
    """The full sign-up, from the door of the form to the guest's own page."""
    pg.get_by_role("button", name="Step inside").click(timeout=15000)
    pg.locator(".figure-grid button:not([disabled])").first.click()
    pg.fill("#f-lastName", last)
    pg.get_by_role("button", name="Next: your character").click()
    pg.fill("#f-who", "Here for the gin."); pg.fill("#f-signature", "A borrowed hat")
    pg.get_by_role("button", name="Next: motive and secret").click()
    pg.get_by_role("button", name="Next: your weapon").click()
    pg.locator(".weapon-grid button:not([disabled])").first.click(timeout=15000)
    pg.get_by_role("button", name="Next: review").click()
    pg.get_by_role("button", name="Put me on the list").click()
    pg.wait_for_url(re.compile(r"/p/[a-z0-9]+$"), timeout=15000)

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    phone = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    laptop = browser.new_context(viewport={"width": 1600, "height": 900}).new_page()
    laptop.on("pageerror", lambda e: errors.append(str(e)))

    # The main page has no game of its own.
    laptop.goto(f"{BASE}/")
    ok(wait_for(lambda: laptop.get_by_role("button", name="Join a game").count() == 1 and laptop.get_by_role("button", name="Host a game").count() == 1),
       "the main page offers Join a game and Host a game")
    ok("Don Ray Sanders requests" not in text(laptop), "and no party's invitation")
    shot(laptop, "01-main-page.png")
    laptop.get_by_role("button", name="Host a game").click()
    ok(wait_for(lambda: laptop.get_by_role("button", name="Start a new game").count() == 1), "Host a game: a laptop with no game sees Start a new game")
    shot(laptop, "02-host-front-door.png")

    # Start a new game.
    laptop.get_by_role("button", name="Start a new game").click()
    ok(wait_for(lambda: laptop.get_by_role("button", name="Play").count() == 1, 20), "Start a new game opens its title screen")
    slug = laptop.evaluate("() => JSON.parse(localStorage.getItem('velvet-room:host-current'))")
    key = laptop.evaluate("(s) => JSON.parse(localStorage.getItem('velvet-room:host-keys'))[s]", slug)
    ok(bool(re.match(r"^party-[a-z0-9]{6}$", slug or "")) and bool(key), f"its own game and host key ({slug})")
    ok("Test game" not in text(laptop), "a real game, not a test game")
    shot(laptop, "03-new-game-title.png")
    laptop.get_by_role("button", name="Options").click()
    ok(wait_for(lambda: laptop.locator(".hx-link code").count() == 1), "Options has the sign-up link")
    link = laptop.locator(".hx-link code").inner_text()
    ok(link.endswith(f"/?game={slug}"), f"the sign-up link names this game ({link})")
    shot(laptop, "04-options.png")
    laptop.get_by_role("button", name="Back").first.click()
    ok(wait_for(lambda: laptop.get_by_role("button", name="Play").count() == 1), "Back to the title screen")

    # A guest signs up ahead of time with the link.
    ana = browser.new_context(**phone).new_page(); ana.on("pageerror", lambda e: errors.append(str(e)))
    ana.goto(f"{BASE}/?game={slug}")
    ana.get_by_role("button", name="Step inside").wait_for(timeout=15000)
    ana.get_by_role("button", name="Step inside").click()
    ok(wait_for(lambda: ana.get_by_role("radio").count() == 16), "the sign-up link shows the 16 faces")
    ana.goto(f"{BASE}/?game={slug}")
    sign_up(ana, "Ruiz")
    roster = cx("host:roster", {"slug": slug, "hostKey": key})
    ok(len(roster["players"]) == 1, f"the host's guest list has her ({len(roster['players'])})")

    # Reload: the laptop stays on its game. Switch game: its games, and Start a new game, without bouncing back.
    laptop.reload()
    ok(wait_for(lambda: laptop.get_by_role("button", name="Play").count() == 1, 20), "a reload keeps the laptop's game")
    laptop.get_by_role("button", name="Switch game").click()
    ok(wait_for(lambda: laptop.get_by_role("button", name="Start a new game").count() == 1 and "Your games on this laptop" in text(laptop)), "Switch game lists this laptop's games")
    laptop.wait_for_timeout(2500)
    ok(laptop.get_by_role("button", name="Start a new game").count() == 1, "and stays there (no jumping back into the game)")
    ok("1 signed up" in text(laptop) and "Not started" in text(laptop), "each game shows how far along it is")
    shot(laptop, "05-switch-game.png")

    # A test game's full link opens it and joins the list.
    laptop.goto(f"{BASE}/host?game={TEST}&key={T['hostKey']}")
    ok(wait_for(lambda: "Rehearsal Night" in text(laptop) and laptop.get_by_role("button", name="Play").count() == 1, 20), "a full host link opens that game")
    ok(laptop.url.endswith("/host") and "key=" not in laptop.url, "and the key leaves the address bar")
    ok("(test 3)" not in text(laptop), "the title screen hides the bracketed note")
    laptop.get_by_role("button", name="Switch game").click()
    ok(wait_for(lambda: laptop.get_by_role("button", name="Open").count() == 2), "both games are on the list now")
    laptop.locator(".hs-games li", has_text="1 signed up").get_by_role("button", name="Open").click()
    ok(wait_for(lambda: laptop.get_by_role("button", name="Play").count() == 1 and "Rehearsal" not in text(laptop), 20), "Open goes back to the new game")

    # Play: the room code. Ana's open page lets her in; a walk-in joins with the code.
    laptop.get_by_role("button", name="Play").click()
    ok(wait_for(lambda: laptop.locator(".hs-lobby").count() == 1, 20), "Play opens the doors")
    code = cx("host:roster", {"slug": slug, "hostKey": key})["game"]["roomCode"]
    ok(bool(re.match(r"^[A-Z]{4}$", code or "")), f"Play made the room code ({code})")
    ok(wait_for(lambda: code in text(laptop)), "the room code is on the TV")
    shot(laptop, "06-lobby-code.png")
    ok(wait_for(lambda: ana.get_by_text("You're in", exact=True).count() == 1, 25), "the guest who signed up ahead is let in")
    walk = browser.new_context(**phone).new_page(); walk.on("pageerror", lambda e: errors.append(str(e)))
    walk.goto(f"{BASE}/")
    walk.get_by_role("button", name="Join a game").click()
    walk.fill("#roomcode", code.lower())
    walk.get_by_role("button", name="New here? Sign up").click(timeout=15000)
    sign_up(walk, "Inman")
    ok(wait_for(lambda: walk.get_by_text("You're in", exact=True).count() == 1, 20), "a walk-in joins with the code from the main page")
    ok(wait_for(lambda: "2" in laptop.locator(".hs-count").inner_text()), "the host screen counts 2 guests in")
    shot(walk, "07-walkin-in.png")

    # A laptop that kept the old single host link (before Oct 16) opens that game.
    old = browser.new_context(viewport={"width": 1600, "height": 900}).new_page(); old.on("pageerror", lambda e: errors.append(str(e)))
    old.goto(f"{BASE}/join")
    old.evaluate("(l) => { localStorage.clear(); localStorage.setItem('velvet-room:host-link', JSON.stringify(l)); }", {"slug": TEST, "hostKey": T["hostKey"]})
    old.goto(f"{BASE}/host")
    ok(wait_for(lambda: "Rehearsal Night" in text(old) and old.get_by_role("button", name="Play").count() == 1, 20), "a laptop with the old saved link opens its game")
    ok(not errors, f"no page errors {errors[:2]}")
    browser.close()

try:
    cx("admin:deleteTestGame", {"slug": TEST})
except Exception:
    pass
print("\n" + ("all passed" if not fails else f"{len(fails)} failed: " + "; ".join(fails)))
raise SystemExit(1 if fails else 0)
