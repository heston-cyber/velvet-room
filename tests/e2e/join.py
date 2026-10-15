"""Room-code join end-to-end, against the dev backend: the TV shows the code and a QR, a phone types it and
taps its name, a second phone finds the name taken, the TV announces the claim, and a rescue frees the name.
  BASE=http://localhost:4174 python3 tests/e2e/join.py
Screenshots go to $OUT (default ./e2e-out/join).
"""
import json, os, re, subprocess, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = os.environ.get("SLUG", "join-e2e")
OUT = os.environ.get("OUT", "e2e-out/join")
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

has = lambda text, needle: needle.lower() in text.lower()
shot = lambda pg, name: pg.screenshot(path=os.path.join(OUT, name))

def wait_for(fn, secs=10):
    end = time.time() + secs
    while time.time() < end:
        if fn():
            return True
        time.sleep(0.25)
    return False

# ---------- a fresh test game, doors open ----------
try:
    cx("admin:deleteTestGame", {"slug": SLUG})
except Exception:
    pass
created = cx("admin:createGame", {"slug": SLUG, "title": "Join e2e", "isTest": True, "makeActive": False,
                                  "registrationClosesAt": int(time.time() * 1000) + 7 * 864e5, "deadlineLabel": "Sat, Oct 24"})
KEY = created["hostKey"]
cx("game:seedFakeCast", {"slug": SLUG, "guests": 5, "markers": 8, "seed": 21, "checkIn": False})
def free_figure():
    """A drawing no fake guest has taken yet (each drawing belongs to one guest)."""
    sets = cx("registration:figures", {"slug": SLUG})
    return next(f["key"] for s in sets for f in s["figures"] if not f["taken"])
def free_weapon():
    """A weapon from the pool no fake guest has taken yet (each weapon belongs to one guest)."""
    return next(w["key"] for w in cx("registration:weapons", {"slug": SLUG}) if not w["taken"])

me = cx("registration:register", {"slug": SLUG, "realName": "Heston Test", "charName": "Velma Kowalski", "who": "Cigarette girl who sells secrets.",
                                  "signature": "Silver cigarette case", "weapon": free_weapon(), "killerOk": True, "figure": free_figure()})
roster = cx("host:roster", {"slug": SLUG, "hostKey": KEY})
ok(roster["game"]["roomCode"] is None, "no room code while sign-ups run")
cx("game:openDoors", {"slug": SLUG, "hostKey": KEY})
roster = cx("host:roster", {"slug": SLUG, "hostKey": KEY})
CODE = roster["game"]["roomCode"]
ok(bool(re.fullmatch(r"[BCDFGHJKLMNPQRSTVWXZ]{4}", CODE or "")), f"opening the doors makes a room code ({CODE})")
TVKEY = roster["game"]["tvKey"]
VELMA = next(p for p in roster["players"] if p["charName"] == "Velma Kowalski")
TV = f"{BASE}/tv?game={SLUG}&key={TVKEY}"
HOST = f"{BASE}/host?game={SLUG}&key={KEY}"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    errors = []
    def watch(pg, name):
        pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
        noise = ("Failed to load resource", "ConvexError", "navigator.vibrate")
        pg.on("console", lambda m: m.type == "error" and not any(n in m.text for n in noise) and errors.append(f"{name}: {m.text}"))
        return pg
    phone = lambda name: watch(b.new_context(viewport={"width": 390, "height": 844}).new_page(), name)

    # ---------- the TV lobby shows the code and a QR to the join page ----------
    tv = watch(b.new_page(viewport={"width": 1600, "height": 900}), "tv")
    tv.goto(TV)
    tv.wait_for_selector(".tv-join .qr svg", timeout=20000)
    time.sleep(4.5)  # past the opening card
    ok(tv.inner_text(".tv-code").strip() == CODE, "the TV lobby shows the room code")
    ok(has(tv.inner_text(".tv-join"), "/join"), "the TV says where to type it")
    shot(tv, "01-tv-lobby.png")

    # ---------- phone A: types the code, taps its name ----------
    a = phone("phoneA")
    a.goto(f"{BASE}/join")
    a.wait_for_selector("#roomcode")
    shot(a, "02-join-code.png")
    a.locator("#roomcode").fill(CODE.lower())
    a.get_by_role("heading", name="Tap your name").wait_for(timeout=15000)
    names = a.locator(".join-list .nm").all_inner_texts()
    ok("Velma Kowalski" in names and len(names) == 6, f"the room lists every guest ({len(names)})")
    ok("code=" + CODE in a.url, "the code goes in the address so a reload lands back here")
    shot(a, "03-join-list.png")
    a.get_by_role("button", name="Join as Velma Kowalski").click()
    ok(has(a.inner_text("body"), "Only pick your own name"), "it asks before claiming the name")
    a.wait_for_timeout(700)
    shot(a, "04-join-confirm.png")
    a.get_by_role("button", name="Yes, that's me").click()
    a.wait_for_url(re.compile(r"/p/"), timeout=15000)
    ok(a.url.endswith("/p/" + me["token"]), "the phone lands on Velma's own link")
    a.wait_for_timeout(1500)
    shot(a, "05-joined-phone.png")

    # ---------- the TV announces it ----------
    ok(wait_for(lambda: tv.locator(".tv-toast").count() > 0 and has(tv.inner_text(".tv-toast"), "Velma Kowalski joined on a phone")), "the TV announces the claim")
    shot(tv, "06-tv-toast.png")

    # ---------- phone B: the name is taken ----------
    bph = phone("phoneB")
    bph.goto(f"{BASE}/join?code={CODE}")
    bph.get_by_role("heading", name="Tap your name").wait_for(timeout=15000)
    taken = bph.get_by_role("button", name="Velma Kowalski, taken")
    ok(taken.count() == 1 and taken.is_disabled(), "a second phone sees Velma taken and can't tap it")
    shot(bph, "07-join-taken.png")

    # ---------- phone C: a wrong code ----------
    cph = phone("phoneC")
    wrong = "ZZZZ" if CODE != "ZZZZ" else "XXXX"
    cph.goto(f"{BASE}/join?code={wrong}")
    ok(wait_for(lambda: has(cph.inner_text("body"), "doesn't match a game")), "a wrong code says so")
    shot(cph, "08-join-wrong.png")

    # ---------- phone A again: the join page offers its own card ----------
    a.goto(f"{BASE}/join?code={CODE}")
    a.get_by_role("heading", name="Tap your name").wait_for(timeout=15000)
    ok(a.get_by_role("button", name="Open my card").count() == 1, "a phone that already joined is offered its own card")

    # ---------- the landing page during the party ----------
    land = phone("landing")
    land.goto(f"{BASE}/?game={SLUG}")
    land.get_by_role("button", name="Join with the room code").wait_for(timeout=15000)
    ok(True, "the landing page offers the room code on party night")
    shot(land, "09-landing.png")

    # ---------- the host sees the code; a rescue frees the name ----------
    host = watch(b.new_page(viewport={"width": 1440, "height": 900}), "host")
    host.goto(HOST)
    ok(wait_for(lambda: has(host.inner_text("body"), "Room code " + CODE)), "the host's Live tab shows the room code")
    shot(host, "10-host-live.png")
    res = cx("host:rescuePhone", {"slug": SLUG, "hostKey": KEY, "playerId": VELMA["id"]})
    ok(res["token"] != me["token"], "a rescue makes Velma a new link")
    ok(wait_for(lambda: bph.get_by_role("button", name="Join as Velma Kowalski").count() == 1), "after the rescue Velma's name is free again (live)")
    bph.get_by_role("button", name="Join as Velma Kowalski").click()
    bph.get_by_role("button", name="Yes, that's me").click()
    bph.wait_for_url(re.compile(r"/p/"), timeout=15000)
    ok(bph.url.endswith("/p/" + res["token"]), "the guest rejoins on the new link")
    a.goto(f"{BASE}/p/{me['token']}")
    ok(wait_for(lambda: has(a.inner_text("body"), "doesn't match")), "the old link stops working")

    # ---------- while the rules play over the lobby, a small room-code badge stays on the TV ----------
    cx("voice:playRules", {"slug": SLUG, "hostKey": KEY})
    ok(wait_for(lambda: tv.locator(".tv-room").count() == 1 and CODE in tv.inner_text(".tv-room"), 15), "the TV keeps a room-code badge up while the rules play")
    tv.wait_for_timeout(1500)
    shot(tv, "11-tv-rules-badge.png")
    cx("voice:stopSegment", {"slug": SLUG, "hostKey": KEY})

    ok(not errors, "no page errors" + ("" if not errors else ": " + "; ".join(errors[:5])))
    b.close()

try:
    cx("admin:deleteTestGame", {"slug": SLUG})
except Exception as e:
    print("cleanup:", e)

print("\n" + ("ALL PASSED" if not fails else f"{len(fails)} FAILED: " + "; ".join(fails)))
raise SystemExit(1 if fails else 0)
