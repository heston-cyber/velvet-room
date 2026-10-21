"""Phase 6 end-to-end, against the dev backend: the drawn cast on the TV, How to play after the roll
call, the house map with markers stamped as they're found, and New game at the end of the night.
  BASE=http://localhost:4174 python3 tests/e2e/phase6.py
Screenshots go to $OUT (default ./e2e-out/p6).
"""
import json, os, re, subprocess, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = os.environ.get("SLUG", "p6-e2e")
OUT = os.environ.get("OUT", "e2e-out/p6")
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

for s in (SLUG, f"{SLUG}-g2"):
    try:
        cx("admin:deleteTestGame", {"slug": s})
    except Exception:
        pass
created = cx("admin:createGame", {"slug": SLUG, "title": "Phase 6 e2e", "isTest": True, "makeActive": False,
                                  "registrationClosesAt": int(time.time() * 1000) + 7 * 864e5, "deadlineLabel": "Sat, Oct 24"})
KEY = created["hostKey"]
cx("host:updateSettings", {"slug": SLUG, "hostKey": KEY, "pacing": {"mode": "timer", "roundMinutes": 10}, "search": "waves"})
cx("game:seedFakeCast", {"slug": SLUG, "guests": 5, "markers": 8, "seed": 21, "checkIn": True})
roster = cx("host:roster", {"slug": SLUG, "hostKey": KEY})
TVKEY = roster["game"]["tvKey"]
players = cx("admin:testPlayers", {"slug": SLUG})
cards = cx("host:markerCards", {"slug": SLUG, "hostKey": KEY})
codes = {c["number"]: c["code"] for c in cards["cards"]}
rooms_of = {m["number"]: m["room"] for m in cards["markers"]}
HOST = f"{BASE}/host?game={SLUG}&key={KEY}"
TV = f"{BASE}/tv?game={SLUG}&key={TVKEY}"

with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    errors, art = [], set()
    def watch(pg, name):
        pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
        noise = ("Failed to load resource", "ConvexError", "navigator.vibrate")
        pg.on("console", lambda m: m.type == "error" and not any(n in m.text for n in noise) and errors.append(f"{name}: {m.text}"))
        pg.on("response", lambda r: "/art/" in r.url and r.status == 200 and art.add(r.url.rsplit("/", 1)[-1]))
        return pg

    tv = watch(b.new_page(viewport={"width": 1280, "height": 720}), "tv")
    tv.goto(TV)
    tv.wait_for_selector(".tv-stage", timeout=30000)
    tv.mouse.click(640, 360)
    loaded = lambda: tv.evaluate("() => new Set(performance.getEntriesByType('resource').map(e => e.name).filter(n => /\\/art\\/[a-z]+\\.webp$/.test(n))).size")
    ok(wait_for(lambda: loaded() >= 18, 20), f"the TV fetches the whole drawn cast ({loaded()} of 18)")

    # ---------- sign-ups: the QR and the cast along the bottom ----------
    ok(wait_for(lambda: tv.locator(".cameo.lineup").count() == 6), "before the doors open, six figures line up along the bottom")
    names = tv.locator(".cameo.lineup .cameo-name").all_inner_texts()
    ok(len(names) == 5, f"the five guests signed up stand in their own drawings, named ({names})")
    ok(tv.locator(".tv-join .qr svg").count() == 1 and has(tv.inner_text(".tv-join"), "Make your character"), "the TV shows a sign-up QR")
    shot(tv, "01-tv-signup.png")

    host = watch(b.new_page(viewport={"width": 1440, "height": 900}), "host")
    host.goto(HOST)
    host.get_by_role("button", name="Open the doors").wait_for(timeout=30000)
    host.get_by_role("button", name="Open the doors").click()
    tv.wait_for_timeout(5500)
    ok(tv.locator(".cameo.stand.don").count() == 1, "the Don greets the room from the side of the doors scene")
    shot(tv, "02-tv-doors-don.png")

    # ---------- How to play ----------
    host.get_by_role("button", name="Live").click()
    host.get_by_role("button", name="Play How to play only").click()
    seen = {}
    t0 = time.time()
    while time.time() - t0 < 110 and len(seen) < 9:
        tv.wait_for_timeout(700)
        m = re.search(r"How to play · (\d+) of (\d+)", tv.inner_text(".tv-stage"), re.I)
        if m and m.group(1) not in seen:
            tv.wait_for_timeout(1300)
            seen[m.group(1)] = tv.locator(".tv-how-art img").get_attribute("src") if tv.locator(".tv-how-art img").count() else "map"
            shot(tv, f"03-tv-how-{int(m.group(1)):02d}.png")
    ok(len(seen) == 9, f"How to play shows nine cards ({sorted(seen, key=int)})")
    ok(seen.get("1", "").endswith("don.webp") and seen.get("2", "").endswith("killer.webp") and seen.get("5") == "map", f"each card has its drawing, and card 5 is the map ({seen})")
    host.get_by_role("button", name="Stop").click()

    # ---------- lights out: the Don's last toast ----------
    host.get_by_role("button", name="Start the game").click()
    host.wait_for_timeout(300)
    host.locator(".hx-next .big-go").click()
    ok(wait_for(lambda: tv.locator(".tv-cameos.cameos-over .cameo.fall.don").count() == 1, 5), "at lights out the Don toasts, then falls (over the card)")
    shot(tv, "04-tv-lightsout-don.png")
    tv.wait_for_timeout(1300)
    shot(tv, "05-tv-lightsout-silhouette.png")

    # ---------- Round 1: the map, and a guest creeping past ----------
    host.get_by_role("button", name="Begin Round 1").click()
    tv.wait_for_timeout(5800)
    ok(tv.locator(".tv-map").count() == 1, "the house map is on the TV while guests search")
    rooms = tv.locator(".tv-map .room")
    ok(rooms.count() == 5, f"all five game rooms are drawn ({rooms.count()})")
    ok(tv.locator(".tv-map .room.sealed").count() >= 1, "rooms that open later are hatched as sealed")
    ok(tv.locator(".tv-map .pin").count() == 8, f"every marker is a pin on the map ({tv.locator('.tv-map .pin').count()})")
    ok(wait_for(lambda: tv.locator(".cameo.creep, .cameo.creepBack").count() == 1, 6), "a guest tiptoes across as the round opens")
    shot(tv, "06-tv-round1-map.png")
    open_rooms = [r["key"] for r in cx("host:roster", {"slug": SLUG, "hostKey": KEY})["game"]["rooms"]]
    # Find three markers in open rooms by scanning them from fake guests' phones.
    state = tv.evaluate("() => [...document.querySelectorAll('.tv-map .room.open')].length")
    found = 0
    for n, code in sorted(codes.items()):
        if n not in rooms_of or found >= 3:
            continue
        try:
            cx("game:scanMarker", {"token": players[found]["token"], "code": code})
            found += 1
        except Exception:
            pass
    ok(found >= 1, f"fake guests found {found} markers in open rooms")
    ok(wait_for(lambda: tv.locator(".tv-map .pin.found").count() == found, 8), f"found markers get stamped on the map ({tv.locator('.tv-map .pin.found').count()} of {found})")
    ok(has(tv.inner_text(".tv-map figcaption"), f"{found} of 8 markers found"), "the map counts what's been found")
    tv.wait_for_timeout(400)
    shot(tv, "07-tv-map-stamped.png")

    # ---------- Round 3: the twist, and the killer peeks in ----------
    host.get_by_role("button", name="Next round").click()
    tv.wait_for_timeout(6000)
    shot(tv, "08-tv-round2-map.png")
    host.get_by_role("button", name="Next round").click()
    ok(wait_for(lambda: tv.locator(".cameo.peek.killer").count() == 1, 45), "after the twist the masked killer peeks in")
    tv.wait_for_timeout(1200)
    shot(tv, "09-tv-twist-peek.png")

    # ---------- accusations: the line-up ----------
    host.get_by_role("button", name="Open accusations").click()
    tv.wait_for_timeout(6500)
    ok(tv.locator(".cameo.lineup").count() == 6 and tv.locator(".cameo.lineup.killer").count() == 1, f"the accusations open on the suspects' drawings with the masked one among them ({tv.locator('.cameo.lineup').count()})")
    shot(tv, "10-tv-lineup.png")

    # ---------- the reveal: spotlight, then unmasked ----------
    cx("game:fakeGuestsAct", {"slug": SLUG, "action": "accuse"})
    host.wait_for_timeout(1500)
    if has(host.inner_text(".hx-next"), "Start the reveal"):
        host.locator(".hx-next .big-go").click()
        host.wait_for_timeout(300)
        if has(host.inner_text(".hx-next"), "Tap again"):
            host.locator(".hx-next .big-go").click()
    t_rev = time.time()
    tv.wait_for_timeout(int((t_rev + 6 - time.time()) * 1000))
    ok(tv.locator(".cameo.spot.killer").count() == 1, "the masked killer stands in the spotlight before the name")
    shot(tv, "11-tv-reveal-spot.png")
    tv.wait_for_timeout(max(0, int((t_rev + 9.4 - time.time()) * 1000)))
    shot(tv, "12-tv-reveal-unmask.png")
    ok(wait_for(lambda: tv.locator(".cameo.unmasked").count() == 1, 4), "out of the flash steps the real killer's drawing")
    tv.wait_for_timeout(1500)
    shot(tv, "12b-tv-reveal-killer-drawing.png")

    # ---------- awards, goodnight, and New game ----------
    tv.wait_for_timeout(max(0, int((t_rev + 22 - time.time()) * 1000)))
    host.get_by_role("button", name="Show the awards").click()
    tv.wait_for_timeout(6000)
    ok(tv.locator(".cameo.detective").count() == 1 and tv.locator(".cameo.flapper").count() == 1, "two guests flank the awards")
    shot(tv, "13-tv-awards.png")
    host.get_by_role("button", name="End the night").click()
    tv.wait_for_timeout(6000)
    ok(tv.locator(".cameo.standRight.don").count() == 1, "the Don raises a last glass on the closing card")
    shot(tv, "14-tv-goodnight.png")
    phone = watch(b.new_page(viewport={"width": 390, "height": 844}), "phone")
    phone.goto(f"{BASE}/p/{players[0]['token']}")
    phone.wait_for_timeout(2500)
    host.get_by_role("button", name="Start a new game").click()
    host.wait_for_timeout(300)
    host.get_by_role("button", name=re.compile("Tap again")).click()
    ok(wait_for(lambda: f"game={SLUG}-g2" in host.evaluate("() => location.href"), 15), f"Start a new game takes the host to game 2 ({host.evaluate('() => location.href').split('&')[0]})")
    shot(host, "15a-host-game2.png")
    ok(wait_for(lambda: has(host.inner_text("body"), "Open the doors"), 15), "game 2 starts in sign-ups on the host page")
    ok(wait_for(lambda: tv.locator(".tv-join .qr svg").count() == 1 and has(tv.inner_text(".tv-stage"), "new mystery"), 15), "the TV follows into game 2 and shows the sign-up QR")
    shot(tv, "15-tv-game2-signup.png")
    ok(wait_for(lambda: phone.get_by_role("button", name="Sign up for the next game").count() == 1, 15), "game-1 phones get a Sign up for the next game button")
    shot(phone, "16-phone-next-game.png")
    phone.get_by_role("button", name="Sign up for the next game").click()
    ok(wait_for(lambda: has(phone.inner_text("body"), "Step inside") or has(phone.inner_text("body"), "STEP INSIDE"), 15), "and it opens game 2's sign-up")
    shot(phone, "17-phone-game2-signup.png")
    g2 = cx("host:roster", {"slug": f"{SLUG}-g2", "hostKey": KEY})
    ok(len(g2["markers"]) == 8 and g2["game"]["rooms"] == roster["game"]["rooms"], "game 2 keeps the rooms and the marker cards")

    ok(not errors, "no page errors" + ("" if not errors else ": " + "; ".join(errors[:5])))
    b.close()

for s in (SLUG, f"{SLUG}-g2"):
    try:
        cx("admin:deleteTestGame", {"slug": s})
    except Exception as e:
        print("cleanup:", e)

print("\n" + ("ALL PASSED" if not fails else f"{len(fails)} FAILED: " + "; ".join(fails)))
raise SystemExit(1 if fails else 0)
