"""The accomplice is gone (Oct 16, Heston: "lets toggle off the accomplice for now, strike that role from everything.
that role is gone"), end-to-end against the dev backend with 8 guests: Options has no Killers setting, the lobby has
no accomplice note, How to play has five cards and no accomplice card, the phones get one killer and seven innocents,
the lock-in has no accomplice guess, and the reveal goes straight from the room to the verdict.
  BASE=http://localhost:4174 [TONE=adult] python3 tests/e2e/no_accomplice.py
Screenshots go to $OUT (default ./e2e-out/no-accomplice).
"""
import json, os, re, subprocess, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = os.environ.get("SLUG", "one-killer-e2e")  # a name without "accomplice": the sign-up link shows it
OUT = os.environ.get("OUT", "e2e-out/no-accomplice")
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
TONE = os.environ.get("TONE", "classic")
cx("host:updateSettings", {"slug": SLUG, "hostKey": KEY, "tone": TONE})
# An old client asking for the accomplice is ignored.
cx("host:updateSettings", {"slug": SLUG, "hostKey": KEY, "accomplice": True})
cx("game:seedFakeCast", {"slug": SLUG, "guests": 8, "markers": 8, "seed": 57, "checkIn": True})
guests = cx("admin:testPlayers", {"slug": SLUG})
roster = lambda: cx("host:roster", {"slug": SLUG, "hostKey": KEY})
ok(roster()["game"]["accomplice"] is False, "the host can't turn the accomplice on")

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    host = browser.new_context(viewport={"width": 1600, "height": 900}).new_page()
    host.on("pageerror", lambda e: errors.append(str(e)))
    host.goto(f"{BASE}/host?game={SLUG}&key={KEY}")

    # Options: no Killers setting.
    host.get_by_role("button", name="Options").click(timeout=20000)
    ok(wait_for(lambda: host.get_by_text("Ask guests if they're up for being the killer").count() == 1, 10), "Options is open")
    ok(host.get_by_role("button", name="Killer + accomplice (7+)").count() == 0, "no Killer + accomplice option")
    def mentions(pg):
        t = pg.inner_text("body")
        return [t[max(0, m.start() - 80):m.end() + 40].replace("\n", " ") for m in re.finditer("accomplice", t, re.I)]
    ok(not mentions(host), f"Options never mentions an accomplice {mentions(host)[:2]}")
    host.wait_for_timeout(600)
    shot(host, "01-options.png")
    host.get_by_role("button", name="Back").first.click()

    host.get_by_role("button", name="Play").click(timeout=20000)
    ok(wait_for(lambda: host.locator(".hs-lobby").count() == 1), "Play opens the doors")
    host.wait_for_timeout(1500)
    ok(not mentions(host), f"the lobby never mentions an accomplice {mentions(host)[:2]}")
    shot(host, "02-lobby.png")
    host.locator(".hs-lobby button").click()
    host.locator(".hs-lobby button").click()
    ok(wait_for(lambda: roster()["game"]["status"] == "playing", 20), "Everyone is in starts the show")
    ok(roster()["game"]["hasAccomplice"] is False, "the game has no accomplice")

    def skip(label):
        # The menu's label follows the clock, and this machine's clock can trail the server's by a second or two.
        host.locator(".hs-menu-btn").click()
        btn = host.get_by_role("button", name=label)
        ok(wait_for(lambda: btn.count() == 1, 8), f"the host menu offers {label}")
        btn.click()

    # How to play: five cards, none of them the accomplice.
    if host.locator(".tv-how").count() == 0:
        skip("Skip to How to play")
    ok(wait_for(lambda: "how to play · 1 of 5" in host.locator(".tv-how").inner_text().lower(), 10), "five How to play cards")
    seen, pair = [], False
    end = time.time() + 90
    while time.time() < end and host.locator(".tv-how").count():
        t = host.locator(".tv-how").inner_text().lower()
        seen.append(t)
        pair = pair or host.locator(".tv-how-pair").count() > 0
        if "5 of 5" in t:
            break
        host.wait_for_timeout(1000)
    ok(any("5 of 5" in t for t in seen), "How to play reached its last card")
    ok(not pair and not any("accomplice" in t for t in seen), "How to play never shows or mentions an accomplice")
    shot(host, "03-how.png")

    skip("Skip to the murder")
    host.wait_for_timeout(1500)
    skip("Skip to the roll call")
    host.wait_for_timeout(1500)
    skip("Skip to the roles")
    ok(wait_for(lambda: roster()["game"]["show"]["phonesAt"] is not None, 15), "the roles are out")
    roles = {}
    for g in guests:
        ph = cx("game:phone", {"token": g["token"]})
        roles[g["token"]] = (ph.get("briefing") or {}).get("role")
    ok(sorted(roles.values()) == ["innocent"] * 7 + ["killer"], f"one killer, seven innocents ({sorted(roles.values())})")
    killer = next(t for t, r in roles.items() if r == "killer")
    innocent = next(t for t, r in roles.items() if r == "innocent")
    kp = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
    kp.on("pageerror", lambda e: errors.append(str(e)))
    kp.goto(f"{BASE}/p/{killer}")
    kp.wait_for_selector("text=Press and hold", timeout=20000)
    kp.get_by_label("Press and hold to see your role").dispatch_event("pointerdown")
    kp.wait_for_timeout(400)
    kp.get_by_label("Press and hold to see your role").dispatch_event("pointerup")
    kp.get_by_role("button", name="Open my case file").click(timeout=10000)
    lines = kp.get_by_label("Press and hold to read your role")
    lines.dispatch_event("pointerdown")
    kp.wait_for_timeout(500)
    ok(not mentions(kp), f"the killer's case file never mentions an accomplice {mentions(kp)[:2]}")
    shot(kp, "04-phone-killer-file.png")
    lines.dispatch_event("pointerup")

    # Through the rounds and their votes to the lock-in.
    cx("game:skipIntro", {"slug": SLUG, "hostKey": KEY})
    for _ in range(14):
        if roster()["game"]["round"] == 4:
            break
        cx("game:advanceRound", {"slug": SLUG, "hostKey": KEY})
    ok(wait_for(lambda: roster()["game"]["round"] == 4, 20), "the lock-in opens")

    ip = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
    ip.on("pageerror", lambda e: errors.append(str(e)))
    ip.goto(f"{BASE}/p/{innocent}")
    ip.wait_for_selector("text=Press and hold", timeout=20000)
    ip.get_by_label("Press and hold to see your role").dispatch_event("pointerdown")
    ip.wait_for_timeout(300)
    ip.get_by_label("Press and hold to see your role").dispatch_event("pointerup")
    ip.get_by_role("button", name="Open my case file").click(timeout=10000)
    if ip.get_by_role("button", name="Lock in").count():
        ip.get_by_role("button", name="Lock in").click()
    ok(wait_for(lambda: ip.locator(".pick").count() >= 3, 10), "the lock-in is open")
    ok(ip.locator(".pick").count() == 3 and ip.get_by_text("The accomplice (optional)").count() == 0, "who, what and where: no accomplice guess")
    shot(ip, "05-phone-lockin.png")
    board = cx("game:phone", {"token": innocent})["board"]
    for g in guests:
        me = next(x["id"] for x in board["suspects"] if x["name"] == g["charName"])
        target = next(x["id"] for x in board["suspects"] if x["id"] != me)
        try:
            cx("game:accuse", {"token": g["token"], "suspectId": target, "exhibitId": board["exhibits"][0]["id"], "roomKey": board["rooms"][0]["key"]})
        except RuntimeError as e:
            print("skip", g["charName"], str(e)[-90:])
    ok(wait_for(lambda: roster()["game"]["status"] == "reveal", 25), "everyone locked in: the reveal")
    ok(wait_for(lambda: host.get_by_text("named the killer").count() == 1, 60), "the verdict")
    ok(host.locator(".tv-reveal-acc").count() == 0 and not mentions(host), f"the reveal never names an accomplice {mentions(host)[:2]}")
    host.wait_for_timeout(800)
    shot(host, "06-tv-verdict.png")
    ok(not errors, f"no page errors {errors[:2]}")
    browser.close()

cx("admin:deleteTestGame", {"slug": SLUG})
print("\n" + ("all passed" if not fails else f"{len(fails)} failed: " + "; ".join(fails)))
