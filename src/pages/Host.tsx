import { Component, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import Shell from "../components/Shell";
import { Deco, initials } from "../components/MemberCard";
import { friendlyError } from "../lib/errors";

const TZ = "America/Chicago";

type SettingsPatch = Omit<FunctionArgs<typeof api.host.updateSettings>, "slug" | "hostKey">;

function endOfDayChicago(day: string): number {
  const hourIn = (t: number) =>
    new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(t);
  for (const off of ["-05:00", "-06:00"]) {
    const t = Date.parse(`${day}T23:59:59${off}`);
    if (hourIn(t) === "23") return t;
  }
  return Date.parse(`${day}T23:59:59-06:00`);
}
const dayLabel = (t: number) =>
  new Date(t).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
const dayValue = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(t);
const when = (t: number) =>
  new Date(t).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <Shell>
          <div className="screen center">
            <span className="eyebrow">Host controls</span>
            <Deco />
            <h1 className="title-lg">That host link isn't valid</h1>
            <p className="lede">Use the full host link Claude gave you, including the part after "key=".</p>
          </div>
        </Shell>
      );
    }
    return this.props.children;
  }
}

export default function Host(props: { slug: string; hostKey: string }) {
  return (
    <Boundary>
      <HostInner {...props} />
    </Boundary>
  );
}

function Toggle(props: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; help: string }) {
  return (
    <label className="toggle" htmlFor={props.id}>
      <input type="checkbox" id={props.id} checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
      <span>
        <strong>{props.label}</strong>
        <span>{props.help}</span>
      </span>
    </label>
  );
}

function HostInner({ slug, hostKey }: { slug: string; hostKey: string }) {
  const data = useQuery(api.host.roster, { slug, hostKey });
  const updateSettings = useMutation(api.host.updateSettings);
  const removePlayer = useMutation(api.host.removePlayer);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<Id<"players"> | null>(null);
  const [copied, setCopied] = useState(false);

  if (data === undefined) {
    return (
      <Shell>
        <div className="screen center">
          <Deco />
          <p className="lede">Opening the books…</p>
        </div>
      </Shell>
    );
  }
  const { game, players, counts } = data;
  const regLink = `${window.location.origin}/${game.isTest ? `?game=${encodeURIComponent(game.slug)}` : ""}`;

  async function save(patch: SettingsPatch) {
    setError(null);
    try {
      await updateSettings({ slug, hostKey, ...patch });
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  async function remove(id: Id<"players">) {
    if (confirmId !== id) {
      setConfirmId(id);
      return;
    }
    setConfirmId(null);
    try {
      await removePlayer({ slug, hostKey, playerId: id });
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  function copyLink() {
    navigator.clipboard?.writeText(regLink).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      },
      () => undefined,
    );
  }

  return (
    <Shell wide>
      <div className="host">
        <header className="host-head">
          <div className="host-title">
            <span className="eyebrow">Host controls{game.isTest ? " · test game" : ""}</span>
            <h1 className="title-lg">{game.title}</h1>
            <p className="help">Spoiler-free: this page never shows weapons, motives, secrets or who opted in.</p>
          </div>
          <div className="stats">
            <div>
              <b>{counts.total}</b>
              <span>signed up</span>
            </div>
            <div>
              <b>{counts.optedIn}</b>
              <span>up for killer</span>
            </div>
            <div>
              <b className={game.open ? "ok" : "warn"}>{game.open ? "Open" : "Closed"}</b>
              <span>guest list</span>
            </div>
          </div>
        </header>

        {error && (
          <div className="errbox" role="alert">
            {error}
          </div>
        )}

        <section className="linkbar">
          <span className="eyebrow">Registration link to text guests</span>
          <div className="key-row">
            <code>{regLink.replace(/^https?:\/\//, "")}</code>
            <button type="button" className="copy" onClick={copyLink}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </section>

        <div className="host-grid">
          <section className="panel-block">
            <h2 className="h-sec">Guest list</h2>
            {players.length === 0 ? (
              <p className="help">Nobody yet. Text the link above, or sign yourself up first.</p>
            ) : (
              <ul className="roster">
                {players.map((p) => (
                  <li key={p.id}>
                    <div className="card-ph sm">{p.photoUrl ? <img src={p.photoUrl} alt="" /> : initials(p.charName)}</div>
                    <div className="roster-main">
                      <div className="roster-name">{p.charName}</div>
                      <div className="roster-sub">
                        {p.realName} · signed up {when(p.registeredAt)}
                      </div>
                      <div className="roster-sig">Signature: {p.signature}</div>
                    </div>
                    <button
                      type="button"
                      className={confirmId === p.id ? "copy danger" : "copy"}
                      onClick={() => remove(p.id)}
                      onBlur={() => setConfirmId(null)}
                    >
                      {confirmId === p.id ? "Tap again to remove" : "Remove"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel-block">
            <h2 className="h-sec">Game menu</h2>

            <div className="setting">
              <span className="lab" id="lab-motives">
                Motives and secrets
              </span>
              <div className="seg" role="group" aria-labelledby="lab-motives">
                <button
                  type="button"
                  aria-pressed={game.motiveMode === "game"}
                  onClick={() => save({ motiveMode: "game" })}
                >
                  The game writes them
                </button>
                <button
                  type="button"
                  aria-pressed={game.motiveMode === "players"}
                  onClick={() => save({ motiveMode: "players" })}
                >
                  Players write their own
                </button>
              </div>
              <span className="help">Anyone who signs up without one gets a motive and secret written by the game.</span>
            </div>

            <div className="setting">
              <span className="lab" id="lab-script">
                Script
              </span>
              <div className="seg" role="group" aria-labelledby="lab-script">
                <button type="button" aria-pressed={game.tone === "classic"} onClick={() => save({ tone: "classic" })}>
                  Classic
                </button>
                <button type="button" aria-pressed={game.tone === "adult"} onClick={() => save({ tone: "adult" })}>
                  Adult (explicit)
                </button>
              </div>
              <span className="help">
                Adult swaps every clue, motive, secret and briefing for a version with cussing and crude humor. Locks when the game starts.
              </span>
            </div>

            <div className="setting">
              <span className="lab" id="lab-pacing">
                Pacing
              </span>
              <div className="seg" role="group" aria-labelledby="lab-pacing">
                <button
                  type="button"
                  aria-pressed={game.pacing.mode === "ready"}
                  onClick={() => save({ pacing: { mode: "ready", roundMinutes: game.pacing.roundMinutes } })}
                >
                  Players tap ready
                </button>
                <button
                  type="button"
                  aria-pressed={game.pacing.mode === "timer"}
                  onClick={() => save({ pacing: { mode: "timer", roundMinutes: game.pacing.roundMinutes } })}
                >
                  Round timer
                </button>
              </div>
              {game.pacing.mode === "timer" ? (
                <label className="help inline-num" htmlFor="set-minutes">
                  Each round lasts
                  <input
                    id="set-minutes"
                    type="number"
                    min={3}
                    max={60}
                    defaultValue={game.pacing.roundMinutes}
                    onBlur={(e) => {
                      const n = Math.round(Number(e.target.value));
                      if (n >= 3 && n <= 60 && n !== game.pacing.roundMinutes) save({ pacing: { mode: "timer", roundMinutes: n } });
                    }}
                  />
                  minutes.
                </label>
              ) : (
                <span className="help">Evidence drops once most guests tap "Ready" on their phones. No clock.</span>
              )}
            </div>

            <Toggle
              id="set-optin"
              checked={game.killerOptIn}
              onChange={(v) => save({ killerOptIn: v })}
              label="Ask guests if they're up for being the killer"
              help="Off means anyone who checks in can be drawn. On, the draw uses only those who opted in, unless fewer than 3 did."
            />

            <Toggle
              id="set-open"
              checked={game.registrationOpen}
              onChange={(v) => save({ registrationOpen: v })}
              label="Accepting sign-ups"
              help="Turn off to close the guest list early."
            />

            <div className="setting">
              <label className="lab" htmlFor="set-deadline">
                Sign-ups close at the end of
              </label>
              <input
                type="date"
                id="set-deadline"
                className="date"
                value={dayValue(game.registrationClosesAt)}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const t = endOfDayChicago(e.target.value);
                  save({ registrationClosesAt: t, deadlineLabel: dayLabel(t) });
                }}
              />
              <span className="help">Guests see "{game.deadlineLabel}". Closes at 11:59 PM Central.</span>
            </div>

            <div className="setting">
              <span className="lab">Rooms in play</span>
              <ul className="rooms">
                {game.rooms.map((r) => (
                  <li key={r.key}>
                    <span>{r.label}</span>
                    <span className="help">
                      {r.houseName}
                      {r.key === game.bodyRoomKey ? " · body found here" : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <span className="help">Editing rooms and round pacing arrives with the full game menu.</span>
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}
