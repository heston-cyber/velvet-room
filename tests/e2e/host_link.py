"""/host always opens the live game (Heston, Oct 16: "this velvetroom.wranglerportal.com/host link is suppoked to be the host back end everytime for the game"). A test game's full link opens it for that visit only.
  BASE=http://localhost:4174 python3 tests/e2e/host_link.py
"""
import json, os, subprocess, time
from playwright.sync_api import sync_playwright
ROOT=os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); BASE=os.environ.get('BASE', 'http://localhost:4173')
ENV=dict(os.environ)
for line in open(os.path.join(ROOT,'.env.local')):
    if '=' in line and not line.startswith('#'):
        k,v=line.strip().split('=',1); ENV[k]=v.split(' #')[0]
def cx(fn,args):
    r=subprocess.run(['npx','convex','run',fn,json.dumps(args)],cwd=ROOT,env=ENV,capture_output=True,text=True,timeout=120)
    if r.returncode: raise RuntimeError(r.stderr[-300:])
    o=r.stdout.strip(); i=o.find('{'); return json.loads(o[i:]) if i>=0 else o
fails=[]
def ok(c,m):
    print(('PASS ' if c else 'FAIL ')+m, flush=True)
    if not c: fails.append(m)
for s in ('hostfollow-live','hostfollow-live-g2','hostfollow-test'):
    try: cx('admin:deleteTestGame',{'slug':s})
    except Exception: pass
far=int(time.time()*1000)+7*864e5
L=cx('admin:createGame',{'slug':'hostfollow-live','title':'The Velvet Room','isTest':True,'makeActive':True,'registrationClosesAt':far,'deadlineLabel':'Sat, Oct 31'})
T=cx('admin:createGame',{'slug':'hostfollow-test','title':'Rehearsal Night (test 3)','isTest':True,'makeActive':False,'registrationClosesAt':far,'deadlineLabel':'Sat, Oct 31'})
title=lambda pg: pg.evaluate("() => document.body.textContent")
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1600,'height':900}); pg=ctx.new_page(); errs=[]
    pg.on('pageerror', lambda e: errs.append(str(e)))
    # the old single remembered link (a test game), as Heston's laptop has it
    pg.goto(f'{BASE}/join'); pg.evaluate("(l) => { localStorage.clear(); localStorage.setItem('velvet-room:host-link', JSON.stringify(l)); }", {'slug':'hostfollow-test','hostKey':T['hostKey']})
    pg.goto(f'{BASE}/host'); pg.wait_for_timeout(3000)
    ok("This laptop isn't the host yet" in title(pg) and 'The Velvet Room · Host' in title(pg), '/host opens the live game, not the old remembered test game')
    pg.goto(f"{BASE}/host?game=hostfollow-test&key={T['hostKey']}"); pg.wait_for_timeout(3000)
    ok('Rehearsal Night' in title(pg) and '(test 3)' not in title(pg) and pg.url.endswith('/host'), 'a test game link opens that test game (key out of the address bar)')
    pg.reload(); pg.wait_for_timeout(3000)
    ok("This laptop isn't the host yet" in title(pg), 'a reload goes back to the live game')
    pg.goto(f"{BASE}/host?game=hostfollow-live&key={L['hostKey']}"); pg.wait_for_timeout(3000)
    ok(pg.get_by_role('button', name='Play').count()==1 and 'Rehearsal' not in title(pg), 'the live game link opens the live game')
    pg.goto(f'{BASE}/host'); pg.wait_for_timeout(3000)
    ok(pg.get_by_role('button', name='Play').count()==1 and 'Rehearsal' not in title(pg), 'from then on, plain /host is the live game')
    pg.goto(f"{BASE}/host?game=hostfollow-test&key={T['hostKey']}"); pg.wait_for_timeout(2500)
    pg.goto(f'{BASE}/host'); pg.wait_for_timeout(3000)
    ok('Rehearsal' not in title(pg) and pg.get_by_role('button', name='Play').count()==1, 'after visiting a test game, /host is the live game again')
    ok(not errs, f'no page errors {errs[:2]}')
    b.close()
for s in ('hostfollow-live','hostfollow-test'):
    try: cx('admin:deleteTestGame',{'slug':s})
    except Exception: pass
print('all passed' if not fails else f'{len(fails)} failed')
