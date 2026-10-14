import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Deco, initials } from "../components/MemberCard";
import { friendlyError } from "../lib/errors";
import { codeFromScan } from "../lib/scan";
import { Swap } from "../lib/Swap";
import { REVEAL_VERDICT_MS } from "../../convex/shared";

type Phone = NonNullable<FunctionReturnType<typeof api.game.phone>>;
type Tab = "case" | "scan" | "evidence" | "notebook";

const firstName = (n: string) =>
  n.replace(/[“"][^”"]*[”"]/g, "").trim().split(/\s+/)[0] || n;
const mid = (label: string) => label.replace(/^The /, "the ");

function seenKey(slug: string) {
  return `velvet-room:seen-role:${slug}`;
}
function hasSeen(slug: string) {
  try {
    return localStorage.getItem(seenKey(slug)) === "1";
  } catch {
    return false;
  }
}
function markSeen(slug: string) {
  try {
    localStorage.setItem(seenKey(slug), "1");
  } catch {
    /* fine */
  }
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function Avatar({ name, url }: { name: string; url?: string | null }) {
  return <span className="av">{url ? <img src={url} alt="" /> : initials(name)}</span>;
}

const ICON: Record<Tab | "accuse", JSX.Element> = {
  case: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="15" />
      <path d="M9 5V3h6v2M8 10h8M8 14h6" />
    </svg>
  ),
  accuse: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
    </svg>
  ),
  scan: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5M7 12h10" />
    </svg>
  ),
  evidence: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M15 3v4h4M9 12h7M9 16h7" />
    </svg>
  ),
  notebook: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="3" width="14" height="18" />
      <path d="M9 8l2 2 4-4M9 15h6" />
    </svg>
  ),
};

export default function PartyPhone({ token, data }: { token: string; data: Phone }) {
  const { game, me } = data;
  const [tab, setTab] = useState<Tab>("case");
  const [seen, setSeen] = useState(() => hasSeen(game.slug));
  const prevStatus = useRef(game.status);

  // Buzz the phone when the game starts (Android; iPhones ignore this).
  useEffect(() => {
    if (prevStatus.current !== "playing" && game.status === "playing") navigator.vibrate?.([250, 120, 250]);
    prevStatus.current = game.status;
  }, [game.status]);

  // Accusations open: jump to the accuse screen once.
  const lastRound = useRef(game.round);
  useEffect(() => {
    if (game.round === 4 && lastRound.current !== 4) setTab("case");
    lastRound.current = game.round;
  }, [game.round]);

  let body: JSX.Element;
  let showNav = false;
  if (me.isMC && (game.status === "lobby" || game.status === "playing")) body = <McPhone data={data} />;
  else if (game.status === "lobby" && !me.checkedIn) body = <Arrive token={token} name={me.charName} />;
  else if (game.status === "lobby") body = <Lobby data={data} />;
  else if (game.status === "playing" && !me.inGame) body = <Late data={data} />;
  else if (game.status === "playing" && !seen) {
    body = (
      <Murder
        data={data}
        onDone={() => {
          markSeen(game.slug);
          setSeen(true);
          setTab("case");
        }}
      />
    );
  } else if (game.status === "playing") {
    showNav = true;
    body =
      tab === "case" ? (
        game.round >= 4 ? <Accuse token={token} data={data} /> : <CaseFile token={token} data={data} />
      ) : tab === "scan" ? (
        <Scan token={token} data={data} onNotebook={() => setTab("notebook")} />
      ) : tab === "evidence" ? (
        <Evidence token={token} data={data} />
      ) : (
        <Notebook token={token} data={data} />
      );
  } else body = <Reveal token={token} data={data} />;

  return (
    <div className="phone-app">
      <TopLine data={data} />
      <main className="phone-body">
        {game.isTest && <div className="testflag">Test game · not the real party</div>}
        {body}
      </main>
      {showNav && (
        <nav className="tabbar" aria-label="Game">
          {(
            [
              ["case", game.round >= 4 ? "Accuse" : "Case"],
              ["scan", "Scan"],
              ["evidence", "Evidence"],
              ["notebook", "Notebook"],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button key={k} type="button" aria-current={tab === k ? "page" : undefined} onClick={() => setTab(k)}>
              {k === "case" && game.round >= 4 ? ICON.accuse : ICON[k]}
              {label}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}

function TopLine({ data }: { data: Phone }) {
  const { game, counts } = data;
  const timed = game.pacing.mode === "timer";
  const now = useNow(game.status === "playing");
  let left = "";
  const intro = game.status === "playing" && game.round === 1 && !!game.introEndsAt && game.introEndsAt > now;
  if (game.paused) left = "Paused";
  else if (intro) left = "Eyes on the TV";
  else if (timed && game.roundEndsAt && game.roundEndsAt > 0) {
    const s = Math.max(0, Math.round((game.roundEndsAt - now) / 1000));
    left = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} left`;
  }
  let chip: string;
  let right: string;
  if (game.status === "lobby") {
    chip = "Doors open";
    right = `${counts.checkedIn} of ${counts.registered} here`;
  } else if (game.status === "playing" && game.round <= 3) {
    chip = `Round ${game.round} · ${["", "Search the house", "Fresh evidence", "Last evidence"][game.round]}`;
    right = timed || intro ? left : game.paused ? "Paused" : `${counts.ready} of ${counts.inGame} ready`;
  } else if (game.status === "playing") {
    chip = "Accusations";
    right = game.paused ? "Paused" : `${counts.accused} of ${counts.inGame} in`;
  } else if (game.status === "reveal") {
    chip = "The reveal";
    right = "";
  } else {
    chip = "Awards";
    right = "";
  }
  return (
    <header className="topline">
      <span className="chip">{chip}</span>
      <span className="timer">{right}</span>
    </header>
  );
}

function Arrive({ token, name }: { token: string; name: string }) {
  const checkIn = useMutation(api.game.checkIn);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go(weaponIn: boolean) {
    setBusy(true);
    setError(null);
    try {
      await checkIn({ token, weaponIn });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="screen center">
      <span className="eyebrow">The Velvet Room</span>
      <Deco />
      <h1 className="title-lg">Good evening, {firstName(name)}.</h1>
      <p className="lede">Put your weapon in an evidence bag where nobody can see it. Then tap below.</p>
      <div className="actions wide">
        <button type="button" className="primary" disabled={busy} onClick={() => go(true)}>
          My weapon's bagged
        </button>
        <button type="button" className="back center-text" disabled={busy} onClick={() => go(false)}>
          I forgot my weapon. Check me in anyway
        </button>
      </div>
      {error && <div className="errbox">{error}</div>}
    </div>
  );
}

function WifiCard({ data }: { data: Phone }) {
  const w = data.game.wifi;
  if (!w) return null;
  return (
    <div className="file wifi">
      <span className="lab">Guest Wi-Fi</span>
      <p>
        <b>{w.name}</b>
        {w.password ? (
          <>
            {" "}
            · password <b className="mono">{w.password}</b>
          </>
        ) : (
          " · no password"
        )}
      </p>
      <span className="help">Or scan the code on the TV.</span>
    </div>
  );
}

function McPhone({ data }: { data: Phone }) {
  return (
    <div className="screen center">
      <span className="eyebrow">Self MC</span>
      <Deco />
      <h1 className="title-lg">You're the MC tonight.</h1>
      <p className="lede">Run the night from the host laptop: it shows the answer, every clue and the lines to read. You don't get a role, and you don't accuse.</p>
      <WifiCard data={data} />
    </div>
  );
}

function Lobby({ data }: { data: Phone }) {
  const { me, lobby } = data;
  return (
    <div className="screen">
      {me.exhibitLetter && (
        <div className="letter-row">
          <div className="letter-tag" aria-label={`Your exhibit letter is ${me.exhibitLetter}`}>
            <span className="t1">Evidence</span>
            <span className="big">{me.exhibitLetter}</span>
            <span className="t3">Write this on your bag</span>
          </div>
          <p className="lede">
            Write <b>{me.exhibitLetter}</b> on your bag and drop it in the evidence box. Letters are dealt at random, so
            yours says nothing about you.
          </p>
        </div>
      )}
      {!me.weaponIn && <p className="help">No weapon? No problem. Tell the host, and you can still play.</p>}
      <span className="eyebrow">You're checked in</span>
      <h1 className="title-lg">Mingle in character.</h1>
      <p className="lede">When the host starts the game, the lights drop and your phone shows your role.</p>
      <ul className="guests">
        {lobby.map((p) => (
          <li key={p.id} className={p.checkedIn ? "" : "away"}>
            <Avatar name={p.charName} url={p.photoUrl} />
            {p.charName}
          </li>
        ))}
      </ul>
      <p className="help">Faded guests haven't checked in yet. Anyone who arrives after the draw watches instead.</p>
      <WifiCard data={data} />
    </div>
  );
}

function Late({ data }: { data: Phone }) {
  return (
    <div className="screen center">
      <span className="eyebrow">The game is on</span>
      <Deco />
      <h1 className="title-lg">You missed the draw.</h1>
      <p className="lede">The case started before you checked in. Grab a drink, watch the TV, and heckle freely.</p>
      <WifiCard data={data} />
    </div>
  );
}

/**
 * Press and hold: the content shows only while a finger (or key) is held down, and hides on release.
 * It looks the same for every guest, killer or not, so a glance at someone's phone gives nothing away.
 */
function useHold() {
  const [holding, setHolding] = useState(false);
  const [seenOnce, setSeenOnce] = useState(false);
  const show = () => {
    setHolding(true);
    setSeenOnce(true);
    navigator.vibrate?.(30);
  };
  const hide = () => setHolding(false);
  const props = {
    role: "button",
    tabIndex: 0,
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture?.(e.pointerId);
      } catch {
        /* keep going: release still hides the card */
      }
      show();
    },
    onPointerUp: hide,
    onPointerCancel: hide,
    onLostPointerCapture: hide,
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        show();
      }
    },
    onKeyUp: hide,
    onBlur: hide,
  };
  return { holding, seenOnce, props };
}

function Murder({ data, onDone }: { data: Phone; onDone: () => void }) {
  const { holding, seenOnce, props } = useHold();
  const b = data.briefing;
  const killer = b?.role === "killer";
  return (
    <div className="screen center murder no-select">
      <span className="eyebrow">Lights down</span>
      <h1 className="title-xl">The Don is dead.</h1>
      <p className="lede">Don Carmine Velluto has been found in {mid(data.game.bodyRoom)}.</p>
      <div {...props} aria-label="Press and hold to see your role" className={`hold-card${holding ? " showing" : ""}`}>
        {holding ? (
          killer ? (
            <>
              <span className="eyebrow">Your role</span>
              <span className="big">You did it.</span>
              <p>{b!.lines[0].replace(/^You did it\. /, "")}</p>
            </>
          ) : (
            <>
              <span className="eyebrow">Your role</span>
              <span className="big">Innocent.</span>
              <p>You didn't kill the Don. Now prove who did.</p>
            </>
          )
        ) : (
          <>
            <span className="eyebrow">Your role</span>
            <span className="hold-hint">Press and hold to read it.</span>
            <span className="help">Let go and it hides again. Keep your screen to yourself.</span>
          </>
        )}
      </div>
      {seenOnce && !holding && (
        <div className="actions wide">
          <button type="button" className="primary" onClick={onDone}>
            Open my case file
          </button>
        </div>
      )}
    </div>
  );
}

function Pacing({ token, data }: { token: string; data: Phone }) {
  const setReady = useMutation(api.game.setReady);
  const { game, counts, me } = data;
  if (game.paused) return <p className="help">The host paused the game. Hang tight.</p>;
  if (game.pacing.mode === "timer") return <p className="help">The next evidence drops on the TV when the timer runs out.</p>;
  if (game.round > 3) return null;
  return (
    <div className="ready">
      <button
        type="button"
        className="ghost-btn full"
        aria-pressed={me.ready}
        onClick={() => setReady({ token, ready: !me.ready })}
      >
        <Swap show={me.ready ? 1 : 0}>
          <span>{game.round === 3 ? "Ready to accuse" : "Ready for more evidence"}</span>
          <span>You're ready ✓</span>
        </Swap>
      </button>
      <div className="meter" aria-hidden="true">
        <i style={{ width: `${(counts.ready / Math.max(1, counts.inGame)) * 100}%` }} />
      </div>
      <span className="help">
        {counts.ready} of {counts.inGame} ready.{" "}
        {game.round === 3 ? "Accusations open" : "More evidence drops on the TV"} once most of the room is ready.
      </span>
    </div>
  );
}

function CaseFile({ token, data }: { token: string; data: Phone }) {
  const b = data.briefing!;
  const { holding, props } = useHold();
  // The card never grows: if the lines don't fit, the text shrinks until they do.
  const card = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = card.current;
    const list = el?.querySelector<HTMLElement>(".role-lines");
    if (!el || !list) return;
    let size = 16;
    list.style.fontSize = `${size}px`;
    while (el.scrollHeight > el.clientHeight + 1 && size > 11) {
      size -= 0.5;
      list.style.fontSize = `${size}px`;
    }
  }, [holding, b.lines]);
  // One layout for every guest. The role lines sit behind press-and-hold in a card of fixed size,
  // so neither the screen nor the card's shape tells anyone who the killer is.
  return (
    <div className="screen">
      <h1 className="title-lg">Your case file</h1>
      <div {...props} ref={card} aria-label="Press and hold to read your role" className={`hold-card role-hold no-select${holding ? " showing" : ""}`}>
        <span className="eyebrow">Your role</span>
        {holding ? (
          <ul className="role-lines">
            {b.lines.map((l) => (
              <li key={l}>{l}</li>
            ))}
          </ul>
        ) : (
          <>
            <span className="hold-hint">Press and hold to read it.</span>
            <span className="help">Let go and it hides again. Keep your screen to yourself.</span>
          </>
        )}
      </div>
      <div className="file private">
        <span className="lab">Your motive</span>
        <p>{b.motive}</p>
      </div>
      <div className="file private">
        <span className="lab">Your secret</span>
        <p>{b.secret}</p>
      </div>
      {b.tip && (
        <div className="file private">
          <span className="lab">Your tip</span>
          <p>{b.tip}</p>
          <span className="help">{b.tipLabel}</span>
        </div>
      )}
      <Pacing token={token} data={data} />
    </div>
  );
}

function CameraScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let scanner: { start: () => Promise<void>; stop: () => void; destroy: () => void } | null = null;
    let done = false;
    (async () => {
      try {
        const { default: QrScanner } = await import("qr-scanner");
        if (!video.current) return;
        scanner = new QrScanner(
          video.current,
          (result: { data: string }) => {
            const code = codeFromScan(result.data);
            if (code && !done) {
              done = true;
              navigator.vibrate?.(40);
              onCode(code);
            }
          },
          {
            preferredCamera: "environment",
            highlightScanRegion: true,
            highlightCodeOutline: true,
            returnDetailedScanResult: true,
            maxScansPerSecond: 15,
            onDecodeError: (e: unknown) => {
              if (String(e) !== "No QR code found") console.warn("[velvet] scanner:", e);
            },
            // Read almost the whole picture, so a card doesn't have to be framed perfectly.
            calculateScanRegion: (v: HTMLVideoElement) => {
              const side = Math.round(Math.min(v.videoWidth, v.videoHeight) * 0.92);
              const size = Math.min(side, 800);
              return { x: Math.round((v.videoWidth - side) / 2), y: Math.round((v.videoHeight - side) / 2), width: side, height: side, downScaledWidth: size, downScaledHeight: size };
            },
          },
        );
        await scanner.start();
      } catch {
        setError("The camera didn't open. Allow camera access for this site in your browser settings, or type the code below.");
      }
    })();
    return () => {
      scanner?.stop();
      scanner?.destroy();
    };
  }, [onCode]);
  return (
    <div className="camera">
      {error ? <div className="errbox">{error}</div> : <video ref={video} playsInline muted aria-label="Camera view" />}
      <button type="button" className="ghost-btn" onClick={onClose}>
        Close camera
      </button>
    </div>
  );
}

function Scan({ token, data, onNotebook }: { token: string; data: Phone; onNotebook: () => void }) {
  const scanMarker = useMutation(api.game.scanMarker);
  const [code, setCode] = useState("");
  const [camera, setCamera] = useState(false);
  const [clue, setClue] = useState<{ number: number; room: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const read = useCallback(
    async (c: string) => {
      setError(null);
      setCamera(false);
      try {
        setClue(await scanMarker({ token, code: c }));
        setCode("");
      } catch (e) {
        setError(friendlyError(e));
      }
    },
    [scanMarker, token],
  );
  if (clue) {
    return (
      <div className="screen">
        <span className="eyebrow">
          Marker {clue.number} · {clue.room}
        </span>
        <div className="clue">
          <span className="no">Evidence marker no. {clue.number}</span>
          <p>{clue.text}</p>
        </div>
        <p className="help">Saved to your evidence. Anyone who finds this marker reads the same thing.</p>
        <button
          type="button"
          className="primary"
          onClick={() => {
            setClue(null);
            setCamera(true);
          }}
        >
          Scan another
        </button>
        <button type="button" className="ghost-btn" onClick={onNotebook}>
          Open my notebook
        </button>
      </div>
    );
  }
  return (
    <div className="screen">
      <h1 className="title-lg">Find a marker</h1>
      {camera ? (
        <CameraScanner onCode={read} onClose={() => setCamera(false)} />
      ) : (
        <>
          <p className="lede">Markers are hidden around the house. When you find one, scan its QR card.</p>
          <button type="button" className="primary" onClick={() => setCamera(true)}>
            Scan a marker
          </button>
        </>
      )}
      <span className="help">Camera won't read it? Type the code printed under the QR.</span>
      <form
        className="code"
        onSubmit={(e) => {
          e.preventDefault();
          const c = codeFromScan(code);
          if (c) read(c);
          else setError("Codes are 6 letters and numbers, like k7qx2m.");
        }}
      >
        <input
          id="marker-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. k7qx2m"
          aria-label="Marker code"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        <button type="submit" className="primary">
          Read
        </button>
      </form>
      {error && <div className="errbox">{error}</div>}
      <p className="help">
        Markers you've found: {data.scans.length} of {data.game.markerCount}
      </p>
      {data.game.search === "waves" && data.board && data.game.round <= 3 && (
        <div className="file">
          <span className="lab">Open for searching</span>
          <p>{data.game.openRooms.join(", ")}</p>
          <span className="help">
            {data.game.openRooms.length < data.board.rooms.length
              ? "The other rooms are sealed. More open each round."
              : "Every room is open now."}
          </span>
        </div>
      )}
    </div>
  );
}

function Evidence({ token, data }: { token: string; data: Phone }) {
  const byRound = (r: number) => data.evidence.filter((e) => e.round === r);
  return (
    <div className="screen">
      <h1 className="title-lg">Evidence</h1>
      {[3, 2].map((r) =>
        byRound(r).length ? (
          <section key={r} className="ev-sec">
            <span className="ev-h">Round {r} · on the TV</span>
            <ul className="ev">
              {byRound(r).map((e) => (
                <li key={e.text} className={e.twist ? "twist" : ""}>
                  <small>{e.twist ? "The twist" : "TV drop"}</small>
                  {e.text}
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
      <section className="ev-sec">
        <span className="ev-h">Markers you found</span>
        {data.scans.length ? (
          <ul className="ev">
            {data.scans.map((s) => (
              <li key={s.number}>
                <small>
                  Marker {s.number} · {s.room}
                </small>
                {s.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="help">None yet. Go search the house.</p>
        )}
      </section>
      {data.briefing?.tip && (
        <section className="ev-sec">
          <span className="ev-h">Your tip</span>
          <ul className="ev">
            <li>
              <small>Private</small>
              {data.briefing.tip}
            </li>
          </ul>
        </section>
      )}
      {data.game.round <= 3 && <Pacing token={token} data={data} />}
    </div>
  );
}

function Notebook({ token, data }: { token: string; data: Phone }) {
  const save = useMutation(api.game.saveNotebook);
  const [crossed, setCrossed] = useState<Set<string>>(() => new Set(data.me.notebook));
  const timer = useRef<number | undefined>(undefined);
  const board = data.board!;
  function toggle(key: string) {
    setCrossed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => save({ token, crossed: [...next] }), 400);
      return next;
    });
  }
  const cell = (key: string, label: string, small?: string) => (
    <button key={key} type="button" className={crossed.has(key) ? "x" : ""} aria-pressed={crossed.has(key)} onClick={() => toggle(key)}>
      <span>{label}</span>
      {small && <small>{small}</small>}
    </button>
  );
  return (
    <div className="screen nb">
      <h1 className="title-lg">Notebook</h1>
      <p className="help">Tap anything you've ruled out. Only you see this.</p>
      <h3>Suspects</h3>
      <div className="nb-grid">{board.suspects.map((s) => cell(`s:${s.id}`, s.name, s.signature))}</div>
      <h3>Exhibits</h3>
      <div className="nb-grid">{board.exhibits.map((e) => cell(`e:${e.id}`, `Exhibit ${e.letter}`, e.name))}</div>
      <h3>Rooms</h3>
      <div className="nb-grid">{board.rooms.map((r) => cell(`r:${r.key}`, r.label))}</div>
    </div>
  );
}

function Accuse({ token, data }: { token: string; data: Phone }) {
  const accuse = useMutation(api.game.accuse);
  const board = data.board!;
  const [pick, setPick] = useState(() => ({
    s: data.myAccusation?.suspectId ?? "",
    e: data.myAccusation?.exhibitId ?? "",
    r: data.myAccusation?.roomKey ?? "",
  }));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(!!data.myAccusation);
  async function lock() {
    setError(null);
    try {
      await accuse({ token, suspectId: pick.s, exhibitId: pick.e, roomKey: pick.r });
      setSaved(true);
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  const opt = (k: "s" | "e" | "r", val: string, label: string) => (
    <button
      key={val}
      type="button"
      aria-pressed={pick[k] === val}
      onClick={() => {
        setPick((p) => ({ ...p, [k]: val }));
        setSaved(false);
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="screen">
      <h1 className="title-lg">Make your accusation</h1>
      <p className="lede">Who killed the Don, with which exhibit, and where?</p>
      <div className="pick">
        <span className="eyebrow">Who</span>
        <div className="opts">{board.suspects.filter((s) => s.id !== data.me.id).map((s) => opt("s", s.id, s.name))}</div>
      </div>
      <div className="pick">
        <span className="eyebrow">Which exhibit</span>
        <div className="opts">{board.exhibits.map((e) => opt("e", e.id, `${e.letter} · ${e.name}`))}</div>
      </div>
      <div className="pick">
        <span className="eyebrow">Where</span>
        <div className="opts">{board.rooms.map((r) => opt("r", r.key, r.label))}</div>
      </div>
      <Swap show={saved ? 1 : 0}>
        <div className="locked pending">Pick who, which exhibit and where, then lock it in.</div>
        <div className="locked">Locked in. You can change it until the reveal starts.</div>
      </Swap>
      {error && <div className="errbox">{error}</div>}
      <button type="button" className="primary" disabled={!pick.s || !pick.e || !pick.r} onClick={lock}>
        {data.myAccusation ? "Update my accusation" : "Lock in my accusation"}
      </button>
      <span className="help">One point each for the right person, exhibit and room. All three makes you an Ace Detective.</span>
    </div>
  );
}

function Reveal({ token, data }: { token: string; data: Phone }) {
  // The TV reveals the killer step by step. The phone waits for the verdict, so nobody reads it here first.
  const verdictAt = data.game.status === "reveal" && data.game.revealAt ? data.game.revealAt + REVEAL_VERDICT_MS : 0;
  const now = useNow(Date.now() < verdictAt);
  if (now < verdictAt) {
    return (
      <div className="screen center">
        <span className="eyebrow">The reveal</span>
        <Deco />
        <h1 className="title-lg">Eyes on the TV.</h1>
        <p className="lede">The killer is about to be named.</p>
      </div>
    );
  }
  return <RevealVotes token={token} data={data} />;
}

function RevealVotes({ token, data }: { token: string; data: Phone }) {
  const vote = useMutation(api.game.vote);
  const r = data.results;
  const others = useMemo(() => (data.board?.suspects ?? []).filter((s) => s.id !== data.me.id), [data.board, data.me.id]);
  const [votes, setVotes] = useState<{ dressed: string | null; liar: string | null }>(() => ({
    dressed: r?.myVote?.dressed ?? null,
    liar: r?.myVote?.liar ?? null,
  }));
  const [sent, setSent] = useState(!!r?.myVote);
  const [error, setError] = useState<string | null>(null);
  if (data.game.status === "done") {
    return (
      <div className="screen center">
        <span className="eyebrow">That's the night</span>
        <Deco />
        <h1 className="title-lg">Awards are on the TV.</h1>
        <p className="lede">The bar is open again. Settle your debts in chips.</p>
      </div>
    );
  }
  const mine = r?.mine;
  const headline = data.me.isMC
    ? "You ran the night."
    : r?.iWasKiller
    ? r.killerWins
      ? "You got away with it."
      : "They caught you."
    : mine
      ? mine.ace
        ? "Ace Detective."
        : `${mine.score} of 3.`
      : "You didn't accuse anyone.";
  const opt = (k: "dressed" | "liar", id: string, name: string) => (
    <button
      key={id}
      type="button"
      aria-pressed={votes[k] === id}
      onClick={() => {
        setVotes((v) => ({ ...v, [k]: id }));
        setSent(false);
      }}
    >
      {name}
    </button>
  );
  return (
    <div className="screen">
      <span className="eyebrow">Eyes on the TV</span>
      <h1 className="title-lg">{headline}</h1>
      {r && (
        <p className="lede">
          It was {r.killer}, with Exhibit {r.exhibit?.letter} ({r.exhibit?.name}), in {mid(r.room)}.
        </p>
      )}
      <p className="help">Best Detective is scored automatically. Vote for the other two.</p>
      <div className="pick">
        <span className="eyebrow">Best Dressed</span>
        <div className="opts">{others.map((s) => opt("dressed", s.id, s.name))}</div>
      </div>
      <div className="pick">
        <span className="eyebrow">Best Liar</span>
        <div className="opts">{others.map((s) => opt("liar", s.id, s.name))}</div>
      </div>
      <Swap show={sent ? 1 : 0}>
        <div className="locked pending">Pick your favorites, then cast your votes.</div>
        <div className="locked">Votes in. You can change them until the host shows the awards.</div>
      </Swap>
      {error && <div className="errbox">{error}</div>}
      <button
        type="button"
        className="primary"
        disabled={!votes.dressed && !votes.liar}
        onClick={async () => {
          setError(null);
          try {
            await vote({
              token,
              dressed: (votes.dressed ?? undefined) as Id<"players"> | undefined,
              liar: (votes.liar ?? undefined) as Id<"players"> | undefined,
            });
            setSent(true);
          } catch (e) {
            setError(friendlyError(e));
          }
        }}
      >
        Cast my votes
      </button>
    </div>
  );
}
