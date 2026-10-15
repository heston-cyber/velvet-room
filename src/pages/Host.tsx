// The host screen (v2, Oct 15): the laptop mirrored to the TV. It IS the TV: the same stage, videos, sound
// and scenes, with the host's controls laid over it. Title screen → Play → Start / Options → the lobby
// (room code on screen) → Everyone is in → the game runs itself. A pause menu (corner button or Esc)
// holds everything else. Nothing on it gives away the answer, so it's safe in front of the room.
import { Component, useCallback, useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { friendlyError } from "../lib/errors";
import Menu, { SoundCheck, type SettingsPatch } from "../host/Menu";
import { Rescue, useNextStep } from "../host/Live";
import { useBusy, useConfirm, useNow, type Roster } from "../host/common";
import { TvStage } from "../tv/Tv";
import { Swap } from "../lib/Swap";
import "../host/host.css";
import "../host/screen.css";

// ---------- the host link: remembered on this laptop ----------

const HOST_LINK = "velvet-room:host-link";
type Link = { slug: string; hostKey: string };

function loadLink(): Link | null {
  try {
    const v = JSON.parse(localStorage.getItem(HOST_LINK) || "null");
    return v && typeof v.slug === "string" && typeof v.hostKey === "string" && v.slug && v.hostKey ? v : null;
  } catch {
    return null;
  }
}
function storeLink(link: Link | null) {
  try {
    if (link) localStorage.setItem(HOST_LINK, JSON.stringify(link));
    else localStorage.removeItem(HOST_LINK);
  } catch {
    /* blocked storage: the full link still works for this visit */
  }
}

/** The full host link (?game=…&key=…) is opened once; after that /host on this laptop is enough. */
function useHostLink(slug: string, hostKey: string) {
  const [link, setLink] = useState<Link | null>(() => (slug && hostKey ? { slug, hostKey } : loadLink()));
  useEffect(() => {
    if (slug && hostKey) setLink({ slug, hostKey });
  }, [slug, hostKey]);
  useEffect(() => {
    if (!link) return;
    storeLink(link);
    // Keep the key out of the address bar (the TV is in front of everyone).
    if (window.location.search) window.history.replaceState(null, "", "/host");
  }, [link]);
  const forget = useCallback(() => {
    storeLink(null);
    setLink(null);
  }, []);
  return { link, setLink, forget };
}

export default function Host(props: { slug: string; hostKey: string }) {
  const { link, setLink, forget } = useHostLink(props.slug, props.hostKey);
  if (!link) return <HostSetup onLink={setLink} />;
  return (
    <Boundary onForget={forget} key={`${link.slug}:${link.hostKey}`}>
      <HostScreen slug={link.slug} hostKey={link.hostKey} onGame={(slug) => setLink({ slug, hostKey: link.hostKey })} />
    </Boundary>
  );
}

class Boundary extends Component<{ children: ReactNode; onForget: () => void }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="hs-page">
          <div className="hs-setup">
            <span className="hs-kick">Host</span>
            <h1 className="hs-h1">That host link isn't valid</h1>
            <p className="hs-sub">Open the full host link again, including the part after "key=".</p>
            <button type="button" className="hs-btn" onClick={this.props.onForget}>
              Forget this link
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/** /host on a laptop that hasn't opened the full link yet. */
function HostSetup({ onLink }: { onLink: (l: Link) => void }) {
  const pub = useQuery(api.registration.publicGame, {});
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  function go() {
    const t = text.trim();
    let slug = pub?.slug ?? "";
    let key = t;
    try {
      const u = new URL(t, window.location.origin);
      if (u.searchParams.get("key")) {
        key = u.searchParams.get("key")!;
        slug = u.searchParams.get("game") || slug;
      }
    } catch {
      /* not a link: treat it as the key itself */
    }
    if (!slug || !/^[a-z0-9]{8,}$/i.test(key)) return setErr("Paste the whole host link, or just the part after key=.");
    onLink({ slug, hostKey: key });
  }
  return (
    <div className="hs-page">
      <div className="hs-setup">
        <span className="hs-kick">The Velvet Room · Host</span>
        <h1 className="hs-h1">This laptop isn't the host yet</h1>
        <p className="hs-sub">Open your full host link once on this laptop, or paste it here. After that, {window.location.host}/host is all you need.</p>
        <input className="hs-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Host link or key" aria-label="Host link or key" />
        {err && <p className="hs-err">{err}</p>}
        <button type="button" className="hs-btn" onClick={go} disabled={!text.trim()}>
          Use this link
        </button>
      </div>
    </div>
  );
}

// ---------- the screen ----------

type Stage = "title" | "options" | "game";

function HostScreen({ slug, hostKey, onGame }: { slug: string; hostKey: string; onGame: (slug: string) => void }) {
  const data = useQuery(api.host.roster, { slug, hostKey });
  const ensureTvKey = useMutation(api.host.ensureTvKey);
  const updateSettings = useMutation(api.host.updateSettings);
  const openDoors = useMutation(api.game.openDoors);
  const needsTvKey = data !== undefined && !data.game.tvKey;
  useEffect(() => {
    if (needsTvKey) void ensureTvKey({ slug, hostKey }).catch(() => undefined);
  }, [needsTvKey, ensureTvKey, slug, hostKey]);

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
      {stage === "title" && <TitleScreen title={data.game.title} isTest={data.game.isTest} onPlay={start} onOptions={() => openOptions("title")} />}
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

  return <TvStage slug={slug} tvKey={data.game.tvKey} onNext={follow} overlay={overlay} hostMode bare={stage === "title"} />;
}

// The title screen: Play opens the doors (the lobby); Options sits right under it.
function TitleScreen({ title, isTest, onPlay, onOptions }: { title: string; isTest: boolean; onPlay: () => Promise<void>; onOptions: () => void }) {
  const { busy, run } = useBusy();
  return (
    <div className="hs-cover hs-title">
      <span className="hs-kick">Chicago · October 31, 1929</span>
      <div className="hs-deco" aria-hidden="true" />
      <h1 className="hs-logo">{title.replace(/\s*\(.*\)$/, "")}</h1>
      {isTest && <span className="hs-test">Test game</span>}
      <nav className="hs-buttons">
        <button type="button" className="hs-btn big" disabled={busy} onClick={() => run(onPlay)} autoFocus>
          Play
        </button>
        <button type="button" className="hs-btn" onClick={onOptions}>
          Options
        </button>
      </nav>
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
      {(g.status === "reveal" || g.status === "done") && <HostStep data={data} slug={slug} hostKey={hostKey} onError={onError} />}
    </>
  );
}

function LobbyBar({ data, slug, hostKey, onError }: { data: Roster; slug: string; hostKey: string; onError: (m: string | null) => void }) {
  const startGame = useMutation(api.game.startGame);
  const { armed, arm, disarm } = useConfirm();
  const { busy, run } = useBusy();
  const inCount = data.counts.checkedIn;
  const isArmed = armed === "start";
  async function go() {
    if (!isArmed) return arm("start");
    disarm();
    onError(null);
    await run(async () => {
      try {
        await startGame({ slug, hostKey });
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
      <button type="button" className={`hs-btn big ${isArmed ? "armed" : ""}`} disabled={busy || inCount < 3} onClick={go}>
        <Swap show={isArmed ? 1 : 0}>
          <span>Everyone is in</span>
          <span>Tap again to begin</span>
        </Swap>
      </button>
      {inCount < 3 && <span className="hs-hint">At least 3 guests have to be in.</span>}
    </div>
  );
}

/** The next step when the game is waiting on the host (the awards, the end of the night, a new game). */
function HostStep({ data, slug, hostKey, onError }: { data: Roster; slug: string; hostKey: string; onError: (m: string | null) => void }) {
  const now = useNow(1000);
  const step = useNextStep(data, slug, hostKey, now);
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
    <div className="hs-step">
      <button type="button" className={`hs-btn ${isArmed ? "armed" : ""}`} disabled={busy || step.disabled} onClick={go}>
        <Swap show={isArmed ? 1 : 0}>
          <span>{step.label}</span>
          <span>{step.confirm ?? step.label}</span>
        </Swap>
      </button>
    </div>
  );
}

function PauseMenu(props: { data: Roster; slug: string; hostKey: string; onClose: () => void; onOptions: () => void; onError: (m: string | null) => void }) {
  const { data, slug, hostKey, onClose, onOptions, onError } = props;
  const g = data.game;
  const running = g.status === "playing";
  const setPaused = useMutation(api.game.setPaused);
  const setShowAll = useMutation(api.game.setTvShowAll);
  const [rescue, setRescue] = useState(false);
  const call = (p: Promise<unknown>) => p.catch((err) => onError(friendlyError(err)));
  const now = useNow(1000);
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
