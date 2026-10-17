import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { HOSTS, voiceKey } from "../../convex/narration";
import { friendlyError } from "../lib/errors";
import { Swap } from "../lib/Swap";
import { initials, type Roster } from "./common";
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
  const sailor = !!n.sailor;
  const voice = voiceKey(n.host, n.unstable, sailor);
  return (
    <Sec title="Narrator and sound">
      <span className="lab">Who runs the floor</span>
      <Seg label="Narrator" value={n.host} options={[["ivy", "Ivy"], ["duke", "Duke"]]} disabled={locked || sailor} onPick={(host) => save({ narrator: { ...n, host } })} />
      <span className="help">{HOSTS[n.host].describe}</span>
      {!sailor && (
        <Toggle
          id="set-unstable"
          checked={n.unstable}
          disabled={locked}
          onChange={(unstable) => save({ narrator: { ...n, unstable } })}
          label="Unstable"
          help="The narrator comes unglued: shouting, sobbing, cackling. No two lines alike."
        />
      )}
      {/* Oct 16, Heston: "a toggle in the voice setup area that is 'Sailor mode'". */}
      <Toggle
        id="set-sailor"
        checked={sailor}
        disabled={locked}
        onChange={(on) => save({ narrator: { host: on ? "duke" : n.host, unstable: false, sailor: on } })}
        label="Sailor mode"
        help="Duke, furious, swearing like his life depends on it, with his own script. Explicit: turns on the Adult script."
      />
      <div className="row">
        <button type="button" className="btn" onClick={() => hear(`/audio/narration/${voice}/${sailor ? "sailor" : game.tone}/doors.mp3`)}>
          Hear {sailor ? "Sailor mode" : HOSTS[n.host].name} on this laptop
        </button>
      </div>
      <Levels game={game} save={save} />
      <span className="help">Levels change the TV right away, even mid-game. 0 turns that part off.</span>
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

const STATUS: Record<string, string> = { ready: "Voice ready", pending: "Recording…", failed: "Couldn't record", none: "Not recorded", later: "Records at Start" };

/** The roll call: after How to play, the narrator introduces every guest by name and nickname. */
export function RollCallSection({ slug, hostKey, locked, onError }: { slug: string; hostKey: string; locked: boolean; onError: (m: string | null) => void }) {
  const sheet = useQuery(api.voice.rollCallSheet, { slug, hostKey });
  if (!sheet) return <Sec title="Roll call">{<span className="help">Loading…</span>}</Sec>;
  const c = sheet.counts;
  return (
    <Sec title={<>Roll call · {c.total} guests</>}>
      <span className="help">
        After How to play, the narrator introduces every guest on the TV: their drawing, their name and their nickname, a few seconds each. The voices
        record when the game starts.
      </span>
      {sheet.started && (
        <span className={`hx-status ${c.failed ? "warn" : ""}`}>
          {c.ready} of {c.total} voices recorded{c.pending ? ` · ${c.pending} recording` : ""}
          {c.failed ? ` · ${c.failed} failed (those guests show without a voice)` : ""}
        </span>
      )}
      {c.total === 0 ? (
        <p className="help">Nobody's signed up yet.</p>
      ) : (
        <ul className="hx-rollcall">
          {sheet.guests.map((gst) => (
            <RollRow key={gst.id} g={gst} slug={slug} hostKey={hostKey} locked={locked || sheet.started} onError={onError} />
          ))}
        </ul>
      )}
    </Sec>
  );
}

type Row = FunctionReturnType<typeof api.voice.rollCallSheet>["guests"][number];

function RollRow({ g }: { g: Row; slug: string; hostKey: string; locked: boolean; onError: (m: string | null) => void }) {
  return (
    <li>
      <div className="card-ph sm">{g.photoUrl ? <img src={g.photoUrl} alt="" /> : initials(g.charName)}</div>
      <div className="main">
        <div className="nm">
          {g.charName}
        </div>
        <span className="help">“{g.line}”</span>
        <div className="meta">
          <span className={`st ${g.voice}`} title={g.error || undefined}>
            {STATUS[g.voice] ?? g.voice}
          </span>
          {g.clipUrl && (
            <button type="button" className="linkish" onClick={() => hear(g.clipUrl!)}>
              Play
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
