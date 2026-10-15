import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { friendlyError } from "../lib/errors";
import { Qr } from "../lib/qr";
import { Swap } from "../lib/Swap";
import { navigate } from "../lib/router";
import { captionText, type CueKey } from "../../convex/narration";
import { clock, openTvWindow, timeLeft, useBusy, useConfirm, useNow, type Roster } from "./common";
import { Sec, SoundCheck } from "./Menu";

const mid = (l: string) => l.replace(/^The /, "the ");

type Step = { label: string; confirm?: string; help: string; run: () => Promise<unknown>; disabled?: boolean };

/** What the big button does right now. */
export function useNextStep(data: Roster, slug: string, hostKey: string, now: number): Step {
  const openDoors = useMutation(api.game.openDoors);
  const startGame = useMutation(api.game.startGame);
  const skipIntro = useMutation(api.game.skipIntro);
  const skipShow = useMutation(api.game.skipShow);
  const advance = useMutation(api.game.advanceRound);
  const finish = useMutation(api.game.finish);
  const endNight = useMutation(api.game.endNight);
  const newGame = useMutation(api.replay.newGame);
  const g = data.game;
  const c = data.counts;
  const args = { slug, hostKey };
  const intro = g.status === "playing" && g.round === 1 && !!g.introEndsAt && g.introEndsAt > now;
  if (g.status === "registration") return { label: "Open the doors", help: "Guests can check in on their phones.", run: () => openDoors(args) };
  if (g.status === "lobby")
    return {
      label: "Start the game",
      confirm: `Tap again to start · ${c.checkedIn} of ${c.total - (g.mcPlayerId ? 1 : 0)} checked in`,
      help: "Runs the secret draw and picks where the body turns up. Anyone not checked in can't join after this.",
      run: () => startGame(args),
    };
  if (intro && g.show) {
    // The show (v2): skip one part at a time.
    const s = g.show;
    const next = now < s.howAt ? "how" : now < s.rollAt ? "roll" : !s.phonesAt || now < s.phonesAt ? "phones" : "round";
    const label = { how: "Skip to How to play", roll: "Skip to the roll call", phones: "Skip to the roles", round: "Begin Round 1" }[next];
    return { label, help: "Or let the show run on its own. Round 1 starts after the roles.", run: () => skipShow(args) };
  }
  if (intro) return { label: "Begin Round 1", help: "Or let the intro finish on its own.", run: () => skipIntro(args) };
  if (g.status === "playing") {
    // v2: a round ends in its votes; the host can close a vote early and skip its verdict.
    const vt = g.round <= 3 ? g.vote : null;
    if (vt && !vt.closedAt) return { label: "Close the vote", help: "Counts the votes now. More than half on one guest is needed.", run: () => advance(args) };
    if (vt && vt.closedAt && (vt.nextAt ?? 0) > now) return { label: vt.kind === "release" ? "On to the jail vote" : g.round === 3 ? "On to the lock-in" : `On to Round ${g.round + 1}`, help: "Skips the rest of the verdict.", run: () => advance(args) };
    if (g.round <= 3) return { label: `End Round ${g.round}`, help: g.round === 1 ? "Ends the round in the jail vote." : "Ends the round in the votes (release first, if anyone is in jail).", run: () => advance(args) };
    const allIn = c.accused >= c.inGame;
    return {
      label: "Start the reveal",
      confirm: allIn ? undefined : `Tap again: only ${c.accused} of ${c.inGame} have locked in`,
      help: "Starts on its own once everyone's in.",
      run: () => advance(args),
    };
  }
  if (g.status === "reveal") return { label: "Show the awards", help: "Closes the voting for Best Dressed and Best Liar.", run: () => finish(args) };
  if (!g.endedAt) return { label: "End the night", help: "The TV shows the closing card. After that you can start a new game.", run: () => endNight(args) };
  const goTo = (next: string) => navigate(`/host?game=${encodeURIComponent(next)}&key=${encodeURIComponent(hostKey)}`);
  if (g.nextSlug) return { label: "Go to the new game", help: "The new game is open for sign-ups. The TV has already switched to it.", run: async () => goTo(g.nextSlug!) };
  return {
    label: "Start a new game",
    confirm: `Tap again: Game ${g.gameNumber + 1} opens sign-ups`,
    help: "Same rooms and marker cards. Everyone signs up again with a new character, and the TV switches over.",
    run: async () => goTo((await newGame(args)).slug),
  };
}

export function NextButton({ data, slug, hostKey, onError }: { data: Roster; slug: string; hostKey: string; onError: (m: string | null) => void }) {
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
    <div className="hx-next">
      <button type="button" className={`big-go ${isArmed ? "armed" : ""}`} disabled={busy || step.disabled} onClick={go}>
        <Swap show={isArmed ? 1 : 0}>
          <span>{step.label}</span>
          <span>{step.confirm ?? step.label}</span>
        </Swap>
      </button>
      <span className="help">{step.help}</span>
    </div>
  );
}

function statusOf(data: Roster, now: number): [string, string] {
  const g = data.game;
  const c = data.counts;
  const left = timeLeft(g, now);
  const clockText = left === null ? "" : `${clock(left)} left`;
  if (g.nextSlug) return ["Night over", "A new game has started. Use the button below to go to it."];
  if (g.endedAt) return ["Night over", "The TV is showing the closing card. Start a new game to play again."];
  if (g.status === "registration") return [g.open ? "Sign-ups open" : "Sign-ups closed", `${c.total} signed up · doors closed`];
  if (g.status === "lobby") return ["Doors open", `${c.checkedIn} checked in · ${c.weaponsIn} weapon${c.weaponsIn === 1 ? "" : "s"} in the box`];
  if (g.status === "reveal") return ["The reveal", "Playing on the TV · votes coming in"];
  if (g.status === "done") return ["Awards", "Showing on the TV"];
  if (g.round === 1 && g.introEndsAt && g.introEndsAt > now) return ["The intro is playing", `Body found in ${g.bodyRoom} · Round 1 starts in ${clock(g.introEndsAt - now)}`];
  const pause = g.paused ? "Paused · " : "";
  if (g.round >= 4) return ["Accusations", `${pause}${c.accused} of ${c.inGame} in${g.pacing.mode === "timer" ? ` · ${clockText}` : ""}`];
  const label = ["", "Search the house", "Fresh evidence", "Last evidence"][g.round] ?? "";
  return [`Round ${g.round} · ${label}`, `${pause}${g.pacing.mode === "timer" ? clockText : `${c.ready} of ${c.inGame} ready`}`];
}

export default function Live({ data, slug, hostKey, onError }: { data: Roster; slug: string; hostKey: string; onError: (m: string | null) => void }) {
  const now = useNow(500);
  const g = data.game;
  const c = data.counts;
  const started = g.status !== "registration" && g.status !== "lobby";
  const running = g.status === "playing";
  const [status, sub] = statusOf(data, now);
  const setPaused = useMutation(api.game.setPaused);
  const setShowAll = useMutation(api.game.setTvShowAll);
  const [rescue, setRescue] = useState(false);
  const tvOk = !!g.tvSeenAt && now - g.tvSeenAt < 45_000;
  const placed = data.markers.filter((m) => m.roomKey && g.rooms.some((r) => r.key === m.roomKey)).length;
  const mcName = g.mcPlayerId ? data.players.find((p) => p.id === g.mcPlayerId)?.charName : null;
  const call = (p: Promise<unknown>) => p.catch((err) => onError(friendlyError(err)));

  return (
    <div className="hx-cols live">
      <div className="hx-col">
        <div className="hx-status-box">
          <span className="eyebrow">Right now</span>
          <span className="now">{status}</span>
          <span className="help">{sub}</span>
          {g.roomCode && g.status !== "registration" && (
            <span className="help">
              Room code <b>{g.roomCode}</b> · guests join at {window.location.host}/join
            </span>
          )}
          {running && g.round <= 3 && (
            <span className="help">{g.search === "waves" && g.openRooms.length < g.rooms.length ? `Open for searching: ${g.openRooms.join(", ")}` : "Every room is open for searching."}</span>
          )}
        </div>

        {(g.status === "registration" || g.status === "lobby") && (
          <ul className="hx-checks">
            <li className={c.checkedIn >= 3 ? "" : "no"}>
              {c.checkedIn} of {c.total - (g.mcPlayerId ? 1 : 0)} guests checked in {c.checkedIn < 3 ? "(3 needed)" : ""}
            </li>
            <li className={c.weaponsIn >= 1 ? "" : "no"}>{c.weaponsIn} weapons in the box</li>
            <li className={placed === data.markers.length ? "" : "no"}>
              {data.markers.length ? `${placed} of ${data.markers.length} markers have a room` : "No markers (Round 1 evidence goes on the TV)"}
            </li>
            <li className={tvOk ? "" : "no"}>{tvOk ? "TV window open" : "TV window not open yet"}</li>
            <li className={tvOk && g.tvSound ? "" : "no"}>{tvOk && g.tvSound ? "Sound allowed on the TV" : "Sound not allowed on the TV yet (click the TV once)"}</li>
            <li className={tvOk && g.tvMedia ? "" : "no"}>{tvOk && g.tvMedia ? "TV videos loaded" : "TV videos not loaded yet"}</li>
            {g.mode === "mc" && <li>Self MC: {mcName ?? "someone who isn't signed up"} runs the night</li>}
          </ul>
        )}

        <NextButton data={data} slug={slug} hostKey={hostKey} onError={onError} />

        <div className="hx-controls">
          <button type="button" className="btn" disabled={!running} onClick={() => call(setPaused({ slug, hostKey, paused: !g.paused }))}>
            <Swap show={g.paused ? 1 : 0}>
              <span>Pause</span>
              <span>Resume</span>
            </Swap>
          </button>
          <button type="button" className="btn" disabled={!running} onClick={() => call(setShowAll({ slug, hostKey, show: !g.tvShowAll }))}>
            <Swap show={g.tvShowAll ? 1 : 0}>
              <span>Show all evidence on the TV</span>
              <span>Back to the round</span>
            </Swap>
          </button>
          <button type="button" className="btn" aria-pressed={rescue} onClick={() => setRescue(!rescue)}>
            Rescue a phone
          </button>
          <button type="button" className="btn" onClick={() => openTvWindow(slug, g.tvKey)}>
            Open the TV window
          </button>
          <SoundCheck slug={slug} hostKey={hostKey} />
        </div>

        {rescue && <Rescue data={data} slug={slug} hostKey={hostKey} />}

        <Sec title={g.status === "playing" && g.round >= 4 ? "Who's accused (not who they picked)" : started ? "Who's playing" : "Who's here"}>
          <div className="hx-who">
            {data.players.map((p) => {
              const playing = started ? p.inGame && !p.isMC : p.checkedIn && !p.isMC;
              const done = running && (g.round >= 4 ? p.accused : p.ready);
              return (
                <span key={p.id} className={`${playing ? "in" : ""} ${done ? "done" : ""}`}>
                  {p.charName}
                  {p.isMC && <em> · MC</em>}
                  {started && !p.inGame && !p.isMC && <em> · late</em>}
                  {!started && p.claimed && !p.checkedIn && <em> · joined</em>}
                </span>
              );
            })}
          </div>
          <span className="help">
            {running && g.round >= 4 ? "A check means they've locked in an accusation." : running ? "A check means they tapped ready." : "Bright names are checked in."}
          </span>
        </Sec>
      </div>

      <div className="hx-col">
        {g.mode === "mc" ? (
          started ? (
            <McSheet data={data} slug={slug} hostKey={hostKey} now={now} />
          ) : (
            <p className="hx-note">Self MC: the MC sheet (the answer, every clue and the lines to read) appears here when the game starts. The TV narrator reads the lines too; set Voice to 0 in the game menu if the MC would rather read them.</p>
          )
        ) : (
          <>
            <p className="hx-note">You're a player too. Nothing on this screen tells you who did it.</p>
            {running && <SwitchToMc data={data} slug={slug} hostKey={hostKey} onError={onError} />}
          </>
        )}
      </div>
    </div>
  );
}

export function Rescue({ data, slug, hostKey }: { data: Roster; slug: string; hostKey: string }) {
  const rescuePhone = useMutation(api.host.rescuePhone);
  const [who, setWho] = useState<Id<"players"> | "">("");
  const [link, setLink] = useState<{ charName: string; token: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { armed, arm, disarm } = useConfirm();
  const url = link ? `${window.location.origin}/p/${link.token}` : "";
  async function go() {
    if (!who) return;
    if (armed !== who) return arm(who);
    disarm();
    setErr(null);
    try {
      setLink(await rescuePhone({ slug, hostKey, playerId: who }));
    } catch (e) {
      setErr(friendlyError(e));
    }
  }
  return (
    <Sec title="Rescue a phone">
      <span className="help">
        A guest's phone died, they lost their link, or someone else joined as them? This frees their name and makes a new link. Their old link stops working,
        and the TV says so. They scan the new link below, or join again with the room code.
      </span>
      <div className="hx-fields">
        <select
          className="inp"
          value={who}
          onChange={(e) => {
            setWho(e.target.value as Id<"players"> | "");
            setLink(null);
            disarm();
          }}
        >
          <option value="">Pick a guest</option>
          {data.players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.charName} ({p.realName})
            </option>
          ))}
        </select>
        <button type="button" className={`btn ${armed && armed === who ? "armed" : ""}`} disabled={!who} onClick={go}>
          <Swap show={armed && armed === who ? 1 : 0}>
            <span>Make a new link</span>
            <span>Tap again: old link stops</span>
          </Swap>
        </button>
      </div>
      <div className="hx-rescue">
        {url ? <Qr className="qr" text={url} label={`New personal link for ${link?.charName}`} /> : <div className="qr empty">QR code</div>}
        <span className="help">{url ? `New link for ${link?.charName}. Have them scan it now.` : err ?? "\u00a0"}</span>
      </div>
    </Sec>
  );
}

function SwitchToMc({ data, slug, hostKey, onError }: { data: Roster; slug: string; hostKey: string; onError: (m: string | null) => void }) {
  const doSwitch = useMutation(api.game.switchToSelfMC);
  const [who, setWho] = useState<Id<"players"> | "">("");
  const { armed, arm, disarm } = useConfirm();
  async function go() {
    if (armed !== "mc") return arm("mc");
    disarm();
    try {
      await doSwitch({ slug, hostKey, confirm: "SWITCH", mcPlayerId: who || null });
    } catch (err) {
      onError(friendlyError(err));
    }
  }
  return (
    <Sec title="If something breaks">
      <span className="help">
        Switch to Self MC if the game needs a person to run it. This laptop will show the answer, so whoever takes over stops playing: their ready taps and guess no
        longer count. It asks twice.
      </span>
      <label className="hx-field">
        <span className="lab">Who takes over?</span>
        <select className="inp" value={who} onChange={(e) => setWho(e.target.value as Id<"players"> | "")}>
          <option value="">Someone who isn't playing</option>
          {data.players
            .filter((p) => p.inGame)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.charName} ({p.realName})
              </option>
            ))}
        </select>
      </label>
      <button type="button" className={`btn danger ${armed === "mc" ? "armed" : ""}`} onClick={go}>
        <Swap show={armed === "mc" ? 1 : 0}>
          <span>Switch to Self MC</span>
          <span>Tap again: the answer will show here</span>
        </Swap>
      </button>
    </Sec>
  );
}

function McSheet({ data, slug, hostKey, now }: { data: Roster; slug: string; hostKey: string; now: number }) {
  const sheet = useQuery(api.host.mcSheet, { slug, hostKey });
  const results = useQuery(api.game.results, data.game.status === "reveal" || data.game.status === "done" ? { slug } : "skip");
  const g = data.game;
  if (!sheet) return <p className="hx-note">Opening the MC sheet…</p>;
  const tone = g.tone;
  const say = (cue: CueKey) => captionText(cue, tone, g.narrator.host);
  const tv = (round: number) => sheet.clues.filter((x) => x.onTv && x.round === round);
  let lines: string[] = [];
  if (g.status === "playing" && g.round === 1 && g.introEndsAt && g.introEndsAt > now) {
    lines = [say("intro1"), `${say("intro2")} He was found in ${mid(sheet.bodyRoom)}.`, say("intro3"), say("intro4")];
  } else if (g.status === "playing") {
    if (g.round === 1) lines = [g.search === "waves" ? say("round1Waves") : say("round1"), ...(g.search === "waves" ? [`Open for searching: ${g.openRooms.join(", ")}.`] : [])];
    if (g.round === 2) lines = [say("round2"), ...tv(2).map((x) => x.text), ...(g.search === "waves" ? [`More rooms are open: ${g.openRooms.join(", ")}.`] : [])];
    if (g.round === 3) lines = [say("round3"), ...tv(3).filter((x) => !x.twist).map((x) => x.text), say("twist"), ...tv(3).filter((x) => x.twist).map((x) => x.text)];
    if (g.round >= 4) lines = [say("accuse")];
  } else if (g.status === "reveal") {
    lines = [
      say("reveal1"),
      `${sheet.killer}!`,
      `With Exhibit ${sheet.exhibit.letter}, the ${sheet.exhibit.name.toLowerCase()}, in ${mid(sheet.room)}.`,
      results ? `${results.named} of ${results.accusers} named the killer. ${results.killerWins ? say("verdictKiller") : say("verdictDetectives")}` : "",
    ].filter(Boolean);
  } else if (g.status === "done") {
    const a = results?.awards;
    lines = [
      say("awards"),
      ...(a
        ? [
            `Best Detective: ${a.bestDetective?.name ?? "nobody scored"}.`,
            `Best Dressed: ${a.bestDressed.map((x) => x.name).join(" and ") || "no votes"}.`,
            `Best Liar: ${a.bestLiar.map((x) => x.name).join(" and ") || "no votes"}.`,
          ]
        : []),
      ...(g.endedAt ? [say("goodnight")] : []),
    ];
  }
  const rounds = [1, 2, 3];
  return (
    <div className="hx-mc">
      <span className="lab blood">MC sheet · only you see this</span>
      <span className="ans">
        {sheet.killer} · Exhibit {sheet.exhibit.letter} ({sheet.exhibit.name}) · {sheet.room}
      </span>
      <span className="help">Body found in {sheet.bodyRoom}. Don't let this screen face the room.</span>
      <span className="lab">Read aloud now</span>
      <ol className="read">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ol>
      <details>
        <summary>Every clue, by round</summary>
        {rounds.map((r) => (
          <div key={r} className="mc-round">
            <b>Round {r}</b>
            <ul>
              {sheet.clues
                .filter((x) => x.round === r)
                .map((x, i) => (
                  <li key={i} className={x.twist ? "twist" : ""}>
                    <small>{x.onTv ? (x.twist ? "TV · the twist" : "TV") : `Marker ${x.marker} · ${x.room}`}</small>
                    {x.text}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </details>
    </div>
  );
}
