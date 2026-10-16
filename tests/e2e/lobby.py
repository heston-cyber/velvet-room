"""The v2 lobby end-to-end, against the dev backend: the host screen's title has Play (opens the doors) with Options under it; a guest who
signed up earlier and has their page open is let in on their own; a walk-in types the room code, signs up on
the spot and is in; the host presses Everyone is in (twice) and the intro starts.
  BASE=http://localhost:4174 python3 tests/e2e/lobby.py
Screenshots go to $OUT (default ./e2e-out/lobby).
"""
import json, os, re, subprocess, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = os.environ.get("SLUG", "lobby-e2e")
OUT = os.environ.get("OUT", "e2e-out/lobby")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.makedirs(OUT, exist_ok=True)

fails = []
def ok(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg, flush=True)
    if not cond:
        fails.append(msg)

def cx(fn, args):
    env = dict(os.environ)
    for line in open(os.path.join(ROOT, ".env.local")):
        if "=" in line and not line.startswith("#"):
            k, v = line.strip().split("=", 1)
            env[k] = v.split(" #")[0]
    r = subprocess.run(["npx", "convex", "run", fn, json.dumps(args)], cwd=ROOT, env=env, capture_output=True, text=True, timeout=120)
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

def wait_for(fn, secs=15):
    end = time.time() + secs
    while time.time() < end:
        if fn():
            return True
        time.sleep(0.3)
    return False

shot = lambda pg, name: pg.screenshot(path=os.path.join(OUT, name))

try:
    cx("admin:deleteTestGame", {"slug": SLUG})
except Exception:
    pass
created = cx("admin:createGame", {"slug": SLUG, "title": "Lobby e2e", "isTest": True, "makeActive": False,
                                  # sign-ups closed already: the walk-in gets in with the room code anyway
                                  "registrationClosesAt": int(time.time() * 1000) + 7 * 864e5, "deadlineLabel": "Sat, Oct 31"})
KEY = created["hostKey"]
cx("game:seedFakeCast", {"slug": SLUG, "guests": 3, "markers": 6, "seed": 5, "checkIn": False})
free_fig = lambda: next(f["key"] for s in cx("registration:figures", {"slug": SLUG}) for f in s["figures"] if not f["taken"])
free_weapon = lambda: next(w["key"] for w in cx("registration:weapons", {"slug": SLUG}) if not w["taken"])
ana = cx("registration:register", {"slug": SLUG, "realName": "Ana Ruiz", "charName": "Velma Kowalski", "who": "Cigarette girl.", "signature": "Silver case",
                                   "weapon": free_weapon(), "killerOk": True, "figure": free_fig()})["token"]
cx("host:updateSettings", {"slug": SLUG, "hostKey": KEY, "registrationOpen": False})

with sync_playwright() as p:
    browser = p.chromium.launch()
    phone = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    errors = []

    # Ana signed up earlier and has her page open, waiting at the door.
    a = browser.new_context(**phone).new_page(); a.on("pageerror", lambda e: errors.append(str(e)))
    a.goto(f"{BASE}/p/{ana}")
    a.wait_for_selector("text=See you inside", timeout=15000)
    ok(a.get_by_text("you're let in automatically").count() == 1, "before the party, the guest page says they'll be let in automatically")

    host = browser.new_context(viewport={"width": 1600, "height": 900}).new_page(); host.on("pageerror", lambda e: errors.append(str(e)))
    host.goto(f"{BASE}/host?game={SLUG}&key={KEY}")
    host.get_by_role("button", name="Play").wait_for(timeout=20000)
    ok(host.get_by_role("button", name="Options").count() == 1, "Options sits under Play on the title screen")
    ok(host.get_by_role("button", name="Start").count() == 0, "no separate Start screen")
    shot(host, "00-host-title.png")
    host.get_by_role("button", name="Options").click()
    host.get_by_role("button", name="← Back").click()
    ok(host.get_by_role("button", name="Play").count() == 1, "Back from Options returns to the title")
    host.get_by_role("button", name="Play").click()
    ok(wait_for(lambda: host.locator(".hs-lobby").count() == 1), "Play opens the doors: the lobby bar is up")
    code = cx("host:roster", {"slug": SLUG, "hostKey": KEY})["game"]["roomCode"]
    ok(bool(code), f"the room code is out ({code})")

    ok(wait_for(lambda: a.get_by_text("You're in", exact=True).count() == 1, 20), "Ana's open page lets her in on its own")
    ok(a.get_by_text("Write").count() == 0 and a.get_by_text("bag").count() == 0, "no evidence bag or letter on the phone")
    shot(a, "01-ana-in.png")

    # A walk-in: types the code, taps New here, signs up.
    w = browser.new_context(**phone).new_page(); w.on("pageerror", lambda e: errors.append(str(e)))
    w.goto(f"{BASE}/join")
    w.fill("#roomcode", code.lower())
    w.get_by_role("button", name="New here? Sign up").click(timeout=15000)
    w.get_by_role("button", name="Step inside").wait_for(timeout=15000)
    ok(w.get_by_text("be quick").count() == 1, "the walk-in form says the game starts once everyone's in")
    shot(w, "01b-walkin-door.png")
    w.get_by_role("button", name="Step inside").click()
    w.locator(".figure-grid button:not([disabled])").first.click()
    w.fill("#f-lastName", "Inman")
    w.get_by_role("button", name="Next: your character").click()
    w.fill("#f-who", "Showed up uninvited."); w.fill("#f-signature", "Wet umbrella")
    w.get_by_role("button", name="Next: motive and secret").click()
    w.get_by_role("button", name="Next: your weapon").click()
    w.locator(".weapon-grid button:not([disabled])").first.click(timeout=15000)
    w.get_by_role("button", name="Next: review").click()
    w.get_by_role("button", name="Put me on the list").click()
    w.wait_for_url(re.compile(r"/p/[a-z0-9]+$"), timeout=15000)
    ok(wait_for(lambda: w.get_by_text("You're in", exact=True).count() == 1, 20), "the walk-in lands in the lobby, already in")
    shot(w, "02-walkin-in.png")

    ok(wait_for(lambda: "2" in host.locator(".hs-count").inner_text()), f"the host screen counts 2 guests in ({host.locator('.hs-count').inner_text()})")
    cx("game:seedFakeCast", {"slug": SLUG, "guests": 0, "markers": 0, "checkIn": True})
    ok(wait_for(lambda: "5" in host.locator(".hs-count").inner_text()), "and 5 once the test guests are in")
    shot(host, "03-host-lobby.png")
    host.locator(".hs-lobby button").click()
    ok("again" in host.locator(".hs-lobby button").inner_text().lower(), "Everyone is in asks for a second tap")
    host.locator(".hs-lobby button").click()
    ok(wait_for(lambda: cx("host:roster", {"slug": SLUG, "hostKey": KEY})["game"]["status"] == "playing", 20), "the second tap starts the game")
    ok(wait_for(lambda: host.locator(".hs-lobby").count() == 0), "the lobby bar goes away once the show starts")
    shot(host, "04-host-intro.png")
    ok(not errors, f"no page errors {errors[:2]}")
    browser.close()

cx("admin:deleteTestGame", {"slug": SLUG})
print("\n" + ("all passed" if not fails else f"{len(fails)} failed: " + "; ".join(fails)))
raise SystemExit(1 if fails else 0)
