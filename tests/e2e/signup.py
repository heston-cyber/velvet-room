"""Sign-up end-to-end, against the dev backend: a guest walks the real form on a phone, picks a drawing and a
weapon from the pool, sees the weapon on their card, and a second guest finds that weapon taken. Then the first
guest switches weapons from their link, which frees the old one.
  BASE=http://localhost:4174 python3 tests/e2e/signup.py
Screenshots go to $OUT (default ./e2e-out/signup).
"""
import json, os, re, subprocess, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = os.environ.get("SLUG", "signup-e2e")
OUT = os.environ.get("OUT", "e2e-out/signup")
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

shot = lambda pg, name: pg.screenshot(path=os.path.join(OUT, name), full_page=True)

try:
    cx("admin:deleteTestGame", {"slug": SLUG})
except Exception:
    pass
cx("admin:createGame", {"slug": SLUG, "title": "Sign-up e2e", "isTest": True, "makeActive": False,
                        "registrationClosesAt": int(time.time() * 1000) + 7 * 864e5, "deadlineLabel": "Sat, Oct 31"})

def sign_up(pg, real, char, weapon, figure_index, shots=False):
    pg.goto(f"{BASE}/?game={SLUG}")
    pg.get_by_role("button", name="Step inside").click()
    pg.fill("#f-realName", real)
    pg.locator(".figure-grid button:not([disabled])").nth(figure_index).click()
    pg.get_by_role("button", name="Next: your character").click()
    pg.fill("#f-charName", char); pg.fill("#f-who", "Test guest."); pg.fill("#f-signature", "A hat")
    pg.get_by_role("button", name="Next: motive and secret").click()
    pg.get_by_role("button", name="Next: your weapon").click()
    pg.wait_for_selector(".weapon-grid button", timeout=15000)
    pg.wait_for_timeout(800)
    if shots:
        shot(pg, "01-weapon-step.png")
    pg.get_by_role("button", name="Next: review").click()
    nag = pg.locator(".field.bad .err").count() > 0 and pg.get_by_text("Pick a weapon to continue").is_visible()
    pg.get_by_role("radio", name=weapon, exact=True).click()
    pg.get_by_role("button", name="Next: review").click()
    pg.wait_for_timeout(500)
    if shots:
        shot(pg, "02-review.png")
    card = pg.locator(".card").inner_text()
    pg.get_by_role("button", name="Put me on the list").click()
    pg.wait_for_url(re.compile(r"/p/[a-z0-9]+$"), timeout=15000)
    return nag, card, pg.url.rsplit("/p/", 1)[1]

with sync_playwright() as p:
    browser = p.chromium.launch()
    phone = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    errors = []

    a = browser.new_context(**phone).new_page(); a.on("pageerror", lambda e: errors.append(str(e)))
    nag, card, tok_a = sign_up(a, "Ana Ruiz", "Velma Kowalski", "Candlestick", 0, shots=True)
    ok(nag, "the weapon step won't move on without a pick")
    ok("Candlestick" in card, "the review card shows the picked weapon")
    ok(a.locator(".weapon-grid button").count() == 0, "after sign-up the guest lands on their page")
    a.wait_for_selector(".card-weapon", timeout=10000)
    ok("Candlestick" in a.locator(".card-weapon").inner_text(), "the guest's own page shows their weapon with its picture")
    broken = a.evaluate("[...document.images].filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.src)")
    ok(not broken, f"no broken images on the guest page {broken}")
    shot(a, "03-guest-page.png")
    me = cx("registration:me", {"token": tok_a})
    ok(me["weapon"] == "candlestick" and me["weaponName"] == "Candlestick", "the server stored the weapon from the pool")

    # A second guest sees the Candlestick taken and can't pick it.
    b = browser.new_context(**phone).new_page(); b.on("pageerror", lambda e: errors.append(str(e)))
    b.goto(f"{BASE}/?game={SLUG}")
    b.get_by_role("button", name="Step inside").click()
    b.fill("#f-realName", "Ben Cho")
    b.locator(".figure-grid button:not([disabled])").first.click()
    b.get_by_role("button", name="Next: your character").click()
    b.fill("#f-charName", "Father Malone"); b.fill("#f-who", "Priest."); b.fill("#f-signature", "Rosary")
    b.get_by_role("button", name="Next: motive and secret").click()
    b.get_by_role("button", name="Next: your weapon").click()
    b.wait_for_selector(".weapon-grid button", timeout=15000)
    taken = b.get_by_role("radio", name="Candlestick, taken")
    ok(taken.count() == 1 and taken.is_disabled(), "for the next guest the Candlestick shows as taken")
    ok(b.locator(".weapon-grid button").count() == 22, "all 22 weapons are on the rack")
    shot(b, "04-taken.png")

    # The first guest switches to the Lawn Gnome from their link; the Candlestick frees up live.
    a.get_by_role("button", name="Edit my entry").click()
    for label in ["Next: your character", "Next: motive and secret", "Next: your weapon"]:
        a.get_by_role("button", name=label).click()
    ok(a.get_by_role("radio", name="Candlestick", exact=True).get_attribute("aria-checked") == "true", "editing starts with their weapon picked")
    a.get_by_role("radio", name="Lawn Gnome", exact=True).click()
    a.get_by_role("button", name="Next: review").click()
    a.get_by_role("button", name="Save changes").click()
    a.wait_for_selector(".card-weapon", timeout=10000)
    ok("Lawn Gnome" in a.locator(".card-weapon").inner_text(), "the switch shows on their page")
    freed = False
    end = time.time() + 10
    while time.time() < end and not freed:
        freed = b.get_by_role("radio", name="Candlestick", exact=True).count() == 1
        time.sleep(0.3)
    ok(freed, "the Candlestick frees up for the second guest without a reload")
    ok(b.get_by_role("radio", name="Lawn Gnome, taken").count() == 1, "and the Lawn Gnome is now taken")
    ok(not errors, f"no page errors {errors[:2]}")
    browser.close()

cx("admin:deleteTestGame", {"slug": SLUG})
print("\n" + ("all passed" if not fails else f"{len(fails)} failed: " + "; ".join(fails)))
raise SystemExit(1 if fails else 0)
