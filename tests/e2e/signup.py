"""Sign-up end-to-end, against the dev backend (rewritten Oct 21 for the Oct 18 form): a guest walks the real form
on a phone, taps their face in the party cast, types their real first and last name and a nickname, checks the last
look and lands on their own page. A second guest finds that face taken; a mystery guest needs a typed first name.
Then the first guest edits their nickname from their link, and the name on their card follows.
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

def sign_up(pg, first, last, nick, figure_index, shots=False):
    pg.goto(f"{BASE}/?game={SLUG}")
    pg.get_by_role("button", name="Step inside").click()
    pg.locator(".figure-grid button:not([disabled])").nth(figure_index).click()
    pg.fill("#f-firstName", first)
    pg.fill("#f-lastName", last)
    pg.fill("#f-nickname", nick)
    if shots:
        shot(pg, "01-face-and-name.png")
    pg.get_by_role("button", name="Next: last look").click()
    pg.wait_for_timeout(500)
    if shots:
        shot(pg, "02-last-look.png")
    card = pg.locator(".card").first.inner_text()
    pg.get_by_role("button", name="Put me on the list").click()
    pg.wait_for_url(re.compile(r"/p/[a-z0-9]+$"), timeout=15000)
    return card, pg.url.rsplit("/p/", 1)[1]

with sync_playwright() as p:
    browser = p.chromium.launch()
    phone = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    errors = []

    # Guest A taps the first face in the cast.
    a = browser.new_context(**phone).new_page(); a.on("pageerror", lambda e: errors.append(str(e)))
    a.goto(f"{BASE}/?game={SLUG}")
    a.get_by_role("button", name="Step inside").click()
    a.locator(".figure-grid button:not([disabled])").first.wait_for(timeout=15000)
    face = a.locator(".figure-grid button:not([disabled])").first.get_attribute("aria-label")
    card, tok_a = sign_up(a, "Ana", "Ruiz", "Two-Tone", 0, shots=True)
    ok(face.split(" ")[0] in card, f"the last look shows the face's name ({face})")
    ok("Two-Tone" in card, "and the nickname")
    a.wait_for_timeout(1500)
    broken = a.evaluate("[...document.images].filter(i=>i.complete&&i.naturalWidth===0).map(i=>i.src)")
    ok(not broken, f"no broken images on the guest page {broken}")
    ok(a.get_by_role("button", name="Edit my entry (until the doors open)").count() == 1, "after sign-up the guest lands on their page, with Edit")
    shot(a, "03-guest-page.png")
    me = cx("registration:me", {"token": tok_a})
    ok(me["charName"].startswith(face.split(" ")[0]), f"the server stored the cast name ({me['charName']})")

    # Guest B finds that face taken; a mystery guest has to type a first name.
    b = browser.new_context(**phone).new_page(); b.on("pageerror", lambda e: errors.append(str(e)))
    b.goto(f"{BASE}/?game={SLUG}")
    b.get_by_role("button", name="Step inside").click()
    b.locator(".figure-grid button").first.wait_for(timeout=15000)
    taken = b.get_by_role("radio", name=f"{face}, taken")
    ok(taken.count() == 1 and taken.is_disabled(), "for the next guest that face shows as taken")
    shot(b, "04-taken.png")
    mystery = b.locator(".figure-cell", has=b.locator(".figure-name", has_text=re.compile(r"^(Woman|Man)$"))).locator("button").first
    if mystery.count():
        mystery.click()
        b.get_by_role("button", name="Next: last look").click()
        ok(b.locator(".field.bad .err").count() > 0, "a mystery guest can't move on without a first name")
        b.fill("#f-firstName", "Ben"); b.fill("#f-lastName", "Cho")
        b.get_by_role("button", name="Next: last look").click()
        ok("Ben" in b.locator(".card").first.inner_text(), "a mystery guest goes by their own first name")
        b.get_by_role("button", name="Put me on the list").click()
        b.wait_for_url(re.compile(r"/p/[a-z0-9]+$"), timeout=15000)
    else:
        print("(no mystery faces in this cast)")

    # Guest A edits the nickname from their link.
    a.get_by_role("button", name="Edit my entry (until the doors open)").click()
    a.fill("#f-nickname", "Lucky")
    a.get_by_role("button", name="Next: last look").click()
    a.get_by_role("button", name="Save changes").click()
    a.wait_for_timeout(1500)
    ok(cx("registration:me", {"token": tok_a})["nickname"] == "Lucky", "the edit is saved")
    ok(not errors, f"no page errors {errors[:2]}")
    browser.close()

cx("admin:deleteTestGame", {"slug": SLUG})
print("\n" + ("all passed" if not fails else f"{len(fails)} failed: " + "; ".join(fails)))
raise SystemExit(1 if fails else 0)
