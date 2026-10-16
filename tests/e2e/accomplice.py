"""Killer + accomplice (v2 step 5) end-to-end, against the dev backend: the Killers setting in Options, the lobby
note, How to play with the accomplice card, the accomplice's role card, the lock-in with the optional accomplice
guess, and the reveal naming the accomplice before the verdict.
  BASE=http://localhost:4174 [TONE=adult] python3 tests/e2e/accomplice.py
Screenshots go to $OUT (default ./e2e-out/accomplice).
"""
import json, os, subprocess, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = os.environ.get("SLUG", "accomplice-e2e")
OUT = os.environ.get("OUT", "e2e-out/accomplice")
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
cx("game:seedFakeCast", {"slug": SLUG, "guests": 8, "markers": 8, "seed": 57, "checkIn": True})
guests = cx("admin:testPlayers", {"slug": SLUG})
roster = lambda: cx("host:roster", {"slug": SLUG, "hostKey": KEY})

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    host = browser.new_context(viewport={"width": 1600, "height": 900}).new_page()
    host.on("pageerror", lambda e: errors.append(str(e)))
    host.goto(f"{BASE}/host?game={SLUG}&key={KEY}")

    # Options: the Killers setting.
    host.get_by_role("button", name="Options").click(timeout=20000)
    ok(wait_for(lambda: host.get_by_role("button", name="Killer + accomplice (7+)").count() == 1, 10), "Options has the Killers setting")
    host.get_by_role("button", name="Killer + accomplice (7+)").click()
    ok(wait_for(lambda: roster()["game"]["accomplice"] is True, 10), "picking it saves the setting")
    ok(host.get_by_text("both drawn at random from everyone").count() == 1, "it explains the mode")
    host.wait_for_timeout(600)
    shot(host, "01-options-killers.png")
    host.get_by_role("button", name="Back").first.click()

    host.get_by_role("button", name="Play").click(timeout=20000)
    ok(wait_for(lambda: host.locator(".hs-lobby").count() == 1), "Play opens the doors")
    ok(wait_for(lambda: host.get_by_text("A killer and an accomplice tonight.").count() == 1, 15), "the lobby says it's a killer + accomplice night")
    shot(host, "02-lobby.png")
    host.locator(".hs-lobby button").click()
    host.locator(".hs-lobby button").click()
    ok(wait_for(lambda: roster()["game"]["status"] == "playing", 20), "Everyone is in starts the show")

    def skip(label):
        # The menu's label follows the clock, and this machine's clock can trail the server's by a second or two.
        host.locator(".hs-menu-btn").click()
        btn = host.get_by_role("button", name=label)
        ok(wait_for(lambda: btn.count() == 1, 8), f"the host menu offers {label}")
        btn.click()

    # How to play: 11 cards, the second is the accomplice.
    if host.locator(".tv-how").count() == 0:
        skip("Skip to How to play")
    ok(wait_for(lambda: "how to play · 1 of 6" in host.locator(".tv-how").inner_text().lower(), 10), "six How to play cards (five + the accomplice)")
    ok(wait_for(lambda: host.locator(".tv-how-pair").count() == 1, 40), "the accomplice card: the killer with someone at their shoulder")
    ok("accomplice" in host.locator(".tv-how").inner_text().lower(), "it explains the accomplice")
    host.wait_for_timeout(1500)
    shot(host, "03-how-accomplice.png")

    # Roles (Oct 16 order: How to play, the murder, the roll call, the roles).
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
    acc = next(t for t, r in roles.items() if r == "accomplice")
    killer = next(t for t, r in roles.items() if r == "killer")
    innocent = next(t for t, r in roles.items() if r == "innocent")
    ok(sorted(roles.values()).count("innocent") == 6, f"one killer, one accomplice, six innocents ({sorted(roles.values())})")
    ph = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
    ph.on("pageerror", lambda e: errors.append(str(e)))
    ph.goto(f"{BASE}/p/{acc}")
    ph.wait_for_selector("text=Press and hold", timeout=20000)
    card = ph.get_by_label("Press and hold to see your role")
    card.dispatch_event("pointerdown")
    ok(wait_for(lambda: ph.get_by_text("Accomplice.").count() == 1, 5), "the accomplice's role card says Accomplice")
    killer_name = next(g["charName"] for g in guests if g["token"] == killer)
    ok(killer_name in ph.locator(".hold-card").inner_text(), "and names the killer")
    shot(ph, "04-phone-accomplice-card.png")
    card.dispatch_event("pointerup")
    ph.get_by_role("button", name="Open my case file").click(timeout=10000)
    lines = ph.get_by_label("Press and hold to read your role")
    lines.dispatch_event("pointerdown")
    ph.wait_for_timeout(500)
    shot(ph, "05-phone-accomplice-file.png")
    lines.dispatch_event("pointerup")

    # Through the rounds and their votes to the lock-in.
    cx("game:skipIntro", {"slug": SLUG, "hostKey": KEY})  # the show may already have moved on to Round 1
    for _ in range(14):
        if roster()["game"]["round"] == 4:
            break
        cx("game:advanceRound", {"slug": SLUG, "hostKey": KEY})
    ok(wait_for(lambda: roster()["game"]["round"] == 4, 20), "the lock-in opens")

    # An innocent locks in on the phone, with an accomplice guess.
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
    ok(wait_for(lambda: ip.get_by_text("The accomplice (optional)").count() == 1, 10), "the lock-in has the optional accomplice guess")
    board = cx("game:phone", {"token": innocent})["board"]
    acc_name = next(g["charName"] for g in guests if g["token"] == acc)
    ip.locator(".pick").nth(0).get_by_role("button", name=killer_name, exact=True).click()
    ip.locator(".opts.weapons button").first.click()
    ip.locator(".pick").nth(2).locator("button").first.click()
    ip.locator(".pick").nth(3).get_by_role("button", name=acc_name, exact=True).click()
    ip.wait_for_timeout(400)
    shot(ip, "06-phone-lockin-accomplice.png")
    ip.get_by_role("button", name="Lock it in").last.click()
    ip.locator("button.primary").click()
    ok(wait_for(lambda: ip.get_by_text(f"Accomplice: {acc_name}.").count() == 1, 10), "locked in, with the accomplice guess")

    # Everyone else locks in (the server checks); two more guess the accomplice, one of them right.
    others = [g for g in guests if g["token"] != innocent]
    for i, g in enumerate(others):
        me = next(x["id"] for x in board["suspects"] if x["name"] == g["charName"])
        target = next(x["id"] for x in board["suspects"] if x["id"] != me)
        args = {"token": g["token"], "suspectId": target, "exhibitId": board["exhibits"][0]["id"], "roomKey": board["rooms"][0]["key"]}
        if i < 2:
            guess = next(x["id"] for x in board["suspects"] if x["id"] not in (me, target))
            args["accompliceId"] = guess
        try:
            cx("game:accuse", args)
        except RuntimeError as e:
            print("skip", g["charName"], str(e)[-90:])
    ok(wait_for(lambda: roster()["game"]["status"] == "reveal", 25), "everyone locked in: the reveal")
    ok(wait_for(lambda: host.locator(".tv-reveal-acc").count() == 1, 40), "the reveal names the accomplice")
    ok(acc_name in host.locator(".tv-reveal-acc").inner_text(), "by name")
    host.wait_for_timeout(1500)
    shot(host, "07-tv-reveal-accomplice.png")
    ok(wait_for(lambda: host.get_by_text("named the killer").count() == 1, 15), "then the verdict")
    ok(host.get_by_text("guessed").count() >= 1 or host.get_by_text("Nobody guessed the accomplice.").count() == 1, "the verdict counts the accomplice guesses")
    host.wait_for_timeout(800)
    shot(host, "08-tv-verdict.png")
    ok(wait_for(lambda: f"{acc_name} was the accomplice." in ph.inner_text("body"), 15), "the accomplice's phone shows the result")
    shot(ph, "09-phone-accomplice-result.png")
    ok(not errors, f"no page errors {errors[:2]}")
    browser.close()

cx("admin:deleteTestGame", {"slug": SLUG})
print("\n" + ("all passed" if not fails else f"{len(fails)} failed: " + "; ".join(fails)))
raise SystemExit(1 if fails else 0)
