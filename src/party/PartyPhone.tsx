import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Deco, initials } from "../components/MemberCard";
import { friendlyError } from "../lib/errors";
import { codeFromScan } from "../lib/scan";
import { Swap } from "../lib/Swap";
import { navigate } from "../lib/router";
import { avatarSrc, faceUrl } from "../lib/figure";
import { weaponUrl } from "../lib/weapon";

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

  // Buzz the phone when the game starts, and again when the roles arrive (Android; iPhones ignore this).
  useEffect(() => {
    if (prevStatus.current !== "playing" && game.status === "playing") navigator.vibrate?.([250, 120, 250]);
    prevStatus.current = game.status;
  }, [game.status]);
  const prevRoles = useRef(game.rolesOut);
  useEffect(() => {
    if (!prevRoles.current && game.rolesOut && game.status === "playing") navigator.vibrate?.([400, 150, 400]);
    prevRoles.current = game.rolesOut;
  }, [game.rolesOut, game.status]);

  // Accusations open: jump to the accuse screen once.
  const lastRound = useRef(game.round);
  useEffect(() => {
    if (game.round === 4 && lastRound.current !== 4) setTab("case");
    lastRound.current = game.round;
  }, [game.round]);

  // v2: the jail and release votes take over the phone between rounds, until the verdict has shown.
  const now = useNow(game.status === "playing");
  const vt = data.vote;
  const voting = game.status === "playing" && !!vt && vt.round === game.round && (!vt.closedAt || now < (vt.nextAt ?? 0));
  // A vote opening brings the phone to the vote, once; the guest can still flip to Evidence or Notebook (I3).
  const voteAt = voting ? vt!.at : null;
  useEffect(() => {
    if (voteAt) setTab("case");
  }, [voteAt]);

  let body: JSX.Element;
  let showNav = false;
  if (game.status === "lobby" && !me.checkedIn) body = <Arrive token={token} name={me.charName} />;
  else if (game.status === "lobby") body = <Lobby data={data} />;
  else if (game.status === "playing" && !me.inGame) body = <Late data={data} />;
  else if (game.status === "playing" && !game.rolesOut) body = <ShowWait data={data} />;
  else if (voting) {
    // I3 (Oct 17): the Evidence and Notebook tabs stay reachable during a vote; the first tab is the vote.
    showNav = seen;
    body =
      seen && tab === "evidence" ? (
        <Evidence token={token} data={data} />
      ) : seen && tab === "notebook" ? (
        <Notebook token={token} data={data} />
      ) : (
        <VoteScreen token={token} data={data} now={now} />
      );
  }
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
              ["case", voting ? "Vote" : game.round >= 4 ? "Lock in" : "Case"],
              ...(voting ? [] : [["scan", "Scan"]]),
              ["evidence", "Evidence"],
              ["notebook", "Notebook"],
            ] as [Tab, string][]
          ).map(([k, label]) => {
            const on = voting ? (k === "case" ? tab !== "evidence" && tab !== "notebook" : tab === k) : tab === k;
            return (
              <button key={k} type="button" aria-current={on ? "page" : undefined} onClick={() => setTab(k)}>
                {k === "case" && (game.round >= 4 || voting) ? ICON.accuse : ICON[k]}
                {label}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}

function TopLine({ data }: { data: Phone }) {
  const { game, counts } = data;
  // F12 (Oct 17): the lock-in has a clock whatever the pacing.
  const timed = game.pacing.mode === "timer" || game.round >= 4 || (!!game.roundEndsAt && game.roundEndsAt > 0);
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
  } else if (intro) {
    chip = "Lights down";
    right = left;
  } else if (data.vote && game.status === "playing" && data.vote.round === game.round && !data.vote.closedAt) {
    chip = data.vote.kind === "jail" ? "Jail vote" : "Release vote";
    right = `${data.vote.voted} of ${data.vote.voters} voted`;
  } else if (game.status === "playing" && game.round <= 3) {
    chip = `Round ${game.round} · ${["", "Search the house", "Fresh evidence", "Last evidence"][game.round]}`;
    right = timed || intro ? left : game.paused ? "Paused" : `${counts.ready} of ${counts.inGame} ready`;
  } else if (game.status === "playing") {
    chip = "Lock-in";
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
      <div className="topline-row">
        <span className="chip">{chip}</span>
        <span className="timer">{right}</span>
      </div>
      <p className="todo">{todoOf(data, intro)}</p>
    </header>
  );
}

/** What this guest should be doing right now, in one line (Heston, Oct 16: "more clear on whats happening"). */
function todoOf(data: Phone, intro: boolean): string {
  const { game, me } = data;
  const vt = data.vote && game.status === "playing" && data.vote.round === game.round ? data.vote : null;
  if (game.paused) return "The host paused the game. Hang tight.";
  if (game.status === "lobby") return "You're in. Wait for the host to start the show.";
  if (intro) return "Watch the TV. Your role arrives here after the roll call.";
  if (vt && !vt.closedAt) {
    if (me.jailed) return "You're in jail, so you can't vote. Bribe someone who can: chips for their vote.";
    if (data.myBallot !== undefined) return "Your vote is in. You can change it until the vote closes.";
    return vt.kind === "jail" ? "Vote below: who goes to jail? Or nobody." : "Vote below: does anyone get out of jail? Or nobody.";
  }
  if (vt) return "Watch the TV for the verdict.";
  if (game.status === "playing" && game.round <= 3) {
    if (me.jailed) return game.round === 3 ? "You're in jail. The release vote at the end of this round can let you out, or the evidence can." : "You're in jail: no searching or voting. Keep talking.";
    return game.pacing.mode === "timer" ? "Search the house and scan every evidence card you find." : "Search the house and scan evidence cards. Tap Ready when you're done.";
  }
  if (game.status === "playing") {
    if (me.jailed) return "Jailbirds sit out the lock-in. Watch the TV.";
    return data.myAccusation ? "You're locked in. Watch the TV." : "Lock in who did it, with what, and where. It's final.";
  }
  if (game.status === "reveal") return "Watch the TV. Then vote Best Dressed and Best Liar here.";
  return "Thanks for playing.";
}

/** At the door (Oct 17, F4): the guest taps "I'm here" once they're at the party, so a link left open at home can't put
 *  them in the game. */
function Arrive({ token, name }: { token: string; name: string }) {
  const checkIn = useMutation(api.game.checkIn);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function arrive() {
    setBusy(true);
    setError(null);
    try {
      await checkIn({ token, weaponIn: true });
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="screen center">
      <span className="eyebrow">The doors are open</span>
      <Deco />
      <h1 className="title-lg">Good evening, {firstName(name)}.</h1>
      <p className="lede">At the party? Tap below and you're in the game.</p>
      {error && <div className="errbox">{error}</div>}
      <div className="actions wide">
        <button type="button" className="primary big-tap" disabled={busy} onClick={() => void arrive()}>
          {busy ? "Letting you in…" : "I'm here"}
        </button>
      </div>
      <p className="help">Not there yet? Leave this page and tap it when you arrive.</p>
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

function Lobby({ data }: { data: Phone }) {
  const { me, lobby } = data;
  return (
    <div className="screen">
      <span className="eyebrow">You're in</span>
      <h1 className="title-lg">Mingle. Stay in costume.</h1>
      <p className="lede">When everyone's here, the lights drop and the show begins. Your role arrives on this phone after the roll call.</p>
      <ul className="guests">
        {lobby.map((p) => (
          <li key={p.id} className={p.checkedIn ? "" : "away"}>
            <Avatar name={p.charName} url={avatarSrc(p.photoUrl, p.figure)} />
            {p.charName}
          </li>
        ))}
      </ul>
      <p className="help">Faded guests aren't in yet. Anyone who arrives after the lights drop watches instead.</p>
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

/** v2 jail: shown on a jailed guest's case file and scanner. */
function JailBanner() {
  return (
    <div className="jail-banner" role="status">
      <b>You're in jail.</b> You can talk, and bribe: offer chips to whoever votes you out. You can't search, vote or lock in.
    </div>
  );
}

const clockOf = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** The jail and release votes (v2): tap someone or nobody; change it until it closes; then the result. */
function VoteScreen({ token, data, now }: { token: string; data: Phone; now: number }) {
  const cast = useMutation(api.game.castVote);
  const [error, setError] = useState<string | null>(null);
  const vt = data.vote!;
  const b = data.myBallot;
  const jail = vt.kind === "jail";
  async function vote(targetId: Id<"players"> | null) {
    setError(null);
    try {
      await cast({ token, targetId });
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  if (vt.closedAt && vt.auto && vt.target) {
    // Oct 17 (D10): the evidence already cleared the guest in jail, so there was no release vote.
    return (
      <div className="screen center">
        <span className="eyebrow">No vote needed</span>
        <h1 className="title-lg">{vt.target.id === data.me.id ? "You're free." : `${vt.target.name} is free.`}</h1>
        <p className="lede">The evidence cleared {vt.target.id === data.me.id ? "you" : "them"}, so they're out of jail and back in for the lock-in.</p>
        <p className="help">Eyes on the TV.</p>
      </div>
    );
  }
  if (vt.closedAt) {
    const verdict =
      vt.outcome === "nobody" || !vt.target
        ? jail
          ? "Nobody goes to jail."
          : "Nobody gets out."
        : vt.outcome === "jailed"
          ? vt.target.id === data.me.id
            ? "You're going to jail."
            : `${vt.target.name} is going to jail.`
          : vt.target.id === data.me.id
            ? "You're free."
            : `${vt.target.name} is free.`;
    return (
      <div className="screen center">
        <span className="eyebrow">The votes are in</span>
        <h1 className="title-lg">{verdict}</h1>
        <ul className="tally">
          {(vt.tally ?? []).map((c) => (
            <li key={c.targetId ?? "nobody"}>
              <b>{c.name}</b> · {c.voters.length} {c.voters.length === 1 ? "vote" : "votes"}
              {c.voters.length > 0 && <span className="help"> ({c.voters.map((v) => v.name).join(", ")})</span>}
            </li>
          ))}
        </ul>
        <p className="help">Eyes on the TV.</p>
      </div>
    );
  }
  if (!b?.canVote) {
    const onBallot = vt.candidates.some((c) => c.id === data.me.id);
    return (
      <div className="screen center">
        <span className="eyebrow">{jail ? "The jail vote" : "The release vote"}</span>
        {data.me.jailed && <JailBanner />}
        <h1 className="title-lg">{onBallot ? "Your fate is on the ballot." : "Sit tight."}</h1>
        <p className="lede">{data.me.jailed ? "You can't vote from a cell. Talk fast. Bribes (chips for votes) are welcome." : "This vote is for the others."}</p>
        <p className="help">
          {vt.voted} of {vt.voters} voted · {clockOf(vt.left ?? vt.endsAt - now)} left
        </p>
      </div>
    );
  }
  const options = vt.candidates.filter((c) => c.id !== data.me.id);
  return (
    <div className="screen">
      <span className="eyebrow">{jail ? `The jail vote · Round ${vt.round}` : `The release vote · Round ${vt.round}`}</span>
      <h1 className="title-lg">{jail ? "Who goes to jail?" : "Does anyone get out?"}</h1>
      <p className="lede">More than half of you have to agree. You can change your vote until it closes.</p>
      <div className="vote-grid" role="radiogroup" aria-label={jail ? "Who goes to jail" : "Who gets out"}>
        {options.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={b.voted && b.targetId === c.id} onClick={() => vote(c.id as Id<"players">)}>
            <span className="av">{c.figure ? <img src={faceUrl(c.figure)} alt="" /> : initials(c.name)}</span>
            <span className="nm">{c.name}</span>
          </button>
        ))}
        <button type="button" role="radio" className="nobody" aria-checked={b.voted && b.targetId === null} onClick={() => vote(null)}>
          <span className="nm">Nobody</span>
        </button>
      </div>
      {error && <div className="errbox">{error}</div>}
      <p className="help">
        {b.voted ? "Your vote is in. " : ""}
        {vt.voted} of {vt.voters} voted · {clockOf(vt.left ?? vt.endsAt - now)} left
      </p>
    </div>
  );
}

/** The show (v2): the intro, How to play and the roll call play on the TV. The role arrives after the roll call. */
function ShowWait({ data }: { data: Phone }) {
  // W4 (Oct 17): How to play and the murder play on the TV first; the phone only says he's dead once the TV has.
  const rollAt = data.game.rollAt;
  const now = useNow(!!rollAt && Date.now() < rollAt);
  const dead = !rollAt || now >= rollAt;
  return (
    <div className="screen center murder">
      <span className="eyebrow">Lights down</span>
      <h1 className="title-xl">{dead ? "The Don is dead." : "Eyes on the TV."}</h1>
      {dead && data.game.bodyRoom && <p className="lede">Don Ray Sanders has been found in {mid(data.game.bodyRoom)}.</p>}
      <div className="sealed">
        <p>{dead ? "Your secret role arrives here after the roll call." : "The show is starting. Your secret role arrives here after the roll call."}</p>
      </div>
    </div>
  );
}

function Murder({ data, onDone }: { data: Phone; onDone: () => void }) {
  const { holding, seenOnce, props } = useHold();
  const b = data.briefing;
  const role = b?.role ?? "innocent";
  return (
    <div className="screen center murder no-select">
      <span className="eyebrow">Check your phone</span>
      <h1 className="title-xl">The Don is dead.</h1>
      <p className="lede">Don Ray Sanders has been found in {mid(data.game.bodyRoom)}.</p>
      <div {...props} aria-label="Press and hold to see your role" className={`hold-card role-hold no-select${holding ? " showing" : ""}`}>
        {holding ? (
          role === "accomplice" ? (
            <>
              <span className="eyebrow">Your role</span>
              <span className="big">Accomplice.</span>
              <p>{b!.lines[0].replace(/^You're the accomplice\. /, "")}</p>
            </>
          ) : (
            <RoleCard role={role} card={b?.card ?? null} jail={data.game.jailVote} />
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
  if (me.jailed) return null;
  if (game.paused) return <p className="help">The host paused the game. Hang tight.</p>;
  if (game.round > 3) return null;
  // W9 (Oct 17): what the end of this round brings. D5: games under 5 guests have no jail vote.
  const next =
    game.round === 1
      ? "Round 2 and its evidence"
      : game.round === 2
        ? game.jailVote
          ? "the jail vote, then Round 3"
          : "Round 3 and its evidence"
        : game.jailVote
          ? "a release vote if anyone's in jail, then the lock-in"
          : "the lock-in";
  if (game.pacing.mode === "timer") return <p className="help">When the timer runs out: {next}.</p>;
  return (
    <div className="ready">
      <button
        type="button"
        className="ghost-btn full"
        aria-pressed={me.ready}
        onClick={() => setReady({ token, ready: !me.ready })}
      >
        <Swap show={me.ready ? 1 : 0}>
          <span>{game.round === 3 ? "Ready for the lock-in" : "Ready to end the round"}</span>
          <span>You're ready ✓</span>
        </Swap>
      </button>
      <div className="meter" aria-hidden="true">
        <i style={{ width: `${(counts.ready / Math.max(1, counts.inGame)) * 100}%` }} />
      </div>
      <span className="help">
        {counts.ready} of {counts.inGame} ready.{" "}
        {/* Oct 16: Round 1 has no vote, Round 2 ends in the jail vote, Round 3 in the release vote (if anyone's in jail). */}
        {game.roundEndsAt && game.roundEndsAt > 0
          ? `Last call: 30 seconds, then ${next}.`
          : `Once most of ${game.jailVote ? "the free guests" : "you"} are ready, a 30-second last call, then ${next}.`}
        {game.round === 2 && game.jailVote ? " Jailing anyone is optional." : ""}
      </span>
    </div>
  );
}

/** Little line drawings for the role card. */
type IconName = "search" | "scan" | "mask" | "secret" | "bars" | "lock" | "target" | "trophy";
function RoleIcon({ name }: { name: IconName }) {
  const d: Record<IconName, ReactNode> = {
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6" />
        <path d="M15 15l5.5 5.5" />
      </>
    ),
    mask: (
      <>
        <path d="M2.5 9c2.2-2.2 6.5-2.2 9.5 0 3-2.2 7.3-2.2 9.5 0 0 5.2-3 7.5-5.2 7.5-2 0-3-2-4.3-2s-2.3 2-4.3 2C5.5 16.5 2.5 14.2 2.5 9z" />
        <circle cx="8" cy="11" r="1.4" />
        <circle cx="16" cy="11" r="1.4" />
      </>
    ),
    scan: <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" />,
    secret: (
      <>
        <path d="M2.5 12c3.2-5.2 15.8-5.2 19 0-3.2 5.2-15.8 5.2-19 0z" />
        <path d="M6 12h12M8.5 10v4M12 9.5v5M15.5 10v4" />
      </>
    ),
    bars: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="1" />
        <path d="M8 3v18M12 3v18M16 3v18" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="11" width="14" height="10" rx="1.5" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3M12 15v2.5" />
      </>
    ),
    target: (
      <>
        <circle cx="12" cy="12" r="8" />
        <circle cx="12" cy="12" r="3" />
        <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" />
      </>
    ),
    trophy: (
      <>
        <path d="M8 4h8v5a4 4 0 0 1-8 0V4z" />
        <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M9 20.5h6M10 17h4" />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" className="ri" aria-hidden="true">
      {d[name]}
    </svg>
  );
}

/**
 * The role card (Oct 16, Heston: "In the role cards, let's use more visuals to explain and less text. More concise
 * information."). Same shape and size for every role, behind press-and-hold, so a glance gives nothing away.
 */
function RoleCard({ role, card, jail }: { role: string; card: NonNullable<Phone["briefing"]>["card"]; jail: boolean }) {
  const killer = role === "killer";
  // D5 (Oct 17): no jail tile in games too small for a jail vote.
  const tiles: [IconName, string][] = (
    killer
      ? [
          ["mask", "Lie about anything"],
          ["target", card?.herring ? `Point at ${card.herring}` : "Point at someone else"],
          ["bars", "Stay out of jail"],
          ["lock", "Lock in someone else"],
        ]
      : [
          ["scan", "Search, scan, compare notes"],
          ["secret", "Lie only about your secret"],
          ["bars", "Jail vote after Round 2"],
          ["lock", "Lock in who, what, where"],
        ]
  ).filter(([icon]) => jail || icon !== "bars") as [IconName, string][];
  return (
    <div className={`role-card${killer ? " killer" : ""}`}>
      <div className="rc-head">
        {killer && card?.weapon.key ? <img src={weaponUrl(card.weapon.key)} alt="" /> : <RoleIcon name={killer ? "mask" : "search"} />}
        <div>
          <span className="big">{killer ? "You did it." : "Innocent."}</span>
          <span className="sub">{killer ? `With the ${(card?.weapon.name ?? "").toLowerCase()}, in ${mid(card?.room ?? "")}.` : "You didn't kill the Don. Find who did."}</span>
        </div>
      </div>
      <ul className="rc-tiles">
        {tiles.map(([icon, text]) => (
          <li key={icon}>
            <RoleIcon name={icon} />
            <span>{text}</span>
          </li>
        ))}
      </ul>
      <p className="rc-win">
        <RoleIcon name="trophy" />
        {/* D1 (Oct 17): the one win rule, worded the same everywhere. */}
        <span>{killer ? "You win unless more than half get you, more than half the weapon, and more than half the room." : "You all win if more than half get the killer, more than half the weapon, and more than half the room."}</span>
      </p>
    </div>
  );
}

function CaseFile({ token, data }: { token: string; data: Phone }) {
  const b = data.briefing!;
  const { holding, props } = useHold();
  // One layout for every guest. The role sits behind press-and-hold in a card of fixed size,
  // so neither the screen nor the card's shape tells anyone who the killer is.
  return (
    <div className="screen">
      {data.me.jailed && <JailBanner />}
      <h1 className="title-lg">Your case file</h1>
      <div {...props} aria-label="Press and hold to read your role" className={`hold-card role-hold no-select${holding ? " showing" : ""}`}>
        {holding ? (
          b.role === "accomplice" ? (
            <ul className="role-lines">
              {b.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          ) : (
            <RoleCard role={b.role} card={b.card} jail={data.game.jailVote} />
          )
        ) : (
          <>
            <span className="eyebrow">Your role</span>
            <span className="hold-hint">Press and hold to read it.</span>
            <span className="help">Let go and it hides again. Keep your screen to yourself.</span>
          </>
        )}
      </div>
      <div className="file private">
        <span className="lab">Your motive</span>
        <p>{b.motive}</p>
        <span className="help">Hint at it, deny it or lie about it.</span>
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

function Scan(props: { token: string; data: Phone; onNotebook: () => void }) {
  if (props.data.me.jailed) {
    return (
      <div className="screen">
        <JailBanner />
        <p className="lede">No searching from a cell. Ask a friend what they've found, and offer chips.</p>
      </div>
    );
  }
  return <Scanner {...props} />;
}

function Scanner({ token, data, onNotebook }: { token: string; data: Phone; onNotebook: () => void }) {
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
          Card {clue.number} · {clue.room}
        </span>
        <div className="clue">
          <span className="no">Evidence card no. {clue.number}</span>
          <p>{clue.text}</p>
        </div>
        <p className="help">Saved to your evidence. Anyone who finds this card reads the same thing.</p>
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
      <h1 className="title-lg">Find an evidence card</h1>
      {camera ? (
        <CameraScanner onCode={read} onClose={() => setCamera(false)} />
      ) : (
        <>
          <p className="lede">Evidence cards are hidden around the house. When you find one, scan its QR code.</p>
          <button type="button" className="primary" onClick={() => setCamera(true)}>
            Scan a card
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
          aria-label="Card code"
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
        Cards you've found: {data.scans.length} of {data.game.markerCount}
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
        <span className="ev-h">Cards you found</span>
        {data.scans.length ? (
          <ul className="ev">
            {data.scans.map((s) => (
              <li key={s.number}>
                <small>
                  Card {s.number} · {s.room}
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
      <h3>Weapons</h3>
      <div className="nb-grid">{board.exhibits.map((e) => cell(`e:${e.id}`, e.name))}</div>
      <h3>Rooms</h3>
      <div className="nb-grid">{board.rooms.map((r) => cell(`r:${r.key}`, r.label))}</div>
    </div>
  );
}

function Accuse({ token, data }: { token: string; data: Phone }) {
  const accuse = useMutation(api.game.accuse);
  const board = data.board!;
  const [pick, setPick] = useState({ s: "", e: "", r: "", a: "" });
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = data.myAccusation;
  if (data.me.jailed) {
    return (
      <div className="screen">
        <JailBanner />
        <h1 className="title-lg">You sit out the lock-in.</h1>
        <p className="lede">Jailbirds don't get a say. Watch the TV for the reveal.</p>
      </div>
    );
  }
  // v2: a lock-in is final.
  if (mine) {
    const who = board.suspects.find((s) => s.id === mine.suspectId)?.name ?? "";
    const weapon = board.exhibits.find((e) => e.id === mine.exhibitId);
    const where = board.rooms.find((r) => r.key === mine.roomKey)?.label ?? "";
    const helper = mine.accompliceId ? board.suspects.find((s) => s.id === mine.accompliceId)?.name ?? "" : "";
    return (
      <div className="screen">
        <span className="eyebrow">Locked in</span>
        <h1 className="title-lg">{who}</h1>
        <p className="lede">
          with the {weapon?.name.toLowerCase()}, in {mid(where)}.
        </p>
        {weapon?.key && <img className="locked-weapon" src={weaponUrl(weapon.key)} alt="" />}
        {data.game.hasAccomplice && <p className="help">Accomplice: {helper || "no guess"}.</p>}
        <p className="help">No changes now. The reveal starts once everyone who's free has locked in.</p>
      </div>
    );
  }
  async function lock() {
    if (!armed) return setArmed(true);
    setError(null);
    try {
      await accuse({ token, suspectId: pick.s, exhibitId: pick.e, roomKey: pick.r, accompliceId: pick.a || undefined });
    } catch (e) {
      setError(friendlyError(e));
      setArmed(false);
    }
  }
  const set = (k: "s" | "e" | "r" | "a", val: string) => {
    // Naming someone as the killer takes them off the accomplice guess.
    setPick((p) => ({ ...p, [k]: val, ...(k === "s" && p.a === val ? { a: "" } : {}) }));
    setArmed(false);
  };
  const opt = (k: "s" | "r" | "a", val: string, label: string, figure?: string | null) => (
    <button key={val} type="button" className={figure ? "who-opt" : undefined} aria-pressed={pick[k] === val} onClick={() => set(k, pick[k] === val && k === "a" ? "" : val)}>
      {figure && <img src={faceUrl(figure)} alt="" />}
      <span>{label}</span>
    </button>
  );
  const ready = !!(pick.s && pick.e && pick.r);
  return (
    <div className="screen">
      <h1 className="title-lg">Lock it in</h1>
      <p className="lede">Who killed the Don, with which weapon, and where? Once you lock in, that's final.</p>
      <div className="pick">
        <span className="eyebrow">Who</span>
        {/* I1 (Oct 17): faces, not just names. */}
        <div className="opts">{board.suspects.filter((s) => s.id !== data.me.id).map((s) => opt("s", s.id, s.name, s.figure))}</div>
      </div>
      <div className="pick">
        <span className="eyebrow">Which weapon</span>
        <div className="opts weapons">
          {board.exhibits.map((e) => (
            <button key={e.id} type="button" aria-pressed={pick.e === e.id} onClick={() => set("e", e.id)}>
              {e.key && <img src={weaponUrl(e.key)} alt="" />}
              <span>{e.name}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="pick">
        <span className="eyebrow">Where</span>
        <div className="opts">{board.rooms.map((r) => opt("r", r.key, r.label))}</div>
      </div>
      {data.game.hasAccomplice && (
        <div className="pick">
          <span className="eyebrow">The accomplice (optional)</span>
          <div className="opts">{board.suspects.filter((s) => s.id !== data.me.id && s.id !== pick.s).map((s) => opt("a", s.id, s.name))}</div>
          <span className="help">A guess. It doesn't change who wins, but it can win you Best Detective. Tap again to clear it.</span>
        </div>
      )}
      {error && <div className="errbox">{error}</div>}
      <button type="button" className={`primary ${armed ? "armed" : ""}`} disabled={!ready} onClick={lock}>
        <Swap show={armed ? 1 : 0}>
          <span>Lock it in</span>
          <span>Tap again: this is final</span>
        </Swap>
      </button>
      <span className="help">The group wins if more than half of you get the killer, more than half the weapon, and more than half the room.</span>
    </div>
  );
}

function Reveal({ token, data }: { token: string; data: Phone }) {
  // The TV reveals the killer step by step. The phone waits for the verdict, so nobody reads it here first.
  // v2: the verdict comes later when the TV also names the accomplice (the server says when).
  const verdictAt = data.game.status === "reveal" && data.game.revealAt ? data.game.revealAt + data.game.verdictMs : 0;
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
    const next = data.game.nextSlug;
    return (
      <div className="screen center">
        <span className="eyebrow">{next ? "Play again" : "That's the night"}</span>
        <Deco />
        <h1 className="title-lg">{next ? "A new mystery is starting." : "Awards are on the TV."}</h1>
        <p className="lede">{next ? "Make a new character for the next game. Same house, new killer." : "The bar is open again. Settle your debts in chips."}</p>
        {next && (
          <div className="actions wide">
            <button type="button" className="primary" onClick={() => navigate(`/?game=${encodeURIComponent(next)}`)}>
              Sign up for the next game
            </button>
          </div>
        )}
      </div>
    );
  }
  const mine = r?.mine;
  // W20 (Oct 17): an innocent's phone leads with who won, then their own score.
  const verdict = r ? (r.killerWins ? (r.accomplice ? "The killer and the accomplice got away." : "The killer got away.") : "The detectives win.") : "";
  const headline = r?.iWasKiller
    ? r.killerWins
      ? "You got away with it."
      : "They caught you."
    : r?.iWasAccomplice
    ? r.killerWins
      ? "You both got away with it."
      : "Your partner got caught."
    : verdict;
  const myScore = r?.iWasKiller || r?.iWasAccomplice
    ? null
    : mine
      ? mine.ace
        ? "You got all three. Ace detective."
        : `You got ${mine.score} of 3.`
      : data.me.satOut
        ? "You sat out the lock-in in jail."
        : "You didn't lock in.";
  // Best Liar is for the innocents (Oct 17, D6): the killer has "Got Away With It".
  const innocents = others.filter((s) => s.id !== r?.killerId && s.id !== r?.accompliceId);
  // S8: a tap saves the vote.
  async function pick(k: "dressed" | "liar", id: string) {
    const next = { ...votes, [k]: votes[k] === id ? null : id };
    setVotes(next);
    setError(null);
    setSent(false);
    try {
      await vote({
        token,
        dressed: (next.dressed ?? undefined) as Id<"players"> | undefined,
        liar: (next.liar ?? undefined) as Id<"players"> | undefined,
      });
      setSent(true);
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  const opt = (k: "dressed" | "liar", s: { id: string; name: string; figure: string | null }) => (
    <button key={s.id} type="button" className="who-opt" aria-pressed={votes[k] === s.id} onClick={() => void pick(k, s.id)}>
      {s.figure && <img src={faceUrl(s.figure)} alt="" />}
      <span>{s.name}</span>
    </button>
  );
  return (
    <div className="screen">
      <span className="eyebrow">Eyes on the TV</span>
      <h1 className="title-lg">{headline}</h1>
      {myScore && <p className="lede strong">{myScore}</p>}
      {r && (
        <p className="lede">
          It was {r.killer}, with the {r.exhibit?.name.toLowerCase()}, in {mid(r.room)}.
          {r.accomplice && ` ${r.accomplice} was the accomplice.`}
        </p>
      )}
      {r?.accomplice && mine && data.myAccusation?.accompliceId && !r.iWasKiller && !r.iWasAccomplice && (
        <p className="help">{mine.gotAccomplice ? "And you spotted the accomplice." : "Your accomplice guess missed."}</p>
      )}
      <p className="help">Best Detective and Prime Suspect come from the lock-ins. Vote for these two:</p>
      <div className="pick">
        <span className="eyebrow">Best Dressed</span>
        <div className="opts">{others.map((s) => opt("dressed", s))}</div>
      </div>
      <div className="pick">
        <span className="eyebrow">Best Liar · innocents only</span>
        <div className="opts">{innocents.map((s) => opt("liar", s))}</div>
      </div>
      <Swap show={sent ? 1 : 0}>
        <div className="locked pending">Tap a name to vote. Tap it again to take it back.</div>
        <div className="locked">Saved. You can change it until the awards start.</div>
      </Swap>
      {error && <div className="errbox">{error}</div>}
    </div>
  );
}
