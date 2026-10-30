"""The runoff end-to-end (Oct 21), against the dev backend: the lock-in ties 3-3 on who, the TV says it's a tie, each
tied guest gets 30 seconds of last words (on the TV and the phones), the host skips the rest, everyone votes again on
who only, and the reveal's verdict gives the runoff's most votes.
  BASE=http://localhost:4174 python3 tests/e2e/runoff.py
Screenshots go to $OUT (default ./e2e-out/runoff).
"""
import json, os, subprocess, time
from playwright.sync_api import sync_playwright
from ui_audit import AUDIT

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = os.environ.get("SLUG", "runoff-e2e")
OUT = os.environ.get("OUT", "e2e-out/runoff")
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

try:
    cx("admin:deleteTestGame", {"slug": SLUG})
except Exception:
    pass
KEY = cx("admin:createGame", {"slug": SLUG, "title": "The Velvet Room", "isTest": True, "makeActive": False,
                              "registrationClosesAt": int(time.time() * 1000) + 7 * 864e5, "deadlineLabel": "Sat, Oct 31"})["hostKey"]
cx("game:seedFakeCast", {"slug": SLUG, "guests": 6, "markers": 8, "seed": 7, "checkIn": True})
guests = cx("admin:testPlayers", {"slug": SLUG})
tok = [g["token"] for g in guests]
gid = [g["id"] for g in guests]
cx("game:openDoors", {"slug": SLUG, "hostKey": KEY})
cx("game:startGame", {"slug": SLUG, "hostKey": KEY})
cx("game:skipIntro", {"slug": SLUG, "hostKey": KEY})
roster = lambda: cx("host:roster", {"slug": SLUG, "hostKey": KEY})
for _ in range(10):
    if roster()["game"]["round"] >= 4:
        break
    cx("game:advanceRound", {"slug": SLUG, "hostKey": KEY})
ok(roster()["game"]["round"] == 4, "on to the lock-in")
case = cx("admin:testCleared", {"slug": SLUG})
K = gid.index(case["killer"])
O = next(i for i in range(6) if i != K)
rest = [i for i in range(6) if i not in (K, O)]

def tie_pick(i):
    if i == K:
        return gid[O]
    if i == O:
        return gid[K]
    return gid[K] if rest.index(i) % 2 else gid[O]

board = cx("game:phone", {"token": tok[0]})["board"]

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    host = browser.new_context(viewport={"width": 1920, "height": 1080}).new_page()
    host.on("pageerror", lambda e: errors.append(str(e)))
    host.goto(f"{BASE}/host?game={SLUG}&key={KEY}")
    host.wait_for_selector(".hs-menu-btn", timeout=20000)
    mk = lambda: browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
    tied_phone, voter_phone = mk(), mk()
    for pg, i in ((tied_phone, O), (voter_phone, rest[0])):
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"{BASE}/p/{tok[i]}")
        # past the role card first
        pg.wait_for_selector("text=Press and hold", timeout=20000)
        pg.get_by_label("Press and hold to see your role").dispatch_event("pointerdown")
        pg.wait_for_timeout(400)
        pg.get_by_label("Press and hold to see your role").dispatch_event("pointerup")
        pg.get_by_role("button", name="Open my case file").click(timeout=10000)
        pg.get_by_role("button", name="Skip the tour").click(timeout=10000)  # Oct 29: the phone tour
        pg.wait_for_selector("text=Lock it in", timeout=20000)

    # Everyone locks in: 3 on the killer, 3 on someone else.
    for i in range(6):
        cx("game:accuse", {"token": tok[i], "suspectId": tie_pick(i), "exhibitId": board["exhibits"][0]["id"], "roomKey": board["rooms"][0]["key"]})
    g = roster()["game"]
    ok(g.get("runoff") is not None and g["status"] == "playing", "a tie on who: a runoff, not the reveal")
    ok(wait_for(lambda: host.get_by_text("It's a tie.").count() >= 1, 10), "the TV says it's a tie")
    host.wait_for_timeout(1500)
    shot(host, "01-tv-tie.png")
    ok(wait_for(lambda: tied_phone.get_by_text("It's a tie.").count() >= 1, 10), "the phone says it's a tie")
    ok(wait_for(lambda: host.locator(".tv-kick", has_text="Last words ·").count() >= 1, 15), "then the first guest's last words on the TV")
    host.wait_for_timeout(1200)
    shot(host, "02-tv-last-words.png")
    ok(tied_phone.locator(".last-words li").count() == 2, "the phone lists whose last words, in order")
    shot(tied_phone, "03-phone-last-words.png")
    issues = tied_phone.evaluate(AUDIT, "top")
    ok(not issues, f"the last-words screen is laid out cleanly {issues[:3]}")
    # The host skips the rest of the last words.
    host.locator(".hs-step").get_by_role("button", name="Skip to the runoff vote").click(timeout=5000)
    ok(wait_for(lambda: host.get_by_text("Vote on your phone.").count() == 1, 10), "the host skips to the runoff vote")
    host.wait_for_timeout(1500)
    shot(host, "04-tv-runoff-vote.png")
    ok(wait_for(lambda: voter_phone.get_by_text("Vote again").count() == 1, 10), "the phone opens the runoff vote")
    ok(voter_phone.locator(".pick").count() == 1, "on who only")
    ok(voter_phone.locator(".pick .opts button").count() == 2, "between the two who tied")
    shot(voter_phone, "05-phone-runoff-vote.png")
    issues = voter_phone.evaluate(AUDIT, "top")
    ok(not issues, f"the runoff vote is laid out cleanly {issues[:3]}")
    # The tied guest can't vote for themselves: only the other one is offered.
    ok(wait_for(lambda: tied_phone.locator(".pick .opts button").count() == 1, 10), "a tied guest only sees the other one")
    voter_phone.locator(".pick .opts button").filter(has_text=guests[K]["charName"].split(" ")[0]).first.click()
    voter_phone.get_by_role("button", name="Vote").click()
    voter_phone.get_by_role("button", name="Tap again: this is final").click()
    ok(wait_for(lambda: voter_phone.locator("h1", has_text="Vote in.").count() == 1, 10), "the vote is in")
    shot(voter_phone, "06-phone-voted.png")
    for i in range(6):
        if i == rest[0]:
            continue
        cx("game:runoffVote", {"token": tok[i], "who": gid[O] if i == K else gid[K]})
    ok(wait_for(lambda: roster()["game"]["status"] == "reveal", 15), "everyone voted: the reveal starts")
    ok(wait_for(lambda: host.get_by_text("The most votes:", exact=False).count() >= 1, 60), "the verdict gives the most votes")
    host.wait_for_timeout(2500)
    shot(host, "07-tv-verdict.png")
    ok(guests[K]["charName"].split(" ")[0] in host.locator(".tv-verdict").inner_text(), "the runoff's most votes are on the killer")
    ok(not errors, f"no page errors {errors[:2]}")
    browser.close()

cx("admin:deleteTestGame", {"slug": SLUG})
print("\n" + ("all passed" if not fails else f"{len(fails)} failed: " + "; ".join(fails)))
raise SystemExit(1 if fails else 0)
