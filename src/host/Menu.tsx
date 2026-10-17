import { useEffect, useRef, useState, type ReactNode } from "react";
import { useConvex, useMutation } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MAX_CARDS, estimateMinutes } from "../../convex/shared";
import { RECOMMENDED, dealCards, setupFor } from "../../convex/engine/setup";
import { friendlyError } from "../lib/errors";
import { Swap } from "../lib/Swap";
import { TZ, initials, useConfirm, type Roster } from "./common";
import { downloadCardsPdf } from "./printCards";
import { weaponUrl } from "../lib/weapon";
import { faceUrl } from "../lib/figure";
import { NarratorSection, RollCallSection } from "./Voice";

export type SettingsPatch = Omit<FunctionArgs<typeof api.host.updateSettings>, "slug" | "hostKey">;

const MIN_ROOMS = 2;
const MAX_ROOMS = 8;
const MAX_MARKERS = MAX_CARDS;

function endOfDayChicago(day: string): number {
  const hourIn = (t: number) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(t);
  for (const off of ["-05:00", "-06:00"]) {
    const t = Date.parse(`${day}T23:59:59${off}`);
    if (hourIn(t) === "23") return t;
  }
  return Date.parse(`${day}T23:59:59-06:00`);
}
const dayLabel = (t: number) => new Date(t).toLocaleDateString("en-US", { timeZone: TZ, weekday: "short", month: "short", day: "numeric" });
const dayValue = (t: number) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(t);
const when = (t: number) => new Date(t).toLocaleString("en-US", { timeZone: TZ, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Equal-width options: picking one never moves anything. */
export function Seg<T extends string>(props: { value: T; options: [T, string][]; onPick: (v: T) => void; disabled?: boolean; label: string }) {
  return (
    <div className="hx-seg" role="group" aria-label={props.label}>
      {props.options.map(([val, text]) => (
        <button key={val} type="button" aria-pressed={props.value === val} disabled={props.disabled} onClick={() => props.value !== val && props.onPick(val)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export function Toggle(props: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; help: string; disabled?: boolean }) {
  return (
    <label className="toggle" htmlFor={props.id}>
      <input type="checkbox" id={props.id} checked={props.checked} disabled={props.disabled} onChange={(e) => props.onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
      <span>
        <strong>{props.label}</strong>
        <span>{props.help}</span>
      </span>
    </label>
  );
}

export function Sec(props: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`hx-sec ${props.className ?? ""}`}>
      <h3>{props.title}</h3>
      {props.children}
    </section>
  );
}

export default function Menu(props: { data: Roster; slug: string; hostKey: string; save: (p: SettingsPatch) => Promise<void>; onError: (m: string | null) => void }) {
  const { data, slug, hostKey, save, onError } = props;
  const { game } = data;
  const locked = game.status !== "registration" && game.status !== "lobby";
  const timer = game.pacing.mode === "timer";

  return (
    <div className="hx-cols">
      <div className="hx-col">
        <Swap show={locked ? 1 : 0} className="hx-note">
          <span>Spoiler-free: nothing in Options shows roles, guesses or the answer.</span>
          <span>The game is running, so the game settings are locked. Guest Wi-Fi can still be changed.</span>
        </Swap>

        <Sec title="The game">
          <span className="lab">Script</span>
          <Seg label="Script" value={game.tone} options={[["classic", "Classic"], ["adult", "Adult (explicit)"]]} disabled={locked} onPick={(tone) => save({ tone })} />
          {/* Oct 17: the game writes every motive and secret (D9); guests can opt out of being the killer at sign-up (D8). */}
          <span className="help">
            One killer, drawn in secret from everyone checked in, except guests who ticked "I'd rather not be the killer" at sign-up. The game writes everyone's
            motive and secret.
          </span>
        </Sec>

        <Pacing game={game} locked={locked} save={save} timer={timer} />

        <Sec title="Searching">
          <Seg label="Searching" value={game.search} options={[["all", "All rooms open"], ["waves", "Rooms open in waves"]]} disabled={locked} onPick={(search) => save({ search })} />
          <Swap show={game.search === "all" ? 0 : 1}>
            <span className="help">Every marker can be found from Round 1.</span>
            <span className="help">The game opens a few rooms each round, starting with where the body is found. Opened rooms stay open. Good for big groups, so nobody finds everything in Round 1.</span>
          </Swap>
        </Sec>

        <Wifi game={game} save={save} />

        <Sec title="Sign-ups">
          <Toggle id="set-open" checked={game.registrationOpen} disabled={locked} onChange={(v) => save({ registrationOpen: v })} label="Accepting sign-ups" help="Turn off to close the guest list early." />
          <label className="hx-field">
            <span className="lab">Sign-ups close at the end of</span>
            <input
              type="date"
              className="inp date"
              value={dayValue(game.registrationClosesAt)}
              disabled={locked}
              onChange={(e) => {
                if (!e.target.value) return;
                const t = endOfDayChicago(e.target.value);
                void save({ registrationClosesAt: t, deadlineLabel: dayLabel(t) });
              }}
            />
          </label>
          <span className="help">Guests see "{game.deadlineLabel}". Closes at 11:59 PM Central.</span>
          <RegLink game={game} />
        </Sec>
      </div>

      <div className="hx-col">
        <Rooms game={game} markers={data.markers} locked={locked} save={save} />
        <Markers data={data} slug={slug} hostKey={hostKey} locked={locked} onError={onError} />
        <Weapons data={data} locked={locked} save={save} />

        <Sec title="Sound">
          <div className="row">
            <SoundCheck slug={slug} hostKey={hostKey} />
          </div>
          <span className="help">This screen is the TV. Full screen is in the host menu (Menu button, or Esc).</span>
        </Sec>

        <NarratorSection game={game} locked={locked} save={save} />

        <Guests data={data} slug={slug} hostKey={hostKey} locked={locked} onError={onError} />

        <RollCallSection slug={slug} hostKey={hostKey} locked={locked} onError={onError} />
      </div>
    </div>
  );
}

export function SoundCheck({ slug, hostKey }: { slug: string; hostKey: string }) {
  const check = useMutation(api.game.soundCheck);
  return (
    <button type="button" className="btn" onClick={() => void check({ slug, hostKey })}>
      Sound check
    </button>
  );
}

function Pacing({ game, locked, save, timer }: { game: Roster["game"]; locked: boolean; save: (p: SettingsPatch) => Promise<void>; timer: boolean }) {
  const [minutes, setMinutes] = useState(game.pacing.roundMinutes);
  const pending = useRef<number | undefined>(undefined);
  useEffect(() => setMinutes(game.pacing.roundMinutes), [game.pacing.roundMinutes]);
  function step(d: number) {
    const n = Math.max(3, Math.min(60, minutes + d));
    setMinutes(n);
    window.clearTimeout(pending.current);
    pending.current = window.setTimeout(() => void save({ pacing: { mode: game.pacing.mode, roundMinutes: n } }), 450);
  }
  return (
    <Sec title="Pacing">
      <Seg
        label="Pacing"
        value={game.pacing.mode}
        options={[["timer", "Round timer"], ["ready", "Players tap ready"]]}
        disabled={locked}
        onPick={(mode) => save({ pacing: { mode, roundMinutes: minutes } })}
      />
      <div className="hx-kv">
        <span className="lab">Each round</span>
        <Swap show={timer ? 0 : 1}>
          <span className="hx-stepper hx-ctl">
            <button type="button" aria-label="Shorter rounds" disabled={locked || minutes <= 3} onClick={() => step(-1)}>
              −
            </button>
            <b>{minutes} min</b>
            <button type="button" aria-label="Longer rounds" disabled={locked || minutes >= 60} onClick={() => step(1)}>
              +
            </button>
          </span>
          <span className="hx-ctl hx-ctl-note">Until most tap ready</span>
        </Swap>
      </div>
      <div className="hx-kv">
        <span className="lab">Game length</span>
        <span className="hx-est">{estimateMinutes({ mode: game.pacing.mode, roundMinutes: minutes })}</span>
      </div>
      <Swap show={timer ? 0 : 1}>
        <span className="help">3 rounds, plus the intro, accusations, reveal and awards. Accusations get 5 minutes at most.</span>
        <span className="help">Each round ends once most guests tap ready. You can always move it on from the host menu.</span>
      </Swap>
    </Sec>
  );
}

function Wifi({ game, save }: { game: Roster["game"]; save: (p: SettingsPatch) => Promise<void> }) {
  const [name, setName] = useState(game.wifi.name);
  const [password, setPassword] = useState(game.wifi.password);
  const [status, setStatus] = useState<"" | "saving" | "saved">("");
  useEffect(() => {
    setName(game.wifi.name);
    setPassword(game.wifi.password);
  }, [game.wifi.name, game.wifi.password]);
  async function commit() {
    if (name === game.wifi.name && password === game.wifi.password) return;
    setStatus("saving");
    await save({ wifi: { name, password } });
    setStatus("saved");
  }
  return (
    <Sec title="Guest Wi-Fi">
      <div className="hx-fields">
        <label className="hx-field">
          <span className="lab">Network</span>
          <input className="inp" value={name} maxLength={32} autoComplete="off" onChange={(e) => setName(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
        </label>
        <label className="hx-field">
          <span className="lab">Password</span>
          <input className="inp" value={password} maxLength={63} autoComplete="off" onChange={(e) => setPassword(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && commit()} />
        </label>
      </div>
      <span className="help">Shown on the TV with a scan-to-join code, and on every guest's phone. Leave blank to hide it.</span>
      <span className="hx-status">{status === "saving" ? "Saving…" : status === "saved" ? "Saved" : " "}</span>
    </Sec>
  );
}

type RoomRow = { key: string; label: string; houseName: string };

function Rooms({ game, markers, locked, save }: { game: Roster["game"]; markers: Roster["markers"]; locked: boolean; save: (p: SettingsPatch) => Promise<void> }) {
  const [rows, setRows] = useState<RoomRow[]>(game.rooms);
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState(" ");
  const pending = useRef<number | undefined>(undefined);
  const list = useRef<HTMLDivElement>(null);
  const focusLast = useRef(false);
  const serverRooms = JSON.stringify(game.rooms);
  useEffect(() => {
    if (!dirty) setRows(game.rooms);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverRooms]);
  useEffect(() => {
    if (focusLast.current) {
      focusLast.current = false;
      list.current?.querySelector<HTMLInputElement>(".r:last-child input")?.focus();
    }
  }, [rows.length]);

  function problem(rs: RoomRow[]): string | null {
    if (rs.some((r) => !r.label.trim())) return "Name every room to save.";
    const names = rs.map((r) => r.label.trim().toLowerCase());
    if (new Set(names).size !== names.length) return "Two rooms have the same name.";
    return null;
  }
  function change(next: RoomRow[], now = false) {
    setRows(next);
    setDirty(true);
    window.clearTimeout(pending.current);
    const p = problem(next);
    if (p) {
      setStatus(p);
      return;
    }
    setStatus("Saving…");
    pending.current = window.setTimeout(
      async () => {
        await save({ rooms: next });
        setDirty(false);
        setStatus("Saved");
      },
      now ? 0 : 600,
    );
  }
  const newKey = () => `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
  const inRoom = (key: string) => markers.filter((m) => m.roomKey === key).length;

  return (
    <Sec title={<>Rooms in play · {rows.length}</>}>
      <div className="hx-rooms" ref={list}>
        <div className="r head">
          <span>Name in the game</span>
          <span>Room in your house</span>
          <span />
        </div>
        {rows.map((r, i) => (
          <div className="r" key={r.key}>
            <input
              className="inp"
              value={r.label}
              placeholder="The …"
              maxLength={40}
              disabled={locked}
              aria-label={`Room ${i + 1}: name in the game`}
              onChange={(e) => change(rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
            />
            <input
              className="inp"
              value={r.houseName}
              placeholder="Which room?"
              maxLength={40}
              disabled={locked}
              aria-label={`Room ${i + 1}: room in your house`}
              onChange={(e) => change(rows.map((x, j) => (j === i ? { ...x, houseName: e.target.value } : x)))}
            />
            <button
              type="button"
              className="hx-x"
              disabled={locked || rows.length <= MIN_ROOMS}
              aria-label={`Remove room ${i + 1}`}
              title={inRoom(r.key) ? `${inRoom(r.key)} marker(s) here will need a new room` : "Remove this room"}
              onClick={() => change(rows.filter((_, j) => j !== i), true)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="row">
        <button
          type="button"
          className="btn"
          disabled={locked || rows.length >= MAX_ROOMS}
          onClick={() => {
            focusLast.current = true;
            change([...rows, { key: newKey(), label: "", houseName: "" }]);
          }}
        >
          + Add a room
        </button>
      </div>
      <span className="help">
        {MIN_ROOMS} to {MAX_ROOMS} rooms. Where the body turns up is drawn when the game starts.
      </span>
      <span className={`hx-status ${status.startsWith("Name") || status.startsWith("Two") ? "warn" : ""}`}>{status}</span>
    </Sec>
  );
}

function Markers({ data, slug, hostKey, locked, onError }: { data: Roster; slug: string; hostKey: string; locked: boolean; onError: (m: string | null) => void }) {
  const saveMarkers = useMutation(api.game.saveMarkers);
  const [list, setList] = useState(data.markers);
  const server = JSON.stringify(data.markers);
  useEffect(() => setList(data.markers), [server]); // eslint-disable-line react-hooks/exhaustive-deps
  const rooms = data.game.rooms;
  async function commit(next: typeof list) {
    setList(next);
    onError(null);
    try {
      await saveMarkers({ slug, hostKey, markers: next });
    } catch (err) {
      onError(friendlyError(err));
      setList(data.markers);
    }
  }
  const placed = list.filter((m) => m.roomKey && rooms.some((r) => r.key === m.roomKey)).length;
  // Oct 16: the recommended cards for this many sign-ups, dealt round the rooms (the ledger below).
  const guests = data.counts.total;
  const rec = setupFor(guests);
  const recPlan = dealCards(rec.markers, rooms);
  const isRec = JSON.stringify(list.map((m) => [m.number, m.roomKey])) === JSON.stringify(recPlan.map((m) => [m.number, m.roomKey]));
  return (
    <Sec title={<>Evidence markers · {list.length}</>}>
      <div className="hx-kv">
        <span className="lab">How many</span>
        <span className="hx-stepper hx-ctl">
          <button type="button" aria-label="One fewer marker" disabled={locked || !list.length} onClick={() => commit(list.slice(0, -1))}>
            −
          </button>
          <b>{list.length}</b>
          <button
            type="button"
            aria-label="One more marker"
            disabled={locked || list.length >= MAX_MARKERS}
            onClick={() => commit([...list, { number: (list[list.length - 1]?.number ?? 0) + 1, roomKey: "" }])}
          >
            +
          </button>
        </span>
      </div>
      {list.length > 0 && (
        <div className="hx-markers">
          {list.map((m) => {
            const ok = !!m.roomKey && rooms.some((r) => r.key === m.roomKey);
            return (
              <label key={m.number} className={ok ? "" : "none"}>
                <b>{m.number}</b>
                <select
                  value={ok ? m.roomKey : ""}
                  disabled={locked}
                  aria-label={`Marker ${m.number} room`}
                  onChange={(e) => commit(list.map((x) => (x.number === m.number ? { ...x, roomKey: e.target.value } : x)))}
                >
                  <option value="">No room</option>
                  {rooms.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label.replace(/^The /, "")}
                    </option>
                  ))}
                </select>
              </label>
            );
          })}
        </div>
      )}
      <div className="row">
        <PrintCards slug={slug} hostKey={hostKey} title={data.game.title} onError={onError} />
        <button type="button" className="btn" disabled={locked || isRec || !rooms.length} onClick={() => commit(recPlan)}>
          Use the recommended {rec.markers}, dealt round the rooms
        </button>
      </div>
      <Ledger guests={guests} rooms={rooms.length} cards={list.length} />
      <span className="help">
        The PDF has all {MAX_CARDS} cards, the same every game. This game uses cards 1 to {list.length || "N"}; the rest stay in the box and get no clue.
        Place them, then pick each marker's room here. Clues are written at the draw. No markers set when you press Play: the game deals the recommended ones.
      </span>
      <span className={`hx-status ${placed < list.length ? "warn" : ""}`}>{list.length ? `${placed} of ${list.length} markers have a room` : "No markers: Round 1 evidence goes on the TV instead."}</span>
    </Sec>
  );
}

/**
 * The night's weapons (Oct 16, Heston: "We should get rid of players picking weapons at sign up"): the game draws
 * them at Play unless the host picks them here. Tap a weapon to add or drop it; draw a set to start from.
 */
function Weapons({ data, locked, save }: { data: Roster; locked: boolean; save: (p: SettingsPatch) => Promise<void> }) {
  const picked = data.game.weapons;
  const rec = data.weaponsRecommended;
  const toggle = (k: string) => void save({ weapons: picked.includes(k) ? picked.filter((x) => x !== k) : [...picked, k] });
  return (
    <Sec title={<>Weapons · {picked.length ? picked.length : `${rec}, drawn at Play`}</>}>
      <div className="hx-weapons" role="group" aria-label="Weapons in play">
        {data.weaponPool.map((w) => (
          <button key={w.key} type="button" className={picked.includes(w.key) ? "on" : ""} aria-pressed={picked.includes(w.key)} disabled={locked} onClick={() => toggle(w.key)}>
            <img src={weaponUrl(w.key)} alt="" />
            <span>{w.name}</span>
          </button>
        ))}
      </div>
      <div className="row">
        <button type="button" className="btn" disabled={locked} onClick={() => void save({ drawWeapons: rec })}>
          {picked.length ? `Draw a new ${rec}` : `Draw ${rec} now`}
        </button>
        {picked.length > 0 && (
          <button type="button" className="btn" disabled={locked} onClick={() => void save({ weapons: [] })}>
            Clear (the game draws them at Play)
          </button>
        )}
      </div>
      <span className={`hx-status ${picked.length && picked.length < 3 ? "warn" : ""}`}>
        {picked.length === 0
          ? `None picked: the game draws ${rec} when you press Play.`
          : picked.length < 3
            ? `${picked.length} picked. Pick at least 3.`
            : `${picked.length} weapons in play.`}
      </span>
      <span className="help">Everyone sees the weapons in play. They belong to nobody, so no guest is tied to one.</span>
    </Sec>
  );
}

/**
 * Recommended setups (Oct 16, Heston: "put a small ledger for recommended setups for different arrangements of rooms
 * to evidence ratio for playability and difficulty"). From the simulations: how hard the case is barely moves with
 * rooms or cards; rooms change how many are still possible going into Round 3, and cards how many searches come up
 * empty.
 */
function Ledger({ guests, rooms, cards }: { guests: number; rooms: number; cards: number }) {
  const row = RECOMMENDED.find((r) => guests <= r.guests[1]) ?? RECOMMENDED[RECOMMENDED.length - 1];
  return (
    <div className="hx-ledger">
      <span className="lab">Recommended setups</span>
      <table>
        <thead>
          <tr>
            <th>Guests</th>
            <th>Rooms</th>
            <th>Cards</th>
            <th>Per room</th>
            <th>Weapons</th>
          </tr>
        </thead>
        <tbody>
          {RECOMMENDED.map((r) => (
            <tr key={r.guests[0]} className={r === row ? "on" : ""}>
              <td>
                {r.guests[0]}–{r.guests[1]}
              </td>
              <td>{r.rooms}</td>
              <td>{r.markers}</td>
              <td>{Math.round((r.markers / r.rooms) * 10) / 10}</td>
              <td>{r.weapons}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <span className="help">
        Tonight: {guests} sign-up{guests === 1 ? "" : "s"}, {rooms} rooms, {cards} cards. Fewer rooms make the room easier to work out; each room past 6 leaves one more room in doubt going into
        Round 3. About one card per guest is right: more cards just means more of them are dead ends, far fewer puts the evidence on the TV instead of in the house.
      </span>
    </div>
  );
}

function PrintCards({ slug, hostKey, title, onError }: { slug: string; hostKey: string; title: string; onError: (m: string | null) => void }) {
  const convex = useConvex();
  const ensure = useMutation(api.host.ensureCards);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    onError(null);
    try {
      await ensure({ slug, hostKey });
      const sheet = await convex.query(api.host.markerCards, { slug, hostKey });
      await downloadCardsPdf(sheet.cards, window.location.origin, title);
    } catch (err) {
      onError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" className="btn" disabled={busy} onClick={go}>
      <Swap show={busy ? 1 : 0}>
        <span>Print QR cards (PDF)</span>
        <span>Making the PDF…</span>
      </Swap>
    </button>
  );
}

function Guests({ data, slug, hostKey, locked, onError }: { data: Roster; slug: string; hostKey: string; locked: boolean; onError: (m: string | null) => void }) {
  const removePlayer = useMutation(api.host.removePlayer);
  const { armed, arm, disarm } = useConfirm();
  async function remove(id: Id<"players">) {
    if (armed !== id) return arm(id);
    disarm();
    try {
      await removePlayer({ slug, hostKey, playerId: id });
    } catch (err) {
      onError(friendlyError(err));
    }
  }
  return (
    <Sec title={<>Guest list · {data.players.length} signed up</>}>
      {data.players.length === 0 ? (
        <p className="help">Nobody yet. Text the sign-up link, or sign yourself up first.</p>
      ) : (
        <ul className="hx-roster">
          {data.players.map((p) => (
            <li key={p.id}>
              <div className="card-ph sm">{p.figure ? <img src={faceUrl(p.figure)} alt="" /> : initials(p.charName)}</div>
              <div className="main">
                <div className="nm">{p.charName}</div>
                <div className="sub">
                  {p.realName} · signed up {when(p.registeredAt)}
                </div>
              </div>
              <button type="button" className={armed === p.id ? "copy danger" : "copy"} disabled={locked} onClick={() => remove(p.id)}>
                <Swap show={armed === p.id ? 1 : 0}>
                  <span>Remove</span>
                  <span>Tap again</span>
                </Swap>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sec>
  );
}

function RegLink({ game }: { game: Roster["game"] }) {
  const [copied, setCopied] = useState(false);
  // Every game has its own sign-up link (Oct 16, anyone can host); the main page has no game of its own.
  const link = `${window.location.origin}/?game=${encodeURIComponent(game.slug)}`;
  return (
    <div className="hx-link">
      <span className="lab">Sign-up link to text guests</span>
      <div className="key-row">
        <code>{link.replace(/^https?:\/\//, "")}</code>
        <button
          type="button"
          className="copy"
          onClick={() =>
            navigator.clipboard?.writeText(link).then(
              () => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
              },
              () => undefined,
            )
          }
        >
          <Swap show={copied ? 1 : 0}>
            <span>Copy</span>
            <span>Copied</span>
          </Swap>
        </button>
      </div>
    </div>
  );
}
