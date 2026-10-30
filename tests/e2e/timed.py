"""A timed night end-to-end (Phase 8, Oct 21), against the dev backend: a game on the clock (3-minute rounds) where
nobody taps Ready, nobody votes in jail and only some guests lock in, so only the clock moves it on: Round 1 to 3 end on
time, the late tips land (Oct 29: no jail vote), the lock-in's 3-minute countdown closes it with the votes it has, and
the reveal runs. The TV is checked for overlaps at every step.
  BASE=http://localhost:4174 python3 tests/e2e/timed.py
Screenshots go to $OUT (default ./e2e-out/timed). Takes about 15 minutes.
"""
import json, os, subprocess, time
from playwright.sync_api import sync_playwright
from ui_audit import AUDIT

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = os.environ.get("SLUG", "timed-e2e")
OUT = os.environ.get("OUT", "e2e-out/timed")
TONE = os.environ.get("TONE", "adult")
MINUTES = 3
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

def wait_for(fn, secs=15, step=2.0):
    end = time.time() + secs
    while time.time() < end:
        try:
            if fn():
                return True
        except Exception:
            pass
        time.sleep(step)
    return False

shot = lambda pg, name: pg.screenshot(path=os.path.join(OUT, name))

try:
    cx("admin:deleteTestGame", {"slug": SLUG})
except Exception:
    pass
KEY = cx("admin:createGame", {"slug": SLUG, "title": "The Velvet Room", "isTest": True, "makeActive": False,
                              "registrationClosesAt": int(time.time() * 1000) + 7 * 864e5, "deadlineLabel": "Sat, Oct 31"})["hostKey"]
cx("game:seedFakeCast", {"slug": SLUG, "guests": 8, "markers": 10, "seed": 21, "checkIn": True})
cx("host:updateSettings", {"slug": SLUG, "hostKey": KEY, "pacing": {"mode": "timer", "roundMinutes": MINUTES}, "tone": TONE})
guests = cx("admin:testPlayers", {"slug": SLUG})
cx("game:openDoors", {"slug": SLUG, "hostKey": KEY})
cx("game:startGame", {"slug": SLUG, "hostKey": KEY})
cx("game:skipIntro", {"slug": SLUG, "hostKey": KEY})
roster = lambda: cx("host:roster", {"slug": SLUG, "hostKey": KEY})
game = lambda: roster()["game"]

def audit(pg, what):
    issues = pg.evaluate(AUDIT, "top")
    ok(not issues, f"{what}: laid out cleanly {issues[:3]}")

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    tv = browser.new_context(viewport={"width": 1920, "height": 1080}).new_page()
    tv.on("pageerror", lambda e: errors.append(str(e)))
    tv.goto(f"{BASE}/host?game={SLUG}&key={KEY}")
    tv.wait_for_selector(".hs-menu-btn", timeout=20000)

    for rnd in (1, 2, 3):
        ok(wait_for(lambda: game()["round"] == rnd and not game().get("vote"), 120), f"Round {rnd} is on")
        ok(wait_for(lambda: tv.locator(".tv-clock").count() == 1, 60, 1), f"Round {rnd}: the TV shows the clock")
        tv.wait_for_timeout(1500)
        shot(tv, f"0{rnd}-round{rnd}.png")
        audit(tv, f"Round {rnd} with the clock")
        if rnd == 1:
            started = time.time()
        # Nobody taps Ready: only the clock ends it.
        mins = MINUTES if rnd != 3 else max(3, round(MINUTES * 0.75))
        ok(wait_for(lambda: game()["round"] != rnd or game().get("vote"), mins * 60 + 90, 5), f"Round {rnd} ends on its clock")
        if rnd == 2:
            # Oct 29: no jail vote. Round 3 opens on the late tips, on their own for a moment.
            ok(wait_for(lambda: tv.get_by_text("Late tips", exact=True).count() >= 1, 30, 1), "the late tips land")
            tv.wait_for_timeout(5000)
            shot(tv, "02b-late-tips.png")
            audit(tv, "the late tips")
            ok(game()["round"] == 3 and not game().get("vote"), "straight on to Round 3, no jail vote")

    # The lock-in: half the guests lock in, the rest never do; the clock closes it.
    ok(wait_for(lambda: game()["round"] == 4, 120), "the lock-in opens")
    case = cx("admin:testCleared", {"slug": SLUG})
    board = cx("game:phone", {"token": guests[0]["token"]})["board"]
    for g in guests[:4]:
        try:
            cx("game:accuse", {"token": g["token"], "suspectId": case["killer"] if g["id"] != case["killer"] else guests[5]["id"],
                               "exhibitId": board["exhibits"][0]["id"], "roomKey": board["rooms"][0]["key"]})
        except Exception as e:
            print("accuse:", str(e)[-120:])
    tv.wait_for_timeout(2000)
    shot(tv, "04-lock-in.png")
    audit(tv, "the lock-in")
    # Oct 29: the 3-minute countdown, big in the corner.
    ok(tv.locator(".tv-countdown").count() == 1, "the lock-in shows its countdown")
    ok(wait_for(lambda: game()["status"] in ("reveal", "done") or game().get("runoff"), 3 * 60 + 60, 5), "the lock-in closes on its 3-minute clock")
    if game().get("runoff"):
        print("(a runoff)", flush=True)
        ok(wait_for(lambda: game()["status"] in ("reveal", "done"), 5 * 60, 5), "the runoff closes on its clock")
    tv.wait_for_timeout(8000)
    shot(tv, "05-reveal.png")
    audit(tv, "the reveal")
    ok(wait_for(lambda: game()["status"] == "done" or tv.get_by_text("The most votes", exact=False).count() >= 1, 240, 3), "the verdict shows")
    shot(tv, "06-verdict.png")
    print(f"(the night took {(time.time() - started) / 60:.1f} minutes from Round 1)")
    ok(not errors, f"no page errors {errors[:2]}")
    browser.close()

cx("admin:deleteTestGame", {"slug": SLUG})
print("\n" + ("all passed" if not fails else f"{len(fails)} failed: " + "; ".join(fails)))
raise SystemExit(1 if fails else 0)
