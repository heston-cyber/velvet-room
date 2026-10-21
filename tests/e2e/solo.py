"""Solo test mode (Oct 20, Heston: "build it as a feature now in the setup menu. so i can play and test the game with
fake Bot players who make choices in game as well so i can solo test the game for real."). On the dev backend: the
host starts a test game with bots from /host, sets them up in Options, opens the doors, joins on a phone with the room
code and signs up at the door, starts the game, finds a card without scanning it, asks a bot what it found, and the
bots search, vote and lock in around them until the reveal.
  BASE=http://localhost:4174 python3 tests/e2e/solo.py
Screenshots go to $OUT (default ./e2e-out/solo).
"""
import json, os, re, subprocess, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173")
OUT = os.environ.get("OUT", "e2e-out/solo")
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
    return json.loads(out[min(starts):]) if starts else (out or None)

def wait_for(fn, secs=15):
    end = time.time() + secs
    while time.time() < end:
        try:
            if fn():
                return True
        except Exception:
            pass
        time.sleep(0.5)
    return False

text = lambda pg: pg.evaluate("() => document.body.textContent")
shot = lambda pg, name: pg.screenshot(path=os.path.join(OUT, name))

def sign_up(pg, last):
    pg.locator(".figure-grid button, button:has-text('Step inside')").first.wait_for(timeout=15000)
    if pg.get_by_role("button", name="Step inside").count():
        pg.get_by_role("button", name="Step inside").click()
    pg.locator(".figure-grid button:not([disabled])").first.click()
    pg.fill("#f-firstName", "Heston")
    pg.fill("#f-lastName", last)
    pg.get_by_role("button", name="Next: last look").click()
    pg.get_by_role("button", name="Put me on the list").click()
    pg.wait_for_url(re.compile(r"/p/[a-z0-9]+$"), timeout=15000)

BOTS = 6
slug = key = None
with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    laptop = browser.new_context(viewport={"width": 1600, "height": 900}).new_page()
    laptop.on("pageerror", lambda e: errors.append(str(e)))

    # /host: Test it solo, with bots.
    laptop.goto(f"{BASE}/host")
    ok(wait_for(lambda: laptop.get_by_text("Test it solo, with bots").count() == 1, 20), "the host page offers a solo test with bots")
    laptop.get_by_text("Test it solo, with bots").click()
    laptop.get_by_label("How many bots").fill(str(BOTS))
    laptop.get_by_role("button", name="Fast").click()
    shot(laptop, "01-start-with-bots.png")
    laptop.get_by_role("button", name=f"Start a test game with {BOTS} bots").click()
    ok(wait_for(lambda: laptop.get_by_role("button", name="Play").count() == 1, 20), "it opens the test game's title screen")
    slug = laptop.evaluate("() => JSON.parse(localStorage.getItem('velvet-room:host-current'))")
    key = laptop.evaluate("(s) => JSON.parse(localStorage.getItem('velvet-room:host-keys'))[s]", slug)
    roster = lambda: cx("host:roster", {"slug": slug, "hostKey": key})
    ok("Test game" in text(laptop), "marked as a test game")
    r = roster()
    ok(r["game"]["isTest"] and r["game"]["bots"] == {"speed": "fast", "voices": False, "count": BOTS}, f"a test game with {BOTS} fast bots, voices off ({r['game']['bots']})")
    ok(sum(1 for x in r["players"] if x["bot"] and x["checkedIn"]) == BOTS, "the bots are signed up and checked in")

    # Options: the Bots section.
    laptop.get_by_role("button", name="Options").click()
    ok(wait_for(lambda: laptop.locator(".hx-bots").count() == 1), "Options has a Bots section")
    ok(laptop.locator("#bot-count").input_value() == str(BOTS), "with how many")
    shot(laptop, "02-options-bots.png")
    laptop.get_by_role("button", name="Back").first.click()

    # Play: the doors open. The host joins on a phone with the room code and signs up at the door.
    laptop.get_by_role("button", name="Play").click(timeout=20000)
    ok(wait_for(lambda: laptop.locator(".hs-lobby").count() == 1, 20), "Play opens the doors")
    code = roster()["game"]["roomCode"]
    phone = browser.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
    phone.on("pageerror", lambda e: errors.append(str(e)))
    phone.goto(f"{BASE}/join")
    phone.fill("#roomcode", code.lower())
    phone.get_by_role("button", name="New here? Sign up").click(timeout=15000)
    sign_up(phone, "Hill")
    ok(wait_for(lambda: phone.get_by_text("You're in", exact=True).count() == 1, 20), "the host is in on their phone")
    token = phone.url.rsplit("/", 1)[1]
    ok(wait_for(lambda: str(BOTS + 1) in laptop.locator(".hs-count").inner_text()), f"the TV counts {BOTS + 1} guests in")
    shot(laptop, "03-lobby.png")
    # Oct 20: Best Dressed is a prompt in the lobby.
    ok(wait_for(lambda: phone.get_by_text("While we wait: vote Best Dressed").count() == 1, 15), "the lobby asks for a Best Dressed vote")
    phone.locator(".best-dressed .opts button").first.click()
    ok(wait_for(lambda: phone.get_by_text("Saved. You can change it until the game starts.").count() == 1, 10), "the vote is saved")
    shot(phone, "03b-best-dressed.png")
    ok(wait_for(lambda: len([1 for x in roster()["players"] if x["bot"]]) == BOTS, 5), "the bots are all here")

    # Start: the QR cards question, then the show. Skip the show.
    laptop.locator(".hs-lobby button").click()
    laptop.locator(".hs-lobby button").first.click()
    ok(wait_for(lambda: roster()["game"]["status"] == "playing", 20), "the game starts")
    for _ in range(6):
        if roster()["game"]["show"]["phonesAt"]:
            break
        cx("game:skipShow", {"slug": slug, "hostKey": key})
    cx("game:skipIntro", {"slug": slug, "hostKey": key})
    ok(wait_for(lambda: phone.get_by_text("Press and hold", exact=False).count() >= 1, 25), "the phone gets its role")
    phone.get_by_label("Press and hold to see your role").dispatch_event("pointerdown")
    phone.wait_for_timeout(700)
    phone.get_by_label("Press and hold to see your role").dispatch_event("pointerup")
    phone.get_by_role("button", name="Open my case file").click(timeout=10000)

    # Find a card without scanning it.
    phone.get_by_role("button", name="Scan", exact=True).click()
    ok(wait_for(lambda: phone.locator(".test-cards").count() == 1, 10), "the Scan tab offers the test game's cards")
    shot(phone, "04-test-cards.png")
    phone.locator(".test-cards .tc-grid button").first.click()
    ok(wait_for(lambda: phone.get_by_text("Evidence card no.", exact=False).count() == 1, 10), "tapping one finds it, like a scan")
    shot(phone, "05-found-card.png")

    # The bots search the open rooms and tap Ready; the round waits for the human (Oct 20: untimed).
    ok(wait_for(lambda: sum(1 for x in roster()["players"] if x["bot"] and x["ready"]) == BOTS, 150), "the bots search and tap Ready")
    ok(roster()["game"]["round"] == 1, "the round waits for the human")
    ok(wait_for(lambda: laptop.get_by_text("Waiting on", exact=False).count() >= 1, 15), "the TV says who it's waiting on")
    shot(laptop, "05b-waiting-on.png")
    # Ask a bot what it found.
    phone.get_by_role("button", name="Notebook", exact=True).click()
    ok(wait_for(lambda: phone.locator(".ask-bots").count() == 1, 10), "the Notebook has Ask the bots")
    phone.locator(".ask-bots .ab-list button").first.click()
    ok(wait_for(lambda: phone.get_by_text("What did you find?").count() == 1, 10), "a bot answers")
    phone.locator(".bot-answer").scroll_into_view_if_needed()
    shot(phone, "06-ask-a-bot.png")

    # On to Round 2's jail vote: the bots vote.
    def round_now():
        g = roster()["game"]
        return g["round"], g["vote"]
    for _ in range(4):
        rnd, vote = round_now()
        if rnd == 2 and vote:
            break
        cx("game:advanceRound", {"slug": slug, "hostKey": key})
        time.sleep(1)
    ok(round_now()[1] and round_now()[1]["kind"] == "jail", "the jail vote opens after Round 2")
    ok(wait_for(lambda: (cx("game:phone", {"token": token}) or {}).get("vote", {}).get("voted", 0) >= BOTS - 1, 90), "the bots vote")
    shot(laptop, "07-jail-vote.png")

    # To the lock-in: the bots lock in; then the host does, and the reveal starts.
    for _ in range(10):
        if roster()["game"]["round"] >= 4:
            break
        cx("game:advanceRound", {"slug": slug, "hostKey": key})
        time.sleep(1)
    ok(roster()["game"]["round"] == 4, "the lock-in opens")
    bots_free = lambda: sum(1 for x in roster()["players"] if x["bot"] and x["inGame"] and not x["jailed"])
    ok(wait_for(lambda: sum(1 for x in roster()["players"] if x["bot"] and x["accused"]) >= bots_free(), 120), "every free bot locks in")
    me = cx("game:phone", {"token": token})
    if me["me"]["jailed"]:
        ok(wait_for(lambda: roster()["game"]["status"] == "reveal", 30), "with the host in jail, the reveal starts")
    else:
        board = me["board"]
        cx("game:accuse", {"token": token, "suspectId": next(s["id"] for s in board["suspects"] if s["id"] != me["me"]["id"]), "exhibitId": board["exhibits"][0]["id"], "roomKey": board["rooms"][0]["key"]})
        ok(wait_for(lambda: roster()["game"]["status"] == "reveal", 20), "the host locks in last and the reveal starts")
    laptop.wait_for_timeout(4000)
    shot(laptop, "08-reveal.png")
    ok(not errors, f"no page errors {errors[:2]}")
    browser.close()

if slug:
    try:
        cx("admin:deleteTestGame", {"slug": slug})
    except Exception as e:
        print("cleanup:", e)
print("\n" + ("all passed" if not fails else f"{len(fails)} failed: " + "; ".join(fails)))
raise SystemExit(1 if fails else 0)
