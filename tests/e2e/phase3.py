"""Phase 3 test: 4 browser phones + 5 fake guests play a full game on the dev backend."""
import json, os, re, subprocess, sys, time
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = os.environ.get("SLUG", "test-p3")
OUT = os.environ.get("OUT", "/tmp/vr-p3")
ENVFILE = os.environ.get("ENVFILE", ".env.local")
TONE = os.environ.get("TONE", "classic")
os.makedirs(OUT, exist_ok=True)

env = dict(os.environ)
for line in open(ENVFILE):
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1); env[k] = v

def convex(fn, args):
    r = subprocess.run(["npx", "convex", "run", fn, json.dumps(args)], capture_output=True, text=True, env=env)
    if r.returncode != 0:
        raise RuntimeError(f"{fn}: {r.stderr[-400:]}")
    out = r.stdout.strip()
    return json.loads(out) if out.startswith(("{", "[", '"')) else out

results = []
def check(name, ok, detail=""):
    results.append((name, ok)); print(("PASS " if ok else "FAIL ") + name + (f" — {detail}" if detail else ""))

# fresh test game
try: convex("admin:deleteTestGame", {"slug": SLUG})
except Exception: pass
host = convex("admin:createGame", {"slug": SLUG, "title": "Phase 3 test", "isTest": True, "makeActive": False,
    "registrationClosesAt": int((time.time() + 86400) * 1000), "deadlineLabel": "Sat, Oct 24"})
HK = host["hostKey"]
convex("host:updateSettings", {"slug": SLUG, "hostKey": HK, "tone": TONE, "pacing": {"mode": "ready", "roundMinutes": 10}})

GUESTS = [("Ana Ruiz", "Mae Malloy", "Gold tooth", "Ice pick", "Wooden handle, sharp."),
          ("Ben Cho", "Smokey Joe", "Cigar he never lights", "Tommy gun (toy)", "Plastic, loud."),
          ("Cal Ortiz", "Lulu Belle", "Pearl necklace", "Poison vial", "Tiny green bottle."),
          ("Dee Park", "Fingers Fontaine", "Piano gloves", "Piano wire", "Coiled, shiny.")]

with sync_playwright() as p:
    browser = p.chromium.launch()
    phone = dict(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
    pages, tokens, errors = [], [], []
    for real, char, sig, weapon, desc in GUESTS:
        ctx = browser.new_context(**phone); pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(f"{BASE}/?game={SLUG}")
        pg.get_by_role("button", name="Step inside").click()
        pg.fill("#f-realName", real); pg.get_by_role("button", name="Next: your character").click()
        pg.fill("#f-charName", char); pg.fill("#f-who", "Test guest."); pg.fill("#f-signature", sig)
        pg.get_by_role("button", name="Next: motive and secret").click(); pg.get_by_role("button", name="Next: your weapon").click()
        pg.fill("#f-weapon", weapon); pg.fill("#f-weaponDesc", desc); pg.get_by_role("button", name="Next: review").click()
        pg.get_by_role("button", name="Put me on the list").click()
        pg.wait_for_url(re.compile(r"/p/[a-z0-9]+$"), timeout=15000)
        tokens.append(pg.url.rsplit("/p/", 1)[1]); pages.append(pg)
    check("4 phones registered", len(tokens) == 4)

    convex("game:openDoors", {"slug": SLUG, "hostKey": HK})
    letters = []
    for i, pg in enumerate(pages):
        pg.get_by_role("button", name="My weapon's bagged").click(timeout=15000)
        expect(pg.locator(".letter-tag .big")).to_be_visible(timeout=10000)
        letters.append(pg.locator(".letter-tag .big").inner_text())
        if i == 0: pg.screenshot(path=f"{OUT}/01-letter.png")
    check("each phone got a different exhibit letter", len(set(letters)) == 4, " ".join(letters))

    convex("game:seedFakeCast", {"slug": SLUG, "guests": 5, "markers": 10, "seed": 3})
    expect(pages[0].locator(".guests li:not(.away)")).to_have_count(9, timeout=10000)
    pages[0].screenshot(path=f"{OUT}/02-lobby.png")
    check("lobby updates live as guests check in", True)

    convex("game:startGame", {"slug": SLUG, "hostKey": HK})
    roles = []
    for i, pg in enumerate(pages):
        expect(pg.get_by_text("The Don is dead.")).to_be_visible(timeout=10000)
        if i == 0: pg.screenshot(path=f"{OUT}/03-murder.png")
        pg.locator(".hold-card").dispatch_event("pointerdown")
        role = "killer" if pg.locator(".hold-card.killer").count() else "innocent"
        roles.append(role)
        if i == 0: pg.screenshot(path=f"{OUT}/04-role.png")
        pg.locator(".hold-card").dispatch_event("pointerup")
        pg.get_by_role("button", name="Open my case file").click()
    check("every phone got a role on start", len(roles) == 4, ",".join(roles))

    # privacy: no phone shows another guest's motive, secret or tip
    briefs = [convex("game:myBriefing", {"token": t}) for t in tokens]
    leaks = []
    for i, pg in enumerate(pages):
        html = pg.content()
        for j, b in enumerate(briefs):
            if i == j: continue
            for k in ("motive", "secret"):
                if b[k] in html and b[k] != briefs[i][k]: leaks.append(f"phone {i+1} shows phone {j+1}'s {k}")
        if briefs[i]["role"] != "killer" and "You did it" in html: leaks.append(f"phone {i+1} sees a killer line")
    check("private screens stay private", not leaks, "; ".join(leaks))
    pages[0].screenshot(path=f"{OUT}/05-casefile.png", full_page=True)

    # scanning: typed code on phone 1, QR link on phone 2
    markers = [json.loads(l) for l in subprocess.run(["npx", "convex", "data", "markers", "--limit", "100", "--format", "jsonLines"], capture_output=True, text=True, env=env).stdout.splitlines() if l.strip()]
    gid = convex("admin:listGames", {})
    mk = sorted([m for m in markers], key=lambda m: m["number"])
    # keep only this game's markers: they were created last
    mk = [m for m in mk if m["_creationTime"] >= max(x["_creationTime"] for x in markers) - 5000][:10]
    pages[0].get_by_role("button", name="Scan", exact=True).click()
    pages[0].fill("#marker-code", mk[0]["code"].upper())
    pages[0].get_by_role("button", name="Read").click()
    expect(pages[0].locator(".clue")).to_be_visible(timeout=10000)
    pages[0].screenshot(path=f"{OUT}/06-clue.png")
    check("typed marker code shows its clue", True)
    pages[1].goto(f"{BASE}/m/{mk[1]['code']}")
    expect(pages[1].locator(".clue")).to_be_visible(timeout=10000)
    check("QR link opens the clue on the guest's phone", True)
    pages[1].get_by_role("button", name="Back to my case").click()
    expect(pages[1].get_by_role("button", name="Evidence", exact=True)).to_be_visible(timeout=10000)

    # notebook persists across a reload
    pages[2].get_by_role("button", name="Notebook", exact=True).click()
    pages[2].locator(".nb-grid button").nth(1).click()
    pages[2].wait_for_timeout(900)
    pages[2].reload()
    pages[2].get_by_role("button", name="Notebook", exact=True).click()
    expect(pages[2].locator(".nb-grid button.x")).to_have_count(1, timeout=10000)
    pages[2].screenshot(path=f"{OUT}/07-notebook.png", full_page=True)
    check("notebook survives a reload", True)

    # ready votes sync across phones
    for pg in pages:
        pg.get_by_role("button", name="Case", exact=True).click()
        pg.get_by_role("button", name="Ready for more evidence").click()
    expect(pages[3].locator(".timer")).to_contain_text("4 of 9 ready", timeout=10000)
    check("ready count syncs to every phone", True)
    convex("game:fakeGuestsAct", {"slug": SLUG, "action": "ready"})
    for pg in pages:
        expect(pg.locator(".chip")).to_contain_text("Round 2", timeout=10000)
    check("all 4 phones moved to Round 2 together", True)
    pages[0].get_by_role("button", name="Evidence", exact=True).click()
    expect(pages[0].locator(".ev-h").first).to_contain_text("Round 2", timeout=10000)
    pages[0].screenshot(path=f"{OUT}/08-evidence.png", full_page=True)

    convex("game:advanceRound", {"slug": SLUG, "hostKey": HK})
    convex("game:advanceRound", {"slug": SLUG, "hostKey": HK})
    for pg in pages:
        expect(pg.locator(".chip")).to_contain_text("Accusations", timeout=10000)
    check("all phones open accusations together", True)
    for i, pg in enumerate(pages):
        pg.get_by_role("button", name="Accuse", exact=True).click()
        for sec in ["Who", "Which exhibit", "Where"]:
            pg.locator(".pick").filter(has_text=sec).locator(".opts button").first.click()
        if i == 0: pg.screenshot(path=f"{OUT}/09-accuse.png", full_page=True)
        pg.get_by_role("button", name="Lock in my accusation").click()
        expect(pg.locator(".locked")).to_be_visible(timeout=10000)
    convex("game:fakeGuestsAct", {"slug": SLUG, "action": "accuse"})
    for pg in pages:
        expect(pg.get_by_text("Eyes on the TV")).to_be_visible(timeout=10000)
    check("reveal starts once everyone has accused", True)
    pages[0].screenshot(path=f"{OUT}/10-reveal.png", full_page=True)
    for pg in pages:
        pg.locator(".pick").filter(has_text="Best Dressed").locator(".opts button").first.click()
        pg.get_by_role("button", name="Cast my votes").click()
        expect(pg.locator(".locked")).to_be_visible(timeout=10000)
    convex("game:finish", {"slug": SLUG, "hostKey": HK})
    for pg in pages:
        expect(pg.get_by_text("Awards are on the TV.")).to_be_visible(timeout=10000)
    res = convex("game:results", {"slug": SLUG})
    check("awards tallied", bool(res["awards"]["bestDressed"]))
    check("no page errors on any phone", not errors, "; ".join(errors[:3]))
    browser.close()

convex("admin:deleteTestGame", {"slug": SLUG})
failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
sys.exit(1 if failed else 0)
