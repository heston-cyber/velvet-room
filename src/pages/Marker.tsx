import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import Shell from "../components/Shell";
import { Deco } from "../components/MemberCard";
import { friendlyError } from "../lib/errors";
import { lastToken } from "../lib/storage";
import { navigate } from "../lib/router";

/** What a marker's QR card opens: reads the clue for this phone's guest and saves it. */
export default function Marker({ code }: { code: string }) {
  const scan = useMutation(api.game.scanMarker);
  const token = lastToken();
  const [clue, setClue] = useState<{ number: number; room: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const once = useRef(false);

  useEffect(() => {
    if (!token || once.current) return;
    once.current = true;
    scan({ token, code }).then(setClue, (e) => setError(friendlyError(e)));
  }, [token, code, scan]);

  if (!token) {
    return (
      <Shell>
        <div className="screen center">
          <span className="eyebrow">Evidence marker</span>
          <Deco />
          <h1 className="title-lg">Who's asking?</h1>
          <p className="lede">Open your personal Velvet Room link on this phone first, then scan the marker again.</p>
        </div>
      </Shell>
    );
  }
  return (
    <Shell>
      <div className="screen">
        {clue ? (
          <>
            <span className="eyebrow">
              Marker {clue.number} · {clue.room}
            </span>
            <div className="clue">
              <span className="no">Evidence marker no. {clue.number}</span>
              <p>{clue.text}</p>
            </div>
            <p className="help">Saved to your evidence. Anyone who finds this marker reads the same thing.</p>
          </>
        ) : error ? (
          <>
            <span className="eyebrow">Evidence marker</span>
            <div className="errbox">{error}</div>
          </>
        ) : (
          <p className="lede">Reading the marker…</p>
        )}
        <button type="button" className="primary" onClick={() => navigate(`/p/${token}`)}>
          Back to my case
        </button>
      </div>
    </Shell>
  );
}
