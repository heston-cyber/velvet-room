"""Phase 5 end-to-end: the videos, the narrator, the roll call and the reveal, against the dev backend.

Run with a preview server up (built against dev). The test browser can't play H.264, so point BASE at
a copy of the site whose videos were swapped for VP9 stand-ins (see tests/e2e/README in the report):
  BASE=http://localhost:4174 python3 tests/e2e/phase5.py
Screenshots go to $OUT (default ./e2e-out/p5).
"""
import json, os, re, subprocess, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = os.environ.get("SLUG", "p5-e2e")
OUT = os.environ.get("OUT", "e2e-out/p5")
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
            env[k] = v
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

# ---------- a fresh test game ----------
try:
    cx("admin:deleteTestGame", {"slug": SLUG})
except Exception:
    pass
created = cx("admin:createGame", {"slug": SLUG, "title": "Phase 5 e2e", "isTest": True, "makeActive": False,
                                  "registrationClosesAt": int(time.time() * 1000) + 7 * 864e5, "deadlineLabel": "Sat, Oct 24"})
KEY = created["hostKey"]
cx("game:seedFakeCast", {"slug": SLUG, "guests": 5, "markers": 8, "seed": 21, "checkIn": False})
me = cx("registration:register", {"slug": SLUG, "realName": "Heston Test", "charName": "Velma Kowalski", "who": "Cigarette girl who sells secrets.",
                                  "signature": "Silver cigarette case", "weapon": "Brass candlestick", "weaponDesc": "Heavy, dented base.", "killerOk": True,
                                  "rumor": "Once cheated a priest at cards, and won.", "sayAs": "VEL-muh koh-WAL-skee"})
ok(bool(me and me.get("token")), "a guest signs up with a roll-call line and Say it like")
TVKEY = cx("host:roster", {"slug": SLUG, "hostKey": KEY})["game"]["tvKey"]
HOST = f"{BASE}/host?game={SLUG}&key={KEY}"
TV = f"{BASE}/tv?game={SLUG}&key={TVKEY}"
print("host link:", HOST)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--autoplay-policy=no-user-gesture-required"])
    errors, audio = [], []
    def watch(pg, name):
        pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
        noise = ("Failed to load resource", "ConvexError", "navigator.vibrate")
        pg.on("console", lambda m: m.type == "error" and not any(n in m.text for n in noise) and errors.append(f"{name}: {m.text}"))
        pg.on("request", lambda r: ("/audio/" in r.url or "/api/storage/" in r.url) and audio.append(r.url))
        return pg

    # ---------- sign-up: the two new questions ----------
    su = watch(b.new_page(viewport={"width": 390, "height": 844}), "signup")
    su.goto(f"{BASE}/?game={SLUG}")
    su.get_by_role("button", name="Step inside").click()
    su.locator("#f-realName").fill("Phone Tester")
    su.get_by_role("button", name=re.compile("Next: your character")).click()
    su.wait_for_selector("#f-rumor")
    ok(su.locator("#f-sayAs").count() == 1 and has(su.inner_text("body"), "word on the street"), "sign-up asks the roll-call question and Say it like")
    su.locator("#f-charName").fill("Lucky Lou")
    su.locator("#f-rumor").fill("Lost his own car in a card game. Twice.")
    su.screenshot(path=os.path.join(OUT, "00-signup-character.png"), full_page=True)
    su.close()

    # ---------- the game menu: narrator and roll call ----------
    host = watch(b.new_page(viewport={"width": 1440, "height": 900}), "host")
    host.goto(HOST)
    host.wait_for_selector(".hx-rollcall", timeout=30000)
    ok(has(host.inner_text("body"), "Narrator and sound") and host.locator(".hx-level").count() == 3, "the menu has the narrator and three levels")
    rows = host.locator(".hx-rollcall li")
    ok(rows.count() == 6, f"the roll call lists every guest ({rows.count()})")
    lines = host.evaluate("() => [...document.querySelectorAll('.hx-rollcall textarea')].map(t => t.value)")
    ok("Word on the street: Once cheated a priest at cards, and won." in lines, "a guest's rumor becomes their line")
    box = rows.nth(1).locator("textarea")
    box.fill("The only man in Chicago who is afraid of pigeons.")
    host.locator(".hx-sec h3", has_text="Roll call").click()  # blur saves
    host.wait_for_timeout(1500)
    ok(has(host.inner_text(".hx-rollcall"), "Use their words"), "an edited line can go back to the guest's words")
    host.get_by_role("button", name=re.compile(r"^Record \d+ voices?")).click()
    for _ in range(60):
        host.wait_for_timeout(2000)
        st = host.inner_text(".hx-rollcall").lower()
        if "recording" not in st and "not recorded" not in st:
            break
    status = host.locator(".hx-sec", has_text="Roll call ·").locator(".hx-status").inner_text()
    ok(has(status, "6 of 6 recorded"), f"all roll-call voices recorded on the server ({status})")
    host.screenshot(path=os.path.join(OUT, "01-menu.png"), full_page=True)

    # ---------- the TV ----------
    tv = watch(b.new_page(viewport={"width": 1280, "height": 720}), "tv")
    tv.goto(TV)
    tv.wait_for_selector(".tv-stage", timeout=30000)
    tv.mouse.click(640, 360)
    for _ in range(40):
        if has(tv.inner_text(".tv-controls"), "Videos ready"):
            break
        tv.wait_for_timeout(1000)
    ok(has(tv.inner_text(".tv-controls"), "Videos ready"), "the TV loads all 20 videos")
    playing = tv.evaluate("() => [...document.querySelectorAll('.tv-backdrop video')].some(v => !v.paused && v.readyState >= 2)")
    ok(playing, "a background loop is playing behind the TV")

    host.get_by_role("button", name="Open the doors").click()
    tv.wait_for_timeout(1500)
    ok(tv.locator(".tv-card video").count() == 1, "opening the doors plays the Opening Title card")
    shot(tv, "02-tv-opening-card.png")
    tv.wait_for_timeout(5500)
    ok(tv.locator(".tv-card").count() == 0 and has(tv.inner_text(".tv-stage"), "The doors are open"), "the card fades away to the doors scene")
    ok(has(tv.inner_text(".tv-stage"), "Welcome to the Velvet Room"), "the narrator's welcome shows as a caption")
    shot(tv, "03-tv-doors.png")
    cx("game:seedFakeCast", {"slug": SLUG, "guests": 0, "markers": 0, "checkIn": True})
    host.wait_for_timeout(2000)
    checks = host.inner_text(".hx-checks")
    ok(has(checks, "TV videos loaded"), f"the laptop sees the TV's videos are in ({checks!r})")

    # ---------- house rules ----------
    host.get_by_role("button", name="Play the house rules").click()
    tv.wait_for_timeout(2500)
    ok(has(tv.inner_text(".tv-stage"), "House rule 1 of 5"), "the TV plays the house rules")
    shot(tv, "04-tv-rule.png")
    host.get_by_role("button", name="Stop").click()
    tv.wait_for_timeout(1500)
    ok(has(tv.inner_text(".tv-stage"), "The doors are open"), "Stop goes back to the doors")

    # ---------- roll call ----------
    host.get_by_role("button", name="Play the roll call").click()
    tv.wait_for_timeout(1500)
    ok(tv.locator(".tv-card video").count() == 1, "the roll call opens on its title card")
    shot(tv, "05-tv-rollcall-card.png")
    seen = set()
    t0 = time.time()
    while time.time() - t0 < 90:
        tv.wait_for_timeout(1000)
        txt = tv.inner_text(".tv-stage")
        m = re.search(r"Roll call · (\d+) of (\d+)", txt, re.I)
        if m and m.group(1) not in seen:
            seen.add(m.group(1))
            tv.wait_for_timeout(1500)
            shot(tv, f"06-tv-roll-{m.group(1)}.png")
            if m.group(1) == m.group(2):
                break
    ok(len(seen) == 6, f"every guest gets a roll-call card ({sorted(seen)})")
    tv.wait_for_timeout(9000)
    ok(has(tv.inner_text(".tv-stage"), "Tonight's guests") or has(tv.inner_text(".tv-stage"), "The doors are open"), "the roll call closes on everyone, then the doors")
    shot(tv, "07-tv-roll-end.png")

    # ---------- Start: lights out, the intro ----------
    host.get_by_role("button", name="Start the game").click()
    host.wait_for_timeout(300)
    host.locator(".hx-next .big-go").click()
    tv.wait_for_timeout(1200)
    ok(tv.locator(".tv-card video").count() == 1, "Start plays Lights Out")
    shot(tv, "08-tv-lightsout.png")
    tv.wait_for_timeout(4000)
    shot(tv, "09-tv-intro1.png")
    tv.wait_for_timeout(13000)
    shot(tv, "10-tv-intro2.png")
    tv.wait_for_timeout(5000)
    cap = tv.inner_text(".tv-stage")
    ok(has(cap, "found in") , "the intro says where the body was found")
    shot(tv, "11-tv-intro2-body.png")
    host.get_by_role("button", name="Begin Round 1").click()
    tv.wait_for_timeout(1500)
    shot(tv, "12-tv-round1-card.png")
    tv.wait_for_timeout(5000)
    shot(tv, "13-tv-round1.png")
    host.get_by_role("button", name="Next round").click()
    tv.wait_for_timeout(6500)
    shot(tv, "14-tv-round2.png")
    host.get_by_role("button", name="Next round").click()
    tv.wait_for_timeout(5500)
    shot(tv, "15-tv-round3.png")
    twisted = False
    for _ in range(25):
        tv.wait_for_timeout(1000)
        if tv.locator(".tv-card video").count():
            shot(tv, "16-tv-twist-card.png")
            twisted = True
            break
    ok(twisted, "the twist gets its own title card")
    tv.wait_for_timeout(5500)
    ok(tv.locator(".tv-ev.twist").count() >= 1, "the twist lands after its card")
    shot(tv, "17-tv-twist.png")

    # ---------- accusations and the reveal ----------
    host.get_by_role("button", name="Open accusations").click()
    tv.wait_for_timeout(1300)
    shot(tv, "18-tv-accuse-card.png")
    tv.wait_for_timeout(5000)
    shot(tv, "19-tv-accuse.png")
    phone = watch(b.new_page(viewport={"width": 390, "height": 844}), "phone")
    phone.goto(f"{BASE}/p/{me['token']}")
    cx("game:fakeGuestsAct", {"slug": SLUG, "action": "accuse"})
    host.wait_for_timeout(1500)
    if has(host.inner_text(".hx-next"), "Start the reveal"):
        host.locator(".hx-next .big-go").click()
        host.wait_for_timeout(300)
        if has(host.inner_text(".hx-next"), "Tap again"):
            host.locator(".hx-next .big-go").click()
    t_rev = time.time()
    tv.wait_for_timeout(1500)
    shot(tv, "20-tv-reveal-card.png")
    phone.wait_for_timeout(1500)
    ok(has(phone.inner_text("body"), "Eyes on the TV") and not has(phone.inner_text("body"), "It was"), "phones keep the answer back while the TV reveals it")
    for at, name in ((6, "21-tv-reveal-line.png"), (11, "22-tv-reveal-name.png"), (16, "23-tv-reveal-how.png"), (23, "24-tv-verdict.png")):
        tv.wait_for_timeout(max(0, int((t_rev + at - time.time()) * 1000)))
        shot(tv, name)
    phone.wait_for_timeout(1500)
    ok(has(phone.inner_text("body"), "It was"), "after the verdict the phone shows the answer and the votes")

    # ---------- awards and goodnight ----------
    host.get_by_role("button", name="Show the awards").click()
    tv.wait_for_timeout(1500)
    shot(tv, "25-tv-awards-card.png")
    tv.wait_for_timeout(25000)
    ok(tv.locator(".tv-award.waiting").count() == 0, "all three awards are on the TV once the narrator has named them")
    shot(tv, "26-tv-awards.png")
    host.get_by_role("button", name="End the night").click()
    tv.wait_for_timeout(1500)
    shot(tv, "27-tv-lastcall-card.png")
    tv.wait_for_timeout(5000)
    shot(tv, "28-tv-goodnight.png")

    sfx = [u for u in audio if "/audio/sfx/" in u]
    music = [u for u in audio if "/audio/music/" in u]
    ok(len(set(sfx)) >= 15, f"the TV loaded the sound effects ({len(set(sfx))} files)")
    ok(len(set(music)) == 4, f"the TV loaded all four music beds ({len(set(music))})")
    narr = [u for u in audio if "/audio/narration/" in u]
    clips = [u for u in audio if "/api/storage/" in u]
    ok(len(narr) >= 20, f"the TV fetched the narrator's lines ({len(narr)} requests)")
    ok(len(clips) >= 6, f"the TV fetched the party's recorded clips ({len(clips)} requests)")
    ok(not errors, "no page errors" + ("" if not errors else f": {errors[:5]}"))
    b.close()

print(f"\n{len(fails)} failed" if fails else "\nall passed")
raise SystemExit(1 if fails else 0)
