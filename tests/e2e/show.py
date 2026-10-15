"""The v2 show end-to-end, against the dev backend: the host presses Play and Everyone is in, then the TV
(the host screen) runs the intro, How to play, the roll call and "check your phones" before Round 1. Phones
wait on "Eyes on the TV" until the roles are out. The host skips through the parts from the host menu.
  BASE=http://localhost:4174 [TONE=adult] python3 tests/e2e/show.py
Screenshots go to $OUT (default ./e2e-out/show).
"""
import json, os, subprocess, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = os.environ.get("SLUG", "show-e2e")
OUT = os.environ.get("OUT", "e2e-out/show")
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

shot = lambda pg, name: pg.screenshot(path=os.path.join(OUT, name))

try:
    cx("admin:deleteTestGame", {"slug": SLUG})
except Exception:
    pass
created = cx("admin:createGame", {"slug": SLUG, "title": "The Velvet Room", "isTest": True, "makeActive": False,
                                  "registrationClosesAt": int(time.time() * 1000) + 7 * 864e5, "deadlineLabel": "Sat, Oct 31"})
KEY = created["hostKey"]
TONE = os.environ.get("TONE", "classic")  # TONE=adult runs the adult script
cx("host:updateSettings", {"slug": SLUG, "hostKey": KEY, "tone": TONE})
cx("game:seedFakeCast", {"slug": SLUG, "guests": 6, "markers": 8, "seed": 21, "checkIn": False})
guests = cx("admin:testPlayers", {"slug": SLUG})
roster = lambda: cx("host:roster", {"slug": SLUG, "hostKey": KEY})

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    phone = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
    phone.on("pageerror", lambda e: errors.append(str(e)))
    phone.goto(f"{BASE}/p/{guests[0]['token']}")
    phone.wait_for_selector("text=See you inside", timeout=15000)

    host = browser.new_context(viewport={"width": 1600, "height": 900}).new_page()
    host.on("pageerror", lambda e: errors.append(str(e)))
    host.goto(f"{BASE}/host?game={SLUG}&key={KEY}")
    host.get_by_role("button", name="Play").click(timeout=20000)
    ok(wait_for(lambda: host.locator(".hs-lobby").count() == 1), "Play opens the doors")
    cx("game:seedFakeCast", {"slug": SLUG, "guests": 0, "markers": 0, "checkIn": True})
    ok(wait_for(lambda: phone.get_by_text("You're in").count() == 1, 20), "the guest's phone is let in")
    ok(wait_for(lambda: "6" in host.locator(".hs-count").inner_text()), "6 guests are in")
    host.locator(".hs-lobby button").click()
    host.locator(".hs-lobby button").click()
    ok(wait_for(lambda: roster()["game"]["status"] == "playing", 20), "Everyone is in starts the show")

    # The intro.
    ok(wait_for(lambda: host.get_by_text("Chicago · October, 1929").count() == 1, 10), "the intro opens on Chicago, 1929")
    ok(wait_for(lambda: phone.get_by_text("Eyes on the TV").count() >= 1, 15), "the phone says eyes on the TV, no role yet")
    ok(phone.get_by_text("Press and hold").count() == 0, "no role card on the phone during the show")
    shot(phone, "01-phone-wait.png")
    g = roster()["game"]
    show = g["show"]
    ok(show and show["howAt"] - g["introEndsAt"] < 0, f"the show has its parts ({show})")
    # Wait into the third beat to see the weapons in play.
    time.sleep(max(0, (show["howAt"] - 9_000) / 1000 - time.time()))
    ok(wait_for(lambda: host.locator(".tv-wrow .tv-wcard").count() == 6, 15), "the intro shows the 6 weapons in play")
    host.wait_for_timeout(2500)
    shot(host, "02-intro-weapons.png")

    def skip(label):
        host.locator(".hs-menu-btn").click()
        btn = host.get_by_role("button", name=label)
        ok(btn.count() == 1, f"the host menu offers {label}")
        ok(host.get_by_role("button", name="Pause the game").count() == 0, "no pause button during the show")
        btn.click()

    # How to play (it may already be on).
    if host.locator(".tv-how").count() == 0:
        skip("Skip to How to play")
    ok(wait_for(lambda: host.locator(".tv-how").count() == 1, 10), "How to play is on")
    ok(wait_for(lambda: "how to play · 1 of 10" in host.locator(".tv-how").inner_text().lower(), 10), "ten How to play cards")
    host.wait_for_timeout(1200)
    shot(host, "03-how-1.png")
    # Step through: the weapons card and the jail card.
    seen = set()
    end = time.time() + 120
    while time.time() < end and not {"weapons", "bars"} <= seen:
        if host.locator(".tv-wfan").count():
            if "weapons" not in seen:
                host.wait_for_timeout(1000)
                shot(host, "04-how-weapons.png")
            seen.add("weapons")
        if host.locator(".tv-jailed").count():
            if "bars" not in seen:
                host.wait_for_timeout(1000)
                shot(host, "05-how-jail.png")
            seen.add("bars")
        time.sleep(0.4)
    ok("weapons" in seen, "the weapons card shows a fan of weapons")
    ok("bars" in seen, "the jail card shows a guest behind bars")
    ok(host.locator(".tv-jailed img.bars").count() == 1, "the bars sit over the drawing")

    # The roll call.
    skip("Skip to the roll call")
    ok(wait_for(lambda: host.get_by_text("The doors are locked.").count() == 1, 12), "the roll call opens: the doors are locked")
    ok(wait_for(lambda: host.locator(".tv-roll.v2").count() == 1, 25), "the first guest's roll call card")
    host.wait_for_timeout(9000)
    shot(host, "06-roll-guest.png")
    card = host.locator(".tv-roll.v2").inner_text().lower()
    ok("weapon" in card and "motive" in card and "signature" in card, "the card has signature, weapon and motive")
    ok(host.locator(".tv-roll-fig .tv-wcard.hip").count() == 1, "the weapon card sits with the drawing")
    fig = host.locator(".tv-roll-fig > img").bounding_box()
    wc = host.locator(".tv-wcard.hip").bounding_box()
    if fig and wc:
        ratio = wc["height"] / fig["height"]
        mid = (wc["y"] + wc["height"] / 2 - fig["y"]) / fig["height"]
        ok(0.2 <= ratio <= 0.32, f"the weapon card is about a quarter of the drawing's height ({ratio:.2f})")
        ok(0.42 <= mid <= 0.66, f"at hip level ({mid:.2f} down the drawing)")
    ok(host.locator(".tv-roast").count() == 1, "the roast is on the card")
    ok(wait_for(lambda: host.locator(".tv-roast").evaluate("e => getComputedStyle(e).opacity") == "1", 30), "the roast comes in with the voice")
    host.wait_for_timeout(500)
    shot(host, "06b-roll-roast.png")
    ok(phone.get_by_text("Eyes on the TV").count() >= 1, "the phone still waits during the roll call")
    g = roster()["game"]
    ok(g["show"]["phonesAt"] is not None, "the roll call's turns are fixed once it begins")

    # Check your phones.
    skip("Skip to the roles")
    ok(wait_for(lambda: host.get_by_text("Press and hold your card.").count() == 1, 10), "the TV says check your phone")
    ok(wait_for(lambda: phone.get_by_text("Press and hold to read it.").count() == 1, 15), "the role card arrives on the phone")
    shot(host, "07-phones.png")
    shot(phone, "08-phone-role.png")

    # Round 1.
    skip("Begin Round 1")
    ok(wait_for(lambda: host.get_by_text("Find the markers.").count() == 1, 15), "Round 1 begins")
    host.wait_for_timeout(5000)
    ok(host.locator(".tv-split .tv-wcard").count() == 6, "Round 1 lists the weapons in play")
    shot(host, "09-round1.png")
    clips = cx("voice:clipsOf", {"slug": SLUG})
    roll = [c for c in clips if c["purpose"].startswith("roll:")]
    ok(len(roll) == 6, f"a roll call voice for each guest ({len(roll)}; ready: {sum(1 for c in roll if c['status'] == 'ready')})")
    ok(not errors, f"no page errors {errors[:2]}")
    browser.close()

cx("admin:deleteTestGame", {"slug": SLUG})
print("\n" + ("all passed" if not fails else f"{len(fails)} failed: " + "; ".join(fails)))
raise SystemExit(1 if fails else 0)
