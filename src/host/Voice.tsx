import { useEffect, useRef, useState } from "react";
import { HOSTS, voiceKey } from "../../convex/narration";
import { Sec, Toggle, type SettingsPatch } from "./Menu";
import type { Roster } from "./common";

type Game = Roster["game"];

/** Plays a file on this laptop (not the TV), one at a time. */
let laptopAudio: HTMLAudioElement | null = null;
export function hear(url: string) {
  laptopAudio?.pause();
  laptopAudio = new Audio(url);
  void laptopAudio.play().catch(() => undefined);
}

type Pick = "ivy-classic" | "duke-classic" | "ivy-adult" | "duke-adult" | "sailor";
const PICKS: { key: Pick; title: string; sub: string }[] = [
  { key: "ivy-classic", title: "Ivy · Classic", sub: "Old Hollywood. Clean." },
  { key: "duke-classic", title: "Duke · Classic", sub: "New York mobster. Clean." },
  { key: "ivy-adult", title: "Ivy · Adult", sub: "Swearing, crude jokes." },
  { key: "duke-adult", title: "Duke · Adult", sub: "Swearing, crude jokes." },
  { key: "sailor", title: "Sailor mode", sub: "An angry old man with his own filthy script. Explicit." },
];

/**
 * S6 (Oct 17): one picker for the narrator and the script, so nothing changes behind the host's back. Unstable is a
 * delivery on top of Ivy or Duke.
 */
export function NarratorSection({ game, locked, save }: { game: Game; locked: boolean; save: (p: SettingsPatch) => Promise<void> }) {
  const n = game.narrator;
  const sailor = !!n.sailor;
  const voice = voiceKey(n.host, n.unstable, sailor);
  const value: Pick = sailor ? "sailor" : (`${n.host}-${game.tone}` as Pick);
  function pick(k: Pick) {
    if (k === "sailor") return save({ narrator: { host: "duke", unstable: false, sailor: true } });
    const [host, tone] = k.split("-") as ["ivy" | "duke", "classic" | "adult"];
    return save({ tone, narrator: { host, unstable: sailor ? false : n.unstable, sailor: false } });
  }
  return (
    <Sec title="Narrator and script">
      <div className="hx-voices" role="radiogroup" aria-label="Narrator and script">
        {PICKS.map((p) => (
          <button key={p.key} type="button" role="radio" aria-checked={value === p.key} className={p.key === "sailor" ? "wide" : ""} disabled={locked} onClick={() => void pick(p.key)}>
            <b>{p.title}</b>
            <span>{p.sub}</span>
          </button>
        ))}
      </div>
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
      <div className="row">
        <button type="button" className="btn" onClick={() => hear(`/audio/narration/${voice}/${sailor ? "sailor" : game.tone}/doors.mp3`)}>
          Hear {sailor ? "Sailor mode" : `${HOSTS[n.host].name} · ${game.tone === "adult" ? "Adult" : "Classic"}`} on this laptop
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

export const VOICE_STATUS: Record<string, string> = { ready: "Voice ready", pending: "Recording…", failed: "Couldn't record", none: "Not recorded", later: "Records at Start" };
