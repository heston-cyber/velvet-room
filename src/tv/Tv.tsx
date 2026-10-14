import { Component, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";
import { INTRO_BEATS, INTRO_MS } from "../../convex/shared";
import { Qr, wifiQrText } from "../lib/qr";
import { line, type Cue } from "./script";
import "./tv.css";

type Data = FunctionReturnType<typeof api.game.tv>;

const mid = (l: string) => l.replace(/^The /, "the ");
const initials = (n: string) => {
  const w = n.split(/\s+/).map((x) => x.replace(/[^A-Za-z]/g, "")[0]).filter(Boolean);
  return (w.length > 1 ? w[0] + w[w.length - 1] : w[0] || "?").toUpperCase();
};
const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const names = (xs: { name: string }[]) => (xs.length ? xs.map((x) => x.name).join(" & ") : "");

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="tv-page">
          <div className="tv-stage">
            <div className="tv-scene">
              <span className="tv-kick">The Velvet Room</span>
              <h2 className="tv-h2" style={{ fontSize: "5cqw" }}>Open the TV from the host laptop</h2>
              <p className="tv-sub">Use "Open the TV window" in the game menu, so the TV gets the host link.</p>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const TV_LINK = "velvet-room:tv-link";

/**
 * The TV's key comes in the link, then leaves the address bar right away, so nobody reads it off
 * the big screen. A reload of this window finds it again in this tab's session storage.
 */
function useTvLink(slug: string, tvKey: string) {
  const [link] = useState(() => {
    if (slug && tvKey) return { slug, tvKey };
    try {
      return JSON.parse(sessionStorage.getItem(TV_LINK) || "null") ?? { slug: "", tvKey: "" };
    } catch {
      return { slug: "", tvKey: "" };
    }
  });
  useEffect(() => {
    if (!slug || !tvKey) return;
    try {
      sessionStorage.setItem(TV_LINK, JSON.stringify({ slug, tvKey }));
    } catch {
      /* the link still works for this load */
    }
    window.history.replaceState(null, "", "/tv");
  }, [slug, tvKey]);
  return link as { slug: string; tvKey: string };
}

export default function Tv(props: { slug: string; tvKey: string }) {
  const link = useTvLink(props.slug, props.tvKey);
  return (
    <Boundary>
      <TvInner slug={link.slug} tvKey={link.tvKey} />
    </Boundary>
  );
}

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** A short chime for the sound check, made in the browser (the narration files arrive in Phase 5). */
function chime(ctx: AudioContext) {
  const t = ctx.currentTime;
  [523.25, 659.25, 783.99].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t + i * 0.18);
    g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.18 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.18 + 0.9);
    o.connect(g).connect(ctx.destination);
    o.start(t + i * 0.18);
    o.stop(t + i * 0.18 + 1);
  });
}

function TvInner({ slug, tvKey }: { slug: string; tvKey: string }) {
  const data = useQuery(api.game.tv, { slug, tvKey });
  const now = useNow(250);
  const audio = useRef<AudioContext | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [checkUntil, setCheckUntil] = useState(0);
  const lastCheck = useRef<number | null>(null);
  const ping = useMutation(api.game.tvPing);

  // Tell the host laptop this TV is open (and whether sound is allowed), every 20 seconds.
  useEffect(() => {
    const send = () => void ping({ slug, tvKey, sound: soundOn }).catch(() => undefined);
    send();
    const id = window.setInterval(send, 20_000);
    return () => window.clearInterval(id);
  }, [ping, slug, tvKey, soundOn]);

  // Controls show on mouse movement, then hide so the TV stays clean.
  useEffect(() => {
    let timer = window.setTimeout(() => setChrome(false), 4000);
    const wake = () => {
      setChrome(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setChrome(false), 3000);
    };
    window.addEventListener("mousemove", wake);
    return () => {
      window.removeEventListener("mousemove", wake);
      window.clearTimeout(timer);
    };
  }, []);

  // Sound check: plays when the host presses it (only checks pressed after this window opened).
  const checkAt = data?.game.soundCheckAt ?? null;
  useEffect(() => {
    if (checkAt === null) return;
    if (lastCheck.current === null) {
      lastCheck.current = checkAt;
      return;
    }
    if (checkAt !== lastCheck.current) {
      lastCheck.current = checkAt;
      setCheckUntil(Date.now() + 6000);
      if (audio.current) chime(audio.current);
    }
  }, [checkAt]);
  useEffect(() => {
    if (data && lastCheck.current === null) lastCheck.current = data.game.soundCheckAt ?? 0;
  }, [data]);

  // Browsers only allow sound after a click on the page. Any click works, even while the TV is loading.
  const soundOnRef = useRef(false);
  const enableSound = useCallback(() => {
    if (soundOnRef.current) return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audio.current = audio.current ?? new Ctx();
      void audio.current.resume();
      chime(audio.current);
      soundOnRef.current = true;
      setSoundOn(true);
    } catch {
      setSoundOn(false);
    }
  }, []);
  useEffect(() => {
    window.addEventListener("pointerdown", enableSound);
    window.addEventListener("keydown", enableSound);
    return () => {
      window.removeEventListener("pointerdown", enableSound);
      window.removeEventListener("keydown", enableSound);
    };
  }, [enableSound]);
  function fullScreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }

  if (data === undefined) {
    return (
      <div className="tv-page">
        <div className="tv-stage">
          <div className="tv-scene">
            <span className="tv-kick">The Velvet Room</span>
          </div>
        </div>
      </div>
    );
  }

  const { scene, cue } = sceneFor(data, now);
  const showCheck = now < checkUntil;
  const say = showCheck ? line("soundCheck", data.game.tone) : cue ? line(cue, data.game.tone) : null;

  return (
    <div className={`tv-page ${chrome ? "" : "hide-cursor"}`}>
      <div className="tv-stage" data-scene={scene.key}>
        {scene.node}
        {data.game.paused && data.game.status === "playing" && (
          <div className="tv-overlay">
            <span className="tv-kick">Paused</span>
            <h2 className="tv-h2">Hold everything.</h2>
            <p className="tv-sub">The host paused the game. The clock is stopped.</p>
          </div>
        )}
        {data.game.tvShowAll && data.game.status === "playing" && <AllEvidence data={data} />}
        {say && (
          <div className="tv-caption" key={say.text}>
            <span className="who">{data.game.mode === "mc" ? "MC" : "Narrator"}</span>
            <span className="line">{say.text}</span>
          </div>
        )}
        {data.game.isTest && <span className="tv-test">Test game</span>}
        {data.game.mode === "mc" && data.game.status === "playing" && <span className="tv-mc">Self MC</span>}
        {data.game.lastRescue && now - data.game.lastRescue.at < 12_000 && (
          <div className="tv-toast" key={data.game.lastRescue.at}>
            New link for <b>{data.game.lastRescue.name}</b>. Their old link no longer works.
          </div>
        )}
      </div>
      <div className={`tv-controls ${chrome ? "" : "gone"}`}>
        <button type="button" onClick={(e) => { e.stopPropagation(); fullScreen(); }}>
          Full screen
        </button>
        <button type="button" aria-pressed={soundOn} onClick={(e) => { e.stopPropagation(); enableSound(); }}>
          {soundOn ? "Sound on" : "Click to allow sound"}
        </button>
      </div>
    </div>
  );
}

type Scene = { key: string; node: ReactNode };

function sceneFor(d: Data, now: number): { scene: Scene; cue: Cue | null } {
  const g = d.game;
  if (g.endedAt) {
    return {
      cue: "goodnight",
      scene: {
        key: "goodnight",
        node: (
          <div className="tv-scene">
            <span className="tv-kick">That's the night</span>
            <div className="tv-deco" />
            <h2 className="tv-h2">The Velvet Room</h2>
            <p className="tv-sub">The bar is open. Settle your debts in chips.</p>
          </div>
        ),
      },
    };
  }
  if (g.status === "registration") {
    return {
      cue: null,
      scene: {
        key: "waiting",
        node: (
          <>
            <div className="tv-scene">
              <span className="tv-kick">Chicago · October 31, 1929</span>
              <div className="tv-deco" />
              <h2 className="tv-h2">The Velvet Room</h2>
              <p className="tv-sub">The doors open soon.</p>
            </div>
            {g.wifi && <WifiCorner wifi={g.wifi} />}
            <div className="tv-corner br">
              <b>{d.counts.registered}</b> on the guest list
            </div>
          </>
        ),
      },
    };
  }
  if (g.status === "lobby") {
    return {
      cue: "doors",
      scene: {
        key: "doors",
        node: (
          <>
            <div className="tv-scene">
              <span className="tv-kick">The doors are open</span>
              <h2 className="tv-h2" style={{ fontSize: "5.4cqw" }}>The Velvet Room</h2>
              <p className="tv-sub">Open your personal link and tap check in. Bag your weapon. Mingle in character.</p>
              <Guests guests={d.guests} mark="here" />
            </div>
            {g.wifi && <WifiCorner wifi={g.wifi} />}
            <div className="tv-corner tr">
              <span>
                <b>{d.counts.here}</b> of {d.counts.registered} here
              </span>
            </div>
          </>
        ),
      },
    };
  }
  if (g.status === "playing") {
    const round = g.round;
    if (round === 1 && g.introEndsAt && now < g.introEndsAt && g.startedAt) {
      const beat = Math.min(INTRO_BEATS - 1, Math.max(0, Math.floor((now - g.startedAt) / (INTRO_MS / INTRO_BEATS))));
      const frames = [
        <div className="tv-scene dark" key="i0">
          <span className="tv-kick fade">Chicago · October, 1929</span>
        </div>,
        <div className="tv-scene dark" key="i1">
          <h2 className="tv-h2 fade blood">The Don is dead.</h2>
          <p className="tv-sub fade">Don Carmine Velluto · found in {mid(g.bodyRoom)}</p>
        </div>,
        <div className="tv-scene dark" key="i2">
          <h2 className="tv-h2 fade">One of you did it.</h2>
          <Exhibits letters={d.exhibits} />
          <p className="tv-sub fade">The weapons are on the table. Only the game knows whose is whose.</p>
        </div>,
        <div className="tv-scene" key="i3">
          <span className="tv-kick fade">Check your phone</span>
          <h2 className="tv-h2 fade" style={{ fontSize: "5.4cqw" }}>Press and hold your card.</h2>
          <p className="tv-sub fade">Keep your screen to yourself. Round 1 starts in a moment.</p>
        </div>,
      ];
      return { cue: (["intro1", "intro2", "intro3", "intro4"] as const)[beat], scene: { key: `intro${beat}`, node: frames[beat] } };
    }
    const waves = g.search === "waves";
    if (round === 1) {
      return {
        cue: waves ? "round1Waves" : "round1",
        scene: {
          key: "r1",
          node: (
            <div className="tv-scene top">
              <RoundBar d={d} now={now} label="Search the house" />
              <h2 className="tv-h2" style={{ fontSize: "5.6cqw", marginTop: "1.2cqw" }}>Find the markers.</h2>
              <p className="tv-sub">Scan them with your phone. Question everyone. Lie only about your own secrets.</p>
              <p className="tv-sub small">The body was found in {mid(g.bodyRoom)}.</p>
              {waves ? <OpenRooms d={d} /> : <Exhibits letters={d.exhibits} caption="Exhibits on the evidence table" />}
            </div>
          ),
        },
      };
    }
    if (round === 2 || round === 3) {
      const cards = d.evidence.filter((e) => e.round === round);
      const ordered = [...cards.filter((c) => !c.twist), ...cards.filter((c) => c.twist)];
      const size = ordered.length <= 4 ? "l" : ordered.length <= 8 ? "m" : "s";
      return {
        cue: round === 2 ? "round2" : "round3",
        scene: {
          key: `r${round}`,
          node: (
            <div className="tv-scene top">
              <RoundBar d={d} now={now} label={round === 2 ? "Fresh evidence" : "Last evidence"} />
              {waves && <OpenRooms d={d} compact />}
              <div className={`tv-cards ${size}`}>
                {ordered.map((c, i) => (
                  <div className={`tv-ev fade ${c.twist ? "twist" : ""}`} style={{ animationDelay: `${c.twist ? ordered.length * 0.35 + 0.8 : i * 0.35}s` }} key={i}>
                    <small>{c.twist ? "The twist" : "New evidence"}</small>
                    {c.text}
                  </div>
                ))}
                {!ordered.length && <p className="tv-sub">No new evidence this round. Keep digging.</p>}
              </div>
            </div>
          ),
        },
      };
    }
    // Round 4: accusations
    return {
      cue: "accuse",
      scene: {
        key: "accuse",
        node: (
          <>
            <div className="tv-scene">
              <span className="tv-kick">Accusations</span>
              <h2 className="tv-h2" style={{ fontSize: "5.4cqw" }}>Who killed the Don?</h2>
              <p className="tv-sub">Lock in who, which exhibit and where on your phone.</p>
              <Guests guests={d.guests} mark="accused" />
            </div>
            <div className="tv-corner tr">
              <span>
                <b>{d.counts.accused}</b> of {d.counts.playing} in
              </span>
              {g.pacing.mode === "timer" && g.roundEndsAt !== null && (
                <span className="tv-mini-clock">{clock(g.roundEndsAt < 0 ? -g.roundEndsAt : g.roundEndsAt - now)}</span>
              )}
            </div>
          </>
        ),
      },
    };
  }
  if (g.status === "reveal" && d.results) {
    const r = d.results;
    const beat = Math.min(d.reveal.beats - 1, Math.max(0, Math.floor((now - (g.revealAt ?? now)) / d.reveal.beatMs)));
    const frames = [
      <div className="tv-scene dark" key="v0">
        <span className="tv-kick fade">The killer of Don Carmine Velluto is</span>
        <h2 className="tv-h2 fade" style={{ fontSize: "9cqw" }}>…</h2>
      </div>,
      <div className="tv-scene dark" key="v1">
        <span className="tv-kick">The killer is</span>
        <span className="tv-av xl blood fade">{r.killerPhoto ? <img src={r.killerPhoto} alt="" /> : initials(r.killer)}</span>
        <span className="tv-reveal-name fade">{r.killer}</span>
      </div>,
      <div className="tv-scene dark" key="v2">
        <span className="tv-kick">{r.killer} did it</span>
        {r.exhibit && <h3 className="tv-h3 fade">with Exhibit {r.exhibit.letter}, the {r.exhibit.name.toLowerCase()}</h3>}
        <h3 className="tv-h3 fade" style={{ animationDelay: ".8s" }}>in {mid(r.room)}</h3>
      </div>,
      <div className="tv-scene" key="v3">
        <span className="tv-kick">The verdict</span>
        <span className="tv-verdict fade">
          {r.named} of {r.accusers} named the killer.
          <br />
          {r.killerWins ? "The killer wins." : "The detectives win."}
        </span>
        {r.aces.length > 0 && <p className="tv-sub fade">Ace detectives: {r.aces.join(", ")}</p>}
        <p className="tv-sub fade" style={{ color: "var(--paper)" }}>
          {r.killer}, stand up and confess. Everyone else: vote Best Dressed and Best Liar on your phones.
        </p>
      </div>,
    ];
    const cue: Cue = beat < 3 ? (["reveal1", "reveal2", "reveal3"] as const)[beat] : r.killerWins ? "verdictKiller" : "verdictDetectives";
    return { cue, scene: { key: `reveal${beat}`, node: frames[beat] } };
  }
  if (g.status === "done" && d.results?.awards) {
    const a = d.results.awards;
    const list: [string, string, string][] = [
      ["Best Detective", a.bestDetective?.name ?? "", a.bestDetective ? `${a.bestDetective.score} of 3 right` : "Nobody scored"],
      ["Best Dressed", names(a.bestDressed), a.bestDressed.length ? `${a.bestDressed[0].votes} vote${a.bestDressed[0].votes === 1 ? "" : "s"}` : "No votes"],
      ["Best Liar", names(a.bestLiar), a.bestLiar.length ? `${a.bestLiar[0].votes} vote${a.bestLiar[0].votes === 1 ? "" : "s"}` : "No votes"],
    ];
    return {
      cue: "awards",
      scene: {
        key: "awards",
        node: (
          <div className="tv-scene">
            <span className="tv-kick">The Velvet Room awards</span>
            <h2 className="tv-h2" style={{ fontSize: "5cqw" }}>To the winners</h2>
            <div className="tv-awards">
              {list.map(([title, who, sub], i) => (
                <div className="tv-award fade" style={{ animationDelay: `${i * 0.6}s` }} key={title}>
                  <span className="tv-kick">{title}</span>
                  <span className="tv-av">{who ? initials(who) : "–"}</span>
                  <span className="n">{who || "—"}</span>
                  <span className="sub">{sub}</span>
                </div>
              ))}
            </div>
            <p className="tv-sub">The bar is open. Settle your debts in chips.</p>
          </div>
        ),
      },
    };
  }
  return { cue: null, scene: { key: "blank", node: <div className="tv-scene"><h2 className="tv-h2">The Velvet Room</h2></div> } };
}

function RoundBar({ d, now, label }: { d: Data; now: number; label: string }) {
  const g = d.game;
  const timed = g.pacing.mode === "timer";
  const left = g.roundEndsAt === null ? 0 : g.roundEndsAt < 0 ? -g.roundEndsAt : g.roundEndsAt - now;
  const pct = d.counts.playing ? Math.min(100, (d.counts.ready / d.counts.playing) * 100) : 0;
  return (
    <>
      <div className="tv-roundbar">
        <span className="chip">
          Round {g.round} · {label}
        </span>
        {timed ? <span className="tv-clock">{clock(left)}</span> : <span className="tv-ready">{d.counts.ready} of {d.counts.playing} ready</span>}
      </div>
      <div className="tv-meter">{!timed && <i style={{ width: `${pct}%` }} />}</div>
    </>
  );
}

function Guests({ guests, mark }: { guests: Data["guests"]; mark: "here" | "accused" }) {
  const cols = guests.length <= 12 ? 6 : 8;
  return (
    <div className="tv-guests" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {guests.map((x) => (
        <div key={x.id} className={mark === "here" && !x.here ? "away" : ""}>
          <span className={`tv-av ${mark === "accused" && x.accused ? "done" : ""}`}>{x.photoUrl ? <img src={x.photoUrl} alt="" /> : initials(x.charName)}</span>
          {x.charName}
        </div>
      ))}
    </div>
  );
}

function Exhibits({ letters, caption }: { letters: string[]; caption?: string }) {
  return (
    <>
      <div className="tv-exhibits fade">
        {letters.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      {caption && <p className="tv-sub small">{caption}</p>}
    </>
  );
}

function OpenRooms({ d, compact }: { d: Data; compact?: boolean }) {
  const open = new Set(d.game.openRooms);
  return (
    <div className={`tv-open ${compact ? "compact" : ""}`}>
      <div className="rooms">
        {d.game.rooms.map((r) => (
          <span key={r} className={open.has(r) ? "" : "closed"}>
            {r.replace(/^The /, "")}
          </span>
        ))}
      </div>
      <p className="tv-sub small">{open.size === d.game.rooms.length ? "Every room is open" : "Open for searching this round"}</p>
    </div>
  );
}

function WifiCorner({ wifi }: { wifi: { name: string; password: string } }) {
  return (
    <div className="tv-corner tl tv-wifi">
      <Qr className="qr" text={wifiQrText(wifi.name, wifi.password)} label="Scan to join the Wi-Fi" />
      <div>
        Wi-Fi <b>{wifi.name}</b>
        <br />
        {wifi.password ? (
          <>
            Password <b>{wifi.password}</b>
          </>
        ) : (
          "No password"
        )}
        <br />
        <span className="tiny">Scan to join</span>
      </div>
    </div>
  );
}

function AllEvidence({ data }: { data: Data }) {
  const ev = data.evidence;
  return (
    <div className="tv-overlay all">
      <span className="tv-kick">All the evidence so far</span>
      <div className={`tv-cards ${ev.length <= 6 ? "m" : "s"} two`}>
        {ev.map((c, i) => (
          <div className={`tv-ev ${c.twist ? "twist" : ""}`} key={i}>
            <small>{c.twist ? "The twist" : `Round ${c.round}`}</small>
            {c.text}
          </div>
        ))}
        {!ev.length && <p className="tv-sub">Nothing on the TV yet. Round 1 evidence is on the markers.</p>}
      </div>
    </div>
  );
}
