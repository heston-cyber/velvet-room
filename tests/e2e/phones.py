"""Phone look-over (Oct 20, Heston: "give the UI and interface a good look over before your done so that everything is
proportioned good, things arent covering up other elements etc."). On the dev backend: a solo test game with bots; the
host joins on a phone and the same phone page is open at three phone sizes (a small iPhone SE, a regular iPhone, a big
one). At each step of the night every tab is checked, top and bottom of the page:
  - nothing sticks out sideways (no sideways scrolling),
  - no text is cut off inside its box,
  - no text sits on other text, and no button or picture covers text,
  - the bars that stay put (the status bar up top, the tabs at the bottom) never hide anything once you scroll to the end,
  - buttons are big enough to tap.
  BASE=http://localhost:4174 python3 tests/e2e/phones.py
Screenshots and a report go to $OUT (default ./e2e-out/phones).
"""
import json, os, re, subprocess, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173")
OUT = os.environ.get("OUT", "e2e-out/phones")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.makedirs(OUT, exist_ok=True)
ENV = dict(os.environ)
for line in open(os.path.join(ROOT, ".env.local")):
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1)
        ENV[k] = v.split(" #")[0]
SIZES = [("se", 375, 667), ("iphone", 390, 844), ("max", 430, 932)]
BOTS = int(os.environ.get("BOTS", "9"))


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


from ui_audit import AUDIT



report = []


def look(pages, label, prep=None):
    """Every size: the top of the page and the bottom, checked and photographed."""
    for size, pg in pages:
        if prep:
            try:
                prep(pg)
            except Exception as e:
                print(f"  ({size} {label}: {str(e)[:80]})")
        pg.wait_for_timeout(900)
        for end in ("top", "bottom"):
            pg.evaluate("(end) => window.scrollTo(0, end === 'top' ? 0 : document.documentElement.scrollHeight)", end)
            pg.wait_for_timeout(350)
            issues = pg.evaluate(AUDIT, end)
            name = f"{label}-{size}-{end}.png"
            pg.screenshot(path=os.path.join(OUT, name))
            report.append({"screen": name, "issues": issues})
            print(("OK   " if not issues else "FLAG ") + name + ("" if not issues else "\n       " + "\n       ".join(issues)), flush=True)
            if pg.evaluate("() => document.documentElement.scrollHeight <= window.innerHeight + 2"):
                break


def tab(name):
    return lambda pg: pg.get_by_role("button", name=name, exact=True).click(timeout=5000)


slug = key = None
with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    laptop = browser.new_context(viewport={"width": 1600, "height": 900}).new_page()
    laptop.goto(f"{BASE}/host")
    laptop.get_by_text("Test it solo, with bots").click(timeout=20000)
    laptop.get_by_label("How many bots").fill(str(BOTS))
    laptop.get_by_role("button", name="Fast").click()
    laptop.get_by_role("button", name=f"Start a test game with {BOTS} bots").click()
    wait_for(lambda: laptop.get_by_role("button", name="Play").count() == 1, 20)
    slug = laptop.evaluate("() => JSON.parse(localStorage.getItem('velvet-room:host-current'))")
    key = laptop.evaluate("(s) => JSON.parse(localStorage.getItem('velvet-room:host-keys'))[s]", slug)
    roster = lambda: cx("host:roster", {"slug": slug, "hostKey": key})
    laptop.get_by_role("button", name="Play").click(timeout=20000)
    wait_for(lambda: laptop.locator(".hs-lobby").count() == 1, 20)
    code = roster()["game"]["roomCode"]

    mk = lambda w, h: browser.new_context(viewport={"width": w, "height": h}, device_scale_factor=2, is_mobile=True, has_touch=True).new_page()
    first = mk(SIZES[0][1], SIZES[0][2])
    first.on("pageerror", lambda e: errors.append(str(e)))
    # The door: room code, sign-up, at the smallest size.
    first.goto(f"{BASE}/join")
    look([("se", first)], "01-join")
    first.fill("#roomcode", code.lower())
    first.get_by_role("button", name="New here? Sign up").click(timeout=15000)
    first.locator(".figure-grid button, button:has-text('Step inside')").first.wait_for(timeout=15000)
    if first.get_by_role("button", name="Step inside").count():
        first.get_by_role("button", name="Step inside").click()
    look([("se", first)], "02-signup-pick")
    first.locator(".figure-grid button:not([disabled])").first.click()
    first.fill("#f-firstName", "Maximiliana")
    first.fill("#f-lastName", "Montgomery-Hillsborough")
    look([("se", first)], "03-signup-form")
    first.get_by_role("button", name="Next: last look").click()
    look([("se", first)], "04-signup-last-look")
    first.get_by_role("button", name="Put me on the list").click()
    first.wait_for_url(re.compile(r"/p/[a-z0-9]+$"), timeout=15000)
    url = first.url
    token = url.rsplit("/", 1)[1]
    pages = [("se", first)]
    for size, w, h in SIZES[1:]:
        pg = mk(w, h)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(url)
        pages.append((size, pg))
    wait_for(lambda: first.get_by_text("You're in", exact=True).count() == 1, 20)

    look(pages, "05-lobby")
    first.locator(".best-dressed .opts button").first.click()
    look(pages, "06-lobby-voted")

    laptop.locator(".hs-lobby button").click()
    laptop.locator(".hs-lobby button").first.click()
    wait_for(lambda: roster()["game"]["status"] == "playing", 20)
    look(pages, "07-show")
    for _ in range(6):
        if roster()["game"]["show"]["phonesAt"]:
            break
        cx("game:skipShow", {"slug": slug, "hostKey": key})
    cx("game:skipIntro", {"slug": slug, "hostKey": key})
    wait_for(lambda: first.get_by_text("Press and hold", exact=False).count() >= 1, 25)
    look(pages, "08-role-card")

    def hold(pg):
        pg.get_by_label("Press and hold to see your role").dispatch_event("pointerdown")
        pg.wait_for_timeout(500)

    look(pages, "09-role-held", hold)
    for _, pg in pages:
        pg.get_by_label("Press and hold to see your role").dispatch_event("pointerup")
        pg.get_by_role("button", name="Open my case file").click(timeout=10000)
    look(pages, "10-r1-case")
    look(pages, "11-r1-scan", tab("Scan"))
    first.locator(".test-cards .tc-grid button").first.click()
    wait_for(lambda: first.get_by_text("Evidence card no.", exact=False).count() == 1, 10)
    look([("se", first)], "12-r1-found")
    look(pages, "13-r1-evidence", tab("Evidence"))

    def ask(pg):
        tab("Notebook")(pg)
        pg.locator(".ask-bots .ab-list button").first.click()

    look(pages, "14-r1-notebook", ask)

    def round_now():
        g = roster()["game"]
        return g["round"], g["vote"]

    cx("game:advanceRound", {"slug": slug, "hostKey": key})
    wait_for(lambda: round_now()[0] == 2, 30)
    first.wait_for_timeout(3000)
    look(pages, "15-r2-case", tab("Case"))
    look(pages, "16-r2-evidence", tab("Evidence"))
    for _ in range(4):
        rnd, vote = round_now()
        if rnd == 2 and vote:
            break
        cx("game:advanceRound", {"slug": slug, "hostKey": key})
        time.sleep(1)
    look(pages, "17-jail-vote")
    first.locator("button.nobody").click()
    wait_for(lambda: (cx("game:phone", {"token": token}) or {}).get("vote", {}).get("closedAt"), 120)
    look(pages, "18-jail-verdict")
    wait_for(lambda: round_now()[0] == 3, 60)
    first.wait_for_timeout(3000)
    look(pages, "19-r3-case", tab("Case"))
    look(pages, "20-r3-notebook", tab("Notebook"))
    for _ in range(6):
        if roster()["game"]["round"] >= 4:
            break
        cx("game:advanceRound", {"slug": slug, "hostKey": key})
        time.sleep(1)
    wait_for(lambda: roster()["game"]["round"] == 4, 30)
    first.wait_for_timeout(2500)
    look(pages, "21-lock-in")

    def pick(pg):
        groups = pg.locator(".pick")
        for i in range(groups.count()):
            groups.nth(i).locator(".opts button").first.click()

    look(pages, "22-lock-in-picked", pick)
    me = cx("game:phone", {"token": token})
    if not me["me"]["jailed"]:
        board = me["board"]
        cx("game:accuse", {"token": token, "suspectId": next(s["id"] for s in board["suspects"] if s["id"] != me["me"]["id"]), "exhibitId": board["exhibits"][0]["id"], "roomKey": board["rooms"][0]["key"]})
    look(pages, "23-locked")
    wait_for(lambda: roster()["game"]["status"] in ("reveal", "done"), 120)
    first.wait_for_timeout(4000)
    look(pages, "24-reveal")
    wait_for(lambda: roster()["game"]["status"] == "done", 120)
    first.wait_for_timeout(3000)
    look(pages, "25-awards")
    look(pages, "26-awards-case", tab("Case"))
    print("page errors:", errors[:3])
    browser.close()

json.dump(report, open(os.path.join(OUT, "report.json"), "w"), indent=1)
flags = [r for r in report if r["issues"]]
print(f"\n{len(report)} screens, {len(flags)} flagged")
if slug:
    try:
        cx("admin:deleteTestGame", {"slug": slug})
    except Exception as e:
        print("cleanup:", e)
