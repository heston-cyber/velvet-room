import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { HOSTS, voiceKey } from "../../convex/narration";
import { friendlyError } from "../lib/errors";
import { Swap } from "../lib/Swap";
import { initials, useNow, type Roster } from "./common";
import type { FunctionReturnType } from "convex/server";
import { Sec, Seg, Toggle, type SettingsPatch } from "./Menu";

type Game = Roster["game"];

/** Plays a file on this laptop (not the TV), one at a time. */
let laptopAudio: HTMLAudioElement | null = null;
function hear(url: string) {
  laptopAudio?.pause();
  laptopAudio = new Audio(url);
  void laptopAudio.play().catch(() => undefined);
}

export function NarratorSection({ game, locked, save }: { game: Game; locked: boolean; save: (p: SettingsPatch) => Promise<void> }) {
  const n = game.narrator;
  const voice = voiceKey(n.host, n.unstable);
  return (
    <Sec title="Narrator and sound">
      <span className="lab">Who runs the floor</span>
      <Seg label="Narrator" value={n.host} options={[["ivy", "Ivy"], ["duke", "Duke"]]} disabled={locked} onPick={(host) => save({ narrator: { ...n, host } })} />
      <span className="help">{HOSTS[n.host].describe}</span>
      <Toggle
        id="set-unstable"
        checked={n.unstable}
        disabled={locked}
        onChange={(unstable) => save({ narrator: { ...n, unstable } })}
        label="Unstable"
        help="The narrator comes unglued: shouting, sobbing, cackling. No two lines alike."
      />
      <div className="row">
        <button type="button" className="btn" onClick={() => hear(`/audio/narration/${voice}/${game.tone}/doors.mp3`)}>
          Hear {HOSTS[n.host].name} on this laptop
        </button>
      </div>
      <Levels game={game} save={save} />
      <span className="help">Levels change the TV right away, even mid-game. 0 turns that part off. In Self MC, set Voice to 0 if the MC would rather read the lines.</span>
    </Sec>
  );
}

function Levels({ game, save }: { game: Game; save: (p: SettingsPatch) => Promise<void> }) {
  const [lv, setLv] = useState(game.levels);
  const pending = useRef<number | undefined>(undefined);
  const server = JSON.stringify(game.levels);
  useEffect(() => setLv(game.levels), [server]); // eslint-disable-line react-hooks/exhaustive-deps
  function set(k: keyof typeof lv, v: number) {
    const next = { ...lv, [k]: v };
    setLv(next);
    window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => void save({ levels: next }), 350);
  }
  const rows: [keyof typeof lv, string][] = [
    ["voice", "Voice"],
    ["music", "Music"],
    ["sfx", "Sound effects"],
  ];
  return (
    <div className="hx-levels">
      {rows.map(([k, label]) => (
        <label key={k} className="hx-level">
          <span className="lab">{label}</span>
          <input type="range" min={0} max={100} step={5} value={lv[k]} onChange={(e) => set(k, Number(e.target.value))} aria-label={`${label} level`} />
          <b>{lv[k] === 0 ? "Off" : lv[k]}</b>
        </label>
      ))}
    </div>
  );
}

const STATUS: Record<string, string> = { ready: "Voice ready", pending: "Recording…", failed: "Couldn't record", none: "Not recorded" };

/** The roll call: each guest's line, editable, and whether the narrator has recorded it. */
export function RollCallSection({ slug, hostKey, locked, onError }: { slug: string; hostKey: string; locked: boolean; onError: (m: string | null) => void }) {
  const sheet = useQuery(api.voice.rollCallSheet, { slug, hostKey });
  const record = useMutation(api.voice.recordRollCall);
  const [busy, setBusy] = useState(false);
  if (!sheet) return <Sec title="Roll call">{<span className="help">Loading…</span>}</Sec>;
  const c = sheet.counts;
  const todo = c.total - c.ready;
  async function go() {
    setBusy(true);
    onError(null);
    try {
      await record({ slug, hostKey });
    } catch (e) {
      onError(friendlyError(e));
    } finally {
      window.setTimeout(() => setBusy(false), 1500);
    }
  }
  return (
    <Sec title={<>Roll call · {c.total} guests</>}>
      <span className="help">
        Right before the murder, the narrator introduces every guest on the TV: their photo, character, real name and this line. Lines start from what each guest wrote at
        sign-up. Edit any of them, then record the voices.
      </span>
      <div className="row">
        <button type="button" className="btn" disabled={busy || locked || !todo || c.pending > 0} onClick={go}>
          <Swap show={c.pending > 0 ? 1 : 0}>
            <span>{todo ? `Record ${todo} voice${todo === 1 ? "" : "s"}` : "All voices recorded"}</span>
            <span>Recording {c.pending}…</span>
          </Swap>
        </button>
        <span className={`hx-status ${c.failed ? "warn" : ""}`}>
          {c.ready} of {c.total} recorded{c.failed ? ` · ${c.failed} failed` : ""}
        </span>
      </div>
      {c.total === 0 ? (
        <p className="help">Nobody's signed up yet.</p>
      ) : (
        <ul className="hx-rollcall">
          {sheet.guests.map((gst) => (
            <RollRow key={gst.id} g={gst} slug={slug} hostKey={hostKey} locked={locked} onError={onError} />
          ))}
        </ul>
      )}
    </Sec>
  );
}

type Row = FunctionReturnType<typeof api.voice.rollCallSheet>["guests"][number];

function RollRow({ g, slug, hostKey, locked, onError }: { g: Row; slug: string; hostKey: string; locked: boolean; onError: (m: string | null) => void }) {
  const setLine = useMutation(api.voice.setRollLine);
  const [text, setText] = useState(g.line);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(g.line);
  }, [g.line, focused]);
  async function commit() {
    setFocused(false);
    if (text.trim() === g.line) return;
    onError(null);
    try {
      await setLine({ slug, hostKey, playerId: g.id as Id<"players">, line: text });
    } catch (e) {
      onError(friendlyError(e));
      setText(g.line);
    }
  }
  return (
    <li>
      <div className="card-ph sm">{g.photoUrl ? <img src={g.photoUrl} alt="" /> : initials(g.charName)}</div>
      <div className="main">
        <div className="nm">
          {g.charName} <span className="sub">· {g.realName}</span>
        </div>
        <textarea
          className="inp area"
          rows={2}
          maxLength={200}
          value={text}
          disabled={locked}
          aria-label={`Roll-call line for ${g.charName}`}
          onFocus={() => setFocused(true)}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
        />
        <div className="meta">
          <span className={`st ${g.voice}`} title={g.error || undefined}>
            {STATUS[g.voice] ?? g.voice}
          </span>
          {g.clipUrl && (
            <button type="button" className="linkish" onClick={() => hear(g.clipUrl!)}>
              Play
            </button>
          )}
          {g.edited && !locked && (
            <button type="button" className="linkish" onClick={() => setLine({ slug, hostKey, playerId: g.id as Id<"players">, line: "" }).catch((e) => onError(friendlyError(e)))}>
              Use their words
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

/** Live tab, before the game: the roll call and How to play on the TV. */
export function Segments({ data, slug, hostKey, onError }: { data: Roster; slug: string; hostKey: string; onError: (m: string | null) => void }) {
  const playRules = useMutation(api.voice.playRules);
  const playRoll = useMutation(api.voice.playRollCall);
  const stop = useMutation(api.voice.stopSegment);
  const sheet = useQuery(api.voice.rollCallSheet, { slug, hostKey });
  const now = useNow(1000);
  const g = data.game;
  if (g.status !== "registration" && g.status !== "lobby") return null;
  // Rough running times, so the buttons know when the TV is back on the doors.
  const HOW_MS = 9 * 8500; // How to play: nine cards
  const here = sheet ? sheet.guests.filter((x) => x.checkedIn).length || sheet.guests.length : 0;
  const rollSecs = sheet ? sheet.guests.reduce((s, x) => s + Math.max(5.5, 2.5 + (x.seconds || x.spoken.length / 15)), 0) / Math.max(1, sheet.guests.length) : 7;
  const rollEnd = g.rollCallAt ? g.rollCallAt + (12 + here * rollSecs) * 1000 : 0;
  // How to play runs by itself, or straight after the roll call.
  const howEnd = g.rulesAt ? g.rulesAt + HOW_MS : rollEnd ? rollEnd + HOW_MS : 0;
  const playing = now < rollEnd ? "roll" : now < howEnd ? "rules" : null;
  const call = (p: Promise<unknown>) => p.catch((e) => onError(friendlyError(e)));
  const ready = sheet?.counts.ready ?? 0;
  const total = sheet?.counts.total ?? 0;
  return (
    <Sec title="Before the murder">
      <span className="help">Once most guests are here, play the roll call. How to play follows it on its own. Then start the game.</span>
      <div className="row">
        <button type="button" className="btn" aria-pressed={playing === "roll"} disabled={!total} onClick={() => call(playRoll({ slug, hostKey }))}>
          {playing === "roll" ? "Roll call playing · restart" : "Play the roll call + How to play"}
        </button>
        <button type="button" className="btn" aria-pressed={playing === "rules"} onClick={() => call(playRules({ slug, hostKey }))}>
          {playing === "rules" ? "How to play is on · restart" : "Play How to play only"}
        </button>
        <button type="button" className="btn" disabled={!playing} onClick={() => call(stop({ slug, hostKey }))}>
          Stop
        </button>
      </div>
      <span className={`hx-status ${total && ready < total ? "warn" : ""}`}>
        {total ? `Roll call voices: ${ready} of ${total} recorded${ready < total ? " (the rest show without a voice; record them in the game menu)" : ""}` : "Nobody signed up yet."}
      </span>
    </Sec>
  );
}

