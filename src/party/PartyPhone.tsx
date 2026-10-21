import React, { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
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
import { LAST_WORDS_MS, RUNOFF_INTRO_MS, speakingNow } from "../../convex/lockin";

type Phone = NonNullable<FunctionReturnType<typeof api.game.phone>>;
type Tab = "case" | "scan" | "evidence" | "notebook" | "book";

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
  // The book (Oct 21): a poker chip.
  book: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 4v3M12 17v3M4 12h3M17 12h3" />
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
  // Phase 4 (Oct 21): Round 2's "pick one" takes over every phone at once, until it's answered (or reopened to change).
  const [pickAgain, setPickAgain] = useState(false);
  const pickOpen = !!data.pick?.open && game.status === "playing" && !!game.rolesOut && !voting;
  const picking = pickOpen && (!data.pick!.answered || pickAgain);
  useEffect(() => {
    if (picking) setTab("case");
  }, [picking]);
  useEffect(() => {
    if (!pickOpen) setPickAgain(false);
  }, [pickOpen]);

  // Phase 6 (Oct 21): the "? How to play" rulebook, from the top of the phone.
  const [rulesOpen, setRulesOpen] = useState(false);
  const rulesShown = rulesOpen && me.checkedIn && game.status !== "registration";

  let body: JSX.Element;
  let showNav = false;
  if (game.status === "lobby" && !me.checkedIn) body = <Arrive token={token} name={me.charName} />;
  else if (game.status === "lobby") body = <Lobby data={data} token={token} />;
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
      ) : seen && tab === "book" ? (
        <Book token={token} data={data} />
      ) : (
        <VoteScreen token={token} data={data} now={now} />
      );
  }
  else if (picking && seen) {
    showNav = true;
    body =
      tab === "evidence" ? (
        <Evidence token={token} data={data} />
      ) : tab === "notebook" ? (
        <Notebook token={token} data={data} />
      ) : tab === "book" ? (
        <Book token={token} data={data} />
      ) : (
        <PickScreen token={token} data={data} onDone={() => setPickAgain(false)} />
      );
  } else if (game.status === "playing" && !seen) {
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
        game.round >= 4 ? <Accuse token={token} data={data} /> : <CaseFile token={token} data={data} onPick={() => setPickAgain(true)} />
      ) : tab === "scan" ? (
        <Scan token={token} data={data} onNotebook={() => setTab("notebook")} />
      ) : tab === "evidence" ? (
        <Evidence token={token} data={data} />
      ) : tab === "book" ? (
        <Book token={token} data={data} />
      ) : (
        <Notebook token={token} data={data} />
      );
  } else body = <Reveal token={token} data={data} />;
  if (rulesShown) {
    body = <Rulebook data={data} onClose={() => setRulesOpen(false)} />;
    showNav = false;
  }

  return (
    <div className="phone-app">
      <TopLine data={data} rules={me.checkedIn && game.status !== "registration" ? { open: rulesShown, toggle: () => setRulesOpen(!rulesOpen) } : null} />
      <main className="phone-body">
        {game.isTest && <div className="testflag">Test game · not the real party</div>}
        {body}
      </main>
      {showNav && (
        <nav className="tabbar" aria-label="Game">
          {(
            [
              ["case", voting ? "Vote" : picking ? "Pick" : game.round >= 4 ? "Lock in" : "Case"],
              ...(voting || picking ? [] : [["scan", "Scan"]]),
              ["evidence", "Evidence"],
              ["notebook", "Notebook"],
              ["book", "Betting"],
            ] as [Tab, string][]
          ).map(([k, label]) => {
            const on = voting || picking ? (k === "case" ? tab !== "evidence" && tab !== "notebook" && tab !== "book" : tab === k) : tab === k;
            return (
              <button key={k} type="button" aria-current={on ? "page" : undefined} onClick={() => setTab(k)}>
                {k === "case" && (game.round >= 4 || voting || picking) ? ICON.accuse : ICON[k]}
                {label}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}

function TopLine({ data, rules }: { data: Phone; rules: { open: boolean; toggle: () => void } | null }) {
  const { game, counts } = data;
  // Oct 20: only timed games have clocks.
  const timed = game.pacing.mode === "timer" && !!game.roundEndsAt;
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
      <div className="topline-sub">
        <p className="todo">{todoOf(data, intro)}</p>
        {rules && (
          <button type="button" className="rules-q" aria-expanded={rules.open} onClick={rules.toggle} aria-label="How to play">
            <b>?</b> How to play
          </button>
        )}
      </div>
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
    if (me.jailed) return "You're in jail this round: no searching or voting. You're back for the lock-in.";
    if (data.pick?.open && !data.pick.answered) return "Everyone picks one now. Pick below.";
    // Phase 4: the story reminder at every round.
    return game.pacing.mode === "timer" ? "Ask where everyone was. Search the house and scan every card you find." : "Ask where everyone was. Search, scan the cards, and tap Ready when you're done.";
  }
  if (game.status === "playing") {
    const ro = data.runoff;
    if (ro && !ro.closedAt) return data.myRunoff ? "Runoff vote in. Watch the TV." : Date.now() < ro.voteAt ? "It's a tie. Last words first." : "The runoff: vote on what's tied.";
    return data.myAccusation ? "You're locked in. Watch the TV." : "Whose story didn't hold up? Lock in who, with what, and where. It's final.";
  }
  if (game.status === "reveal") return "Watch the TV.";
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

function Lobby({ data, token }: { data: Phone; token: string }) {
  const { me, lobby } = data;
  return (
    <div className="screen">
      <span className="eyebrow">You're in</span>
      <h1 className="title-lg">Mingle. Stay in costume.</h1>
      <p className="lede">When everyone's here, the lights drop and the show begins. Your role arrives on this phone after the roll call.</p>
      <BestDressed token={token} data={data} />
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

/**
 * Best Dressed (Oct 20, Heston: "its a prompt in the lobby while people wait for the game to start"): a tap votes, a
 * second tap takes it back, and it can change until the game starts. The award comes at the end of the night.
 */
function BestDressed({ token, data }: { token: string; data: Phone }) {
  const vote = useMutation(api.game.vote);
  const [mine, setMine] = useState<string | null>(data.me.dressed);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setMine(data.me.dressed), [data.me.dressed]);
  const others = data.lobby.filter((p) => p.checkedIn && p.id !== data.me.id);
  if (!data.me.checkedIn || !others.length) return null;
  async function pick(id: string) {
    const next = mine === id ? null : id;
    setMine(next);
    setError(null);
    try {
      await vote({ token, dressed: (next ?? undefined) as Id<"players"> | undefined });
    } catch (e) {
      setError(friendlyError(e));
    }
  }
  return (
    <div className="pick best-dressed">
      <span className="eyebrow">While we wait: vote Best Dressed</span>
      <div className="opts">
        {others.map((p) => (
          <button key={p.id} type="button" className="who-opt" aria-pressed={mine === p.id} onClick={() => void pick(p.id)}>
            {p.figure && <img src={faceUrl(p.figure)} alt="" />}
            <span>{p.charName}</span>
          </button>
        ))}
      </div>
      <span className="help">{mine ? "Saved. You can change it until the game starts." : "Tap a name to vote. The award comes at the end of the night."}</span>
      {error && <div className="errbox">{error}</div>}
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
      <b>You're in jail this round.</b> You can talk, and bribe with chips. You can't search or vote. You're back for the lock-in.
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
          {vt.voted} of {vt.voters} voted{vt.endsAt > 0 ? ` · ${clockOf(vt.left ?? vt.endsAt - now)} left` : ""}
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
        {vt.voted} of {vt.voters} voted{vt.endsAt > 0 ? ` · ${clockOf(vt.left ?? vt.endsAt - now)} left` : ""}
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
        : "the lock-in";
  // Oct 20: a timed round ends on its clock (or once everyone's ready); an untimed one waits for everyone.
  if (game.pacing.mode === "timer") return (
    <div className="ready">
      <button type="button" className="ghost-btn full" aria-pressed={me.ready} onClick={() => setReady({ token, ready: !me.ready })}>
        <Swap show={me.ready ? 1 : 0}>
          <span>{game.round === 3 ? "Ready for the lock-in" : "Ready to end the round"}</span>
          <span>You're ready ✓</span>
        </Swap>
      </button>
      <span className="help">When the clock runs out, or everyone's ready: {next}.</span>
    </div>
  );
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
        {/* Oct 20: Round 2 ends in the jail vote; no release vote. The round waits for everyone. */}
        {`Once ${game.jailVote && counts.inGame < data.counts.registered ? "everyone who's free" : "everyone"} is ready: ${next}.`}
        {game.round === 2 && game.jailVote ? " Jailing anyone is optional." : ""}
      </span>
    </div>
  );
}

/** Little line drawings for the role card. */
type IconName = "search" | "scan" | "mask" | "secret" | "bars" | "lock" | "target" | "trophy" | "chips";
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
    // Phase 4 (Oct 21): a stack of chips.
    chips: (
      <>
        <ellipse cx="12" cy="7" rx="7" ry="2.6" />
        <path d="M5 7v4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V7M5 11v4c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6v-4" />
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
          // Phase 4 (fix #6, Oct 20): the chip tip, worded for the role. It takes the lock-in tile's place (the win line
          // below says it), so the card keeps four tiles and its size.
          ["chips", "Chips buy votes and silence"],
        ]
      : [
          ["scan", "Search, scan, compare notes"],
          // Oct 18: no secrets. Innocents tell the truth; only the killer lies.
          ["secret", "Tell the truth"],
          ["bars", "Jail vote after Round 2"],
          ["chips", "Chips pay debts. Never lie for them"],
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
        {/* Oct 20: the most votes wins each part of the lock-in. */}
        <span>{killer ? "You win unless the most votes land on you, the weapon and the room." : "You all win if the most votes land on the killer, the weapon and the room."}</span>
      </p>
    </div>
  );
}

function CaseFile({ token, data, onPick }: { token: string; data: Phone; onPick?: () => void }) {
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
      {/* Phase 3: where you were when the lights went out. Everyone's reads the same way, the killer's cover too. */}
      {data.story && (
        <div className="file story-file">
          <span className="eyebrow">Where you were</span>
          <p className="story-text">{data.story}</p>
          <span className="help">Everyone has one. Ask where everyone was, and check stories against the cards.</span>
        </div>
      )}
      {/* Phase 4 (Oct 21): debts, always true; settle them in chips. */}
      {data.debts.length > 0 && (
        <div className="file debts-file">
          <span className="eyebrow">Debts</span>
          <ul className="debts">
            {data.debts.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
          <span className="help">Settle up in chips, tonight or never.</span>
        </div>
      )}
      <PickRow data={data} onChange={onPick} />
      {/* Phase 4: the heat, taught with one quick line at Round 1 (no How to play card). */}
      {data.game.round === 1 && data.heat.shows && (
        <p className="help heat-line">Suspect someone? Tag them in your Notebook. Three tags on one guest puts the heat on them, on the TV.</p>
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
      {data.game.isTest && data.testCards.length > 0 && <TestCards token={token} data={data} onClue={setClue} onError={setError} />}
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

/**
 * Solo test mode (Oct 20): in a test game, "find" a card by tapping it, so a test needs no printed cards. Only the
 * rooms open now; the ones you've found are ticked.
 */
function TestCards(props: { token: string; data: Phone; onClue: (c: { number: number; room: string; text: string }) => void; onError: (m: string | null) => void }) {
  const find = useMutation(api.game.scanTestCard);
  const open = props.data.testCards.filter((c) => c.open);
  if (!open.length) return null;
  return (
    <div className="file test-cards">
      <span className="lab">Test game: find a card</span>
      <span className="help">No printed cards needed. Tap one to find it.</span>
      <div className="tc-grid">
        {open.map((c) => (
          <button
            key={c.number}
            type="button"
            className={c.found ? "found" : ""}
            onClick={async () => {
              props.onError(null);
              try {
                props.onClue(await find({ token: props.token, number: c.number }));
              } catch (e) {
                props.onError(friendlyError(e));
              }
            }}
          >
            <b>{c.number}</b>
            <small>{c.room}</small>
          </button>
        ))}
      </div>
    </div>
  );
}

function Evidence({ token, data }: { token: string; data: Phone }) {
  const byRound = (r: number) => data.evidence.filter((e) => e.round === r);
  return (
    <div className="screen">
      <h1 className="title-lg">Evidence</h1>
      {/* Phase 4: the two late tips, as they landed on the TV at the end of Round 2. */}
      {data.lateTips.length > 0 && (
        <section className="ev-sec">
          <span className="ev-h">Late tips · on the TV</span>
          <ul className="ev">
            {data.lateTips.map((t) => (
              <li key={t}>
                <small>Late tip</small>
                {t}
              </li>
            ))}
          </ul>
        </section>
      )}
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
      {data.game.round <= 3 && <Pacing token={token} data={data} />}
    </div>
  );
}

/**
 * Phase 6 (Oct 21, Heston, Oct 20: "the exhaustive, in-depth version of every rule, in plain language, for settling
 * arguments over technicalities"): the full rulebook, from "? How to play" at the top of the phone. It never gives away
 * how the evidence is built, how many are left standing, or how the late tips work beyond the killer planting one.
 * Worded for this game's settings (a jail vote or not, timed or not, rooms opening in waves or all at once).
 */
function RbSec({ h, children }: { h: string; children: ReactNode }) {
  return (
    <section className="rb-sec">
      <h3>{h}</h3>
      {children}
    </section>
  );
}

function Rulebook({ data, onClose }: { data: Phone; onClose: () => void }) {
  const g = data.game;
  const timed = g.pacing.mode === "timer";
  const waves = g.search === "waves";
  const S = RbSec;
  return (
    <div className="screen rulebook">
      <div className="rb-head">
        <h1 className="title-lg">How to play</h1>
        <button type="button" className="ghost-btn" onClick={onClose}>
          Back to the game
        </button>
      </div>
      <p className="help">Every rule, in full. Settle your arguments here.</p>
      <S h="The night">
        <p>Don Ray Sanders dies at the start of the night, and one of you did it. Work out who did it, with which weapon, and in which room. The killer's job is to keep you from it.</p>
      </S>
      <S h="Your role">
        <p>Your phone tells you if you're the killer or innocent. Press and hold your case file to read it; let go and it hides again. Keep it to yourself.</p>
        <p>Only the killer may lie, about anything. Everyone else tells the truth. You don't have to answer every question, but you can't lie.</p>
      </S>
      <S h="Where you were">
        <p>Everyone's phone says where they were when the lights went out, with one detail someone can check. Innocents' stories are true. The killer's is a made-up cover that looks exactly the same, so showing your phone proves nothing. Never show your phone.</p>
        <p>Some phones also list debts, like "You owe Josh $200." Debts are always true, the killer's too.</p>
      </S>
      <S h="Searching">
        <p>
          The night has three rounds. {waves ? "Rooms open a few at a time; stay out of a room until the TV map shows it open." : "Every room is open from the start."} Evidence cards are hidden around the house. Scan each one you find with your phone. A card's words show only on the phone that scanned it, so compare notes. The TV map ticks off each card once someone finds it.
        </p>
        <p>New evidence also lands on the TV in Rounds 2 and 3. Your Evidence tab keeps everything you've seen.</p>
        <p>{timed ? "Each round runs on the clock. When it runs out, the round ends." : "Tap Ready when you're done searching. The round ends when everyone's ready, or when the host moves it on."}</p>
      </S>
      <S h="The heat">
        <p>You can tag one guest you suspect, in your Notebook. When three or more guests tag the same person, the TV puts the heat on them. Tags are anonymous. Move or drop yours any time. If the evidence on the TV clears someone, tags on them fall off. The heat changes nothing by itself, and it goes away at the lock-in.</p>
      </S>
      <S h="Round 2 and the late tips">
        <p>In Round 2, every phone asks everyone to pick one guest at the same moment. For innocents, the pick moves your heat tag. You can skip.</p>
        <p>When Round 2 ends, two late tips land on the TV. The killer may plant evidence once, so one of them might not be true.</p>
      </S>
      {g.jailVote ? (
        <S h="The jail vote">
          <p>After the late tips, everyone who's free votes on their phone: who goes to jail? You can vote for nobody. It takes more than half of the voters on one guest, or nobody goes. The TV shows who voted for whom.</p>
          <p>The jailbird sits out Round 3: no searching, voting or betting. They can still talk, bribe and tag. They're back for the lock-in.</p>
        </S>
      ) : (
        <S h="The jail vote">
          <p>Tonight's game is too small for a jail vote (it takes 5 guests).</p>
        </S>
      )}
      <S h="Chips">
        <p>Chips buy drinks and pay debts. Someone may try to buy your vote or your silence; that's allowed. You can stay quiet. You can never lie, chips or no chips.</p>
      </S>
      <S h="Locking in">
        <p>After Round 3, everyone locks in on their phone: who did it, with which weapon, and in which room. Everyone locks in, the jailbird and the killer too. Once you lock in, it's final.</p>
        <p>The most votes wins on each of the three. If the most votes are on the killer, the weapon and the room, everyone innocent wins. Miss any one, and the killer wins.</p>
      </S>
      <S h="Ties">
        <p>A tie for the most votes goes to a runoff. A tie on who did it: everyone tied gets 30 seconds of last words, then everyone votes again, on who only. A tie on the weapon or the room: just that part is voted again. If the runoff ties too, the killer walks.</p>
      </S>
      <S h="Betting">
        <p>Betting is optional and has its own rules in the Betting tab (tap its "?").</p>
      </S>
      <S h="The end">
        <p>The reveal shows the killer, the weapon, the room, and whether a late tip was planted. Then the awards: Best Detective, Prime Suspect, Best Dressed (voted in the lobby) and Got Away With It.</p>
        <p>The host can pause the night or move any step on, for a dead phone or someone stuck outside.</p>
      </S>
      <button type="button" className="ghost-btn full" onClick={onClose}>
        Back to the game
      </button>
    </div>
  );
}

/**
 * Phase 4 (Oct 21): Round 2's "pick one", on every phone at the same moment, in one layout (fix #6, Oct 20): innocents
 * move their heat tag ("Who's feeling the heat?"); the killer may frame someone ("Who takes the fall?"). Same faces,
 * same buttons, so a glance at the killer's phone shows what everyone else's shows.
 */
function PickScreen({ token, data, onDone }: { token: string; data: Phone; onDone: () => void }) {
  const pick = useMutation(api.heat.pick);
  const killer = data.briefing?.role === "killer";
  const [sel, setSel] = useState<string | null>(data.pick?.mine ?? null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const others = data.board!.suspects.filter((x) => x.id !== data.me.id);
  async function send(target: string | null) {
    setBusy(true);
    setErr(null);
    try {
      await pick({ token, targetId: target as Id<"players"> | null });
      onDone();
    } catch (e) {
      setErr(friendlyError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="screen pick-screen">
      <span className="eyebrow">Round 2 · everyone picks one</span>
      <h1 className="title-lg">{killer ? "Who takes the fall?" : "Who's feeling the heat?"}</h1>
      <p className="help">
        {killer ? "A tip about whoever you pick lands on the TV when Round 2 ends. Skip for no one." : "Your heat tag moves to whoever you pick. Skip to leave it where it is."}
      </p>
      <div className="pick">
        <div className="opts">
          {others.map((x) => (
            <button key={x.id} type="button" className="who-opt" aria-pressed={sel === x.id} onClick={() => setSel(x.id)}>
              {avatarSrc(x.photoUrl, x.figure) ? <img src={avatarSrc(x.photoUrl, x.figure)!} alt="" /> : <span className="av">{initials(x.name)}</span>}
              {firstName(x.name)}
            </button>
          ))}
        </div>
      </div>
      {err && <p className="err">{err}</p>}
      <div className="actions wide">
        <button type="button" className="primary" disabled={!sel || busy} onClick={() => send(sel)}>
          {sel ? `Pick ${firstName(others.find((x) => x.id === sel)?.name ?? "")}` : "Pick someone"}
        </button>
        <button type="button" className="ghost-btn" disabled={busy} onClick={() => send(null)}>
          Skip
        </button>
      </div>
    </div>
  );
}

/** After Round 2's pick: what you picked, and Change until the late tips land. The same row on every phone. */
function PickRow({ data, onChange }: { data: Phone; onChange?: () => void }) {
  const p = data.pick;
  if (!p || !p.answered) return null;
  const who = p.mine ? data.board?.suspects.find((x) => x.id === p.mine)?.name : null;
  return (
    <div className="file pick-row">
      <span className="eyebrow">Your Round 2 pick</span>
      <div className="pick-row-line">
        <span>{who ? firstName(who) : "Nobody"}</span>
        {p.open && onChange && (
          <button type="button" className="ghost-btn" onClick={onChange}>
            Change
          </button>
        )}
      </div>
      {!p.open && <span className="help">Locked in when Round 2 ended.</span>}
    </div>
  );
}

/**
 * Phase 4: the heat tag, on the Notebook's suspect list (Heston, Oct 20). One tag each, anonymous; three or more on
 * someone puts the heat on them on the TV. A tag on someone the evidence cleared drops.
 */
function HeatTags({ token, data }: { token: string; data: Phone }) {
  const tag = useMutation(api.heat.tag);
  const [err, setErr] = useState<string | null>(null);
  if (!data.heat.shows || !data.board) return null;
  const hot = new Set(data.heat.on);
  const others = data.board.suspects.filter((x) => x.id !== data.me.id);
  async function set(id: string | null) {
    setErr(null);
    try {
      await tag({ token, targetId: id as Id<"players"> | null });
    } catch (e) {
      setErr(friendlyError(e));
    }
  }
  return (
    <section className="heat-tags">
      <h3>The heat</h3>
      <p className="help">
        Tag the one guest you suspect most. Three tags on someone puts the heat on them, on the TV. Nobody sees whose tag is whose.
      </p>
      {data.heat.dropped && <p className="help strong">The evidence cleared the guest you tagged, so your tag came off. Tag someone else if you like.</p>}
      <div className="pick">
        <div className="opts">
          {others.map((x) => (
            <button key={x.id} type="button" className={hot.has(x.id) ? "hot" : ""} aria-pressed={data.heat.mine === x.id} onClick={() => set(data.heat.mine === x.id ? null : x.id)}>
              {hot.has(x.id) && <Flame />}
              {firstName(x.name)}
            </button>
          ))}
        </div>
      </div>
      {err && <p className="err">{err}</p>}
    </section>
  );
}

function Flame() {
  return (
    <svg viewBox="0 0 24 24" className="flame" aria-label="has the heat">
      <path d="M12 2c1 4-3 5.5-3 9.5A3 3 0 0 0 12 15a3 3 0 0 0 3-3.5c2 1.5 3 3.4 3 5.5a6 6 0 0 1-12 0C6 11 11 8 12 2z" />
    </svg>
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
      <HeatTags token={token} data={data} />
      <h3>Weapons</h3>
      <div className="nb-grid">{board.exhibits.map((e) => cell(`e:${e.id}`, e.name))}</div>
      <h3>Rooms</h3>
      <div className="nb-grid">{board.rooms.map((r) => cell(`r:${r.key}`, r.label))}</div>
      {data.game.bots && <AskBots token={token} data={data} />}
    </div>
  );
}

/**
 * Solo test mode (Oct 20): ask a bot what a guest would tell you at a party: where they were (once the stories are
 * built) and the cards they've found.
 */
function AskBots({ token, data }: { token: string; data: Phone }) {
  const [asking, setAsking] = useState<string | null>(null);
  const bots = data.board!.suspects.filter((s) => s.bot && s.id !== data.me.id);
  if (!bots.length) return null;
  return (
    <section className="ask-bots">
      <h3>Ask the bots</h3>
      <p className="help">Test game: what they'd tell you if you asked them.</p>
      <div className="ab-list">
        {bots.map((b) => (
          <button key={b.id} type="button" aria-pressed={asking === b.id} onClick={() => setAsking(asking === b.id ? null : b.id)}>
            {b.name}
          </button>
        ))}
      </div>
      {asking && <BotAnswer token={token} botId={asking as Id<"players">} />}
    </section>
  );
}

function BotAnswer({ token, botId }: { token: string; botId: Id<"players"> }) {
  const a = useQuery(api.bots.askBot, { token, botId });
  if (!a) return <p className="help">Asking…</p>;
  return (
    <div className="file bot-answer">
      <span className="lab">{a.name}</span>
      <p>
        <b>Where were you?</b> {a.story ?? "\u201cI don't have a story yet.\u201d"}
      </p>
      <b>What did you find?</b>
      {a.found.length ? (
        <ul className="ev">
          {a.found.map((f) => (
            <li key={f.number}>
              <small>
                Card {f.number} · {f.room}
              </small>
              {f.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="help">Nothing yet.</p>
      )}
    </div>
  );
}

function Accuse({ token, data }: { token: string; data: Phone }) {
  // The runoff (Oct 21): a tie at the lock-in takes over the phone until it's settled.
  if (data.runoff && !data.runoff.closedAt) return <Runoff token={token} data={data} />;
  return <LockIn token={token} data={data} />;
}

/**
 * The runoff (Oct 21, Heston: the runoff is on who only when the person is tied; "revote the tied part" for a weapon
 * or room; 30 seconds of last words for everyone in a runoff on who). First the last words, then one vote on what's
 * tied, final once cast.
 */
/**
 * The Betting tab (Oct 21): one optional bet on who the killer is, $100 to $500, any time before the lock-in. The
 * earlier, the better it pays. The chips go on the TV stand; wrong bets go to the killer. It explains itself (its own
 * "?"); How to play doesn't mention it.
 */
function Book({ token, data }: { token: string; data: Phone }) {
  const book = data.book;
  const place = useMutation(api.game.placeBet);
  const [who, setWho] = useState("");
  const [amount, setAmount] = useState(0);
  const [armed, setArmed] = useState(false);
  const [rules, setRules] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!book || !data.board) return null;
  const me = data.me.id;
  const odds = book.odds;
  async function bet() {
    if (!armed) return setArmed(true);
    setError(null);
    try {
      await place({ token, suspectId: who, amount });
    } catch (e) {
      setError(friendlyError(e));
      setArmed(false);
    }
  }
  return (
    <div className="screen book">
      <div className="book-head">
        <h1 className="title-lg">The book</h1>
        <button type="button" className="book-q" aria-expanded={rules} onClick={() => setRules(!rules)}>
          ?<span className="sr-only"> How betting works</span>
        </button>
      </div>
      {odds !== null && <span className="odds-badge">Round {data.game.round} pays {odds} to 1</span>}
      {rules && (
        <div className="file book-rules">
          <p>One bet a game, on who the killer is: $100 to $500. It's separate from your lock-in.</p>
          <p>When you bet, set your chips on the TV stand.</p>
          <p>The earlier you bet, the better it pays: Round 1 pays 4 to 1, Round 2 (the jail vote too) 3 to 1, Round 3 2 to 1.</p>
          <p>Right: your chips back, plus your winnings from the bank. Wrong: your chips go to the killer.</p>
          <p>Betting closes when the lock-in starts. Jailbirds can't bet. Results show here after the reveal.</p>
        </div>
      )}
      <p className="pot">
        On the stand: <b>${book.pot.toLocaleString()}</b>
        <span className="help"> · {book.bets} {book.bets === 1 ? "bet" : "bets"}</span>
      </p>
      {book.mine ? (
        <div className="file my-bet">
          <span className="eyebrow">Your bet</span>
          <p>
            ${book.mine.amount} on <b>{book.mine.name}</b> at {book.mine.odds} to 1.
          </p>
          <span className="help">
            If {splitFirst(book.mine.name)} did it: ${book.mine.amount * book.mine.odds} from the bank, plus your ${book.mine.amount} back. If not, your chips go to the killer.
          </span>
        </div>
      ) : data.me.jailed ? (
        <p className="lede">Jailbirds can't bet.</p>
      ) : odds === null ? (
        <p className="lede">The book is closed.</p>
      ) : (
        <>
          <div className="pick">
            <span className="eyebrow">Who did it?</span>
            <div className="opts">
              {data.board.suspects
                .filter((s) => s.id !== me)
                .map((s) => (
                  <button key={s.id} type="button" className="who-opt" aria-pressed={who === s.id} onClick={() => (setWho(s.id), setArmed(false))}>
                    {s.figure && <img src={faceUrl(s.figure)} alt="" />}
                    <span>{s.name}</span>
                  </button>
                ))}
            </div>
          </div>
          <div className="pick">
            <span className="eyebrow">How much</span>
            <div className="opts amounts">
              {[100, 200, 300, 400, 500].map((n) => (
                <button key={n} type="button" aria-pressed={amount === n} onClick={() => (setAmount(n), setArmed(false))}>
                  ${n}
                </button>
              ))}
            </div>
          </div>
          {who && amount > 0 && <p className="help">Pays ${amount * odds} plus your ${amount} back if you're right.</p>}
          {error && <div className="errbox">{error}</div>}
          <button type="button" className={`primary ${armed ? "armed" : ""}`} disabled={!who || !amount} onClick={bet}>
            <Swap show={armed ? 1 : 0}>
              <span>Place the bet</span>
              <span>Tap again: set ${amount || 100} on the TV stand</span>
            </Swap>
          </button>
        </>
      )}
    </div>
  );
}

const splitFirst = (name: string) => name.replace(/[“"].*?[”"]\s*/, "").split(" ")[0] || name;

/** After the reveal (Oct 21): what this guest's bet came to, on the results screen. */
function BookResult({ data }: { data: Phone }) {
  const b = data.book;
  if (!b || (!b.result && b.take === null)) return null;
  const r = b.result;
  return (
    <div className="file book-result">
      <span className="eyebrow">The book</span>
      {r?.kind === "won" && (
        <p>
          You called it. Take your ${r.amount} back from the stand, plus <b>${r.winnings}</b> from the bank.
        </p>
      )}
      {r?.kind === "lost" && <p>Wrong pick. Your ${r.amount} on the stand goes to the killer.</p>}
      {r?.kind === "void" && <p>Your bet was cover. Take your ${r.amount} back.</p>}
      {b.take !== null && b.take > 0 && (
        <p>
          The wrong bets are yours: take <b>${b.take}</b> from the stand.
        </p>
      )}
    </div>
  );
}

function Runoff({ token, data }: { token: string; data: Phone }) {
  const ro = data.runoff!;
  const vote = useMutation(api.game.runoffVote);
  const now = useNow(true);
  const [pick, setPick] = useState<{ who?: string; weapon?: string; room?: string }>({});
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const me = data.me.id;
  const tied = [ro.who ? "who did it" : "", ro.weapon ? "the weapon" : "", ro.room ? "the room" : ""].filter(Boolean);
  const what = tied.length > 1 ? `${tied.slice(0, -1).join(", ")} and ${tied[tied.length - 1]}` : tied[0];
  if (data.myRunoff) {
    return (
      <div className="screen">
        <span className="eyebrow">The runoff</span>
        <h1 className="title-lg">Vote in.</h1>
        <p className="lede">Watch the TV. The reveal starts once everyone's voted.</p>
        <p className="help">{ro.voted} of {ro.of} in</p>
      </div>
    );
  }
  if (now < ro.voteAt) {
    const i = speakingNow(ro.at, ro.words.length, now);
    const speaker = i >= 0 ? ro.who?.find((x) => x.id === ro.words[i]) : undefined;
    const left = i >= 0 ? ro.at + RUNOFF_INTRO_MS + (i + 1) * LAST_WORDS_MS - now : ro.voteAt - now;
    return (
      <div className="screen">
        <span className="eyebrow">The runoff</span>
        <h1 className="title-lg">It's a tie.</h1>
        <p className="lede">A runoff on {what}.{ro.words.length ? " Last words first: 30 seconds each." : ""}</p>
        {ro.words.length > 0 && (
          <ol className="last-words">
            {ro.words.map((id, k) => {
              const p = ro.who?.find((x) => x.id === id);
              const state = k === i ? "now" : i < 0 ? (now < ro.at + RUNOFF_INTRO_MS ? "next" : "done") : k < i ? "done" : "next";
              return (
                <li key={id} className={state}>
                  {p?.figure ? <img src={faceUrl(p.figure)} alt="" /> : <span className="av">{initials(p?.name ?? "")}</span>}
                  <span className="nm">{id === me ? "You" : p?.short || p?.name}</span>
                  <span className="st">{state === "now" ? `speaking · ${clockOf(left)}` : state === "done" ? "done" : "up next"}</span>
                </li>
              );
            })}
          </ol>
        )}
        {speaker?.id === me && <div className="file you-speak"><b>You're on.</b> 30 seconds of last words. Make them count.</div>}
        <p className="help">The vote opens on your phone after the last words.</p>
      </div>
    );
  }
  const ready = (!ro.who || !!pick.who) && (!ro.weapon || !!pick.weapon) && (!ro.room || !!pick.room);
  async function go() {
    if (!armed) return setArmed(true);
    setError(null);
    try {
      await vote({ token, ...pick });
    } catch (e) {
      setError(friendlyError(e));
      setArmed(false);
    }
  }
  const set = (k: "who" | "weapon" | "room", v: string) => {
    setPick((p) => ({ ...p, [k]: v }));
    setArmed(false);
  };
  return (
    <div className="screen">
      <span className="eyebrow">The runoff</span>
      <h1 className="title-lg">Vote again</h1>
      <p className="lede">On {what} only. The most votes wins. Another tie, and the killer walks.</p>
      {ro.who && (
        <div className="pick">
          <span className="eyebrow">Who</span>
          <div className="opts">
            {ro.who.filter((x) => x.id !== me).map((x) => (
              <button key={x.id} type="button" className="who-opt" aria-pressed={pick.who === x.id} onClick={() => set("who", x.id)}>
                {x.figure && <img src={faceUrl(x.figure)} alt="" />}
                <span>{x.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {ro.weapon && (
        <div className="pick">
          <span className="eyebrow">Which weapon</span>
          <div className="opts weapons">
            {ro.weapon.map((w) => (
              <button key={w.id} type="button" aria-pressed={pick.weapon === w.id} onClick={() => set("weapon", w.id)}>
                {w.key && <img src={weaponUrl(w.key)} alt="" />}
                <span>{w.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {ro.room && (
        <div className="pick">
          <span className="eyebrow">Where</span>
          <div className="opts">
            {ro.room.map((r) => (
              <button key={r.key} type="button" aria-pressed={pick.room === r.key} onClick={() => set("room", r.key)}>
                <span>{r.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <div className="errbox">{error}</div>}
      <button type="button" className={`primary ${armed ? "armed" : ""}`} disabled={!ready} onClick={go}>
        <Swap show={armed ? 1 : 0}>
          <span>Vote</span>
          <span>Tap again: this is final</span>
        </Swap>
      </button>
      <span className="help">
        {ro.voted} of {ro.of} in{ro.endsAt ? ` · ${clockOf(ro.endsAt - now)} left` : ""}
      </span>
    </div>
  );
}

function LockIn({ token, data }: { token: string; data: Phone }) {
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
        <p className="help">No changes now. The reveal starts once everyone has locked in.</p>
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
      <span className="help">The most votes wins each part: who, the weapon and the room. The group wins if all three are right. A tie for the most goes to a runoff.</span>
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

function RevealVotes({ data }: { token: string; data: Phone }) {
  const r = data.results;
  if (data.game.status === "done") {
    const next = data.game.nextSlug;
    return (
      <div className="screen center">
        <span className="eyebrow">{next ? "Play again" : "That's the night"}</span>
        <Deco />
        <h1 className="title-lg">{next ? "A new mystery is starting." : "Awards are on the TV."}</h1>
        <p className="lede">{next ? "Make a new character for the next game. Same house, new killer." : "The bar is open again. Settle your debts in chips."}</p>
        {!next && <BookResult data={data} />}
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
      <BookResult data={data} />
      <p className="help">The awards are next on the TV.</p>
    </div>
  );
}
