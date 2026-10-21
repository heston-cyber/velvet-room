"""The page check shared by the phone and laptop look-overs (Oct 20): sideways scrolling, cut-off text, things on top of
each other, bars that hide content at the ends of the page, small buttons and tiny text. Run in the page with the end
of the page it's looking at ("top" or "bottom")."""

AUDIT = r"""(where) => {
  const out = [];
  const W = window.innerWidth, H = window.innerHeight;
  const seen = (el) => el.checkVisibility ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true;
  const label = (el, t) => `${(el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase())} "${(t || el.innerText || '').trim().slice(0, 30).replace(/\n/g, ' ')}"`;
  const cut = (a, b, m = 2) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > m && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > m;
  const fixedOf = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') return e; } return null; };
  // Sideways: nothing reaches past the screen's edges.
  if (document.documentElement.scrollWidth > W + 1) {
    const wide = [...document.querySelectorAll('body *')].filter((el) => seen(el) && el.getBoundingClientRect().right > W + 1 && !el.closest('[aria-hidden=true]'));
    out.push(`sideways scroll (${document.documentElement.scrollWidth}px wide): ${wide.slice(0, 3).map((el) => label(el)).join(', ')}`);
  }
  // A page laid over another (Options over the TV, a menu): what's underneath is hidden by it, so it doesn't count.
  const sheets = [...document.querySelectorAll('body *')].filter((el) => {
    const cs = getComputedStyle(el); if (!['fixed', 'absolute'].includes(cs.position) || !seen(el)) return false;
    const r = el.getBoundingClientRect(); if (r.width * r.height < W * H * 0.5) return false;
    const m = cs.backgroundColor.match(/rgba?\(([^)]+)\)/); const a = m ? +(m[1].split(',')[3] ?? 1) : 0;
    return a >= 0.9 || cs.backgroundImage !== 'none';
  });
  const buried = (el, r) => {
    const top = document.elementFromPoint(Math.min(W - 1, Math.max(0, (r.left + r.right) / 2)), Math.min(H - 1, Math.max(0, (r.top + r.bottom) / 2)));
    return !!top && !el.contains(top) && !top.contains(el) && sheets.some((sh) => sh.contains(top) && !sh.contains(el));
  };
  const texts = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const el = n.parentElement;
    if (!n.textContent.trim() || !el || el.closest('[aria-hidden=true], script, style') || !seen(el)) continue;
    const range = document.createRange(); range.selectNodeContents(n);
    for (const r of range.getClientRects()) if (r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < H && !buried(el, r)) texts.push({ el, r, t: n.textContent, fixed: fixedOf(el) });
  }
  for (const el of document.querySelectorAll('body *')) {
    if (!seen(el) || el.closest('[aria-hidden=true]')) continue;
    const cs = getComputedStyle(el);
    const hides = /(hidden|clip)/.test(cs.overflow + cs.overflowY + cs.overflowX);
    if (hides && el.innerText && el.innerText.trim() && (el.scrollWidth > el.clientWidth + 3 || el.scrollHeight > el.clientHeight + 3) && !['HTML', 'BODY'].includes(el.tagName) && cs.textOverflow !== 'ellipsis' && !el.matches('.scroll, [data-scroll], .sr-only')) {
      out.push(`cut off: ${label(el)} (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`);
    }
  }
  const unit = (el) => el.closest('button, a, label, .chip, [role=button]');
  const related = (a, b) => a === b || a.contains(b) || b.contains(a) || (!!unit(a) && unit(a) === unit(b));
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (related(a.el, b.el) || !!a.fixed !== !!b.fixed) continue;
    if (cut(a.r, b.r)) out.push(`text over text: ${label(a.el, a.t)} / ${label(b.el, b.t)}`);
  }
  const solids = [...document.querySelectorAll('button, img, input, select, textarea')].filter((el) => seen(el) && !el.closest('[aria-hidden=true]')).map((el) => ({ el, r: el.getBoundingClientRect(), fixed: fixedOf(el) })).filter((x) => x.r.bottom > 0 && x.r.top < H && !buried(x.el, x.r));
  for (const s of solids) for (const t of texts) if (!!s.fixed === !!t.fixed && !related(s.el, t.el) && cut(s.r, t.r, 3)) out.push(`${s.el.tagName.toLowerCase()} over text: ${label(s.el)} / ${label(t.el, t.t)}`);
  // The bars that stay put: at this end of the page, nothing else is under them.
  const bars = [...document.querySelectorAll('body *')].filter((el) => seen(el) && ['fixed', 'sticky'].includes(getComputedStyle(el).position) && !(el.parentElement && fixedOf(el.parentElement)));
  // At the top of the page, the bars along the top; at the bottom, the bars along the bottom. (Mid-scroll, things pass under them.)
  for (const b of bars) {
    const R = b.getBoundingClientRect(); if (R.width < 2 || R.height < 2) continue;
    if ((where === 'top') !== (R.top + R.bottom < H)) continue;
    for (const x of [...texts.filter((t) => !t.fixed), ...solids.filter((s) => !s.fixed && s.el.tagName === 'BUTTON')]) if (cut(R, x.r, 3)) out.push(`${where}: ${label(b)} hides ${label(x.el, x.t)}`);
  }
  // Big enough to tap (Apple says 44 points; flag anything under 36).
  for (const s of solids) if (s.el.tagName === 'BUTTON' && s.r.bottom > 0 && s.r.top < H && (s.r.height < 36 || s.r.width < 36)) out.push(`small button: ${label(s.el)} ${Math.round(s.r.width)}x${Math.round(s.r.height)}`);
  // Too small to read.
  for (const t of texts) { const fs = parseFloat(getComputedStyle(t.el).fontSize); if (fs < 11) out.push(`tiny text (${fs}px): ${label(t.el, t.t)}`); }
  return [...new Set(out)].slice(0, 20);
}"""
