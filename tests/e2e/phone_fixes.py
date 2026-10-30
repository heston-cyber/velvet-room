"""Checks the press-and-hold role card and in-app camera scanning (Chromium fake camera showing a marker QR)."""
import json, os, subprocess, sys, time
import qrcode
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = "test-fixes"
OUT = "/tmp/vr-fixes"; os.makedirs(OUT, exist_ok=True)
env = dict(os.environ)
for line in open(".env.local"):
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1); env[k] = v
def convex(fn, args):
    r = subprocess.run(["npx", "convex", "run", fn, json.dumps(args)], capture_output=True, text=True, env=env)
    if r.returncode: raise RuntimeError(r.stderr[-300:])
    o = r.stdout.strip(); return json.loads(o) if o[:1] in "{[\"" else o
def data(table):
    r = subprocess.run(["npx", "convex", "data", table, "--limit", "500", "--format", "jsonLines"], capture_output=True, text=True, env=env)
    return [json.loads(l) for l in r.stdout.splitlines() if l.strip()]
results = []
def check(name, ok, detail=""):
    results.append(ok); print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))

try: convex("admin:deleteTestGame", {"slug": SLUG})
except Exception: pass
hk = convex("admin:createGame", {"slug": SLUG, "title": "Fixes test", "isTest": True, "makeActive": False, "registrationClosesAt": int((time.time()+86400)*1000), "deadlineLabel": "x"})["hostKey"]
convex("game:seedFakeCast", {"slug": SLUG, "guests": 5, "markers": 6, "seed": 5, "checkIn": True})
# v2: the doors open, the game starts, and the show is skipped so the roles go out (as on party night).
convex("game:openDoors", {"slug": SLUG, "hostKey": hk})
convex("game:startGame", {"slug": SLUG, "hostKey": hk})
convex("game:skipIntro", {"slug": SLUG, "hostKey": hk})
gid = next(g["_id"] for g in data("games") if g["slug"] == SLUG)
token = next(p["token"] for p in data("players") if p["gameId"] == gid)
# Rooms open in waves (Oct 18): find a card that's in a Round 1 room by trying them with another guest.
other = [p["token"] for p in data("players") if p["gameId"] == gid and p["token"] != token][0]
def scannable(m):
    try:
        convex("game:scanMarker", {"token": other, "code": m["code"]})
        return True
    except Exception:
        return False
marker = next(m for m in sorted([m for m in data("markers") if m["gameId"] == gid], key=lambda m: m["number"]) if scannable(m))

# a fake camera feed showing marker 1's QR card
img = qrcode.make(f"https://velvetroom.wranglerportal.com/m/{marker['code']}", box_size=8, border=10).convert("RGB").resize((480, 480))
from PIL import Image
canvas = Image.new("RGB", (640, 480), (90, 70, 60)); canvas.paste(img.resize((360, 360)), (140, 60)); canvas.save(f"{OUT}/qr.png")
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", f"{OUT}/qr.png", "-t", "6", "-r", "15", "-pix_fmt", "yuv420p", f"{OUT}/qr.y4m"], check=True)

with sync_playwright() as p:
    b = p.chromium.launch(args=["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", f"--use-file-for-fake-video-capture={OUT}/qr.y4m"])
    ctx = b.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, permissions=["camera"])
    pg = ctx.new_page(); errs = []; logs = []
    pg.on("console", lambda m: logs.append(f"{m.type}: {m.text}"))
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto(f"{BASE}/p/{token}")
    card = pg.locator(".hold-card")
    expect(card).to_be_visible(timeout=15000)
    box = card.bounding_box()
    pg.mouse.move(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2)
    pg.mouse.down(); pg.wait_for_timeout(900)
    showing = card.locator(".big").count() == 1
    sel = pg.evaluate("window.getSelection().toString()")
    pg.screenshot(path=f"{OUT}/holding.png")
    check("role shows while held", showing)
    check("holding doesn't highlight any text", sel == "", repr(sel))
    pg.mouse.up(); pg.wait_for_timeout(200)
    check("role hides again on release", card.locator(".big").count() == 0)
    pg.screenshot(path=f"{OUT}/released.png")
    expect(pg.get_by_role("button", name="Open my case file")).to_be_visible()
    check("case file opens after the first hold", True)
    pg.get_by_role("button", name="Open my case file").click()
    pg.get_by_role("button", name="Skip the tour").click(timeout=10000)  # Oct 29: the phone tour
    pg.get_by_role("button", name="Scan", exact=True).click()
    pg.get_by_role("button", name="Scan a card").click()
    try:
        expect(pg.locator(".clue")).to_be_visible(timeout=20000)
        ok = f"card {marker['number']}" in pg.locator(".screen .eyebrow").first.inner_text().lower()
        check("camera reads a printed marker QR and shows its clue", ok)
    except AssertionError:
        pg.screenshot(path=f"{OUT}/camera-fail.png"); check("camera reads a printed marker QR and shows its clue", False, " | ".join(logs[-4:]))
    pg.screenshot(path=f"{OUT}/scanned.png")
    check("no page errors", not errs, "; ".join(errs[:2]))
    b.close()
convex("admin:deleteTestGame", {"slug": SLUG})
print(f"\n{sum(results)}/{len(results)} checks passed"); sys.exit(0 if all(results) else 1)
