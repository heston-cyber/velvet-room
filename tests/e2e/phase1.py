"""Phase 1 test: three phones sign up, links reopen the right guest, the host roster stays spoiler-free."""
import base64, json, os, re, sys
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = os.environ["SLUG"]
HOST_KEY = os.environ["HOST_KEY"]
OUT = os.environ.get("OUT", "/tmp/vr-shots")
os.makedirs(OUT, exist_ok=True)

# 1x1 red PNG for the photo upload
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
photo_path = os.path.join(OUT, "costume.png")
open(photo_path, "wb").write(PNG)

GUESTS = [
    dict(realName="Ana Ruiz", charName="Velma Two-Bits Kowalski", who="Cigarette girl who sells secrets by the pack.",
         signature="Silver cigarette case", weapon="Brass candlestick", weaponDesc="Heavy, a foot tall, dented at the base.", killer=True, photo=True),
    dict(realName="Ben Cho", charName="Father Malone", who="A priest who drinks more than he prays.",
         signature="Rosary he twirls", weapon="Rubber chicken", weaponDesc="Yellow and squeaky.", killer=False, photo=False),
    dict(realName="Cal Ortiz", charName="Lucky Lou", who="Bookie with famously bad luck.",
         signature="Green dice", weapon="Snapped pool cue", weaponDesc="Chalky tip, splintered end.", killer=True, photo=False),
]
results = []
def check(name, ok, detail=""):
    results.append((name, ok, detail))
    print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))

with sync_playwright() as p:
    browser = p.chromium.launch()
    phone = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    tokens = []
    pages = []
    for i, g in enumerate(GUESTS):
        ctx = browser.new_context(**phone)
        page = ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(f"{BASE}/?game={SLUG}")
        page.get_by_role("button", name="Step inside").click()
        # try to skip a required field
        page.get_by_role("button", name="Next: your character").click()
        if i == 0:
            check("required field blocks Next", page.locator(".err").count() == 1)
            page.screenshot(path=f"{OUT}/01-required.png")
        page.fill("#f-realName", g["realName"])
        page.get_by_role("button", name="Next: your character").click()
        page.fill("#f-charName", g["charName"])
        page.fill("#f-who", g["who"])
        page.fill("#f-signature", g["signature"])
        if g["photo"]:
            page.set_input_files("#f-photo", photo_path)
        if i == 0:
            page.screenshot(path=f"{OUT}/02-character.png")
        page.get_by_role("button", name="Next: motive and secret").click()
        page.get_by_role("button", name="Next: your weapon").click()
        page.fill("#f-weapon", g["weapon"])
        page.fill("#f-weaponDesc", g["weaponDesc"])
        if i == 0:
            page.screenshot(path=f"{OUT}/03-weapon.png")
        page.get_by_role("button", name="Next: review").click()
        if not g["killer"]:
            page.uncheck("#f-killer")
        if i == 0:
            page.screenshot(path=f"{OUT}/04-review.png")
        page.get_by_role("button", name="Put me on the list").click()
        page.wait_for_url(re.compile(r"/p/[a-z0-9]+$"), timeout=15000)
        token = page.url.rsplit("/p/", 1)[1]
        tokens.append(token)
        expect(page.locator(".card-name")).to_have_text(g["charName"], timeout=10000)
        if i == 0:
            page.wait_for_timeout(800)
            page.screenshot(path=f"{OUT}/05-done.png")
            has_img = page.locator(".card-ph img").count() == 1
            check("costume photo uploaded and shown", has_img)
        check(f"phone {i+1} registered", True, g["charName"])
        check(f"phone {i+1} no page errors", not errors, "; ".join(errors))
        pages.append((ctx, page))

    check("three distinct personal links", len(set(tokens)) == 3)

    # each link reopens only its own guest, on a fresh phone
    for i, t in enumerate(tokens):
        ctx = browser.new_context(**phone)
        pg = ctx.new_page()
        pg.goto(f"{BASE}/p/{t}")
        expect(pg.locator(".card-name")).to_have_text(GUESTS[i]["charName"], timeout=10000)
        body = pg.inner_text("body")
        others = [g["charName"] for j, g in enumerate(GUESTS) if j != i]
        check(f"link {i+1} reopens the right guest", not any(o in body for o in others))
        ctx.close()

    # duplicate character name is refused with a clear message
    ctx = browser.new_context(**phone)
    pg = ctx.new_page()
    pg.goto(f"{BASE}/?game={SLUG}")
    pg.get_by_role("button", name="Step inside").click()
    pg.fill("#f-realName", "Dee Park"); pg.get_by_role("button", name="Next: your character").click()
    pg.fill("#f-charName", "lucky LOU"); pg.fill("#f-who", "Imposter."); pg.fill("#f-signature", "Fake dice")
    pg.get_by_role("button", name="Next: motive and secret").click()
    pg.get_by_role("button", name="Next: your weapon").click()
    pg.fill("#f-weapon", "Spoon"); pg.fill("#f-weaponDesc", "Bent.")
    pg.get_by_role("button", name="Next: review").click()
    pg.get_by_role("button", name="Put me on the list").click()
    expect(pg.locator(".errbox")).to_contain_text("already took", timeout=10000)
    check("duplicate character name refused with a clear message", True)
    ctx.close()

    # the first guest edits their weapon from their link
    ctx0, page0 = pages[0]
    page0.get_by_role("button", name="Edit my entry").click()
    for label in ["Next: your character", "Next: motive and secret", "Next: your weapon"]:
        page0.get_by_role("button", name=label).click()
    page0.fill("#f-weapon", "Velvet rope")
    page0.get_by_role("button", name="Next: review").click()
    page0.get_by_role("button", name="Save changes").click()
    expect(page0.get_by_role("button", name="Edit my entry")).to_be_visible(timeout=10000)
    check("guest can edit their entry", True)

    # bad link
    ctx = browser.new_context(**phone)
    pg = ctx.new_page(); pg.goto(f"{BASE}/p/notarealcode")
    expect(pg.get_by_text("This link doesn't match a guest")).to_be_visible(timeout=10000)
    check("unknown link shows a clear message", True)
    ctx.close()

    # host roster
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    pg = ctx.new_page()
    pg.goto(f"{BASE}/host?game={SLUG}&key={HOST_KEY}")
    expect(pg.locator(".hx-roster li")).to_have_count(3, timeout=10000)
    pg.wait_for_timeout(600)
    pg.screenshot(path=f"{OUT}/06-host.png", full_page=True)
    text = pg.inner_text("body")
    html = pg.content()
    leaked = [g[k] for g in GUESTS for k in ("weapon", "weaponDesc")] + ["Velvet rope"]
    leaked = [w for w in leaked if w in text or w in html]
    check("host roster shows all three characters", all(g["charName"] in text for g in GUESTS))
    check("host roster never shows a weapon", not leaked, ", ".join(leaked))
    flat = " ".join(text.split()).lower()
    check("host sees opt-in count of 2", "2 up for killer" in flat)
    # wrong key
    pg2 = ctx.new_page(); pg2.goto(f"{BASE}/host?game={SLUG}&key=wrong")
    expect(pg2.get_by_text("That host link isn't valid")).to_be_visible(timeout=10000)
    check("wrong host key is refused", True)
    ctx.close()
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
