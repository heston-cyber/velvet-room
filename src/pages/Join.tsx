// Join with the room code, Jackbox style: type the four letters on the TV, tap your own name.
// Each name can be claimed once, and the TV announces every claim.
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import Shell from "../components/Shell";
import { Deco, initials } from "../components/MemberCard";
import { friendlyError } from "../lib/errors";
import { navigate } from "../lib/router";
import { saveToken, savedToken } from "../lib/storage";
import { avatarSrc } from "../lib/figure";

const LEN = 4;
const clean = (s: string) => s.toUpperCase().replace(/[^A-Z]/g, "").slice(0, LEN);

type Guest = { id: Id<"players">; charName: string; firstName: string; photoUrl: string | null; figure: string | null; taken: boolean };

export default function Join({ initialCode }: { initialCode: string }) {
  const [typed, setTyped] = useState(clean(initialCode));
  const code = typed.length === LEN ? typed : "";
  const room = useQuery(api.join.room, code ? { code } : "skip");
  const claim = useMutation(api.join.claim);
  const [pick, setPick] = useState<Guest | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function setCode(v: string) {
    const c = clean(v);
    setTyped(c);
    setPick(null);
    setErr("");
    // Keep the code in the address so a reload lands back here.
    try {
      window.history.replaceState(null, "", c.length === LEN ? `/join?code=${c}` : "/join");
    } catch {
      /* ignore */
    }
  }

  async function confirm() {
    if (!pick || !code) return;
    setBusy(true);
    setErr("");
    try {
      const { token, slug } = await claim({ code, playerId: pick.id });
      saveToken(slug, token);
      navigate(`/p/${token}`);
    } catch (e) {
      setErr(friendlyError(e));
      setBusy(false);
    }
  }

  const codeField = (
    <div className="field join-field">
      <label htmlFor="roomcode">Room code</label>
      <input
        id="roomcode"
        type="text"
        className="join-code"
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={LEN + 2}
        placeholder="ABCD"
        value={typed}
        onChange={(e) => setCode(e.target.value)}
      />
    </div>
  );

  // 1. No code yet, or the code didn't match.
  if (!code || room === undefined || room.ok === false) {
    return (
      <Shell>
        <div className="screen center join">
          <span className="eyebrow">The Velvet Room</span>
          <Deco />
          <h1 className="title-lg">Join the party</h1>
          <p className="lede">Type the four letters on the TV.</p>
          {codeField}
          {code && room === undefined && <p className="help">Checking the code…</p>}
          {code && room && room.ok === false && <p className="err" role="alert">{room.reason}</p>}
          <p className="help">Already have your personal link? Open that instead. It works the same.</p>
        </div>
      </Shell>
    );
  }

  const saved = savedToken(room.slug);

  // 3. Confirm the name.
  if (pick) {
    return (
      <Shell>
        <div className="screen center join">
          {room.isTest && <div className="testflag">Test game · not the real party</div>}
          <span className="eyebrow">Is this you?</span>
          <span className="av big">{avatarSrc(pick.photoUrl, pick.figure) ? <img src={avatarSrc(pick.photoUrl, pick.figure)!} alt="" /> : initials(pick.charName)}</span>
          <h1 className="title-lg">{pick.charName}</h1>
          {pick.firstName && <p className="lede">Signed up by {pick.firstName}</p>}
          <p className="help">Only pick your own name. The TV will announce it, and each name can only join once.</p>
          {err && <p className="errbox" role="alert">{err}</p>}
          <div className="actions wide">
            <button type="button" className="primary" disabled={busy} onClick={() => void confirm()}>
              {busy ? "Joining…" : "Yes, that's me"}
            </button>
            <button type="button" className="back center-text" disabled={busy} onClick={() => { setPick(null); setErr(""); }}>
              Not me, go back
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // 2. Pick your name.
  return (
    <Shell>
      <div className="screen join">
        {room.isTest && <div className="testflag">Test game · not the real party</div>}
        <span className="eyebrow">Room {code}</span>
        <h1 className="title-lg">Tap your name</h1>
        {saved && (
          <div className="sealed">
            <p className="help">This phone already holds a card for tonight.</p>
            <button type="button" className="primary" onClick={() => navigate(`/p/${saved}`)}>
              Open my card
            </button>
          </div>
        )}
        <ul className="guests join-list">
          {room.guests.map((g) => (
            <li key={g.id} className={g.taken ? "away" : ""}>
              <button type="button" disabled={g.taken} onClick={() => setPick(g)} aria-label={g.taken ? `${g.charName}, taken` : `Join as ${g.charName}`}>
                <span className="av">{avatarSrc(g.photoUrl, g.figure) ? <img src={avatarSrc(g.photoUrl, g.figure)!} alt="" /> : initials(g.charName)}</span>
                <span className="nm">{g.charName}</span>
                <span className="small">{g.taken ? "Taken" : g.firstName}</span>
              </button>
            </li>
          ))}
        </ul>
        <p className="help">Faded names already have a phone. If one of them is yours, ask the host to free it.</p>
        <button type="button" className="back" onClick={() => setCode("")}>
          Wrong room? Change the code
        </button>
      </div>
    </Shell>
  );
}
