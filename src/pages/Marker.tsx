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

  // F11 (Oct 17): a phone's camera app can open this page outside the guest's own page (iPhones keep them apart), so
  // it shows the card's code to type into Scan, and a way in with the room code.
  if (!token) {
    return (
      <Shell>
        <div className="screen center">
          <span className="eyebrow">Evidence card</span>
          <Deco />
          <h1 className="title-lg">Who's asking?</h1>
          <p className="lede">This phone isn't in the game here yet. Open your Velvet Room page, tap Scan, and type this card's code:</p>
          <code className="card-code">{code.toUpperCase()}</code>
          <div className="actions wide">
            <button type="button" className="primary" onClick={() => navigate("/join")}>
              Join with the room code
            </button>
          </div>
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
              Card {clue.number} · {clue.room}
            </span>
            <div className="clue">
              <span className="no">Evidence card no. {clue.number}</span>
              <p>{clue.text}</p>
            </div>
            <p className="help">Saved to your evidence. Anyone who finds this card reads the same thing.</p>
          </>
        ) : error ? (
          <>
            <span className="eyebrow">Evidence card</span>
            <div className="errbox">{error}</div>
            <p className="help">Or open your own Velvet Room page, tap Scan and type the code: <b>{code.toUpperCase()}</b></p>
          </>
        ) : (
          <p className="lede">Reading the card…</p>
        )}
        <button type="button" className="primary" onClick={() => navigate(`/p/${token}`)}>
          Back to my case
        </button>
      </div>
    </Shell>
  );
}
