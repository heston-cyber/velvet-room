import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { HOSTS, captionText, type CueKey } from "../../convex/narration";
import { INTRO_BEATS, INTRO_MS, REVEAL } from "../../convex/shared";
import { Qr, wifiQrText } from "../lib/qr";
import { CARD_MS, cardUrl, loopUrl, useMediaBank, type LoopKey } from "./media";
import { SoundEngine } from "./sound";
import { cardNow, due, plan, type Data, type Plan } from "./timeline";
import "./tv.css";

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

function TvInner({ slug, tvKey }: { slug: string; tvKey: string }) {
  const data = useQuery(api.game.tv, { slug, tvKey });
  const now = useNow(200);
  const engine = useMemo(() => new SoundEngine(), []);
  const bank = useMediaBank();
  const [soundOn, setSoundOn] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [, setManifest] = useState(0);
  const fired = useRef(new Set<string>());
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null);
  const ping = useMutation(api.game.tvPing);

  useEffect(() => {
    void engine.ready.then(() => {
      setManifest((n) => n + 1);
      engine.preloadMedia();
    });
  }, [engine]);

  // Tell the host laptop this TV is open, whether sound is allowed and the videos are in, every 20 seconds.
  useEffect(() => {
    const send = () => void ping({ slug, tvKey, sound: soundOn, media: bank.ready }).catch(() => undefined);
    send();
    const id = window.setInterval(send, 20_000);
    return () => window.clearInterval(id);
  }, [ping, slug, tvKey, soundOn, bank.ready]);

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

  // Browsers only allow sound after a click on the page. Any click works, even while the TV is loading.
  const enableSound = useCallback(() => {
    if (engine.unlocked) return;
    if (engine.unlock()) {
      engine.synthChime();
      setSoundOn(true);
    }
  }, [engine]);
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

  const g = data?.game;
  const voice = data?.voice.voice ?? "ivy";
  const tone = g?.tone ?? "classic";
  const host = g?.narrator.host ?? "ivy";
  const secs = useCallback(
    (cue: CueKey) => engine.narrationSecs(voice, tone, cue) ?? captionText(cue, tone, host).length / 14 + 0.4,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [engine, voice, tone, host, engine.manifest],
  );
  const p: Plan | null = data ? plan(data, now, secs) : null;

  // Levels, the music bed, room tone and friends follow the game.
  const levels = g?.levels;
  useEffect(() => {
    if (levels) engine.setLevels(levels);
  }, [engine, levels?.voice, levels?.music, levels?.sfx]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => engine.dim(!!g?.paused && g.status === "playing"), [engine, g?.paused, g?.status]);
  const music = p?.music ?? null;
  const amb = p?.ambience.join(",") ?? "";
  useEffect(() => void engine.music(music), [engine, music, soundOn]);
  useEffect(() => void engine.ambience(amb ? (amb.split(",") as Plan["ambience"]) : []), [engine, amb, soundOn]);

  // The narrator's lines for this voice, fetched ahead.
  useEffect(() => {
    if (!data) return;
    const cues = Object.keys(engine.manifest[voice]?.[tone] ?? {});
    engine.preload(cues.map((c) => engine.narrationUrl(voice, tone, c)));
  }, [engine, voice, tone, !!data, engine.manifest]); // eslint-disable-line react-hooks/exhaustive-deps
  const clipUrls = data ? partyClipUrls(data) : [];
  useEffect(() => engine.preload(clipUrls), [engine, clipUrls.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire what's due: once each, only while fresh.
  useEffect(() => {
    if (!p) return;
    for (const e of due(p, now, fired.current)) {
      fired.current.add(e.id);
      if (!engine.unlocked) continue;
      if (e.sfx) void engine.sfx(e.sfx);
      else if (e.clip) void engine.voice(e.clip.url, 0.9);
      else if (e.cue) void engine.voice(engine.narrationUrl(voice, tone, e.cue));
    }
  });

  // Sound check: the chime and the narrator, when the host presses it (only checks pressed after this window opened).
  const checkAt = g?.soundCheckAt ?? null;
  const [checkUntil, setCheckUntil] = useState(0);
  const lastCheck = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (!data) return;
    if (lastCheck.current === undefined) {
      lastCheck.current = checkAt;
      return;
    }
    if (checkAt !== lastCheck.current) {
      lastCheck.current = checkAt;
      setCheckUntil(Date.now() + 7000);
      void engine.sfx("chime");
      window.setTimeout(() => void engine.voice(engine.narrationUrl(voice, tone, "soundCheck")), 900);
    }
  }, [checkAt, !!data]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arrivals chime in the lobby; each accusation gets a stamp.
  const here = data ? data.guests.filter((x) => x.here).map((x) => x.id as string) : null;
  const seenHere = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!data || !here) return;
    if (!seenHere.current) {
      seenHere.current = new Set(here);
      return;
    }
    const fresh = data.guests.filter((x) => x.here && !seenHere.current!.has(x.id));
    seenHere.current = new Set(here);
    if (data.game.status !== "lobby" || !fresh.length) return;
    void engine.sfx("chime", 0.7);
    setToast({ text: `${fresh.map((x) => x.charName).join(" & ")} ${fresh.length > 1 ? "have" : "has"} arrived`, at: Date.now() });
  }, [here?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const accused = data?.counts.accused ?? 0;
  const lastAccused = useRef<number | null>(null);
  useEffect(() => {
    if (lastAccused.current !== null && accused > lastAccused.current && g?.status === "playing" && g.round >= 4) void engine.sfx("stamp", 0.8);
    lastAccused.current = accused;
  }, [accused]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || !p || !g) {
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

  const { scene } = sceneFor(data, p, now);
  const card = cardNow(p, now);
  const held = now < p.holdUntil;
  const showCheck = now < checkUntil;
  const speaking = showCheck ? null : captionNow(p, now);
  const say = showCheck ? captionText("soundCheck", tone, host) : speaking ? (speaking.cue ? captionText(speaking.cue, tone, host) : speaking.clip?.caption ?? "") : null;
  const who = g.mode === "mc" ? "MC" : HOSTS[host].name;

  return (
    <div className={`tv-page ${chrome ? "" : "hide-cursor"}`}>
      <div className="tv-stage" data-scene={scene.key}>
        <Backdrop loop={p.loop} src={bank.src} />
        <div className={`tv-content ${held ? "held" : ""}`} key={`${scene.key}:${held ? "hold" : "go"}`}>
          {scene.node}
        </div>
        {card && <TitleCard key={`${card.key}:${card.at}`} cardKey={card.key} at={card.at} src={bank.src} />}
        {g.paused && g.status === "playing" && (
          <div className="tv-overlay">
            <span className="tv-kick">Paused</span>
            <h2 className="tv-h2">Hold everything.</h2>
            <p className="tv-sub">The host paused the game. The clock is stopped.</p>
          </div>
        )}
        {g.tvShowAll && g.status === "playing" && <AllEvidence data={data} />}
        {say && (
          <div className="tv-caption" key={say}>
            <span className="who">{who}</span>
            <span className="line">{say}</span>
          </div>
        )}
        {g.isTest && <span className="tv-test">Test game</span>}
        {g.mode === "mc" && g.status === "playing" && <span className="tv-mc">Self MC</span>}
        {g.lastRescue && now - g.lastRescue.at < 12_000 && (
          <div className="tv-toast" key={g.lastRescue.at}>
            New link for <b>{g.lastRescue.name}</b>. Their old link no longer works.
          </div>
        )}
        {toast && now - toast.at < 6000 && !(g.lastRescue && now - g.lastRescue.at < 12_000) && (
          <div className="tv-toast" key={toast.at}>
            {toast.text}
          </div>
        )}
      </div>
      <div className={`tv-controls ${chrome ? "" : "gone"}`}>
        <span className="tv-load">{bank.ready ? "Videos ready" : `Loading videos ${bank.loaded} of ${bank.total}`}</span>
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

/** The narrator line on screen now (rules and roll-call lines show on their own cards). */
function captionNow(p: Plan, now: number) {
  let best: Plan["events"][number] | null = null;
  for (const e of p.events) {
    if (e.quiet || e.sfx || !(e.cue || e.clip)) continue;
    if (e.at <= now && now < e.at + e.secs * 1000 + 1200 && (!best || e.at > best.at)) best = e;
  }
  return best;
}

function partyClipUrls(d: Data): string[] {
  const v = d.voice;
  const out: (string | undefined)[] = [];
  for (const i of v.rollCall?.items ?? []) out.push(i.clip?.url);
  out.push(v.body?.url);
  for (const c of Object.values(v.rooms)) out.push(c?.url);
  out.push(v.reveal?.killer?.url, v.reveal?.exhibit?.url, v.reveal?.room?.url);
  out.push(v.winners?.detective?.url, v.winners?.dressed?.url, v.winners?.liar?.url);
  return out.filter((u): u is string => !!u);
}

/** The background loop, crossfaded when the scene changes. The velvet CSS shows if a video can't play. */
function Backdrop({ loop, src }: { loop: LoopKey; src: (path: string) => string }) {
  // Each layer keeps the address it started with, so a video never reloads when the in-memory copy arrives.
  const [layers, setLayers] = useState<{ key: LoopKey; n: number; url: string }[]>(() => [{ key: loop, n: 0, url: src(loopUrl(loop)) }]);
  useEffect(() => {
    setLayers((ls) => (ls[ls.length - 1].key === loop ? ls : [...ls.slice(-1), { key: loop, n: ls[ls.length - 1].n + 1, url: src(loopUrl(loop)) }]));
  }, [loop]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (layers.length < 2) return;
    const id = window.setTimeout(() => setLayers((ls) => ls.slice(-1)), 1400);
    return () => window.clearTimeout(id);
  }, [layers]);
  return (
    <div className="tv-backdrop" aria-hidden="true">
      {layers.map((l, i) => (
        <video
          key={l.n}
          className={i === layers.length - 1 && layers.length > 1 ? "in" : ""}
          src={l.url}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          onError={(e) => ((e.target as HTMLVideoElement).style.display = "none")}
        />
      ))}
    </div>
  );
}

/** A full-screen title card. It plays once and fades away to the scene underneath. */
function TitleCard({ cardKey, at, src }: { cardKey: keyof typeof CARD_MS; at: number; src: (path: string) => string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const ms = CARD_MS[cardKey];
  // A TV that opens mid-card picks the card up where it is.
  const [late] = useState(() => Math.max(0, Date.now() - at));
  const [url] = useState(() => src(cardUrl(cardKey)));
  return (
    <div className="tv-card" style={{ animationDuration: `${ms}ms`, animationDelay: `-${late}ms` }} aria-hidden="true">
      <video
        ref={ref}
        src={url}
        autoPlay
        muted
        playsInline
        preload="auto"
        onLoadedMetadata={() => {
          if (ref.current && late > 200) ref.current.currentTime = late / 1000;
        }}
        onError={(e) => ((e.target as HTMLVideoElement).style.display = "none")}
      />
    </div>
  );
}

type Scene = { key: string; node: ReactNode };

function sceneFor(d: Data, p: Plan, now: number): { scene: Scene } {
  const g = d.game;
  if (g.endedAt) {
    return {
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
  if (g.status === "registration" || g.status === "lobby") {
    // The house rules and the roll call play over the doors.
    if (p.rules && now < p.rules.end) {
      const i = Math.max(0, p.rules.steps.findIndex((s) => now < s.until));
      const step = p.rules.steps[i];
      return {
        scene: {
          key: `rules${i}`,
          node: (
            <div className="tv-scene">
              <span className="tv-kick fade">House rule {i + 1} of {p.rules.steps.length}</span>
              <div className="tv-rule fade">{captionText(step.cue, g.tone, g.narrator.host)}</div>
            </div>
          ),
        },
      };
    }
    if (p.roll && now < p.roll.end) {
      const i = p.roll.steps.findIndex((s) => now >= s.at && now < s.until);
      if (i >= 0) {
        const it = p.roll.steps[i].item;
        return {
          scene: {
            key: `roll${it.id}`,
            node: (
              <div className="tv-scene roll">
                <div className="tv-roll">
                  <div className="tv-frame fade">{it.photoUrl ? <img src={it.photoUrl} alt="" /> : <span>{initials(it.charName)}</span>}</div>
                  <div className="tv-roll-text">
                    <span className="tv-kick fade">Roll call · {i + 1} of {p.roll.steps.length}</span>
                    <h2 className="tv-h2 fade" style={{ animationDelay: ".25s" }}>{it.charName}</h2>
                    <span className="tv-played fade" style={{ animationDelay: ".45s" }}>Played by {it.realName}</span>
                    <p className="tv-sub fade" style={{ animationDelay: "1s" }}>{it.line}</p>
                  </div>
                </div>
              </div>
            ),
          },
        };
      }
      const done = now >= (p.roll.steps[p.roll.steps.length - 1]?.until ?? 0);
      return {
        scene: {
          key: done ? "roll-end" : "roll-open",
          node: (
            <div className="tv-scene">
              <span className="tv-kick fade">{done ? "Remember these faces" : "Roll call"}</span>
              <h2 className="tv-h2 fade" style={{ fontSize: "5.4cqw" }}>{done ? "Tonight's guests" : "Meet tonight's guests"}</h2>
              {done && <Guests guests={d.guests} mark="here" />}
            </div>
          ),
        },
      };
    }
    if (g.status === "registration") {
      return {
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
    return {
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
        <div className="tv-scene dark" key="i3">
          <span className="tv-kick fade">Check your phone</span>
          <h2 className="tv-h2 fade" style={{ fontSize: "5.4cqw" }}>Press and hold your card.</h2>
          <p className="tv-sub fade">Keep your screen to yourself. Round 1 starts in a moment.</p>
        </div>,
      ];
      return { scene: { key: `intro${beat}`, node: frames[beat] } };
    }
    const waves = g.search === "waves";
    if (round === 1) {
      return {
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
      const plain = cards.filter((c) => !c.twist);
      const twist = cards.filter((c) => c.twist);
      const twistIn = p.twistAt === null || now >= p.twistAt;
      const total = plain.length + twist.length;
      const size = total <= 4 ? "l" : total <= 8 ? "m" : "s";
      return {
        scene: {
          key: `r${round}`,
          node: (
            <div className="tv-scene top">
              <RoundBar d={d} now={now} label={round === 2 ? "Fresh evidence" : "Last evidence"} />
              {waves && <OpenRooms d={d} compact />}
              <div className={`tv-cards ${size}`}>
                {plain.map((c, i) => (
                  <div className="tv-ev fade" style={{ animationDelay: `${i * 0.35}s` }} key={`p${i}`}>
                    <small>New evidence</small>
                    {c.text}
                  </div>
                ))}
                {twistIn &&
                  twist.map((c, i) => (
                    <div className="tv-ev fade twist" key={`t${i}`}>
                      <small>The twist</small>
                      {c.text}
                    </div>
                  ))}
                {!cards.length && <p className="tv-sub">No new evidence this round. Keep digging.</p>}
              </div>
            </div>
          ),
        },
      };
    }
    // Round 4: accusations
    return {
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
    const t = g.revealAt ?? 0;
    const step = now < t + REVEAL.name ? 0 : now < t + REVEAL.how ? 1 : now < t + REVEAL.verdict ? 2 : 3;
    const frames = [
      <div className="tv-scene" key="v0">
        <span className="tv-kick fade">The killer of Don Carmine Velluto is</span>
        <h2 className="tv-h2 fade" style={{ fontSize: "9cqw" }}>…</h2>
      </div>,
      <div className="tv-scene" key="v1">
        <span className="tv-kick">The killer is</span>
        <span className="tv-av xl blood fade">{r.killerPhoto ? <img src={r.killerPhoto} alt="" /> : initials(r.killer)}</span>
        <span className="tv-reveal-name fade">{r.killer}</span>
      </div>,
      <div className="tv-scene" key="v2">
        <span className="tv-kick">{r.killer} did it</span>
        {r.exhibit && <h3 className="tv-h3 fade">with Exhibit {r.exhibit.letter}, the {r.exhibit.name.toLowerCase()}</h3>}
        <h3 className="tv-h3 fade" style={{ animationDelay: "1.4s" }}>in {mid(r.room)}</h3>
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
    return { scene: { key: `reveal${step}`, node: frames[step] } };
  }
  if (g.status === "done" && d.results?.awards) {
    const a = d.results.awards;
    const list: [string, string, string][] = [
      ["Best Detective", a.bestDetective?.name ?? "", a.bestDetective ? `${a.bestDetective.score} of 3 right` : "Nobody scored"],
      ["Best Dressed", names(a.bestDressed), a.bestDressed.length ? `${a.bestDressed[0].votes} vote${a.bestDressed[0].votes === 1 ? "" : "s"}` : "No votes"],
      ["Best Liar", names(a.bestLiar), a.bestLiar.length ? `${a.bestLiar[0].votes} vote${a.bestLiar[0].votes === 1 ? "" : "s"}` : "No votes"],
    ];
    return {
      scene: {
        key: "awards",
        node: (
          <div className="tv-scene">
            <span className="tv-kick">The Velvet Room awards</span>
            <h2 className="tv-h2" style={{ fontSize: "5cqw" }}>To the winners</h2>
            <div className="tv-awards">
              {list.map(([title, who, sub], i) => {
                const shown = !p.awardsAt.length || now >= p.awardsAt[i];
                return (
                  <div className={`tv-award ${shown ? "fade" : "waiting"}`} key={`${title}:${shown}`}>
                    <span className="tv-kick">{title}</span>
                    <span className="tv-av">{shown ? (who ? initials(who) : "–") : "?"}</span>
                    <span className="n">{shown ? who || "—" : "…"}</span>
                    <span className="sub">{shown ? sub : " "}</span>
                  </div>
                );
              })}
            </div>
            <p className="tv-sub">The bar is open. Settle your debts in chips.</p>
          </div>
        ),
      },
    };
  }
  return { scene: { key: "blank", node: <div className="tv-scene"><h2 className="tv-h2">The Velvet Room</h2></div> } };
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
