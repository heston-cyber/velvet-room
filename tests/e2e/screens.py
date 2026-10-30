"""Screen check (Oct 16, Heston: "some stuff was cut off out of frame (the evidence) and other stuff as well"): plays a
whole night on the dev backend with 15 guests and the longest names sign-up allows, screenshots every TV screen, and
flags anything that sticks out of the 16:9 stage or is clipped inside its box.
  BASE=http://localhost:4174 [TONE=adult] [W=1920 H=1080] python3 tests/e2e/screens.py
Screenshots and a report go to $OUT (default ./e2e-out/screens).
"""
import json, os, subprocess, time, urllib.request
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE", "http://localhost:4173")
SLUG = os.environ.get("SLUG", "screens-e2e")
OUT = os.environ.get("OUT", "e2e-out/screens")
TONE = os.environ.get("TONE", "adult")
W, H = int(os.environ.get("W", "1920")), int(os.environ.get("H", "1080"))
GUESTS = int(os.environ.get("GUESTS", "15"))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.makedirs(OUT, exist_ok=True)
ENV = dict(os.environ)
for line in open(os.path.join(ROOT, ".env.local")):
    if "=" in line and not line.startswith("#"):
        k, v = line.strip().split("=", 1)
        ENV[k] = v.split(" #")[0]
URL = ENV["VITE_CONVEX_URL"].rstrip("/")


def cx(fn, args):
    r = subprocess.run(["npx", "convex", "run", fn, json.dumps(args)], cwd=ROOT, env=ENV, capture_output=True, text=True, timeout=120)
    if r.returncode != 0:
        raise RuntimeError(f"{fn}: {r.stderr[-400:]}")
    out = r.stdout.strip()
    starts = [i for i in (out.find("{"), out.find("[")) if i >= 0]
    return json.loads(out[min(starts):]) if starts else (out or None)


def call(kind, path, args):
    """A public query or mutation over HTTP (much faster than the CLI)."""
    req = urllib.request.Request(f"{URL}/api/{kind}", data=json.dumps({"path": path, "args": args, "format": "json"}).encode(), headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = json.loads(r.read())
    if body.get("status") != "success":
        raise RuntimeError(f"{path}: {body.get('errorMessage')}")
    return body["value"]


mut = lambda path, args: call("mutation", path, args)
qry = lambda path, args: call("query", path, args)


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


# Anything on the stage that reaches past its edges, or text cut off inside a box that hides overflow.
AUDIT = """() => {
  const st = document.querySelector('.tv-stage'); if (!st) return ['no stage'];
  const R = st.getBoundingClientRect(); const out = [];
  const name = (el) => (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).join('.') : el.tagName.toLowerCase());
  for (const el of st.querySelectorAll('*')) {
    if (el.closest('.tv-cameos, .tv-scene-out, [aria-hidden=true]')) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue;
    const pad = 1;
    if (r.bottom > R.bottom + pad || r.top < R.top - pad || r.right > R.right + pad || r.left < R.left - pad) {
      out.push(`off-stage ${name(el)} [${Math.round(r.left - R.left)},${Math.round(r.top - R.top)} ${Math.round(r.width)}x${Math.round(r.height)}] "${(el.innerText || '').slice(0, 40).replace(/\\n/g, ' ')}"`);
      continue;
    }
    const hides = /(hidden|clip)/.test(cs.overflow + cs.overflowY + cs.overflowX);
    if (hides && el.children.length + (el.innerText ? 1 : 0) > 0 && (el.scrollHeight > el.clientHeight + 3 || el.scrollWidth > el.clientWidth + 3) && !el.matches('.tv-stage, .tv-page, img')) {
      out.push(`clipped ${name(el)} (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}) "${(el.innerText || '').slice(0, 40).replace(/\\n/g, ' ')}"`);
    }
  }
  // Oct 16: the guest strip, the narrator's caption and the round's cards and map never cover each other.
  const box = (s) => { const el = st.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 2 ? r : null; };
  const hit = (a, b) => a && b && a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2;
  const strip = box('.tv-strip'), cap = box('.tv-caption'), split = box('.tv-fit.split'), foot = box('.tv-foot');
  if (hit(strip, cap)) out.push('overlap: strip and caption');
  if (hit(strip, split)) out.push('overlap: strip and the round');
  if (strip && hit(cap, split)) out.push('overlap: caption and the round');
  if (hit(strip, foot)) out.push('overlap: strip and the room code');
  // The weapons along the top: no two names touch, and the round chip and ready count stay on one line.
  const names = [...st.querySelectorAll('.tv-topweapons .nm')].map((e) => e.getBoundingClientRect());
  for (let i = 1; i < names.length; i++) if (names[i].left < names[i - 1].right - 1 && names[i].top < names[i - 1].bottom && names[i - 1].top < names[i].bottom) { out.push('overlap: weapon names'); break; }
  for (const el of st.querySelectorAll('.tv-roundbar .chip, .tv-roundbar .tv-ready')) if (el.getBoundingClientRect().height > parseFloat(getComputedStyle(el).fontSize) * 2.6) out.push('wrapped: ' + el.className);
  out.push(...covers(st));
  return [...new Set(out)].slice(0, 15);
}"""

# Oct 20 (Heston: "everything is proportioned good, things arent covering up other elements"): nothing on the TV covers
# anything else. Text against text, the narrator's caption and the host's buttons against everything, and the standing
# drawings (by their painted pixels, not their box) against text and cards. Walkers crossing the screen don't count.
COVERS = """
window.covers = (st) => {
  const out = [];
  const seen = (el) => el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true;
  const label = (el, t) => `${(el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/)[0] : el.tagName.toLowerCase())} "${(t || el.innerText || '').trim().slice(0, 28).replace(/\\n/g, ' ')}"`;
  const cut = (a, b, m = 3) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > m && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > m;
  const skip = '.tv-cameos, [aria-hidden=true], .tv-test';
  // Every visible line of text, as the box its letters take (not its element's full width).
  const texts = [];
  const tw = document.createTreeWalker(st, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || !el || el.closest(skip) || !seen(el)) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width > 2 && r.height > 2) texts.push({ el, r, t: n.textContent });
  }
  const solids = [...st.querySelectorAll('button, .tv-award, .tv-tally > div, .tv-rule, .tv-av, img, .tv-strip, .wcard')]
    .filter((el) => !el.closest(skip) && seen(el)).map((el) => ({ el, r: el.getBoundingClientRect() })).filter((x) => x.r.width > 2 && x.r.height > 2);
  // Parts of one thing (a face and its ?, a weapon card's picture and name, a button's label) don't count.
  const unit = (el) => el.closest('.tv-av, .tv-wcard, button, .tv-award, .tv-tally > div, .tv-jailed, .tv-frame, .tv-how-suspects .face');
  // The host menu is a panel over the TV: it covers the screen on purpose, so only what's inside it is checked against itself.
  const layer = (el) => el.closest('[role=dialog]');
  const related = (a, b) => a === b || a.contains(b) || b.contains(a) || (!!unit(a) && unit(a) === unit(b)) || layer(a) !== layer(b);
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (!related(a.el, b.el) && cut(a.r, b.r)) out.push(`text over text: ${label(a.el, a.t)} / ${label(b.el, b.t)}`);
  }
  for (const s of solids) for (const t of texts) if (!related(s.el, t.el) && !s.el.closest('.tv-strip, .tv-caption') === !t.el.closest('.tv-strip, .tv-caption') && cut(s.r, t.r)) out.push(`box over text: ${label(s.el)} / ${label(t.el, t.t)}`);
  const cap = st.querySelector('.tv-caption');
  if (cap && seen(cap)) {
    const c = cap.getBoundingClientRect();
    for (const x of [...texts, ...solids]) if (!cap.contains(x.el) && !x.el.contains(cap) && !x.el.closest('.tv-strip') && layer(x.el) === layer(cap) && cut(c, x.r)) out.push(`caption covers ${label(x.el, x.t)}`);
  }
  // The drawings: which of their pixels are painted, on a coarse grid, cached per picture.
  const masks = (window.__masks = window.__masks || {});
  const maskOf = (img) => {
    if (masks[img.currentSrc]) return masks[img.currentSrc];
    if (!img.complete || !img.naturalWidth) return null;
    const w = 60, h = Math.max(1, Math.round(60 * img.naturalHeight / img.naturalWidth));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data; const m = new Uint8Array(w * h);
    for (let k = 0; k < w * h; k++) m[k] = d[k * 4 + 3] > 60 ? 1 : 0;
    return (masks[img.currentSrc] = { w, h, m });
  };
  const STILL = /\\b(stand|standRight|peek|unmasked|lineup|stroll|strollBack|creep|creepBack)\\b/;
  for (const img of st.querySelectorAll('.tv-cameos .cameo img')) {
    const fig = img.closest('.cameo');
    if (!STILL.test(fig.className) || +getComputedStyle(fig).opacity < 0.6 || !seen(img)) continue;
    const mk = maskOf(img); if (!mk) continue;
    const R = img.getBoundingClientRect(); const flip = img.classList.contains('flip');
    const painted = (r) => {
      const x0 = Math.max(0, Math.floor((Math.max(r.left, R.left) - R.left) / R.width * mk.w)), x1 = Math.min(mk.w, Math.ceil((Math.min(r.right, R.right) - R.left) / R.width * mk.w));
      const y0 = Math.max(0, Math.floor((Math.max(r.top, R.top) - R.top) / R.height * mk.h)), y1 = Math.min(mk.h, Math.ceil((Math.min(r.bottom, R.bottom) - R.top) / R.height * mk.h));
      let n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) n += mk.m[y * mk.w + (flip ? mk.w - 1 - x : x)];
      return n;
    };
    const who = fig.className.split(/\\s+/).find((c) => STILL.test(c));
    // Passing behind the content is fine for walkers and peeks (they're gone in seconds); not for drawings that stay.
    // (The lock-in's waiting-on lineup is a backdrop along the bottom, behind the caption on purpose.)
    if (fig.closest('.cameos-back') && !/^(stand|standRight)$/.test(who)) continue;
    // A drawing behind the content (the back layer) only counts where it shows through a card or sits under text.
    for (const x of [...texts, ...solids]) if (cut(R, x.r) && painted(x.r) > 2) out.push(`drawing (${who}) ${fig.closest('.cameos-back') ? 'behind' : 'over'} ${label(x.el, x.t)}`);
  }
  return out;
};
"""

report = []
try:
    cx("admin:deleteTestGame", {"slug": SLUG})
except Exception:
    pass
created = cx("admin:createGame", {"slug": SLUG, "title": "The Velvet Room", "isTest": True, "makeActive": False,
                                  "registrationClosesAt": int(time.time() * 1000) + 7 * 864e5, "deadlineLabel": "Sat, Oct 31"})
KEY = created["hostKey"]
cx("host:updateSettings", {"slug": SLUG, "hostKey": KEY, "tone": TONE, "search": "waves", "pacing": {"mode": "ready", "roundMinutes": 10}})
cx("game:seedFakeCast", {"slug": SLUG, "guests": GUESTS, "markers": 24, "seed": 77, "checkIn": True, "longNames": True})
# Oct 16: the game draws the weapons; WEAPONS=10 checks the biggest set (17+ guests) with the longest names.
if os.environ.get("WEAPONS"):
    cx("host:updateSettings", {"slug": SLUG, "hostKey": KEY, "weapons": ["candlestick", "racquet", "shears", "fishingline", "golfclub", "bat", "gnome", "bucket", "leadpipe", "flaregun"][: int(os.environ["WEAPONS"])]})
guests = cx("admin:testPlayers", {"slug": SLUG})
roster = lambda: qry("host:roster", {"slug": SLUG, "hostKey": KEY})

with sync_playwright() as p:
    browser = p.chromium.launch()
    errors = []
    host = browser.new_context(viewport={"width": W, "height": H}).new_page()
    host.add_init_script(COVERS)
    host.on("pageerror", lambda e: errors.append(str(e)))
    n = [0]

    def audit(label, settle=1500):
        host.wait_for_timeout(settle)
        n[0] += 1
        fname = f"{n[0]:02d}-{label}.png"
        host.screenshot(path=os.path.join(OUT, fname))
        issues = host.evaluate(AUDIT)
        report.append({"screen": fname, "issues": issues})
        print(("OK   " if not issues else "FLAG ") + fname + ("" if not issues else "\n       " + "\n       ".join(issues)), flush=True)

    def menu(label):
        host.locator(".hs-menu-btn").click()
        host.get_by_role("button", name=label).click(timeout=5000)

    def vote_all(target):
        """Every guest who can votes for target (None is nobody); the last ballot closes the vote."""
        for gst in guests:
            try:
                mut("game:castVote", {"token": gst["token"], "targetId": None if target == gst["id"] else target})
            except Exception:
                pass

    host.goto(f"{BASE}/host?game={SLUG}&key={KEY}")
    host.get_by_role("button", name="Play").wait_for(timeout=20000)
    audit("title")
    host.get_by_role("button", name="Play").click()
    wait_for(lambda: host.locator(".hs-lobby").count() == 1)
    audit("lobby", 7000)  # Oct 20: once the doors scene is up
    # Oct 20: Best Dressed is voted in the lobby, so the awards card shows several.
    for i, gst in enumerate(guests):
        try:
            mut("game:vote", {"token": gst["token"], "dressed": guests[(i + 1) % len(guests)]["id"]})
        except Exception:
            pass
    host.locator(".hs-lobby button").click()
    host.locator(".hs-lobby button").first.click()  # Oct 17: "Yes, begin" (the QR cards are hidden)
    wait_for(lambda: roster()["game"]["status"] == "playing", 20)
    # Oct 16: How to play, then the Don dies, then the roll call.
    kick = lambda: host.evaluate("() => document.querySelector('.tv-how .tv-kick')?.textContent || ''")
    wait_for(lambda: "· 1 of" in kick(), 30)
    cards = int(kick().split(" of ")[-1].strip() or 5)
    for i in range(1, cards + 1):
        if not wait_for(lambda: f"· {i} of" in kick(), 30):
            break
        audit(f"how-{i}", 1600)
        # Oct 17: LONG_HOW=<text>: the longest rules line any script has (pass it in) still fits this card's layout.
        if os.environ.get("LONG_HOW"):
            host.evaluate("""(t) => { const r = document.querySelector('.tv-how .tv-rule'); if (!r) return;
              r.textContent = t; const k = document.querySelector('.tv-how.wide') ? 750 : 1300; r.style.fontSize = Math.min(2.5, Math.sqrt(k / t.length)).toFixed(2) + 'cqw'; }""", os.environ["LONG_HOW"])
            audit(f"how-{i}-longest", 300)
    text = lambda: host.evaluate("() => document.body.textContent")
    for label, words in (("intro-1", "New York City · October 31, 2026"), ("intro-2", "The Don is dead."), ("intro-3", "One of you did it.")):
        wait_for(lambda: words in text(), 45)
        audit(label, 1500)
    wait_for(lambda: host.locator(".tv-roll h2").count() == 1, 60)
    audit("roll-call", 2500)
    menu("Skip to the roles")
    audit("phones", 6500)  # the Check Your Phone card runs 4 s first (its video is blank in headless Chromium)
    cx("game:skipIntro", {"slug": SLUG, "hostKey": KEY})
    audit("round-1", 5500)
    # Oct 20: the host menu over the round, and its rescue buttons.
    host.locator(".hs-menu-btn").click()
    audit("round-1-menu", 1200)
    host.locator(".hs-pause button[aria-pressed]").click()
    audit("round-1-menu-rescue", 800)
    host.get_by_role("button", name="Resume").click()
    host.wait_for_timeout(800)

    def vote_round(rnd, kind, target):
        wait_for(lambda: host.get_by_text("Who goes to jail?" if kind == "jail" else "Does anyone get out?").count() or "The evidence clears" in text(), 15)
        if "The evidence clears" in text():
            # D10 (Oct 17): the evidence already cleared the jailbird, so no vote.
            audit(f"r{rnd}-{kind}-auto", 5000)
            return
        audit(f"r{rnd}-{kind}-vote", 5000)
        vote_all(target)
        wait_for(lambda: host.get_by_text("The votes are in").count() == 1, 15)
        audit(f"r{rnd}-{kind}-tally", 1500)
        host.wait_for_timeout(9000)
        audit(f"r{rnd}-{kind}-verdict", 0)

    # Round 1 ends with no vote; Oct 29: no jail vote either. Round 2 ends in the late tips (they open Round 3); Round 3
    # goes straight to the lock-in.
    mut("game:advanceRound", {"slug": SLUG, "hostKey": KEY})
    wait_for(lambda: roster()["game"]["round"] == 2, 25)
    audit("round-2", 6000)
    mut("game:advanceRound", {"slug": SLUG, "hostKey": KEY})
    wait_for(lambda: roster()["game"]["round"] == 3, 30)
    audit("round-3-late-tips", 7000)
    audit("round-3", 6000)
    audit("round-3-twist", 9000)
    mut("game:advanceRound", {"slug": SLUG, "hostKey": KEY})

    wait_for(lambda: roster()["game"]["round"] == 4, 30)
    audit("lock-in", 6000)
    board = qry("game:phone", {"token": guests[0]["token"]})["board"]
    for gst in guests:
        other = next(s["id"] for s in board["suspects"] if s["id"] != gst["id"])
        try:
            mut("game:accuse", {"token": gst["token"], "suspectId": other, "exhibitId": board["exhibits"][0]["id"], "roomKey": board["rooms"][0]["key"]})
        except Exception:
            pass
    wait_for(lambda: roster()["game"]["status"] == "reveal", 25)
    rt = time.time()
    for at, label in ((6, "reveal-line"), (16, "reveal-name"), (21, "reveal-how"), (30, "reveal-verdict"), (40, "reveal-votes")):
        host.wait_for_timeout(max(0, int((rt + at - time.time()) * 1000)))
        audit(label, 0)
    # Oct 20: the awards follow the verdict on their own; Finish only if they haven't yet.
    if roster()["game"]["status"] == "reveal":
        try:
            mut("game:finish", {"slug": SLUG, "hostKey": KEY})
        except Exception:
            pass
    audit("awards", 9000)
    audit("awards-names", 12000)
    mut("game:endNight", {"slug": SLUG, "hostKey": KEY})
    audit("goodnight", 6000)
    print("page errors:", errors[:3])
    browser.close()

json.dump(report, open(os.path.join(OUT, "report.json"), "w"), indent=1)
flags = [r for r in report if r["issues"]]
print(f"\n{len(report)} screens, {len(flags)} flagged")
cx("admin:deleteTestGame", {"slug": SLUG})
