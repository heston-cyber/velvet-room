import { useEffect, useRef, useState, type ReactNode } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import type { FunctionArgs } from "convex/server";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { MAX_CARDS, estimateMinutes, roundMinutesFor } from "../../convex/shared";
import { RECOMMENDED, dealCards, setupFor } from "../../convex/engine/setup";
import { friendlyError } from "../lib/errors";
import { Swap } from "../lib/Swap";
import { TZ, initials, useConfirm, type Roster } from "./common";
import { downloadCardsPdf } from "./printCards";
import { weaponUrl } from "../lib/weapon";
import { faceUrl } from "../lib/figure";
import { NarratorSection, VOICE_STATUS, hear } from "./Voice";

export type SettingsPatch = Omit<FunctionArgs<typeof api.host.updateSettings>, "slug" | "hostKey">;

const MIN_ROOMS = 2;
const MAX_ROOMS = 8;
const MAX_MARKERS = MAX_CARDS;

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
          {/* S6 (Oct 17): the script is picked with the narrator (Narrator and script). */}
          {/* Oct 17: the game writes every motive (D9); guests can opt out of being the killer at sign-up (D8). Oct 18: no secrets. */}
          <span className="help">
            One killer, drawn in secret from everyone checked in, except guests who ticked "I'd rather not be the killer" at sign-up. The game writes everyone's
            motive, and the roll call reads them out.
          </span>
        </Sec>

        <Pacing game={game} locked={locked} save={save} timer={timer} />

        {/* Oct 18 (Heston: "get rid of the "all rooms open" option. it should always be a room waves"). */}
        <Sec title="Searching">
          <span className="help">Rooms open a few at a time: where the body is found first, more each round, every room by Round 3. Opened rooms stay open.</span>
        </Sec>

        <Wifi game={game} save={save} />

        {/* S1 (Oct 17): sign-ups are open until the doors open on party night; after that, walk-ins join with the room code. */}
        <Sec title="Sign-ups">
          <span className="help">Open until you press Play on party night. After that, new guests join with the room code on the TV.</span>
          <RegLink game={game} />
          <HostLink slug={slug} hostKey={hostKey} />
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

        {/* S5 (Oct 17): one guest list, with each guest's roll-call line and voice. */}
        <Guests data={data} slug={slug} hostKey={hostKey} locked={locked} onError={onError} />
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
        <span className="help">3 rounds (Round 3 is a little shorter: {roundMinutesFor(minutes, 3)} min), plus the intro, the lock-in, the reveal and the awards. The lock-in gets 5 minutes at most.</span>
        <span className="help">Each round ends once most guests tap ready. The lock-in still has a 5-minute clock. You can always move on from the host menu.</span>
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
              title={inRoom(r.key) ? `${inRoom(r.key)} card(s) here will need a new room` : "Remove this room"}
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
  // S4 (Oct 17): one line and the PDF; placing cards by hand and the setups table are under Advanced.
  const auto = !list.length || isRec;
  return (
    <Sec title={<>Evidence cards · {list.length || rec.markers}</>}>
      <div className="row">
        <span className="hx-oneline">
          {list.length ? `${list.length} cards${isRec ? ", dealt round the rooms" : ""}` : `${rec.markers} cards, dealt automatically when the doors open`}
        </span>
        <PrintCards slug={slug} hostKey={hostKey} title={data.game.title} onError={onError} />
      </div>
      <span className="help">Print the PDF (cards 1 to {list.length || rec.markers}), hide them around the house, and you're set. Play asks if they're hidden.</span>
      <details className="hx-advanced" open={!auto}>
        <summary>Advanced: how many, and which room each card is in</summary>
        <div className="hx-kv">
          <span className="lab">How many</span>
          <span className="hx-stepper hx-ctl">
            <button type="button" aria-label="One fewer card" disabled={locked || !list.length} onClick={() => commit(list.slice(0, -1))}>
              −
            </button>
            <b>{list.length}</b>
            <button
              type="button"
              aria-label="One more card"
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
                    aria-label={`Card ${m.number} room`}
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
          <button type="button" className="btn" disabled={locked || isRec || !rooms.length} onClick={() => commit(recPlan)}>
            Use the recommended {rec.markers}, dealt round the rooms
          </button>
        </div>
        <Ledger guests={guests} rooms={rooms.length} cards={list.length} />
        <span className="help">
          The PDF has all {MAX_CARDS} cards, the same every game; this game uses cards 1 to {list.length || "N"} and the rest get no clue. Clues are written at Play. A
          card with no room is dealt to a room at Play.
        </span>
        <span className={`hx-status ${placed < list.length ? "warn" : ""}`}>
          {list.length ? `${placed} of ${list.length} cards have a room${placed < list.length ? " (the rest are dealt at Play)" : ""}` : "No cards yet: the recommended ones are dealt when the doors open."}
        </span>
      </details>
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
  const setHere = useMutation(api.host.setHere);
  const { armed, arm, disarm } = useConfirm();
  const doors = data.game.status === "lobby";
  const here = (id: Id<"players">, v: boolean) => setHere({ slug, hostKey, playerId: id, here: v }).catch((err) => onError(friendlyError(err)));
  const sheet = useQuery(api.voice.rollCallSheet, { slug, hostKey });
  const roll = new Map((sheet?.guests ?? []).map((g) => [g.id as string, g]));
  const c = sheet?.counts;
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
      <span className="help">After How to play, the narrator introduces every guest on the TV by name and nickname. Their voices record when the game starts.</span>
      {sheet?.started && c && (
        <span className={`hx-status ${c.failed ? "warn" : ""}`}>
          {c.ready} of {c.total} roll-call voices recorded{c.pending ? ` · ${c.pending} recording` : ""}
          {c.failed ? ` · ${c.failed} failed (those guests show without a voice)` : ""}
        </span>
      )}
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
                  {p.realName} · {doors ? (p.checkedIn ? "here" : "not here yet") : `signed up ${when(p.registeredAt)}`}
                </div>
                {roll.get(p.id) && (
                  <div className="sub roll">
                    “{roll.get(p.id)!.line}” · {VOICE_STATUS[roll.get(p.id)!.voice] ?? roll.get(p.id)!.voice}
                    {roll.get(p.id)!.clipUrl && (
                      <button type="button" className="linkish" onClick={() => hear(roll.get(p.id)!.clipUrl!)}>
                        Play
                      </button>
                    )}
                  </div>
                )}
              </div>
              {/* F4 (Oct 17): a guest whose phone checked in from home can be marked not here before the draw. */}
              {doors && (
                <button type="button" className="copy" onClick={() => void here(p.id, !p.checkedIn)}>
                  {p.checkedIn ? "Not here" : "Here"}
                </button>
              )}
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

/** F2 (Oct 17): the way back in if this laptop forgets the game. Copied, never shown: this screen is the TV. */
function HostLink({ slug, hostKey }: { slug: string; hostKey: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/host?game=${encodeURIComponent(slug)}&key=${encodeURIComponent(hostKey)}`;
  return (
    <div className="hx-link">
      <span className="lab">Your host link</span>
      <div className="key-row">
        <code>Hidden: this screen is on the TV</code>
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
      <span className="help">Paste it somewhere only you can see. It gets you back into this game from any laptop. Anyone who has it can run the game.</span>
    </div>
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
