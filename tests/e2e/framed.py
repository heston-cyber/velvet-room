"""A framed night end-to-end (Phase 4, Oct 21), against the dev backend: Round 2's "pick one" lands on every phone in
the same layout; the killer frames a guest and changes their mind; an innocent moves their heat tag; three tags put the
heat on someone (the TV shows it); Round 2 ends with the two late tips on the TV, the plant among them, about the
guest the killer picked last; the phones list the tips; the reveal names the planted tip.
  BASE=http://localhost:4174 python3 tests/e2e/framed.py
Screenshots go to $OUT (default ./e2e-out/framed).
"""
import json, os, subprocess, time
from playwright.sync_api import sync_playwright
from ui_audit import AUDIT

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = os.environ.get("SLUG", "framed-e2e")
OUT = os.environ.get("OUT", "e2e-out/framed")
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
first = lambda name: name.split(" ")[0]

try:
    cx("admin:deleteTestGame", {"slug": SLUG})
except Exception:
    pass
KEY = cx("admin:createGame", {"slug": SLUG, "title": "The Velvet Room", "isTest": True, "makeActive": False,
                              "registrationClosesAt": int(time.time() * 1000) + 7 * 864e5, "deadlineLabel": "Sat, Oct 31"})["hostKey"]
cx("game:seedFakeCast", {"slug": SLUG, "guests": 8, "markers": 10, "seed": 11, "checkIn": True})
guests = cx("admin:testPlayers", {"slug": SLUG})
cx("game:openDoors", {"slug": SLUG, "hostKey": KEY})
cx("game:startGame", {"slug": SLUG, "hostKey": KEY})
cx("game:skipIntro", {"slug": SLUG, "hostKey": KEY})
roster = lambda: cx("host:roster", {"slug": SLUG, "hostKey": KEY})
case = cx("admin:testCleared", {"slug": SLUG})
K = next(g for g in guests if g["id"] == case["killer"])
standing = [g for g in guests if g["id"] not in case["cleared"] and g["id"] != K["id"]]
others = [g for g in guests if g["id"] != K["id"]]
innocent = next(g for g in others if g not in standing[:1])
x, y = standing[0], next(g for g in others if g["id"] != standing[0]["id"] and g["id"] != innocent["id"])

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    host = browser.new_context(viewport={"width": 1920, "height": 1080}).new_page()
    host.on("pageerror", lambda e: errors.append(str(e)))
    host.goto(f"{BASE}/host?game={SLUG}&key={KEY}")
    host.wait_for_selector(".hs-menu-btn", timeout=20000)
    mk = lambda: browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
    kp, ip = mk(), mk()
    for pg, g in ((kp, K), (ip, innocent)):
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"{BASE}/p/{g['token']}")
        pg.wait_for_selector("text=Press and hold", timeout=20000)
        pg.get_by_label("Press and hold to see your role").dispatch_event("pointerdown")
        pg.wait_for_timeout(400)
        pg.get_by_label("Press and hold to see your role").dispatch_event("pointerup")
        pg.get_by_role("button", name="Open my case file").click(timeout=10000)
        pg.get_by_role("button", name="Skip the tour").click(timeout=10000)  # Oct 29: the phone tour

    # Round 1: the heat tags live on the Notebook.
    ip.get_by_role("button", name="Notebook", exact=True).click()
    ok(wait_for(lambda: ip.locator(".heat-tags").count() == 1, 10), "Round 1: the Notebook has the heat tags")
    shot(ip, "01-notebook-heat.png")
    issues = ip.evaluate(AUDIT, "top")
    ok(not issues, f"the notebook is laid out cleanly {issues[:3]}")

    # Round 2: the pick lands on both phones, in the same layout.
    cx("game:advanceRound", {"slug": SLUG, "hostKey": KEY})
    ok(wait_for(lambda: roster()["game"]["round"] == 2, 20), "on to Round 2")
    ok(wait_for(lambda: kp.locator(".pick-screen").count() == 1 and ip.locator(".pick-screen").count() == 1, 20), "the pick takes over both phones")
    ok(kp.get_by_text("Who takes the fall?").count() == 1, "the killer's phone: who takes the fall")
    ok(ip.get_by_text("Who's feeling the heat?").count() == 1, "an innocent's phone: who's feeling the heat")
    ok(kp.locator(".pick-screen .who-opt").count() == ip.locator(".pick-screen .who-opt").count(), "the same number of faces on both")
    shot(kp, "02-killer-pick.png")
    shot(ip, "03-innocent-pick.png")
    for pg, nm in ((kp, "killer"), (ip, "innocent")):
        issues = pg.evaluate(AUDIT, "top")
        ok(not issues, f"the {nm}'s pick screen is laid out cleanly {issues[:3]}")
    # The killer frames x, then changes to y.
    kp.locator(".pick-screen .who-opt", has_text=first(x["charName"])).first.click()
    kp.get_by_role("button", name=f"Pick {first(x['charName'])}").click()
    ok(wait_for(lambda: kp.locator(".pick-row").count() == 1, 10), "the killer's pick is in; the case file shows it")
    kp.locator(".pick-row").get_by_role("button", name="Change").click()
    kp.locator(".pick-screen .who-opt", has_text=first(y["charName"])).first.click()
    kp.get_by_role("button", name=f"Pick {first(y['charName'])}").click()
    ok(wait_for(lambda: first(y["charName"]) in kp.locator(".pick-row").inner_text(), 10), "the killer changed the pick")
    shot(kp, "04-killer-picked.png")
    # The innocent skips (keeps their tag).
    ip.get_by_role("button", name="Skip").click()
    ok(wait_for(lambda: ip.locator(".pick-row").count() == 1, 10), "the innocent's pick is in")

    # The heat: three tags on x.
    taggers = [g for g in others if g["id"] != x["id"]][:3]
    for g in taggers:
        cx("heat:tag", {"token": g["token"], "targetId": x["id"]})
    ok(wait_for(lambda: host.locator(".tv-heat").count() == 1, 15), "three tags: the TV shows the heat")
    ok(first(x["charName"]) in host.locator(".tv-heat").inner_text(), "on the right guest")
    host.wait_for_timeout(1200)
    shot(host, "05-tv-heat.png")
    issues = host.evaluate(AUDIT, "top")
    ok(not issues, f"the TV with the heat is laid out cleanly {issues[:3]}")
    cx("heat:tag", {"token": taggers[0]["token"], "targetId": None})
    ok(wait_for(lambda: host.locator(".tv-heat").count() == 0, 15), "below three tags: the heat goes away")

    # Round 2 ends: the late tips land, the plant about y among them.
    cx("game:advanceRound", {"slug": SLUG, "hostKey": KEY})
    # Oct 29: no jail vote, so the late tips land with Round 3's evidence.
    ok(wait_for(lambda: host.locator(".tv-ev.tip").count() >= 1, 20), "the TV shows the late tips")
    host.wait_for_timeout(7000)
    shot(host, "06-tv-late-tips.png")
    issues = host.evaluate(AUDIT, "top")
    ok(not issues, f"the late tips are laid out cleanly {issues[:3]}")
    tips = host.locator(".tv-ev.tip").all_inner_texts()
    ok(len(tips) == 2, f"two late tips ({len(tips)})")
    ok(any(first(y["charName"]) in t for t in tips), "one of them names the guest the killer framed")
    ip.get_by_role("button", name="Evidence", exact=True).click()
    ok(wait_for(lambda: ip.locator(".ev-sec", has_text="Late tips").count() == 1, 10), "the phone's Evidence lists the late tips")
    shot(ip, "07-phone-tips.png")

    # Straight to the reveal: the planted tip is named.
    for _ in range(12):
        if roster()["game"]["status"] in ("reveal", "done"):
            break
        g = roster()["game"]
        if g["round"] == 4 and not g.get("runoff"):
            board = cx("game:phone", {"token": guests[0]["token"]})["board"]
            for gg in guests:
                try:
                    cx("game:accuse", {"token": gg["token"], "suspectId": K["id"] if gg["id"] != K["id"] else x["id"], "exhibitId": board["exhibits"][0]["id"], "roomKey": board["rooms"][0]["key"]})
                except Exception:
                    pass
        else:
            cx("game:advanceRound", {"slug": SLUG, "hostKey": KEY})
    ok(wait_for(lambda: host.get_by_text("the planted tip", exact=False).count() >= 1, 90), "the reveal names the planted tip")
    shot(host, "08-tv-plant.png")
    ok(not errors, f"no page errors {errors[:2]}")
    browser.close()

cx("admin:deleteTestGame", {"slug": SLUG})
print("\n" + ("all passed" if not fails else f"{len(fails)} failed: " + "; ".join(fails)))
raise SystemExit(1 if fails else 0)
