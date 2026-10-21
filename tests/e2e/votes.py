"""The votes end-to-end, against the dev backend (Oct 20: Round 1 no vote, Round 2 the jail vote, no release vote: the
jailbird sits out Round 3 and rejoins for the lock-in), phones vote, the TV shows who voted for whom and the verdict, the
jailed guest's phone is locked down in Round 3, then the final lock-in with weapon pictures and the reveal.
  BASE=http://localhost:4174 [TONE=adult] python3 tests/e2e/votes.py
Screenshots go to $OUT (default ./e2e-out/votes).
"""
import json, os, subprocess, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = os.environ.get("SLUG", "votes-e2e")
OUT = os.environ.get("OUT", "e2e-out/votes")
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
cx("host:updateSettings", {"slug": SLUG, "hostKey": KEY, "tone": os.environ.get("TONE", "classic")})
cx("game:seedFakeCast", {"slug": SLUG, "guests": 5, "markers": 8, "seed": 41, "checkIn": True})
guests = cx("admin:testPlayers", {"slug": SLUG})
tok = [g["token"] for g in guests]
gid = [g["id"] for g in guests]
cx("game:openDoors", {"slug": SLUG, "hostKey": KEY})
cx("game:startGame", {"slug": SLUG, "hostKey": KEY})
cx("game:skipIntro", {"slug": SLUG, "hostKey": KEY})
# Oct 17 (D10): a jailbird the evidence clears walks out without a vote, so jail one it never clears.
case = cx("admin:testCleared", {"slug": SLUG})
J = next((i for i in range(1, 5) if gid[i] != case["killer"] and gid[i] not in case["cleared"]), None)
if J is None:
    J = next(i for i in range(1, 5) if gid[i] == case["killer"]) if case["killer"] in gid[1:] else 4
OTHERS = [i for i in range(1, 5) if i != J]
roster = lambda: cx("host:roster", {"slug": SLUG, "hostKey": KEY})
vote = lambda i, target: cx("game:castVote", {"token": tok[i], "targetId": target})

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    mk = lambda: browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
    a, b = mk(), mk()
    for pg in (a, b):
        pg.on("pageerror", lambda e: errors.append(str(e)))
    a.goto(f"{BASE}/p/{tok[0]}")
    b.goto(f"{BASE}/p/{tok[J]}")
    for pg in (a, b):
        # past the role card
        pg.wait_for_selector("text=Press and hold", timeout=20000)
        pg.get_by_label("Press and hold to see your role").dispatch_event("pointerdown")
        pg.wait_for_timeout(400)
        pg.get_by_label("Press and hold to see your role").dispatch_event("pointerup")
        pg.get_by_role("button", name="Open my case file").click(timeout=10000)

    host = browser.new_context(viewport={"width": 1600, "height": 900}).new_page()
    host.on("pageerror", lambda e: errors.append(str(e)))
    host.goto(f"{BASE}/host?game={SLUG}&key={KEY}")
    host.wait_for_selector(".hs-menu-btn", timeout=20000)

    def host_step(label):
        host.locator(".hs-menu-btn").click()
        btn = host.get_by_role("button", name=label)
        ok(btn.count() == 1, f"the host menu offers {label}")
        btn.click()

    # Round 1 ends with no vote (Oct 16); Round 2 ends in the jail vote.
    host_step("End Round 1")
    ok(wait_for(lambda: roster()["game"]["round"] == 2, 15), "Round 1 ends straight into Round 2, no vote")
    ok(roster()["game"].get("vote") is None, "no vote after Round 1")
    host_step("End Round 2")
    # Phase 4 (Oct 21): the late tips come first (20 seconds), then the jail vote.
    ok(wait_for(lambda: host.get_by_text("Who goes to jail?").count() == 1, 40), "Round 2 ends in the late tips, then the jail vote")
    ok(wait_for(lambda: a.get_by_role("radio", name="Nobody").count() == 1, 10), "the phone shows the vote")
    host.wait_for_timeout(1500)
    shot(host, "01-tv-jail-vote.png")
    shot(a, "02-phone-vote.png")
    a.get_by_role("radio").filter(has_text=guests[J]["charName"].split(" ")[0]).first.click()
    ok(wait_for(lambda: "Your vote is in" in a.inner_text("body"), 10), "the phone shows the vote is in")
    for i in OTHERS:
        vote(i, gid[J])
    vote(J, gid[0])  # the last ballot closes it
    ok(wait_for(lambda: host.get_by_text("The votes are in").count() == 1, 10), "everyone voted: the TV shows who voted for whom")
    host.wait_for_timeout(1500)
    shot(host, "03-tv-tally.png")
    ok(wait_for(lambda: host.locator(".tv-verdict-who .tv-jailed").count() == 1, 12), "the verdict: behind bars")
    host.wait_for_timeout(1500)
    shot(host, "04-tv-verdict.png")
    ok(wait_for(lambda: roster()["game"]["round"] == 3, 25), "the night moves on to Round 3")
    ok(wait_for(lambda: b.locator(".jail-banner").count() >= 1, 10), "the jailed guest's phone says they're in jail")
    shot(b, "05-phone-jailed.png")
    b.get_by_role("button", name="Scan").click()
    ok(b.get_by_text("No searching from a cell").count() == 1, "no scanning from jail")

    # Round 3 ends: no release vote (Oct 20); the jailbird is let out for the lock-in.
    host_step("End Round 3")
    ok(wait_for(lambda: roster()["game"]["round"] == 4, 20), "Round 3 goes straight to the lock-in")
    ok(roster()["game"].get("vote") is None or roster()["game"]["vote"]["kind"] == "jail", "no release vote")
    ok(not any(p["jailed"] for p in roster()["players"]), "the jailbird is out for the lock-in")

    # The lock-in: final, with weapon pictures. The former jailbird locks in too.
    if a.get_by_role("button", name="Lock in").count():
        a.get_by_role("button", name="Lock in").click()
    ok(wait_for(lambda: a.get_by_text("Lock it in").count() >= 1, 10), "the phone shows the lock-in")
    ok(a.locator(".opts.weapons img").count() >= 4, "weapons with their pictures")
    shot(a, "07-phone-lockin.png")
    ok(wait_for(lambda: b.get_by_text("Lock it in").count() >= 1 or b.get_by_role("button", name="Lock in").count() >= 1, 10), "the former jailbird gets the lock-in too")
    a.locator(".pick").nth(0).locator("button").first.click()
    a.locator(".opts.weapons button").first.click()
    a.locator(".pick").nth(2).locator("button").first.click()
    a.get_by_role("button", name="Lock it in").last.click()
    ok(a.get_by_text("Tap again: this is final").count() == 1, "it asks for a second tap")
    a.locator("button.primary").click()
    ok(wait_for(lambda: a.get_by_text("Locked in").count() >= 1, 10), "locked in, final")
    shot(a, "08-phone-locked.png")
    board = cx("game:phone", {"token": tok[1]})["board"]
    for i in OTHERS + [J]:
        me = gid[i]
        other = next(s["id"] for s in board["suspects"] if s["id"] != me)
        try:
            cx("game:accuse", {"token": tok[i], "suspectId": other, "exhibitId": board["exhibits"][0]["id"], "roomKey": board["rooms"][0]["key"]})
        except RuntimeError as e:
            print("skip", i, str(e)[-80:])
    # Oct 21: a tie goes to a runoff first (skip the last words, everyone votes the first option that isn't them).
    if wait_for(lambda: roster()["game"].get("runoff") is not None, 3) and roster()["game"]["status"] != "reveal":
        cx("game:advanceRound", {"slug": SLUG, "hostKey": KEY})
        ro = cx("game:phone", {"token": tok[0]})["runoff"]
        for i in range(5):
            pick = {k: next((x.get("id") or x.get("key")) for x in ro[k] if (x.get("id") or x.get("key")) != gid[i]) for k in ("who", "weapon", "room") if ro.get(k)}
            cx("game:runoffVote", {"token": tok[i], **pick})
    ok(wait_for(lambda: roster()["game"]["status"] == "reveal", 20), "everyone locked in: the reveal")
    ok(wait_for(lambda: host.locator(".tv-reveal-weapon").count() == 1, 25), "the reveal names the weapon with its card")
    host.wait_for_timeout(1200)
    shot(host, "09-tv-reveal-weapon.png")
    ok(wait_for(lambda: host.get_by_text("The most votes:", exact=False).count() == 1, 15), "the verdict gives the most votes on killer, weapon and room (Oct 21)")
    host.wait_for_timeout(800)
    shot(host, "10-tv-verdict.png")
    ok(not errors, f"no page errors {errors[:2]}")
    browser.close()

cx("admin:deleteTestGame", {"slug": SLUG})
print("\n" + ("all passed" if not fails else f"{len(fails)} failed: " + "; ".join(fails)))
raise SystemExit(1 if fails else 0)
