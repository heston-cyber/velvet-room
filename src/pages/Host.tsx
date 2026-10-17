// The host screen (v2, Oct 15): the laptop mirrored to the TV. It IS the TV: the same stage, videos, sound
// and scenes, with the host's controls laid over it. Title screen → Play → Start / Options → the lobby
// (room code on screen) → Everyone is in → the game runs itself. A pause menu (corner button or Esc)
// holds everything else. Nothing on it gives away the answer, so it's safe in front of the room.
import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import { heardForStart, rememberGame } from "../lib/heard";
import { scriptOf } from "../../convex/voiceLines";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { friendlyError } from "../lib/errors";
import Menu, { SoundCheck, type SettingsPatch } from "../host/Menu";
import { Rescue, useNextStep, useSideStep } from "../host/Live";
import { useBusy, useConfirm, useNow, type Roster } from "../host/common";
import { TvStage } from "../tv/Tv";
import { Swap } from "../lib/Swap";
import "../host/host.css";
import "../host/screen.css";

// ---------- the host's games: remembered on this laptop ----------
//
// Anyone can host (Heston, Oct 16: "the host goes to the host link and anyone can start a game and play. it will
// generate a code and everyone can join to play. just like jackbox.tv games work"). /host on a laptop opens the
// game it's hosting; with none, it offers Start a new game, the games this laptop has hosted, and a box for a host
// link. Each game's key is kept once (a Game 2 shares its game's key); a full host link (?game=…&key=…) adds that
// game and opens it.

const HOST_KEYS = "velvet-room:host-keys";
const CURRENT = "velvet-room:host-current";
const OLD_LINK = "velvet-room:host-link";
type Link = { slug: string; hostKey: string };

/** A game and its Game 2, Game 3 share a host key, so keys are kept by the first game's slug. */
const baseSlug = (slug: string) => slug.replace(/-g\d+$/, "");

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* blocked storage: the game still works for this visit */
  }
}
function loadKeys(): Record<string, string> {
  const keys = read<Record<string, string>>(HOST_KEYS, {});
  // The single link this laptop kept before Oct 16 joins the list.
  const old = read<Link | null>(OLD_LINK, null);
  if (old && typeof old.slug === "string" && typeof old.hostKey === "string" && !keys[baseSlug(old.slug)]) keys[baseSlug(old.slug)] = old.hostKey;
  return keys && typeof keys === "object" ? keys : {};
}

export default function Host(props: { slug: string; hostKey: string }) {
  const [keys, setKeys] = useState<Record<string, string>>(loadKeys);
  const [current, setCurrentState] = useState<string | null>(() => (props.slug && props.hostKey ? props.slug : read<string | null>(CURRENT, null)));
  const setCurrent = useCallback((slug: string | null) => {
    setCurrentState(slug);
    write(CURRENT, slug);
  }, []);
  const remember = useCallback((l: Link) => {
    setKeys((k) => {
      const next = { ...k, [baseSlug(l.slug)]: l.hostKey };
      write(HOST_KEYS, next);
      write(OLD_LINK, null);
      return next;
    });
  }, []);
  const open = useCallback(
    (l: Link) => {
      remember(l);
      setCurrent(l.slug);
    },
    [remember, setCurrent],
  );
  useEffect(() => {
    if (props.slug && props.hostKey) open({ slug: props.slug, hostKey: props.hostKey });
    // Keep the key out of the address bar (the TV is in front of everyone).
    if (window.location.search) window.history.replaceState(null, "", "/host");
  }, [props.slug, props.hostKey, open]);
  const forget = useCallback(
    (slug: string) => {
      setCurrent(null);
      setKeys((k) => {
        const next = { ...k };
        delete next[baseSlug(slug)];
        write(HOST_KEYS, next);
        return next;
      });
    },
    [setCurrent],
  );

  // After Switch game, the lobby never jumps back into a game on its own.
  const [picking, setPicking] = useState(false);
  const key = current ? keys[baseSlug(current)] ?? (props.slug === current ? props.hostKey : null) : null;
  if (!current || !key) return <Lobby keys={keys} onOpen={open} auto={!picking} />;
  return (
    <Boundary
      onForget={() => forget(current)}
      onBack={() => {
        setPicking(true);
        setCurrent(null);
      }}
      key={`${current}:${key}`}
    >
      <HostScreen slug={current} hostKey={key} onGame={(slug) => open({ slug, hostKey: key })} onSwitch={() => {
          setPicking(true);
          setCurrent(null);
        }}
      />
    </Boundary>
  );
}

/**
 * F2 (Oct 17): a crash on the host screen offers Reload (the game keeps running on the server). Only a host link that
 * really isn't valid offers to forget it, so a hiccup can't lock the host out of their own game.
 */
class Boundary extends Component<{ children: ReactNode; onForget: () => void; onBack: () => void }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if (this.state.error) {
      const e = this.state.error as { data?: unknown; message?: unknown };
      const badKey = /host link isn't valid/i.test(`${String(e?.data ?? "")} ${String(e?.message ?? "")}`);
      return (
        <div className="hs-page">
          <div className="hs-setup">
            <span className="hs-kick">Host</span>
            <h1 className="hs-h1">{badKey ? "That host link isn't valid" : "Something went wrong"}</h1>
            <p className="hs-sub">
              {badKey ? "Open the full host link again, including the part after \"key=\"." : "Reload the page. The game is safe: it keeps running without this screen."}
            </p>
            <button type="button" className="hs-btn big" onClick={() => window.location.reload()}>
              Reload
            </button>
            <button type="button" className="hs-btn" onClick={this.props.onBack}>
              Back to my games
            </button>
            {badKey && (
              <button type="button" className="hs-btn" onClick={this.props.onForget}>
                Forget this link
              </button>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const STATUS: Record<string, string> = { registration: "Not started", lobby: "Doors open", playing: "Playing", reveal: "The reveal", done: "Awards" };

/** /host with no game open: start one, pick one this laptop has hosted, or paste a host link. */
function Lobby({ keys, onOpen, auto }: { keys: Record<string, string>; onOpen: (l: Link) => void; auto: boolean }) {
  const links = Object.entries(keys).map(([slug, hostKey]) => ({ slug, hostKey }));
  const mine = useQuery(api.hosting.myGames, { links });
  const create = useMutation(api.hosting.createGame);
  const { busy, run } = useBusy();
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const live = (mine ?? []).filter((g) => !g.over);
  // One game on this laptop and it isn't over: just open it.
  const only = auto && mine && mine.length === 1 && live.length === 1 ? live[0] : null;
  useEffect(() => {
    if (only) onOpen({ slug: only.slug, hostKey: keys[baseSlug(only.slug)] });
  }, [only?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    setErr(null);
    try {
      onOpen(await create({}));
    } catch (e) {
      setErr(friendlyError(e));
    }
  }
  function paste() {
    const t = text.trim();
    let slug = "";
    let key = t;
    try {
      const u = new URL(t, window.location.origin);
      if (u.searchParams.get("key")) {
        key = u.searchParams.get("key")!;
        slug = u.searchParams.get("game") || "";
      }
    } catch {
      /* not a link */
    }
    if (!slug || !/^[a-z0-9]{8,}$/i.test(key)) return setErr("Paste the whole host link, including game= and key=.");
    onOpen({ slug, hostKey: key });
  }
  if (mine === undefined || only) {
    return (
      <div className="hs-page">
        <div className="hs-setup">
          <span className="hs-kick">The Velvet Room</span>
          <p className="hs-sub">Opening the books…</p>
        </div>
      </div>
    );
  }
  return (
    <div className="hs-page">
      <div className="hs-setup hs-lobby-pick">
        <span className="hs-kick">The Velvet Room · Host</span>
        <h1 className="hs-h1">Host a murder mystery</h1>
        <p className="hs-sub">Start a game on this laptop and put it on the TV. When you press Play, the TV shows a room code; everyone joins on their phone at {window.location.host}/join.</p>
        <button type="button" className="hs-btn big" disabled={busy} onClick={() => run(start)}>
          Start a new game
        </button>
        {mine.length > 0 && (
          <>
            <span className="hs-kick">Your games on this laptop</span>
            <ul className="hs-games">
              {mine.map((g) => (
                <li key={g.slug}>
                  <span className="nm">
                    {g.title.replace(/\s*\([^)]*\)/g, "")} · {new Date(g.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </span>
                  <span className="st">
                    {g.over ? "Over" : STATUS[g.status] ?? g.status} · {g.players} signed up{g.roomCode ? ` · code ${g.roomCode}` : ""}{g.isTest ? " · test game" : ""}
                  </span>
                  <button type="button" className="hs-btn" onClick={() => onOpen({ slug: g.slug, hostKey: keys[baseSlug(g.slug)] })}>
                    Open
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
        <details className="hs-paste">
          <summary>Have a host link from another laptop?</summary>
          <input className="hs-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the host link" aria-label="Host link" />
          <button type="button" className="hs-btn" onClick={paste} disabled={!text.trim()}>
            Use this link
          </button>
        </details>
        {err && <p className="hs-err">{err}</p>}
      </div>
    </div>
  );
}

// ---------- the screen ----------

type Stage = "title" | "options" | "game";

function HostScreen({ slug, hostKey, onGame, onSwitch }: { slug: string; hostKey: string; onGame: (slug: string) => void; onSwitch: () => void }) {
  const data = useQuery(api.host.roster, { slug, hostKey });
  const ensureTvKey = useMutation(api.host.ensureTvKey);
  const updateSettings = useMutation(api.host.updateSettings);
  const openDoors = useMutation(api.game.openDoors);
  const needsTvKey = data !== undefined && !data.game.tvKey;
  useEffect(() => {
    if (needsTvKey) void ensureTvKey({ slug, hostKey }).catch(() => undefined);
  }, [needsTvKey, ensureTvKey, slug, hostKey]);

  // Once a game has started, this laptop remembers what it picked, so the next game steers clear (src/lib/heard.ts).
  const picked = data?.game.heard ?? null;
  useEffect(() => {
    if (picked) rememberGame(slug, picked);
  }, [slug, picked]);

  const [stage, setStage] = useState<Stage | null>(null);
  const [back, setBack] = useState<Stage>("title");
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = data?.game.status;

  // Before the doors open, the night starts on the title screen; a reload mid-game goes straight to the game.
  useEffect(() => {
    if (!status) return;
    if (stage === null) setStage(status === "registration" ? "title" : "game");
    else if (status !== "registration" && stage === "title") setStage("game");
  }, [status, stage]);

  // Esc opens and closes the pause menu during the game.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (stage === "game") setMenuOpen((o) => !o);
      else if (stage === "options") setStage(back);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage, back]);

  // Play again: the TV follows the next game, and so does the host.
  const follow = useCallback((next: string) => onGame(next), [onGame]);

  if (!data || !data.game.tvKey || stage === null) {
    return (
      <div className="hs-page">
        <div className="hs-setup">
          <span className="hs-kick">The Velvet Room</span>
          <p className="hs-sub">Opening the books…</p>
        </div>
      </div>
    );
  }

  async function save(patch: SettingsPatch) {
    setError(null);
    try {
      await updateSettings({ slug, hostKey, ...patch });
    } catch (err) {
      setError(friendlyError(err));
    }
  }
  async function start() {
    setError(null);
    try {
      if (data!.game.status === "registration") await openDoors({ slug, hostKey });
      setStage("game");
    } catch (err) {
      setError(friendlyError(err));
    }
  }
  const openOptions = (from: Stage) => {
    setBack(from);
    setMenuOpen(false);
    setStage("options");
  };

  const overlay = (
    <>
      {stage === "title" && <TitleScreen title={data.game.title} isTest={data.game.isTest} onPlay={start} onOptions={() => openOptions("title")} onSwitch={onSwitch} />}
      {stage === "options" && (
        <Options onBack={() => setStage(back)} error={error}>
          <Menu data={data} slug={slug} hostKey={hostKey} save={save} onError={setError} />
        </Options>
      )}
      {stage === "game" && (
        <>
          <GameHud data={data} slug={slug} hostKey={hostKey} onMenu={() => setMenuOpen(true)} onError={setError} />
          {menuOpen && (
            <PauseMenu data={data} slug={slug} hostKey={hostKey} onClose={() => setMenuOpen(false)} onOptions={() => openOptions("game")} onError={setError} />
          )}
        </>
      )}
      {error && stage !== "options" && (
        <div className="hs-error" role="alert" onClick={() => setError(null)}>
          {error}
        </div>
      )}
    </>
  );

  return <TvStage slug={slug} tvKey={data.game.tvKey} onNext={follow} overlay={overlay} bare={stage === "title"} />;
}

// The title screen: Play opens the doors (the lobby); Options sits right under it.
function TitleScreen({ title, isTest, onPlay, onOptions, onSwitch }: { title: string; isTest: boolean; onPlay: () => Promise<void>; onOptions: () => void; onSwitch: () => void }) {
  const { busy, run } = useBusy();
  return (
    <div className="hs-cover hs-title">
      <span className="hs-kick">New York City · October 31, 1929</span>
      <div className="hs-deco" aria-hidden="true" />
      <h1 className="hs-logo">{title.replace(/\s*\([^)]*\)/g, "")}</h1>
      {isTest && <span className="hs-test">Test game</span>}
      <nav className="hs-buttons">
        <button type="button" className="hs-btn big" disabled={busy} onClick={() => run(onPlay)} autoFocus>
          Play
        </button>
        <button type="button" className="hs-btn" onClick={onOptions}>
          Options
        </button>
      </nav>
      <button type="button" className="hs-switch" onClick={onSwitch}>
        Switch game
      </button>
    </div>
  );
}

function Options({ onBack, error, children }: { onBack: () => void; error: string | null; children: ReactNode }) {
  return (
    <div className="hs-options">
      <div className="hs-options-bar">
        <button type="button" className="hs-btn" onClick={onBack} autoFocus>
          ← Back
        </button>
        <span className="hs-kick">Options</span>
      </div>
      {error && (
        <div className="hx-err" role="alert">
          <div className="errbox">{error}</div>
        </div>
      )}
      <div className="hx">{children}</div>
    </div>
  );
}

/** What sits on the TV during the game: the lobby bar, a host button when the game waits on the host, and the menu button. */
function GameHud({ data, slug, hostKey, onMenu, onError }: { data: Roster; slug: string; hostKey: string; onMenu: () => void; onError: (m: string | null) => void }) {
  const g = data.game;
  return (
    <>
      <button type="button" className="hs-menu-btn" onClick={onMenu} aria-label="Host menu">
        <span aria-hidden="true">☰</span> Menu
      </button>
      {g.status === "lobby" && <LobbyBar data={data} slug={slug} hostKey={hostKey} onError={onError} />}
      {(g.status === "reveal" || g.status === "done" || (g.status === "playing" && g.round >= 4)) && (
        <HostStep data={data} slug={slug} hostKey={hostKey} onError={onError} top={g.status !== "playing"} />
      )}
    </>
  );
}

function LobbyBar({ data, slug, hostKey, onError }: { data: Roster; slug: string; hostKey: string; onError: (m: string | null) => void }) {
  const startGame = useMutation(api.game.startGame);
  const { armed, arm, disarm } = useConfirm();
  const { busy, run } = useBusy();
  const inCount = data.counts.checkedIn;
  const isArmed = armed === "start";
  // F1 (Oct 17): Play asks whether the QR cards are hidden. No cards tonight: their clues come out on the TV instead.
  const hasCards = data.markers.length > 0;
  async function begin(cards: "hidden" | "none") {
    disarm();
    onError(null);
    await run(async () => {
      try {
        await startGame({ slug, hostKey, cards, ...heardForStart(scriptOf(data.game)) });
      } catch (err) {
        onError(friendlyError(err));
      }
    });
  }
  return (
    <div className="hs-lobby">
      <span className="hs-count">
        <b>{inCount}</b> {inCount === 1 ? "guest is" : "guests are"} in
      </span>
      {isArmed && hasCards ? (
        <div className="hs-ask" role="group" aria-label="Are the QR cards hidden?">
          <span className="hs-ask-q">Are the {data.markers.length} QR cards hidden around the house?</span>
          <div className="hs-row">
            <button type="button" className="hs-btn big" disabled={busy} onClick={() => void begin("hidden")}>
              Yes, begin
            </button>
            <button type="button" className="hs-btn" disabled={busy} onClick={() => void begin("none")}>
              No cards tonight
            </button>
          </div>
          <span className="hs-hint">No cards: their clues come out on the TV instead.</span>
        </div>
      ) : (
        <button
          type="button"
          className={`hs-btn big ${isArmed ? "armed" : ""}`}
          disabled={busy || inCount < 3}
          onClick={() => (isArmed ? void begin("none") : arm("start"))}
        >
          <Swap show={isArmed ? 1 : 0}>
            <span>Everyone is in</span>
            <span>Tap again to begin</span>
          </Swap>
        </button>
      )}
      {inCount < 3 ? <span className="hs-hint">At least 3 guests have to be in.</span> : null}
    </div>
  );
}

/** The next step when the game is waiting on the host (the lock-in, the awards, the end of the night, a new game). */
function HostStep({ data, slug, hostKey, onError, top }: { data: Roster; slug: string; hostKey: string; onError: (m: string | null) => void; top?: boolean }) {
  const now = useNow(1000);
  const step = useNextStep(data, slug, hostKey, now);
  const side = useSideStep(data, slug, hostKey);
  // F7: "Show the awards" stays off the TV until the verdict.
  if (step.disabled) return null;
  return (
    // At the reveal and the awards the buttons sit up top, clear of the verdict and the award cards.
    <div className={`hs-step${top ? " top" : ""}`}>
      {side && <StepButton step={side} onError={onError} />}
      <StepButton step={step} onError={onError} />
    </div>
  );
}

function StepButton({ step, onError }: { step: ReturnType<typeof useNextStep>; onError: (m: string | null) => void }) {
  const { armed, arm, disarm } = useConfirm();
  const { busy, run } = useBusy();
  const isArmed = armed === step.label;
  async function go() {
    if (step.confirm && !isArmed) return arm(step.label);
    disarm();
    onError(null);
    await run(async () => {
      try {
        await step.run();
      } catch (err) {
        onError(friendlyError(err));
      }
    });
  }
  return (
    <button type="button" className={`hs-btn ${isArmed ? "armed" : ""}`} disabled={busy || step.disabled} onClick={go}>
      <Swap show={isArmed ? 1 : 0}>
        <span>{step.label}</span>
        <span>{step.confirm ?? step.label}</span>
      </Swap>
    </button>
  );
}

function PauseMenu(props: { data: Roster; slug: string; hostKey: string; onClose: () => void; onOptions: () => void; onError: (m: string | null) => void }) {
  const { data, slug, hostKey, onClose, onOptions, onError } = props;
  const g = data.game;
  const now = useNow(1000);
  // During the show (intro to the roles) there's no clock to pause and no evidence yet: only skipping.
  const inShow = g.status === "playing" && g.round === 1 && !!g.introEndsAt && g.introEndsAt > now;
  const running = g.status === "playing" && !inShow;
  const setPaused = useMutation(api.game.setPaused);
  const setShowAll = useMutation(api.game.setTvShowAll);
  const [rescue, setRescue] = useState(false);
  const call = (p: Promise<unknown>) => p.catch((err) => onError(friendlyError(err)));
  const step = useNextStep(data, slug, hostKey, now);
  const { armed, arm, disarm } = useConfirm();
  const { busy, run } = useBusy();
  const isArmed = armed === step.label;
  const showStep = g.status !== "registration" && g.status !== "lobby";
  async function goStep() {
    if (step.confirm && !isArmed) return arm(step.label);
    disarm();
    onError(null);
    await run(async () => {
      try {
        await step.run();
        onClose();
      } catch (err) {
        onError(friendlyError(err));
      }
    });
  }
  function fullScreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }
  return (
    <div className="hs-pause" role="dialog" aria-label="Host menu">
      <span className="hs-kick">Host menu</span>
      <button type="button" className="hs-btn big" onClick={onClose} autoFocus>
        Resume
      </button>
      {running && (
        <button type="button" className="hs-btn" onClick={() => call(setPaused({ slug, hostKey, paused: !g.paused }))}>
          {g.paused ? "Start the clock again" : "Pause the game"}
        </button>
      )}
      {showStep && (
        <button type="button" className={`hs-btn ${isArmed ? "armed" : ""}`} disabled={busy || step.disabled} onClick={goStep}>
          <Swap show={isArmed ? 1 : 0}>
            <span>{step.label}</span>
            <span>{step.confirm ?? step.label}</span>
          </Swap>
        </button>
      )}
      {running && (
        <button type="button" className="hs-btn" onClick={() => call(setShowAll({ slug, hostKey, show: !g.tvShowAll }))}>
          {g.tvShowAll ? "Back to the round" : "Show all evidence"}
        </button>
      )}
      <button type="button" className="hs-btn" aria-pressed={rescue} onClick={() => setRescue(!rescue)}>
        Rescue a phone
      </button>
      {rescue && (
        <div className="hs-rescue hx">
          <Rescue data={data} slug={slug} hostKey={hostKey} />
        </div>
      )}
      <div className="hs-row">
        <SoundCheck slug={slug} hostKey={hostKey} />
        <button type="button" className="btn" onClick={fullScreen}>
          Full screen
        </button>
      </div>
      <button type="button" className="hs-btn" onClick={onOptions}>
        Options
      </button>
    </div>
  );
}
