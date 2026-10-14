"""Phase 4 end-to-end: the host laptop (game menu + Live), the TV and guest phones, played
through a whole night against the dev backend with a fake cast.

Run from the repo with the preview server up (vite preview on :4173, built against dev):
  python3 tests/e2e/phase4.py            # everyone plays, rooms open in waves, round timer
  MODE=mc python3 tests/e2e/phase4.py    # Self MC
Screenshots go to $OUT (default ./e2e-out).
"""
import json, os, re, subprocess, sys, time
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173")
MODE = os.environ.get("MODE", "play")
SLUG = os.environ.get("SLUG", f"p4-e2e-{MODE}")
OUT = os.environ.get("OUT", "e2e-out")
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

# ---------- a fresh test game ----------
try:
    cx("admin:deleteTestGame", {"slug": SLUG})
except Exception:
    pass
created = cx("admin:createGame", {"slug": SLUG, "title": f"Phase 4 e2e ({MODE})", "isTest": True, "makeActive": False,
                                  "registrationClosesAt": int(time.time() * 1000) + 7 * 864e5, "deadlineLabel": "Sat, Oct 24"})
KEY = created["hostKey"]
cx("game:seedFakeCast", {"slug": SLUG, "guests": 7, "markers": 10, "seed": 11, "checkIn": False})
players = cx("admin:testPlayers", {"slug": SLUG})
TVKEY = cx("host:roster", {"slug": SLUG, "hostKey": KEY})["game"]["tvKey"]
HOST = f"{BASE}/host?game={SLUG}&key={KEY}"
TV = f"{BASE}/tv?game={SLUG}&key={TVKEY}"
print("host link:", HOST)

def has(text, needle):
    return needle.lower() in text.lower()

def layout(pg):
    return pg.evaluate("""() => [...document.querySelectorAll('.hx-sec, .hx-note, .hx-ctl, .hx-est, .inp, .hx-seg button, .big-go')]
      .map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top + window.scrollY), Math.round(r.width), Math.round(r.height)]; })""")

with sync_playwright() as p:
    b = p.chromium.launch()
    errors = []
    def watch(pg, name):
        pg.on("pageerror", lambda e: errors.append(f"{name}: {e}"))
        # expected noise: a guest's own mistakes come back as Convex errors, and Chrome blocks vibration before a tap
        noise = ("Failed to load resource", "ConvexError", "navigator.vibrate")
        pg.on("console", lambda m: m.type == "error" and not any(n in m.text for n in noise) and errors.append(f"{name}: {m.text}"))
        return pg

    host = watch(b.new_page(viewport={"width": 1440, "height": 900}, accept_downloads=True), "host")
    host.goto(HOST)
    host.wait_for_selector(".hx-sec", timeout=30000)
    ok(host.locator(".hx-tabs button[aria-pressed=true]").inner_text().strip().lower() == "game menu", "the host starts on the game menu before the doors open")
    ok(has(host.inner_text("body"), "Where the body turns up is drawn when the game starts"), "the body room isn't a menu setting")

    # ---------- the no-shift rule: every toggle, at laptop and phone widths ----------
    for width in (1440, 390):
        host.set_viewport_size({"width": width, "height": 900})
        host.wait_for_timeout(300)
        base = layout(host)
        for group, (a, bb) in {"How you're playing": ("Self MC", "Everyone plays"), "Script": ("Adult (explicit)", "Classic"),
                               "Motives and secrets": ("Players write their own", "Game writes them"), "Pacing": ("Round timer", "Players tap ready"),
                               "Searching": ("Rooms open in waves", "All rooms open")}.items():
            for label in (a, bb):
                host.locator(f'.hx-seg[aria-label="{group}"] button', has_text=re.compile(f"^{re.escape(label)}$")).click()
                host.wait_for_timeout(700)
                ok(layout(host) == base, f"{width}px: picking '{label}' moves nothing")
    host.set_viewport_size({"width": 1440, "height": 900})

    # ---------- settings through the menu ----------
    if MODE == "mc":
        host.locator('.hx-seg[aria-label="How you\'re playing"] button', has_text="Self MC").click()
        host.wait_for_timeout(500)
        host.locator("select.inp").first.select_option(players[0]["id"])
        host.wait_for_timeout(600)
    host.locator('.hx-seg[aria-label="Pacing"] button', has_text="Round timer").click()
    host.wait_for_timeout(500)
    for _ in range(9):
        host.get_by_role("button", name="Shorter rounds").click()
    host.wait_for_timeout(1200)
    ok(has(host.inner_text(".hx-est"), "about 25 min of play"), f"3-minute rounds show about 25 min of play ({host.inner_text('.hx-est')})")
    host.locator('.hx-seg[aria-label="Searching"] button', has_text="Rooms open in waves").click()
    host.wait_for_timeout(500)
    fields = host.locator(".hx-fields .inp")
    fields.nth(0).fill("VelvetRoom")
    fields.nth(1).fill("bootleg1929")
    fields.nth(1).press("Enter")
    host.wait_for_timeout(800)

    # rooms: add, name, persist, remove
    host.get_by_role("button", name="+ Add a room").click()
    host.wait_for_timeout(200)
    focused = host.evaluate("document.activeElement && document.activeElement.getAttribute('aria-label')")
    ok(focused == "Room 6: name in the game", f"the new room's name box gets the cursor ({focused})")
    host.keyboard.type("The Cigar Room")
    host.locator('[aria-label="Room 6: room in your house"]').fill("Garage")
    host.wait_for_timeout(1500)
    host.reload(); host.wait_for_selector(".hx-rooms .r", timeout=20000); host.wait_for_timeout(500)
    ok(host.locator(".hx-rooms .r:not(.head)").count() == 6, "a new room is saved")
    widths = host.evaluate("() => [...document.querySelectorAll('.hx-rooms .r:not(.head)')].map(r => [...r.querySelectorAll('.inp')].map(i => Math.round(i.getBoundingClientRect().width)).join(','))")
    ok(len(set(widths)) == 1, f"every room row has the same box widths ({widths[0]})")
    host.get_by_role("button", name="Remove room 6").click()
    host.wait_for_timeout(1500)
    ok(host.locator(".hx-rooms .r:not(.head)").count() == 5, "a room can be removed")

    # markers: one more, give it a room, then back to 10
    host.get_by_role("button", name="One more marker").click()
    host.wait_for_timeout(900)
    ok(has(host.inner_text("body"), "10 of 11 markers have a room"), "a new marker starts with no room")
    host.locator('[aria-label="Marker 11 room"]').select_option(index=2)
    host.wait_for_timeout(900)
    ok(has(host.inner_text("body"), "11 of 11 markers have a room"), "picking a room places the marker")
    host.get_by_role("button", name="One fewer marker").click()
    host.wait_for_timeout(900)

    # the printable PDF: every card, 3 pages
    with host.expect_download(timeout=60000) as dl:
        host.get_by_role("button", name=re.compile("Print QR cards")).click()
    pdf = os.path.join(OUT, "qr-cards.pdf")
    dl.value.save_as(pdf)
    data = open(pdf, "rb").read()
    pages = len(re.findall(rb"/Type\s*/Page[^s]", data))
    ok(pages == 3, f"the QR card PDF has 3 pages for 36 cards ({pages} pages, {len(data)//1024} KB)")
    host.screenshot(path=os.path.join(OUT, "01-menu.png"), full_page=True)

    # ---------- the TV and the phones ----------
    tv = watch(b.new_page(viewport={"width": 1280, "height": 720}), "tv")
    tv.goto(TV)
    tv.wait_for_selector(".tv-stage", timeout=30000)
    tv.mouse.click(640, 360)  # allow sound
    tv.wait_for_timeout(2500)
    ok(tv.url.endswith("/tv"), f"the TV's key leaves the address bar ({tv.url})")
    ok(TVKEY != KEY, "the TV has its own key, not the host key")
    tv.reload(); tv.wait_for_timeout(2500)
    ok(tv.locator(".tv-h2").count() >= 1 and not has(tv.inner_text("body"), "Open the TV from the host laptop"), "the TV still works after a reload")
    tv.mouse.click(640, 360)
    phones = []
    for i in (1, 2):
        ph = watch(b.new_page(viewport={"width": 390, "height": 844}), f"phone{i}")
        ph.goto(f"{BASE}/p/{players[i]['token']}")
        phones.append(ph)
    mcphone = None
    if MODE == "mc":
        mcphone = watch(b.new_page(viewport={"width": 390, "height": 844}), "mc-phone")
        mcphone.goto(f"{BASE}/p/{players[0]['token']}")

    host.get_by_role("button", name="Open the doors").click()
    host.wait_for_timeout(1500)
    ok(host.locator(".hx-tabs button[aria-pressed=true]").inner_text().strip().lower() == "live", "opening the doors switches the laptop to Live")
    tvtext = tv.inner_text(".tv-stage")
    ok("VelvetRoom" in tvtext and tv.locator(".tv-wifi svg").count() == 1, "the TV lobby shows the Wi-Fi and a join code")
    host.get_by_role("button", name="Sound check").first.click()
    tv.wait_for_timeout(1500)
    ok(has(tv.inner_text(".tv-stage"), "Sound check"), "Sound check shows on the TV")
    host.wait_for_timeout(1500)
    checks = host.inner_text(".hx-checks")
    ok(has(checks, "TV window open") and has(checks, "Sound allowed"), f"the laptop sees the TV is open with sound allowed ({checks!r})")
    phones[0].wait_for_selector("text=My weapon's bagged", timeout=20000)
    phones[0].get_by_role("button", name="My weapon's bagged").click()
    phones[0].wait_for_timeout(1500)
    ok(has(phones[0].inner_text("body"), "VelvetRoom"), "a checked-in phone shows the guest Wi-Fi")
    if mcphone:
        mcphone.wait_for_timeout(1000)
        ok(has(mcphone.inner_text("body"), "You're the MC tonight"), "the MC's phone says they're the MC")
    cx("game:seedFakeCast", {"slug": SLUG, "guests": 0, "markers": 0, "checkIn": True})
    tv.wait_for_timeout(1500)
    tv.screenshot(path=os.path.join(OUT, "02-tv-lobby.png"))
    host.screenshot(path=os.path.join(OUT, "03-live-lobby.png"), full_page=True)

    # ---------- Start: asks twice, then the intro ----------
    host.get_by_role("button", name="Start the game").click()
    host.wait_for_timeout(300)
    ok(has(host.inner_text(".hx-next"), "Tap again to start"), "Start asks for a second tap")
    host.locator(".hx-next .big-go").click()
    host.wait_for_timeout(2500)
    tv.screenshot(path=os.path.join(OUT, "04-tv-intro-1.png"))
    ok(has(host.inner_text(".hx-status-box"), "The intro is playing"), "the laptop shows the intro playing")
    roster = cx("host:roster", {"slug": SLUG, "hostKey": KEY})
    body_room = roster["game"]["bodyRoom"]
    ok(bool(body_room), f"the body room was drawn at Start ({body_room})")
    tv.wait_for_timeout(14000)
    ok(re.sub(r"^The ", "", body_room) in tv.inner_text(".tv-stage"), "the TV intro shows where the body turned up")
    tv.screenshot(path=os.path.join(OUT, "05-tv-intro-2.png"))
    ph = phones[0]
    ph.wait_for_selector(".hold-card", timeout=20000)
    ok(re.sub(r"^The ", "", body_room) in ph.inner_text("body"), "the phone says where the body was found")
    if MODE == "mc":
        sheet = host.inner_text(".hx-mc")
        ok(has(sheet, "MC sheet") and has(sheet, "Body found in"), "Self MC: the Live tab shows the MC sheet")
        ok(has(sheet, "He was found in"), "the MC sheet has the intro lines to read")
        ok(tv.locator(".tv-caption .who").inner_text().strip().upper() == "MC", "Self MC: TV captions are marked MC")
    else:
        ok(host.locator(".hx-mc").count() == 0, "everyone plays: no MC sheet on the laptop")
    box = ph.locator(".hold-card").bounding_box()
    ph.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    ph.mouse.down(); ph.wait_for_timeout(300)
    ph.screenshot(path=os.path.join(OUT, "06-phone-hold.png"))
    ph.mouse.up(); ph.wait_for_timeout(200)
    ph.get_by_role("button", name="Open my case file").click()
    host.get_by_role("button", name="Begin Round 1").click()
    host.wait_for_timeout(2000)

    # ---------- Round 1: waves ----------
    tvtext = tv.inner_text(".tv-stage")
    ok(has(tvtext, "Find the markers") and has(tvtext, "Open for searching this round"), "TV Round 1 shows which rooms are open")
    tv.screenshot(path=os.path.join(OUT, "07-tv-r1.png"))
    roster = cx("host:roster", {"slug": SLUG, "hostKey": KEY})
    open_now = set(roster["game"]["openRooms"])
    labels = {r["key"]: r["label"] for r in roster["game"]["rooms"]}
    cards = cx("host:markerCards", {"slug": SLUG, "hostKey": KEY})["markers"]
    sealed = next((m for m in cards if m["room"] not in open_now), None)
    opened = next(m for m in cards if m["room"] in open_now)
    ph.get_by_role("button", name="Scan", exact=True).click()
    ph.wait_for_timeout(800)
    ok(has(ph.inner_text("body"), "Open for searching"), "the phone's Scan tab lists the open rooms")
    if sealed:
        ph.fill("#marker-code", sealed["code"]); ph.get_by_role("button", name="Read").click(); ph.wait_for_timeout(1200)
        ok(has(ph.inner_text("body"), "sealed until Round"), f"a marker in a closed room is sealed ({sealed['room']})")
    ph.fill("#marker-code", opened["code"]); ph.get_by_role("button", name="Read").click(); ph.wait_for_timeout(1200)
    ok(has(ph.inner_text("body"), f"Marker {opened['number']}"), "a marker in an open room reads")
    ph.screenshot(path=os.path.join(OUT, "08-phone-marker.png"))

    # ---------- Rounds 2 and 3, show all, pause ----------
    host.get_by_role("button", name="Next round").click(); host.wait_for_timeout(2500)
    ok(has(tv.inner_text(".tv-stage"), "Round 2") and tv.locator(".tv-ev").count() >= 1, "TV Round 2 shows the new evidence")
    tv.screenshot(path=os.path.join(OUT, "09-tv-r2.png"))
    host.get_by_role("button", name="Show all evidence on the TV").click(); tv.wait_for_timeout(1500)
    ok(has(tv.inner_text(".tv-stage"), "All the evidence so far"), "Show all evidence takes over the TV")
    tv.screenshot(path=os.path.join(OUT, "10-tv-all.png"))
    host.get_by_role("button", name="Back to the round").click(); tv.wait_for_timeout(1000)
    host.get_by_role("button", name="Pause").click(); tv.wait_for_timeout(1500)
    ok(has(tv.inner_text(".tv-stage"), "Hold everything"), "Pause shows on the TV")
    ok(has(phones[1].inner_text(".topline"), "Paused"), "Pause shows on the phones")
    host.get_by_role("button", name="Resume").click(); host.wait_for_timeout(1000)

    # rescue a phone: a new link, the old one stops, the TV says so
    host.get_by_role("button", name="Rescue a phone").click()
    rescue = host.locator(".hx-sec", has=host.locator("h3", has_text="Rescue a phone"))
    rescue.locator("select").select_option(players[2]["id"])
    rescue.get_by_role("button", name="Make a new link").click()
    host.wait_for_timeout(300)
    ok(has(rescue.inner_text(), "Tap again"), "rescuing a phone asks for a second tap")
    rescue.locator("button.btn").click()
    host.wait_for_timeout(1500)
    ok(rescue.locator(".qr svg").count() == 1, "the new link shows as a QR code")
    tv.wait_for_timeout(500)
    ok(has(tv.inner_text(".tv-stage"), f"New link for {players[2]['charName']}"), "the TV announces the rescue")
    phones[1].reload(); phones[1].wait_for_timeout(2500)
    ok(not phones[1].locator(".topline").count(), "the old link stops working")
    fresh = next(x for x in cx("admin:testPlayers", {"slug": SLUG}) if x["id"] == players[2]["id"])
    phones[1].goto(f"{BASE}/p/{fresh['token']}"); phones[1].wait_for_timeout(2500)
    ok(phones[1].locator(".hold-card, .topline").count() >= 1, "the new link opens their game")
    host.get_by_role("button", name="Rescue a phone").click()
    host.get_by_role("button", name="Next round").click(); host.wait_for_timeout(4500)
    ok(tv.locator(".tv-ev.twist").count() == 1, "TV Round 3 ends on the twist")
    tv.screenshot(path=os.path.join(OUT, "11-tv-r3.png"))
    if MODE == "mc":
        ok(has(host.inner_text(".hx-mc"), "And now, the twist") or "twist" in host.inner_text(".hx-mc").lower(), "the MC sheet has the twist to read")

    # ---------- accusations and the reveal ----------
    host.get_by_role("button", name="Open accusations").click(); host.wait_for_timeout(2000)
    ok(has(tv.inner_text(".tv-stage"), "Who killed the Don"), "TV shows accusations")
    ph.get_by_role("button", name="Accuse").click()
    for group in ("Who", "Which exhibit", "Where"):
        ph.locator(".pick", has=ph.locator(".eyebrow", has_text=re.compile(f"^{group}$", re.I))).locator(".opts button").first.click()
    where = "() => { const b = [...document.querySelectorAll('.primary')].find(x => /accusation/i.test(x.textContent)); return Math.round(b.getBoundingClientRect().top + window.scrollY); }"
    before = ph.evaluate(where)
    ph.get_by_role("button", name="Lock in my accusation").click(); ph.wait_for_timeout(1200)
    after = ph.evaluate(where)
    ok(before == after, f"locking in an accusation doesn't move the button ({before} -> {after})")
    host.wait_for_timeout(1500)
    host.screenshot(path=os.path.join(OUT, "12-live-accuse.png"), full_page=True)
    host.locator(".hx-next .big-go").click(); host.wait_for_timeout(300)
    ok(has(host.inner_text(".hx-next"), "only"), "starting the reveal early asks for a second tap")
    host.locator(".hx-next .big-go").click()
    tv.wait_for_timeout(1500)
    tv.screenshot(path=os.path.join(OUT, "13-tv-reveal-1.png"))
    tv.wait_for_timeout(6500)
    tv.screenshot(path=os.path.join(OUT, "14-tv-reveal-2.png"))
    killer = cx("game:results", {"slug": SLUG})["killer"]
    ok(killer in tv.inner_text(".tv-stage"), f"the TV names the killer ({killer})")
    tv.wait_for_timeout(13000)
    ok(has(tv.inner_text(".tv-stage"), "The verdict"), "the reveal ends on the verdict")
    tv.screenshot(path=os.path.join(OUT, "15-tv-verdict.png"))
    if MODE == "mc":
        ok(killer in host.inner_text(".hx-mc"), "the MC sheet reads out the killer")
    ph.locator(".pick", has=ph.locator(".eyebrow", has_text="Best Dressed")).locator(".opts button").first.click()
    ph.get_by_role("button", name="Cast my votes").click(); ph.wait_for_timeout(1000)
    host.get_by_role("button", name="Show the awards").click(); tv.wait_for_timeout(3000)
    ok(has(tv.inner_text(".tv-stage"), "To the winners"), "TV shows the awards")
    tv.screenshot(path=os.path.join(OUT, "16-tv-awards.png"))
    host.get_by_role("button", name="End the night").click(); tv.wait_for_timeout(2000)
    ok(has(tv.inner_text(".tv-stage"), "That's the night"), "End the night shows the closing card")
    ok(host.locator(".hx-next .big-go").is_disabled(), "the laptop's button is done")
    host.screenshot(path=os.path.join(OUT, "17-live-end.png"), full_page=True)

    ok(not errors, f"no page errors {errors[:5]}")
    b.close()

print(f"\n{len(fails)} failed" if fails else "\nALL PASSED")
sys.exit(1 if fails else 0)
