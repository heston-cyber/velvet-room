import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { captionText, cueFile, cueVariant, narratorName, type CueKey } from "../../convex/narration";
import { VOTE } from "../../convex/shared";
import { LAST_WORDS_MS, RUNOFF_INTRO_MS, speakingNow } from "../../convex/lockin";
import { HOW_TITLE, SHOW } from "../../convex/show";
import { Qr, wifiQrText } from "../lib/qr";
import HouseMap from "./HouseMap";
import { avatarSrc, faceUrl, faceX, figureUrl } from "../lib/figure";
import { weaponUrl } from "../lib/weapon";
import { ALL_FIGURE_KEYS, FACES_RIGHT } from "../../convex/figures";
import { CARD_MS, cardUrl, loopUrl, useMediaBank, type LoopKey } from "./media";
import { SoundEngine } from "./sound";
import { LATE_TIPS_MS, cameosNow, cardNow, dress, due, plan, type Cameo, type CharKey, type Data, type Plan } from "./timeline";
import type { MapData } from "./HouseMap";
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

function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

/** The TV stage. The host screen (src/pages/Host.tsx) runs it with its own controls laid over it. */
export function TvStage(props: { slug: string; tvKey: string; onNext: (slug: string) => void; overlay?: ReactNode; bare?: boolean }) {
  return <TvInner {...props} />;
}

function TvInner({ slug, tvKey, onNext, overlay, bare }: { slug: string; tvKey: string; onNext: (slug: string) => void; overlay?: ReactNode; bare?: boolean }) {
  const data = useQuery(api.game.tv, { slug, tvKey });
  const nextSlug = data?.game.nextSlug ?? null;
  useEffect(() => {
    if (nextSlug) onNext(nextSlug);
  }, [nextSlug, onNext]);
  const now = useNow(200);
  const engine = useMemo(() => new SoundEngine(), []);
  const bank = useMediaBank();
  const [soundOn, setSoundOn] = useState(false);
  const [chrome, setChrome] = useState(true);
  const [, setManifest] = useState(0);
  const fired = useRef(new Set<string>());
  const [toast, setToast] = useState<{ text: string; at: number } | null>(null);
  const ping = useMutation(api.game.tvPing);

  // The drawn cast, fetched ahead so nobody pops in half-loaded.
  useEffect(() => {
    for (const c of CAST) new Image().src = artUrl(c);
  }, []);

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

  // The cursor shows on mouse movement, then hides so the TV stays clean.
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

  const g = data?.game;
  const voice = data?.voice.voice ?? "duke";
  // The script the narrator reads: Classic, Adult, or Sailor mode's own.
  const tone = g?.script ?? g?.tone ?? "classic";
  const linePicks = g?.lines ? { picks: g.lines.picks, d: true } : undefined;
  const host = g?.narrator.host ?? "duke";
  const secs = useCallback(
    (cue: CueKey, v = 0) => engine.narrationSecs(voice, tone, cueFile(cue, v)) ?? captionText(cue, tone, host, v).length / 14 + 0.4,
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
      // The heat's sound is skipped while the narrator talks (Oct 20).
      if (e.sfx) {
        if (e.sfx !== "heat" || !engine.talkingNow) void engine.sfx(e.sfx, e.gain ?? 1);
      }
      else if (e.clip) void engine.voice(e.clip.url, 0.9);
      // Oct 21: only a recording that says the line's current words (in the manifest); otherwise the caption alone.
      else if (e.cue && engine.narrationSecs(voice, tone, cueFile(e.cue, e.v)) !== null) void engine.voice(engine.narrationUrl(voice, tone, cueFile(e.cue, e.v)));
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
    if (checkAt !== lastCheck.current && checkAt !== null) {
      lastCheck.current = checkAt;
      setCheckUntil(Date.now() + 7000);
      void engine.sfx("chime");
      const file = cueFile("soundCheck", cueVariant(tone, "soundCheck", data.game.slug, String(checkAt), linePicks));
      if (engine.narrationSecs(voice, tone, file) !== null) window.setTimeout(() => void engine.voice(engine.narrationUrl(voice, tone, file)), 900);
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
  // Each name claimed with the room code is announced, so nobody can quietly join as someone else.
  const joinAt = data?.game.lastJoin?.at ?? null;
  const lastJoinSeen = useRef<number | null | undefined>(undefined);
  useEffect(() => {
    if (!data) return;
    if (lastJoinSeen.current === undefined || joinAt === null || joinAt === lastJoinSeen.current) {
      lastJoinSeen.current = joinAt;
      return;
    }
    lastJoinSeen.current = joinAt;
    if (data.game.status === "lobby") void engine.sfx("chime", 0.5);
    setToast({ text: `${data.game.lastJoin!.name} joined on a phone`, at: Date.now() });
  }, [joinAt, !!data]); // eslint-disable-line react-hooks/exhaustive-deps
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
          {overlay}
        </div>
      </div>
    );
  }

  const { scene } = sceneFor(data, p, now);
  const card = cardNow(p, now);
  const held = now < p.holdUntil;
  const showCheck = now < checkUntil;
  const speaking = showCheck ? null : captionNow(p, now);
  const say = showCheck
    ? captionText("soundCheck", tone, host, cueVariant(tone, "soundCheck", g.slug, String(checkAt), linePicks))
    : speaking
      ? speaking.cue
        ? captionText(speaking.cue, tone, host, speaking.v)
        : speaking.clip?.caption ?? ""
      : null;
  const who = narratorName(host, tone);
  // Oct 16 (Heston: "keep the players on screen at the bottom"): the guests stay in a strip along the bottom while
  // the house is searched, Rounds 1 to 3.
  const strip = !bare && !held && !card && !g.paused && !g.tvShowAll && /^r[123]$/.test(scene.key);
  // The room code in the bottom corner; the caption sits a little higher while it shows (Phase 6, the look-over).
  const footRoom = !!g.roomCode && !card && scene.key !== "doors" && (g.status === "lobby" || (g.status === "playing" && !(g.introEndsAt && now < g.introEndsAt)));

  return (
    <div className={`tv-page ${chrome ? "" : "hide-cursor"}`}>
      <div className={`tv-stage ${strip ? "with-strip" : ""}`} data-scene={scene.key}>
        <Backdrop loop={p.loop} src={bank.src} />
        {/* The host's title screen and main menu show only the backdrop. */}
        {!bare && (
          <>
            {!held && <CameoLayer list={cameosNow(p, now, scene.key, false)} layer="back" />}
            <div className={`tv-content ${held ? "held" : ""}`} key={`${scene.key}:${held ? "hold" : "go"}`}>
              {scene.node}
            </div>
            {!held && <CameoLayer list={cameosNow(p, now, scene.key, false)} layer="front" />}
            {card && <TitleCard key={`${card.key}:${card.at}`} cardKey={card.key} at={card.at} src={bank.src} />}
            <CameoLayer list={cameosNow(p, now, scene.key, true)} layer="over" />
            {g.paused && g.status === "playing" && (
              <div className="tv-overlay">
                <span className="tv-kick">Paused</span>
                <h2 className="tv-h2">Hold everything.</h2>
                <p className="tv-sub">{g.pacing.mode === "timer" || g.round >= 4 || !!data.vote ? "The host paused the game. The clock is stopped." : "The host paused the game."}</p>
              </div>
            )}
            {g.tvShowAll && g.status === "playing" && <AllEvidence data={data} />}
            {strip && <GuestStrip guests={data.guests} ready={g.pacing.mode === "ready"} />}
            {say && (
              <div className={`tv-caption${footRoom ? " above-foot" : ""}`} key={say}>
                <span className="who">{who}</span>
                <span className="line">{say}</span>
              </div>
            )}
            <div className="tv-foot">
              {g.isTest && <span className="tv-test">Test game</span>}
              {footRoom && (
                <span className="tv-room">
                  Room code <b>{g.roomCode}</b> · {window.location.host}/join
                </span>
              )}
            </div>
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
          </>
        )}
        {overlay}
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
  out.push(v.reveal?.killer?.url, v.reveal?.exhibit?.url, v.reveal?.room?.url, v.reveal?.accomplice?.url);
  for (const cs of Object.values(v.winners ?? {})) for (const c of cs) out.push(c?.url);
  for (const cs of Object.values(v.roasts ?? {})) for (const c of cs) out.push(c?.url);
  out.push(v.caught?.url, v.kept?.url, v.lastLockIn?.url);
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
    if (g.status === "registration") {
      return {
        scene: {
          key: "waiting",
          node: (
            <>
              <div className="tv-scene">
                <span className="tv-kick">New York City · October 31, 2026</span>
                <div className="tv-deco" />
                <h2 className="tv-h2">The Velvet Room</h2>
                <p className="tv-sub">{(g.gameNumber ?? 1) > 1 ? "A new mystery. Scan the code and make a new character." : "The doors open soon."}</p>
              </div>
              {g.wifi && <WifiCorner wifi={g.wifi} />}
              <div className="tv-corner tr">
                <SignupPanel slug={g.slug} />
                <span>
                  <b>{d.counts.registered}</b> on the guest list
                </span>
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
            <div className="tv-scene doors">
              {/* Oct 20: between the Don on the left and the join code and Everyone is in on the right, shrinking to fit a big party. */}
              <Fit className="scene" watch={d.guests.length}>
              <span className="tv-kick">The doors are open</span>
              <h2 className="tv-h2" style={{ fontSize: "5.4cqw" }}>The Velvet Room</h2>
              <p className="tv-sub">
                {g.roomCode ? "Signed up? Open your link and you're in. New here? Scan the code to join." : "Open your personal link and you're in."} Mingle. Stay in costume.
              </p>
              <Guests guests={d.guests} mark="here" />
              </Fit>
            </div>
            {g.wifi && <WifiCorner wifi={g.wifi} />}
            <div className="tv-corner tr">
              {g.roomCode && <JoinPanel code={g.roomCode} />}
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
    if (round === 1 && g.introEndsAt && now < g.introEndsAt && g.startedAt && p.part) {
      const scene = showScene(d, p, now);
      if (scene) return { scene };
    }
    const vt = d.vote;
    if (round <= 3 && vt && vt.round === round && (!vt.closedAt || now < (vt.nextAt ?? Infinity))) return { scene: voteScene(d, vt, now) };
    const bodyKey = d.map.rooms.find((r) => r.label === g.bodyRoom)?.key ?? null;
    const houseMap = <HouseMap map={d.map} round={round} bodyRoomKey={bodyKey} now={now} />;
    if (round === 1) {
      return {
        scene: {
          key: "r1",
          node: (
            <div className="tv-scene top">
              <RoundBar d={d} now={now} label="Search the house" />
              <Fit className="split" watch={`${d.weapons.length}:${d.heat.length}`}>
              <div className="tv-split">
                <div className="tv-left">
                  <h2 className="tv-h2" style={{ fontSize: "5cqw", marginTop: "1cqw" }}>Find the evidence cards.</h2>
                  <p className="tv-sub">Scan them with your phone. Ask where everyone was when the lights went out.</p>
                  <p className="tv-sub small">The body was found in {mid(g.bodyRoom)}.</p>
                  {/* Oct 21 (Heston: "I like ... the small text caption"): the Betting tab, mentioned once, at Round 1. */}
                  <p className="tv-sub small book-note">The book is open on your phones.</p>
                  {/* Oct 16: the weapons in play sit along the top of the screen through every round. */}
                  {d.weapons.length === 0 && <Exhibits letters={d.exhibits} caption="Exhibits on the evidence table" />}
                </div>
                {houseMap}
              </div>
              </Fit>
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
      const tipsHere = round === 3 && !d.game.jailVote ? d.lateTips : [];
      const total = plain.length + twist.length + tipsHere.length;
      const size = total <= 4 ? "l" : total <= 8 ? "m" : "s";
      return {
        scene: {
          key: `r${round}`,
          node: (
            <div className="tv-scene top">
              <RoundBar d={d} now={now} label={round === 2 ? "Fresh evidence" : "Last evidence"} />
              <Fit className="split" watch={`${total}:${twistIn}:${d.heat.length}`}>
              <div className="tv-split">
              <div className={`tv-cards ${size === "l" ? "l" : "s"}`}>
                {/* Phase 4: without a jail vote, the late tips land with Round 3's evidence. */}
                {tipsHere.map((t, i) => (
                  <div className="tv-ev fade tip" style={{ animationDelay: `${i * 0.35}s` }} key={`tip${i}`}>
                    <small>Late tip</small>
                    {t}
                  </div>
                ))}
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
                {!cards.length && !tipsHere.length && <p className="tv-sub">No new evidence this round. Keep digging.</p>}
              </div>
              {houseMap}
              </div>
              </Fit>
            </div>
          ),
        },
      };
    }
    // The runoff (Oct 21): a tie at the lock-in, the last words, then the vote.
    if (d.runoff && !d.runoff.closedAt) return { scene: runoffScene(d, now) };
    // Round 4: accusations
    return {
      scene: {
        key: "accuse",
        node: (
          <>
            <div className="tv-scene">
              {/* Oct 21: with 8 or fewer guests the suspects line up along the bottom (timeline.ts): the grid stays above them. */}
              <Fit className={`scene${d.guests.length <= 8 ? " with-line" : ""}`} watch={d.guests.length}>
              <span className="tv-kick">The lock-in</span>
              <h2 className="tv-h2" style={{ fontSize: "5.4cqw" }}>Who killed the Don?</h2>
              {/* Phase 4: the story reminder at the lock-in. */}
              <p className="tv-sub">Whose story didn't hold up? Lock in who, with which weapon, and where, on your phone.</p>
              <Guests guests={d.guests} mark="accused" />
              </Fit>
            </div>
            <div className="tv-corner tr">
              <span>
                <b>{d.counts.accused}</b> of {d.counts.playing} in
              </span>
              {/* F12 (Oct 17): the lock-in always has a clock. */}
              {g.roundEndsAt !== null && <span className="tv-mini-clock">{clock(g.roundEndsAt < 0 ? -g.roundEndsAt : g.roundEndsAt - now)}</span>}
            </div>
          </>
        ),
      },
    };
  }
  if (g.status === "reveal" && d.results) {
    const r = d.results;
    const t = g.revealAt ?? 0;
    const R = d.reveal;
    // Killer + accomplice games add a step for the accomplice before the verdict.
    const accAt = R.accomplice !== null && r.accomplice ? t + R.accomplice : null;
    const step = now < t + R.name ? 0 : now < t + R.how ? 1 : accAt !== null && now < accAt ? 2 : now < t + R.verdict ? (accAt !== null ? 3 : 2) : accAt !== null ? 4 : 3;
    const frames = [
      <div className="tv-scene" key="v0">
        <span className="tv-kick fade">The killer of Don Ray Sanders is</span>
        <h2 className="tv-h2 fade" style={{ fontSize: "9cqw" }}>…</h2>
      </div>,
      <div className="tv-scene" key="v1">
        <Fit className="scene" watch={r.killer}>
        <span className="tv-kick">The killer is</span>
        <span className="tv-av xl blood fade">{avatarSrc(r.killerPhoto, r.killerFigure) ? <img src={avatarSrc(r.killerPhoto, r.killerFigure)!} alt="" /> : initials(r.killer)}</span>
        <BigName name={r.killer} />
        </Fit>
      </div>,
      <div className="tv-scene" key="v2">
        <span className="tv-kick">{splitName(r.killer).main} did it</span>
        {r.exhibit && (
          <div className="tv-reveal-weapon fade">
            {r.exhibit.key && <WeaponCard weapon={{ key: r.exhibit.key, name: r.exhibit.name }} />}
            <h3 className="tv-h3">with the {r.exhibit.name.toLowerCase()}</h3>
          </div>
        )}
        <h3 className="tv-h3 fade" style={{ animationDelay: "1.4s" }}>in {mid(r.room)}</h3>
        {/* Phase 4: the plant, or none. */}
        {r.plant && (
          <p className="tv-sub fade" style={{ animationDelay: "2.6s" }}>
            {r.plant.planted ? `And the planted tip: the one about ${r.plant.about}.` : "No plant tonight. Both late tips were true."}
          </p>
        )}
      </div>,
      ...(r.accomplice
        ? [
            <div className="tv-scene" key="vacc">
              <span className="tv-kick">The accomplice</span>
              <span className="tv-av xl fade">{avatarSrc(r.accomplice.photo, r.accomplice.figure) ? <img src={avatarSrc(r.accomplice.photo, r.accomplice.figure)!} alt="" /> : initials(r.accomplice.name)}</span>
              <BigName name={r.accomplice.name} className="tv-reveal-acc" />
            </div>,
          ]
        : []),
      <div className="tv-scene" key="vverdict">
        <Fit className="scene" watch={r.aces.length + r.lockins.length * 100}>
        <span className="tv-kick">The verdict</span>
        <span className="tv-verdict fade">
          {/* Oct 21: the most votes on each part (after any runoff); a tie that stayed tied is a tie. */}
          {r.top ? <>The most votes: {r.top.who ? splitName(r.top.who).main : "a tie"}, {r.top.weapon ? `the ${r.top.weapon.toLowerCase()}` : "a tie on the weapon"}, {r.top.room ? mid(r.top.room) : "a tie on the room"}.</> : <>Of {r.accusers} locked in: {r.named} named the killer, {r.rightWeapon} the weapon, {r.rightRoom} the room.</>}
          <br />
          {r.killerWins ? (r.accomplice ? "The killer and the accomplice win." : "The killer wins.") : "The detectives win."}
        </span>
        {r.accomplice && r.guessers !== null && (
          <p className="tv-sub fade">
            {r.guessers ? `${r.namedAccomplice} of ${r.guessers} who guessed spotted the accomplice.` : "Nobody guessed the accomplice."}
          </p>
        )}
        {/* I1 (Oct 17): who named whom, the payoff for reading people. Oct 21: after a runoff on who, the runoff's. */}
        {(r.runoffTally ?? r.lockins).length > 0 && (
          <div className={`tv-tally lockins fade${(r.runoffTally ?? r.lockins).length > 5 ? " many" : ""}`}>
            {(r.runoffTally ?? r.lockins).slice(0, 7).map((col) => (
              <div key={col.suspect.id}>
                <span className="who">{col.suspect.name}</span>
                <span className="n">{col.by.length}</span>
                <div className="voters">
                  {col.by.map((v) => (
                    <span key={v.id} className="tv-av sm" title={v.name}>
                      {v.figure ? <img src={faceUrl(v.figure)} alt="" /> : initials(v.name)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {r.aces.length > 0 && <p className="tv-sub fade">Ace detectives: {r.aces.join(", ")}</p>}
        <p className="tv-sub fade" style={{ color: "var(--paper)" }}>
          {r.accomplice ? `${splitName(r.killer).main} and ${splitName(r.accomplice.name).main}, stand up and confess.` : `${splitName(r.killer).main}, stand up and confess.`}
        </p>
        </Fit>
      </div>,
    ];
    return { scene: { key: `reveal${step}`, node: frames[step] } };
  }
  if (g.status === "done" && d.results?.awards) {
    // Oct 17: only the awards someone won, in the order the narrator gives them; a shared award shows every winner.
    const list = d.results.awards;
    return {
      scene: {
        key: "awards",
        node: (
          <div className="tv-scene">
            {/* Oct 21: shrinks to fit between the host's buttons and the caption, however many awards and winners. */}
            {/* Phase 6 look-over: refit as each award's names come in (a shared award grows its card). */}
            <Fit className="scene" watch={`${list.map((a) => a.winners.length).join()}:${p.awardsAt.filter((x) => now >= x).length}`}>
            <span className="tv-kick">The Velvet Room awards</span>
            <h2 className="tv-h2" style={{ fontSize: "5cqw" }}>To the winners</h2>
            <div className={`tv-awards${list.length > 3 ? " many" : ""}`} style={{ "--n": list.length } as CSSProperties}>
              {list.map((a, i) => {
                const shown = !p.awardsAt.length || now >= (p.awardsAt[i] ?? 0);
                return (
                  <div className={`tv-award ${a.key} ${shown ? "fade" : "waiting"}`} key={`${a.key}:${shown}`}>
                    <span className="tv-kick">{a.title}</span>
                    <span className="faces">
                      {a.winners.slice(0, 3).map((w) => (
                        <span className="tv-av" key={w.id}>
                          {shown ? w.figure ? <img src={faceUrl(w.figure)} alt="" /> : initials(w.name) : "?"}
                        </span>
                      ))}
                    </span>
                    {/* First names: a shared award with full names wouldn't fit the card. Oct 21: three at most, then how many more. */}
                    <span className="n">{shown ? (a.winners.length > 3 ? `${a.winners.slice(0, 3).map((w) => w.short).join(", ")} and ${a.winners.length - 3} more` : a.winners.map((w) => w.short).join(" & ")) : "…"}</span>
                    <span className="sub">{shown ? a.sub : " "}</span>
                  </div>
                );
              })}
            </div>
            <p className="tv-sub">The bar is open. Settle your debts in chips.</p>
            </Fit>
          </div>
        ),
      },
    };
  }
  return { scene: { key: "blank", node: <div className="tv-scene"><h2 className="tv-h2">The Velvet Room</h2></div> } };
}

/** The runoff on the TV (Oct 21): "It's a tie", each guest's last words with a 30-second clock, then the vote. */
function runoffScene(d: Data, now: number): { key: string; node: ReactNode } {
  const ro = d.runoff!;
  const parts = [ro.who ? "who did it" : "", ro.weapon ? "the weapon" : "", ro.room ? "the room" : ""].filter(Boolean);
  const what = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  const faces = (ids: { id: string; name: string; figure: string | null; photoUrl: string | null }[]) => (
    <div className="tv-runoff-faces">
      {ids.map((x) => (
        <div key={x.id}>
          <span className="tv-av">{avatarSrc(x.photoUrl, x.figure) ? <img src={avatarSrc(x.photoUrl, x.figure)!} alt="" /> : initials(x.name)}</span>
          <span className="nm">{splitName(x.name).main}</span>
        </div>
      ))}
    </div>
  );
  const things = (
    <>
      {ro.weapon && (
        <div className="tv-wrow">
          {ro.weapon.map((w) => (w.key ? <WeaponCard key={w.id} weapon={{ key: w.key, name: w.name }} /> : <span key={w.id} className="tv-h3">{w.name}</span>))}
        </div>
      )}
      {ro.room && <p className="tv-h3">{ro.room.map((r) => r.label).join("  ·  ")}</p>}
    </>
  );
  if (now < ro.at + RUNOFF_INTRO_MS) {
    return {
      key: "runoff-tie",
      node: (
        <div className="tv-scene">
          <Fit className="scene" watch={`${ro.who?.length}:${ro.weapon?.length}:${ro.room?.length}`}>
            <span className="tv-kick fade">The lock-in</span>
            <h2 className="tv-h2 fade" style={{ fontSize: "7cqw" }}>It's a tie.</h2>
            <p className="tv-sub fade">A runoff on {what}.{ro.words.length ? " Last words first." : ""}</p>
            {ro.who && faces(ro.who)}
            {things}
          </Fit>
        </div>
      ),
    };
  }
  const i = speakingNow(ro.at, ro.words.length, now);
  if (i >= 0 && now < ro.voteAt) {
    const p = ro.who!.find((x) => x.id === ro.words[i])!;
    const left = ro.at + RUNOFF_INTRO_MS + (i + 1) * LAST_WORDS_MS - now;
    const next = ro.words.slice(i + 1).map((id) => ro.who!.find((x) => x.id === id)!);
    return {
      key: `runoff-words-${i}`,
      node: (
        <div className="tv-scene">
          <div className="tv-verdict-who">
            {p.figure ? <img className="freed" src={figureUrl(p.figure)} alt="" /> : <span className="tv-av xl">{initials(p.name)}</span>}
            <div>
              <span className="tv-kick">Last words · {i + 1} of {ro.words.length}</span>
              <BigName name={p.name} />
              {p.plea ? <p className="tv-sub">“{p.plea}”</p> : <p className="tv-sub">Thirty seconds. Make them count.</p>}
              <span className="tv-mini-clock big">{clock(left)}</span>
              {next.length > 0 && <p className="tv-sub">Up next: {next.map((x) => splitName(x.name).main).join(", ")}</p>}
            </div>
          </div>
        </div>
      ),
    };
  }
  return {
    key: "runoff-vote",
    node: (
      <>
        <div className="tv-scene">
          <Fit className="scene" watch={`${ro.who?.length}:${ro.weapon?.length}:${ro.room?.length}`}>
            <span className="tv-kick">The runoff</span>
            <h2 className="tv-h2" style={{ fontSize: "5.4cqw" }}>Vote on your phone.</h2>
            <p className="tv-sub">On {what} only. The most votes wins. Another tie, and the killer walks.</p>
            {ro.who && faces(ro.who)}
            {things}
          </Fit>
        </div>
        <div className="tv-corner tr">
          <span>
            <b>{ro.voted}</b> of {ro.of} in
          </span>
          {ro.endsAt !== null && <span className="tv-mini-clock">{clock(ro.endsAt - now)}</span>}
        </div>
      </>
    ),
  };
}

/**
 * Oct 20 (untimed games): how many are ready, and once most are, who the round is waiting on ("Waiting on Josh and
 * Reily"), so the room can chase them.
 */
function waitingLine(d: Data): string {
  const left = d.guests.filter((x) => x.here && !x.jailed && !x.ready).map((x) => splitName(x.short ?? x.charName).main);
  if (!d.counts.playing || d.counts.ready * 2 < d.counts.playing || !left.length) return `${d.counts.ready} of ${d.counts.playing} ready`;
  // Oct 29: at most three names, so the line stays short enough for the round bar.
  const names = left.length > 3 ? `${left.slice(0, 2).join(", ")} and ${left.length - 2} more` : left.length === 1 ? left[0] : `${left.slice(0, -1).join(", ")} and ${left[left.length - 1]}`;
  return `Waiting on ${names}`;
}

function RoundBar({ d, now, label }: { d: Data; now: number; label: string }) {
  const g = d.game;
  // I4 (Oct 17): a Ready game shows the clock during its 30-second last call.
  const timed = g.pacing.mode === "timer" || (g.roundEndsAt !== null && g.roundEndsAt !== 0);
  const left = g.roundEndsAt === null ? 0 : g.roundEndsAt < 0 ? -g.roundEndsAt : g.roundEndsAt - now;
  const pct = d.counts.playing ? Math.min(100, (d.counts.ready / d.counts.playing) * 100) : 0;
  return (
    <>
      <div className="tv-roundbar">
        <span className="chip">
          Round {g.round} · {label}
        </span>
        {d.weapons.length > 0 && <TopWeapons weapons={d.weapons} />}
        {timed ? <span className="tv-clock">{clock(left)}</span> : <span className="tv-ready">{waitingLine(d)}</span>}
      </div>
      <div className="tv-meter">{!timed && <i style={{ width: `${pct}%` }} />}</div>
      {/* Phase 4 (Oct 21): who has the heat (three or more anonymous tags). Rounds 1 to 3 only. */}
      {g.round <= 3 && d.heat.length > 0 && (
        <div className="tv-heat" aria-label="The heat">
          <span className="lab">The heat</span>
          {d.heat.map((h) => (
            <span className="who fade" key={h.id}>
              <span className="tv-av sm hot">{h.figure ? <img src={faceUrl(h.figure)} alt="" /> : initials(h.name)}</span>
              {h.name}
            </span>
          ))}
        </div>
      )}
    </>
  );
}

/** The show: How to play, the intro (the Don dies), the roll call, "check your phones" (that order since Oct 16). */
function showScene(d: Data, p: Plan, now: number): Scene | null {
  const g = d.game;
  if (p.part === "intro") {
    // The slides wait for the narrator's lines (introLayout, Oct 16).
    const beats = p.intro?.beats ?? [g.startedAt ?? now, (g.startedAt ?? now) + SHOW.introBeatMs, (g.startedAt ?? now) + 2 * SHOW.introBeatMs];
    const beat = now >= beats[2] ? 2 : now >= beats[1] ? 1 : 0;
    const frames = [
      <div className="tv-scene dark" key="i0">
        <span className="tv-kick fade">New York City · October 31, 2026</span>
      </div>,
      <div className="tv-scene dark" key="i1">
        <h2 className="tv-h2 fade blood">The Don is dead.</h2>
        <p className="tv-sub fade">Don Ray Sanders · found in {mid(g.bodyRoom)}</p>
      </div>,
      <div className="tv-scene dark" key="i2">
        <h2 className="tv-h2 fade">One of you did it.</h2>
        {d.weapons.length > 0 && <WeaponRow weapons={d.weapons} />}
        <p className="tv-sub fade" style={{ animationDelay: ".6s" }}>
          {d.weapons.length ? "And one of these did the deed." : "The doors are locked."}
        </p>
      </div>,
    ];
    return { key: `intro${beat}`, node: frames[beat] };
  }
  if (p.part === "how" && p.rules && p.rules.steps.length) {
    const n = p.rules.steps.length;
    const i = Math.max(0, p.rules.steps.findIndex((st) => now < st.until));
    const step = p.rules.steps[i];
    const wide = step.art === "search" || step.art === "win";
    const stand = d.standIns?.length ? d.standIns : ALL_FIGURE_KEYS;
    return {
      key: `how${i}`,
      node: (
        <div className="tv-scene how">
          <div className={`tv-how ${wide ? "wide" : ""}`}>
            <div className={`tv-how-art ${wide ? "map" : ""}`}>
              {step.art === "suspects" ? (
                <HowSuspects faces={stand.slice(0, 4)} />
              ) : step.art === "search" ? (
                <div className="tv-how-search">
                  <HouseMap map={demoMap(d.map, step.at)} round={1} now={now} />
                  <ScanPhone />
                </div>
              ) : step.art === "weapons" ? (
                <WeaponFan weapons={d.weapons} />
              ) : step.art === "jail" ? (
                <div className="tv-how-jail">
                  <Jailed figure={dress(d, "guest3")} className="enter" />
                  <VoteDots />
                </div>
              ) : step.art === "win" ? (
                <HowWin face={stand[0]} weapon={d.weapons[0] ?? { key: "candlestick", name: "Candlestick" }} room={d.map.rooms[0]?.label ?? "The Lounge"} />
              ) : step.art === "round" ? (
                <HowRound faces={stand.slice(0, 5)} timer={g.pacing.mode === "timer"} />
              ) : step.art === "story" ? (
                <HowStory />
              ) : step.art === "tips" ? (
                <HowTips />
              ) : step.art === "chips" ? (
                <HowChips />
              ) : step.art === "pair" ? (
                // The accomplice: the masked killer, with someone at their shoulder.
                <div className="tv-how-pair">
                  <img className="enter behind" src={artUrl(dress(d, "guest6"))} alt="" />
                  <img className="enter" src={artUrl("killer")} alt="" />
                </div>
              ) : (
                <img className="enter" src={artUrl(step.art)} alt="" />
              )}
            </div>
            <div className="tv-how-text">
              <span className="tv-kick fade">How to play · {i + 1} of {n}</span>
              {HOW_TITLE[step.cue] && <h2 className="tv-how-title fade">{HOW_TITLE[step.cue]}</h2>}
              <HowRule text={captionText(step.cue, g.script ?? g.tone, g.narrator.host, step.v)} wide={wide} />
            </div>
          </div>
        </div>
      ),
    };
  }
  if (p.part === "roll" && p.roll) {
    const steps = p.roll.steps.filter((st) => st.at < p.roll!.phonesAt);
    const i = steps.findIndex((st) => now >= st.at && now < st.until);
    if (i >= 0) return { key: `roll${steps[i].item.id}`, node: <RollCard step={steps[i]} index={i} count={steps.length} /> };
    const done = steps.length > 0 && now >= steps[steps.length - 1].until;
    return {
      key: done ? "roll-end" : "roll-open",
      node: (
        <div className="tv-scene">
          <span className="tv-kick fade">{done ? "Remember these faces" : "The roll call"}</span>
          <h2 className="tv-h2 fade" style={{ fontSize: "5.4cqw" }}>{done ? "Tonight's suspects" : "The doors are locked."}</h2>
          {done ? <Guests guests={d.guests} mark="here" /> : <p className="tv-sub fade" style={{ animationDelay: ".6s" }}>Nobody leaves until we know who did it.</p>}
        </div>
      ),
    };
  }
  if (p.part === "phones") {
    return {
      key: "phones",
      node: (
        <div className="tv-scene dark">
          <span className="tv-kick fade">Check your phone</span>
          <h2 className="tv-h2 fade" style={{ fontSize: "5.4cqw" }}>Press and hold your card.</h2>
          <p className="tv-sub fade">Keep your screen to yourself. Round 1 starts in a moment.</p>
        </div>
      ),
    };
  }
  return null;
}

type Vote = NonNullable<Data["vote"]>;

/** The jail and release votes: the candidates while it's open, then who voted for whom, then the verdict. */
function voteScene(d: Data, vt: Vote, now: number): Scene {
  const jail = vt.kind === "jail";
  if (vt.auto && vt.target) {
    // Oct 17 (D10): no release vote, the evidence already cleared them.
    const who = vt.target;
    return {
      key: `vote-auto-${vt.at}`,
      node: (
        <div className="tv-scene">
          <div className="tv-verdict-who">
            {who.figure && <img className="freed" src={figureUrl(who.figure)} alt="" />}
            <div>
              <span className="tv-kick fade">Released</span>
              <h2 className="tv-h2 fade" style={{ fontSize: "5cqw" }}>The evidence clears {who.name}.</h2>
              <p className="tv-sub fade" style={{ animationDelay: ".6s" }}>No vote needed. Back in the game: they can lock in.</p>
            </div>
          </div>
        </div>
      ),
    };
  }
  // Phase 4 (Oct 21): the two late tips land as the jail vote opens, on their own for a moment (the plant among them,
  // if the killer framed someone).
  if (!vt.closedAt && jail && d.lateTips.length && d.lateTipsAt && now < d.lateTipsAt + LATE_TIPS_MS) {
    return {
      key: `vote-tips-${vt.at}`,
      node: (
        <div className="tv-scene">
          <Fit className="scene" watch={d.lateTips.join("|")}>
          <span className="tv-kick fade">Late tips</span>
          <h2 className="tv-h2 fade" style={{ fontSize: "5cqw" }}>Word just came in.</h2>
          <div className="tv-cards l">
            {d.lateTips.map((t, i) => (
              <div className="tv-ev fade tip" style={{ animationDelay: `${0.4 + i * 0.6}s` }} key={i}>
                <small>Late tip</small>
                {t}
              </div>
            ))}
          </div>
          <p className="tv-sub fade" style={{ animationDelay: "1.8s" }}>Then the jail vote, on your phones.</p>
          </Fit>
        </div>
      ),
    };
  }
  if (!vt.closedAt) {
    return {
      key: `vote-open-${vt.at}`,
      node: (
        <>
          <div className="tv-scene">
            <Fit className="scene" watch={vt.candidates.length}>
            <span className="tv-kick fade">{jail ? `The jail vote · Round ${vt.round}` : `The release vote · Round ${vt.round}`}</span>
            <h2 className="tv-h2 fade" style={{ fontSize: "5.4cqw" }}>{jail ? "Who goes to jail?" : "Does anyone get out?"}</h2>
            <div className={`tv-cands ${jail && vt.candidates.length > 6 ? "crowd" : ""}`}>
              {vt.candidates.map((c, i) => (
                <div key={c.id} className="fade" style={{ animationDelay: `${0.2 + i * 0.05}s` }}>
                  {c.figure ? (
                    !jail ? <Jailed figure={c.figure} /> : vt.candidates.length > 6 ? <span className="tv-av"><img src={faceUrl(c.figure)} alt="" /></span> : <img src={figureUrl(c.figure)} alt="" />
                  ) : (
                    <span className="tv-av">{initials(c.name)}</span>
                  )}
                  <span>{c.name}</span>
                </div>
              ))}
            </div>
            <p className="tv-sub fade">Vote on your phone, or pick nobody. More than half of you have to agree.</p>
            </Fit>
          </div>
          <div className="tv-corner tr">
            <span>
              <b>{vt.voted}</b> of {vt.voters} voted
            </span>
            {/* Oct 20: untimed votes (endsAt 0) have no clock. */}
            {vt.endsAt > 0 && <span className="tv-mini-clock">{clock(vt.left ?? vt.endsAt - now)}</span>}
          </div>
        </>
      ),
    };
  }
  const verdictAt = vt.closedAt + VOTE.verdictAtMs;
  if (now < verdictAt) {
    return {
      key: `vote-tally-${vt.at}`,
      node: (
        <div className="tv-scene">
          <Fit className="scene" watch={(vt.tally ?? []).length}>
          <span className="tv-kick fade">The votes are in</span>
          <div className="tv-tally">
            {(vt.tally ?? []).filter((col) => col.voters.length).map((col, i) => (
              <div key={col.targetId ?? "nobody"} className="fade" style={{ animationDelay: `${0.3 + i * 0.25}s` }}>
                <span className="who">{col.name}</span>
                <span className="n">{col.voters.length}</span>
                <div className="voters">
                  {col.voters.map((v) => (
                    <span key={v.id} className="tv-av sm" title={v.name}>
                      {v.figure ? <img src={faceUrl(v.figure)} alt="" /> : initials(v.name)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="tv-sub fade" style={{ animationDelay: "1s" }}>
            {vt.voted} of {vt.voters} voted. More than half had to agree.
          </p>
          </Fit>
        </div>
      ),
    };
  }
  const who = vt.target;
  return {
    key: `vote-verdict-${vt.at}`,
    node: (
      <div className="tv-scene">
        {vt.outcome === "nobody" || !who ? (
          <>
            <span className="tv-kick fade">The verdict</span>
            <h2 className="tv-h2 fade" style={{ fontSize: "5.4cqw" }}>{jail ? "Nobody goes to jail." : "Nobody gets out."}</h2>
            <p className="tv-sub fade">Not enough votes. More than half had to agree.</p>
          </>
        ) : (
          <div className="tv-verdict-who">
            {who.figure && (vt.outcome === "jailed" ? <Jailed figure={who.figure} className="slam" /> : <img className="freed" src={figureUrl(who.figure)} alt="" />)}
            <div>
              <span className="tv-kick fade">{vt.outcome === "jailed" ? "Locked up" : "Released"}</span>
              <h2 className="tv-h2 fade" style={{ fontSize: "5cqw" }}>{vt.outcome === "jailed" ? `${who.name} is going to jail.` : `${who.name} is free.`}</h2>
              <p className="tv-sub fade" style={{ animationDelay: ".6s" }}>
                {vt.outcome === "jailed" ? "They can talk, and bribe with chips. No searching or voting this round. They're back for the lock-in." : "Back in the game: they can lock in."}
              </p>
            </div>
          </div>
        )}
      </div>
    ),
  };
}

type RollStep = NonNullable<Plan["roll"]>["steps"][number];

/** One guest's turn (Heston, Oct 16): their drawing, their name, and "a.k.a." their nickname. Nothing else. */
function RollCard({ step, index, count }: { step: RollStep; index: number; count: number }) {
  const it = step.item;
  const name = it.cast ? it.cast.real : it.charName;
  return (
    <div className="tv-scene roll">
      <div className="tv-roll v2">
        <div className="tv-roll-art">
          {it.figure ? (
            <div className="tv-roll-fig enter">
              <img src={figureUrl(it.figure)} alt="" />
            </div>
          ) : (
            <div className="tv-frame fade">{it.photoUrl ? <img src={it.photoUrl} alt="" /> : <span>{initials(it.charName)}</span>}</div>
          )}
        </div>
        <div className="tv-roll-text">
          <span className="tv-kick fade">
            Roll call · {index + 1} of {count}
          </span>
          <h2 className="tv-h2 fade" style={{ animationDelay: ".25s" }}>{name}</h2>
          {it.cast?.nickname && (
            <span className="tv-aka fade" style={{ animationDelay: ".6s" }}>
              a.k.a. “{it.cast.nickname}”
            </span>
          )}
          {!it.cast && <span className="tv-played fade" style={{ animationDelay: ".45s" }}>Played by {it.realName}</span>}
        </div>
      </div>
    </div>
  );
}

type Weapon = { key: string; name: string };

/** A weapon's little framed card: the painting and its name. */
function WeaponCard({ weapon, className = "", style }: { weapon: Weapon; className?: string; style?: CSSProperties }) {
  return (
    <div className={`tv-wcard ${className}`} style={style}>
      <span className="in">
        <img src={weaponUrl(weapon.key)} alt="" />
      </span>
      <span className="nm">{weapon.name}</span>
    </div>
  );
}

/** Every weapon in play, in a row (the intro). */
function WeaponRow({ weapons }: { weapons: Weapon[] }) {
  return (
    <div className="tv-wrow">
      {weapons.map((w, i) => (
        <WeaponCard key={w.key} weapon={w} className="fade" style={{ animationDelay: `${0.3 + i * 0.12}s` }} />
      ))}
    </div>
  );
}

/**
 * The weapons in play along the top of the screen during the rounds (Oct 16, Heston: "attach the weapons in play for
 * that particular game at the top of the screen as well"), like the guests along the bottom. Never by owner.
 */
function TopWeapons({ weapons }: { weapons: Weapon[] }) {
  const slot = Math.min(6, 44 / weapons.length);
  return (
    <div className="tv-topweapons" style={{ "--slot": `${slot}cqw` } as CSSProperties} aria-label="The weapons in play">
      {weapons.map((w) => (
        <div key={w.key}>
          <img src={weaponUrl(w.key)} alt="" />
          <span className="nm">{w.name}</span>
        </div>
      ))}
    </div>
  );
}

/** Three weapon cards fanned out (How to play). */
function WeaponFan({ weapons }: { weapons: Weapon[] }) {
  const fallback: Weapon[] = [
    { key: "candlestick", name: "Candlestick" },
    { key: "revolver", name: "Revolver" },
    { key: "rope", name: "Rope" },
  ];
  const three = (weapons.length >= 3 ? weapons : fallback).slice(0, 3);
  return (
    <div className="tv-wfan enter">
      {three.map((w) => (
        <WeaponCard key={w.key} weapon={w} />
      ))}
    </div>
  );
}

/** How to play, card 1: this game's faces with the masked killer in the middle. One of them did it. */
function HowSuspects({ faces }: { faces: string[] }) {
  const row = [...faces.slice(0, 2), "killer", ...faces.slice(2, 4)];
  return (
    <div className="tv-how-suspects">
      {row.map((f, i) => (
        <span key={`${f}${i}`} className={`face ${f === "killer" ? "it" : ""}`} style={{ animationDelay: `${0.1 + i * 0.12}s` }}>
          <img src={faceUrl(f)} alt="" />
          {f === "killer" && <b>?</b>}
        </span>
      ))}
    </div>
  );
}

/** How to play, searching: a phone scanning an evidence card. */
function ScanPhone() {
  return (
    <div className="tv-scan" aria-hidden="true">
      <svg viewBox="0 0 60 100">
        <rect x="2" y="2" width="56" height="96" rx="8" className="body" />
        <rect x="8" y="12" width="44" height="70" rx="2" className="screen" />
        <g className="qr">
          {[0, 1, 2, 3, 4].flatMap((r) => [0, 1, 2, 3, 4].map((c) => ((r * 7 + c * 3) % 5 < 3 || (r % 4 === 0 && c % 4 === 0) ? <rect key={`${r}${c}`} x={14 + c * 6.4} y={28 + r * 6.4} width="5.4" height="5.4" /> : null)))}
        </g>
        <rect x="10" y="44" width="40" height="1.6" className="beam" />
      </svg>
    </div>
  );
}

/** How to play, the jail vote: more than half of the votes. */
function VoteDots() {
  return (
    <div className="tv-vdots">
      <span className="dots">
        {[1, 1, 1, 0, 0].map((on, i) => (
          <i key={i} className={on ? "on" : ""} style={{ animationDelay: `${0.6 + i * 0.18}s` }} />
        ))}
      </span>
      <span className="lab">More than half</span>
    </div>
  );
}

/** Phase 6 (Oct 21), How to play: your story. A phone's "Where you were" card, and a second one just like it. */
function HowStory() {
  return (
    <div className="tv-how-story enter" aria-hidden="true">
      {[0, 1].map((k) => (
        <div key={k} className={`card ${k ? "back" : ""}`}>
          <span className="lab">Where you were</span>
          <i />
          <i />
          <i className="short" />
          {k === 0 && <span className="q">Real, or a cover?</span>}
        </div>
      ))}
    </div>
  );
}

/** Phase 6, How to play: the late tips. Two tips land; one might be a plant. */
function HowTips() {
  return (
    <div className="tv-how-tips enter" aria-hidden="true">
      {[0, 1].map((k) => (
        <div key={k} className="tip" style={{ animationDelay: `${0.3 + k * 0.5}s` }}>
          <span className="lab">Late tip</span>
          <i />
          <i className="short" />
          {k === 1 && <b className="stamp">Planted?</b>}
        </div>
      ))}
    </div>
  );
}

/** Phase 6, How to play: chips. A stack of chips, and the rule: quiet is allowed, a lie never. */
function HowChips() {
  return (
    <div className="tv-how-chips enter" aria-hidden="true">
      <svg viewBox="0 0 120 120">
        {[0, 1, 2, 3, 4].map((k) => (
          <g key={k} transform={`translate(0 ${-k * 11})`} style={{ animationDelay: `${0.2 + k * 0.15}s` }} className="chip">
            <ellipse cx="60" cy="96" rx="34" ry="11" />
            <path d="M26 96v8c0 6 15 11 34 11s34-5 34-11v-8" />
          </g>
        ))}
      </svg>
      <span className="lab">Votes and silence: yes. Lies: never.</span>
    </div>
  );
}

/** How to play, locking in: who + with what + where. */
/** W14 (Oct 17): how a round ends: most of you tap Ready, or the clock runs out. */
function HowRound({ faces, timer }: { faces: string[]; timer: boolean }) {
  if (timer) {
    return (
      <div className="tv-how-round enter">
        <span className="clock">10:00</span>
        <span className="lab">Then the round ends</span>
      </div>
    );
  }
  return (
    <div className="tv-how-round enter">
      <div className="faces">
        {faces.map((f, i) => (
          <span key={f} className={`tv-av ${i < 3 ? "ready" : ""}`} style={{ animationDelay: `${0.4 + i * 0.35}s` }}>
            <img src={faceUrl(f)} alt="" />
          </span>
        ))}
      </div>
      <span className="lab">3 of {faces.length} ready: 30 seconds, then the round ends</span>
    </div>
  );
}

function HowWin({ face, weapon, room }: { face: string; weapon: Weapon; room: string }) {
  return (
    <div className="tv-how-win">
      <div className="tile fade" style={{ animationDelay: ".15s" }}>
        <span className="q">Who</span>
        <span className="pic face">
          <img src={faceUrl(face)} alt="" />
        </span>
      </div>
      <span className="plus fade" style={{ animationDelay: ".35s" }}>+</span>
      <div className="tile fade" style={{ animationDelay: ".5s" }}>
        <span className="q">With what</span>
        <WeaponCard weapon={weapon} />
      </div>
      <span className="plus fade" style={{ animationDelay: ".7s" }}>+</span>
      <div className="tile fade" style={{ animationDelay: ".85s" }}>
        <span className="q">Where</span>
        <span className="pic room">{room}</span>
      </div>
    </div>
  );
}

/** "Josh “Two-Tone” Lee" → "Josh Lee", a.k.a. "Two-Tone". */
function splitName(name: string): { main: string; aka: string | null } {
  const m = /^(.*?)\s*“([^”]+)”\s*(.*)$/.exec(name);
  return m ? { main: [m[1], m[3]].filter(Boolean).join(" "), aka: m[2] } : { main: name, aka: null };
}

/** A big name at the reveal: their name, and their nickname under it. */
function BigName({ name, className = "" }: { name: string; className?: string }) {
  const n = splitName(name);
  return (
    <span className={`tv-reveal-name fade ${className}`}>
      {n.main}
      {n.aka && <small className="aka">a.k.a. “{n.aka}”</small>}
    </span>
  );
}

/**
 * Fits a scene in the 16:9 frame (Heston, Oct 16: "some stuff was cut off out of frame"): if what's inside is taller or
 * wider than the space it has, it's zoomed down until it fits (never below 45%), so a night with 15 guests, long names
 * and a pile of evidence still shows everything.
 */
function Fit({ children, className = "", watch }: { children: ReactNode; className?: string; watch: unknown }) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const measure = () => {
      const b = box.current;
      const i = inner.current;
      if (!b || !i) return;
      const was = i.style.zoom;
      i.style.zoom = "1";
      const z = Math.max(0.45, Math.min(1, b.clientHeight / Math.max(1, i.scrollHeight), b.clientWidth / Math.max(1, i.scrollWidth)));
      i.style.zoom = was;
      setZoom((old) => (Math.abs(old - z) > 0.01 ? z : old));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    void document.fonts?.ready.then(measure);
    const t = window.setTimeout(measure, 500);
    return () => {
      ro.disconnect();
      window.clearTimeout(t);
    };
  }, [watch]);
  return (
    <div ref={box} className={`tv-fit ${className}`}>
      <div ref={inner} className="tv-fit-in" style={{ zoom }}>
        {children}
      </div>
    </div>
  );
}

/** A drawing behind the jail bars, its face lined up with the gap in the middle. */
function Jailed({ figure, className = "" }: { figure: string; className?: string }) {
  return (
    <div className={`tv-jailed ${className}`}>
      <img className="who" src={figureUrl(figure)} alt="" style={{ transform: `translateX(-${(faceX(figure) * 100).toFixed(1)}%)` }} />
      <img className="bars" src="/art/jailbars.webp" alt="" />
    </div>
  );
}

function Guests({ guests, mark }: { guests: Data["guests"]; mark: "here" | "accused" }) {
  // Oct 21 (Phase 8 look-over): up to 8 guests in one row; more in two even rows (10: 5 and 5), at most 8 across.
  const n = guests.length;
  const cols = n <= 8 ? Math.max(1, n) : Math.min(8, Math.ceil(n / 2));
  return (
    <div className="tv-guests" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {guests.map((x) => (
        <div key={x.id} className={mark === "here" && !x.here ? "away" : ""}>
          <span className={`tv-av ${mark === "accused" && x.accused ? "done" : ""} ${x.jailed ? "jailed" : ""}`}>{avatarSrc(x.photoUrl, x.figure) ? <img src={avatarSrc(x.photoUrl, x.figure)!} alt="" /> : initials(x.charName)}</span>
          {x.short ?? x.charName}
        </div>
      ))}
    </div>
  );
}

/** Every guest along the bottom of the TV during the rounds: drawing, first name, a ring once ready, bars if jailed. */
function GuestStrip({ guests, ready }: { guests: Data["guests"]; ready: boolean }) {
  const shown = guests.filter((x) => x.here);
  if (!shown.length) return null;
  // One row, as wide as the screen allows: 6.2cqw a guest, less past about 14.
  const slot = Math.min(6.2, (90 - 0.4 * (shown.length - 1)) / shown.length);
  return (
    <div className="tv-strip" style={{ "--slot": `${slot}cqw` } as CSSProperties}>
      {shown.map((x) => (
        <div key={x.id} className={x.jailed ? "jailed" : ""}>
          <span className={`tv-av ${ready && x.ready && !x.jailed ? "done" : ""} ${x.jailed ? "jailed" : ""}`}>
            {avatarSrc(x.photoUrl, x.figure) ? <img src={avatarSrc(x.photoUrl, x.figure)!} alt="" /> : initials(x.charName)}
          </span>
          <span className="nm">{splitName(x.short ?? x.charName).main}</span>
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

const CAST: CharKey[] = ["don", "killer", ...ALL_FIGURE_KEYS];
const artUrl = (c: CharKey) => `/art/${c}.webp`;
/** Which way each drawing faces, so walkers face where they're going. */
const FACES_RIGHT_SET = new Set<CharKey>(FACES_RIGHT);
// Oct 20 (Heston: "things arent covering up other elements"): the walkers and the heckle peeks pass behind the
// guests, the caption and the cards too. Only the reveal's killer and the Don's fall play in front.
const BACK = new Set<Cameo["anim"]>(["stand", "standRight", "lineup", "peek", "stroll", "strollBack", "creep", "creepBack"]);

function CameoLayer({ list, layer }: { list: Cameo[]; layer: "back" | "front" | "over" }) {
  const shown = layer === "over" ? list : list.filter((c) => BACK.has(c.anim) === (layer === "back"));
  if (!shown.length) return null;
  return (
    <div className={`tv-cameos cameos-${layer}`} aria-hidden="true">
      {shown.map((c) => (
        <CameoFigure key={c.id} c={c} />
      ))}
    </div>
  );
}

function CameoFigure({ c }: { c: Cameo }) {
  // A TV that opens mid-cameo picks the animation up where it is.
  // (Line-ups with no start time are simply already standing.)
  const [late] = useState(() => (c.at > 0 && Number.isFinite(c.at) ? Math.min(3_600_000, Math.max(0, Date.now() - c.at)) : 60_000));
  const right = c.anim === "stroll" || c.anim === "creep" || c.anim === "stand";
  const left = c.anim === "strollBack" || c.anim === "creepBack" || c.anim === "standRight";
  const flip = (right && !FACES_RIGHT_SET.has(c.char)) || (left && FACES_RIGHT_SET.has(c.char));
  return (
    <div
      className={`cameo ${c.anim} ${c.char} ${c.on ? `on-${c.on}` : ""}`}
      style={{ animationDelay: `-${late}ms`, ["--slot" as string]: c.slot ?? 0, ["--n" as string]: c.count ?? 7 }}
    >
      <img className={flip ? "flip" : ""} src={artUrl(c.char)} alt="" style={{ animationDelay: `-${late}ms` }} />
      {c.label && <span className="cameo-name">{c.label}</span>}
    </div>
  );
}

/** How to play, card 5: the real map with every other marker stamped, as if the night were under way. */
function demoMap(map: MapData, at: number): MapData {
  return { rooms: map.rooms.map((r) => ({ ...r, opensIn: 1 })), markers: map.markers.map((m, i) => ({ ...m, foundAt: i % 2 ? null : at + 1500 + i * 350 })) };
}

/** Before the doors open: scan to sign up and make a character (the replay's main screen). */
function SignupPanel({ slug }: { slug: string }) {
  return (
    <div className="tv-join">
      <Qr className="qr" text={`${window.location.origin}/?game=${encodeURIComponent(slug)}`} label="Scan to sign up" />
      <div className="tv-join-text">
        <span className="tiny">Make your character</span>
        <b className="tv-code tv-code-sm">Sign up</b>
        <span className="tiny">Scan with your phone camera</span>
      </div>
    </div>
  );
}

/** Jackbox style: scan, or go to the site and type the code, then tap your name. */
function JoinPanel({ code }: { code: string }) {
  const host = window.location.host;
  return (
    <div className="tv-join">
      <Qr className="qr" text={`${window.location.origin}/join?code=${code}`} label={`Scan to join room ${code}`} />
      <div className="tv-join-text">
        <span className="tiny">Join on your phone</span>
        <b className="tv-code">{code}</b>
        <span className="tiny">{host}/join</span>
      </div>
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
        {!ev.length && <p className="tv-sub">Nothing on the TV yet. Round 1 evidence is on the cards.</p>}
      </div>
    </div>
  );
}

/**
 * Oct 17: a How to play card's words, sized to fit. The longer rules lines (up to about 400 characters in Sailor mode)
 * pushed the card's "How to play · 6 of 6" off the top of the screen at the usual size.
 */
// Phase 6 (Oct 21): a wide card (the map beside it) has a narrower text column, so its words run smaller.
const howRuleSize = (len: number, wide = false) => Math.min(2.5, Math.sqrt((wide ? 750 : 1300) / Math.max(1, len)));
function HowRule({ text, wide = false }: { text: string; wide?: boolean }) {
  return (
    <div className="tv-rule fade" style={{ fontSize: `${howRuleSize(text.length, wide).toFixed(2)}cqw` }}>
      {text}
    </div>
  );
}
