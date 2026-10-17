"""The party cast end-to-end, against the dev backend: a cast game's sign-up (tap your face and your name fills in,
the old drawings behind "Not on the list?"), test guests who are the cast, How to play dressed in the cast, and the
roll call introducing a cast member by name with no "played by".
  BASE=http://localhost:4174 python3 tests/e2e/cast.py
Screenshots go to $OUT (default ./e2e-out/cast).
"""
import json, os, re, subprocess, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = os.environ.get("SLUG", "cast-e2e")
OUT = os.environ.get("OUT", "e2e-out/cast")
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
        try:
            if fn():
                return True
        except Exception:
            pass
        time.sleep(0.3)
    return False

shot = lambda pg, name: pg.screenshot(path=os.path.join(OUT, name), full_page=True)

try:
    cx("admin:deleteTestGame", {"slug": SLUG})
except Exception:
    pass
created = cx("admin:createGame", {"slug": SLUG, "title": "The Velvet Room", "isTest": True, "makeActive": False,
                                  "registrationClosesAt": int(time.time() * 1000) + 7 * 864e5, "deadlineLabel": "Sat, Oct 31"})
KEY = created["hostKey"]
CAST = [f["key"] for s in cx("registration:figures", {"slug": SLUG}) for f in s["figures"]]
NAMES = [f["name"] for s in cx("registration:figures", {"slug": SLUG}) for f in s["figures"]]
roster = lambda: cx("host:roster", {"slug": SLUG, "hostKey": KEY})
phone = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []

    # Sign-up: only the cast, by name; tap your face, then your last name and nickname.
    pg = browser.new_context(**phone).new_page()
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{BASE}/?game={SLUG}")
    pg.get_by_role("button", name="Step inside").click(timeout=20000)
    ok(wait_for(lambda: pg.get_by_text("The guys", exact=True).count() == 1 and pg.get_by_text("The girls", exact=True).count() == 1), "the gallery: the guys, the girls")
    ok(pg.get_by_role("button", name=re.compile("Not on the list")).count() == 0, "no other drawings (the generic characters are gone)")
    ok(pg.locator(".figure-grid button").count() == len(CAST), f"only the cast shows ({pg.locator('.figure-grid button').count()} faces)")
    ok(pg.locator("#f-realName").count() == 0, "no name to type before you pick your face")
    shot(pg, "01-signup-cast.png")
    pg.get_by_role("radio", name="Josh", exact=True).click()
    pg.get_by_role("button", name="Next: last look").click()
    ok(wait_for(lambda: pg.get_by_text("Fill this in to continue.").count() == 1, 5), "the last name is required")
    pg.fill("#f-lastName", "Lee")
    # Oct 16: a typed "aka" is dropped (the narrator says a.k.a. itself).
    pg.fill("#f-nickname", "aka Two-Tone")
    ok(wait_for(lambda: pg.get_by_text("Josh “Two-Tone” Lee").count() >= 1, 5), "the name builds as you type: Josh “Two-Tone” Lee")
    shot(pg, "02-signup-josh.png")
    pg.get_by_role("button", name="Next: last look").click()
    ok(wait_for(lambda: pg.get_by_role("heading", name="Last look").count() == 1), "straight to the last look: no about-you page, no weapon pick")
    ok(pg.locator("#f-who, #f-signature, #f-photo, .weapon-grid").count() == 0, "no who-you-are, signature, photo or weapon fields")
    ok("Josh “Two-Tone” Lee" in pg.locator(".card").inner_text(), "the last-look card shows the full name")
    shot(pg, "03-signup-last-look.png")
    pg.get_by_role("button", name="Put me on the list").click()
    pg.wait_for_url(re.compile(r"/p/[a-z0-9]+$"), timeout=15000)
    token = pg.url.rsplit("/", 1)[1]
    me = cx("registration:me", {"token": token})
    ok(me["charName"] == "Josh “Two-Tone” Lee" and me["realName"] == "Josh Lee" and me["figure"] == "josh", f"signed up as {me['charName']}")

    # Test guests are the cast; everyone in, the show starts.
    cx("game:seedFakeCast", {"slug": SLUG, "guests": 6, "markers": 8, "seed": 31, "checkIn": True})
    guests = cx("admin:testPlayers", {"slug": SLUG})
    names = [g["charName"] for g in guests]
    ok(all(any(n.startswith(cx_name) for cx_name in NAMES) for n in names), f"test guests are the cast: {names}")
    host = browser.new_context(viewport={"width": 1600, "height": 900}).new_page()
    host.on("pageerror", lambda e: errors.append(str(e)))
    host.goto(f"{BASE}/host?game={SLUG}&key={KEY}")
    host.get_by_role("button", name="Play").click(timeout=20000)
    ok(wait_for(lambda: host.locator(".hs-lobby").count() == 1), "Play opens the doors")
    host.wait_for_timeout(1500)
    shot(host, "05-lobby.png")
    host.locator(".hs-lobby button").click()
    host.locator(".hs-lobby button").first.click()  # Oct 17: "Yes, begin" (the QR cards are hidden)
    ok(wait_for(lambda: roster()["game"]["status"] == "playing", 20), "Everyone is in starts the show")

    def skip(label):
        # The menu's label follows the clock, and this machine's clock can trail the server's by a second or two.
        host.locator(".hs-menu-btn").click()
        btn = host.get_by_role("button", name=label)
        ok(wait_for(lambda: btn.count() == 1, 8), f"the host menu offers {label}")
        btn.click()

    # How to play: the cards that used the old drawings show the cast.
    if host.locator(".tv-how").count() == 0:
        skip("Skip to How to play")
    cast_re = re.compile(r"/art/(faces/)?(" + "|".join(CAST) + r")\.webp")
    def how_is_cast():
        srcs = [host.locator(".tv-how-art img").nth(i).get_attribute("src") or "" for i in range(host.locator(".tv-how-art img").count())]
        return any(cast_re.search(s) for s in srcs)
    ok(wait_for(how_is_cast, 40), "How to play is dressed in the cast")
    host.wait_for_timeout(1200)
    shot(host, "06-how-cast.png")
    old = re.compile(r"/art/(flapper|dapper|bodyguard|lady|detective|slick)\.webp")
    seen_old = []
    end = time.time() + 25
    while time.time() < end and host.locator(".tv-how").count():
        for i in range(host.locator(".tv-how-art img").count()):
            s = host.locator(".tv-how-art img").nth(i).get_attribute("src") or ""
            if old.search(s):
                seen_old.append(s)
        time.sleep(0.5)
    ok(not seen_old, f"no old drawings in How to play ({set(seen_old)})")

    # The roll call: by name, no played by. (Oct 16 order: How to play, the murder, then the roll call.)
    if host.locator(".tv-how").count():
        skip("Skip to the murder")
        host.wait_for_timeout(1500)
    skip("Skip to the roll call")
    ok(wait_for(lambda: host.locator(".tv-roll").count() == 1, 30), "the roll call starts")
    ok(wait_for(lambda: host.locator(".tv-roll h2").count() == 1, 15), "a guest's card")
    host.wait_for_timeout(1500)
    ok(host.locator(".tv-played").count() == 0, "no Played by on a cast member's card")
    shot(host, "07-roll-cast.png")
    ok(not errors, f"no page errors {errors[:2]}")
    browser.close()

cx("admin:deleteTestGame", {"slug": SLUG})
print("\n" + ("all passed" if not fails else f"{len(fails)} failed: " + "; ".join(fails)))
raise SystemExit(1 if fails else 0)
