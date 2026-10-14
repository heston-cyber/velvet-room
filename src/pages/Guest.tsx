import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import ProfileForm from "../components/ProfileForm";
import MemberCard, { Deco } from "../components/MemberCard";
import Shell, { Loading } from "../components/Shell";
import { saveToken } from "../lib/storage";

export default function Guest({ token }: { token: string }) {
  const me = useQuery(api.registration.me, { token });
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState<"" | "Copied" | "Selected">("");

  useEffect(() => {
    if (me) saveToken(me.game.slug, token);
  }, [me, token]);

  if (me === undefined) return <Loading />;
  if (me === null) {
    return (
      <Shell>
        <div className="screen center">
          <span className="eyebrow">The Velvet Room</span>
          <Deco />
          <h1 className="title-lg">This link doesn't match a guest</h1>
          <p className="lede">Check the link you saved, or ask your host to resend it.</p>
        </div>
      </Shell>
    );
  }

  if (editing) {
    return (
      <Shell>
        <ProfileForm
          game={me.game}
          mode="edit"
          token={token}
          initial={{
            realName: me.realName,
            charName: me.charName,
            who: me.who,
            signature: me.signature,
            motive: me.motive,
            secret: me.secret,
            weapon: me.weapon,
            weaponDesc: me.weaponDesc,
            killerOk: me.killerOk,
          }}
          initialPhotoUrl={me.photoUrl}
          onDone={() => setEditing(false)}
          onCancel={() => setEditing(false)}
        />
      </Shell>
    );
  }

  const link = `${window.location.origin}/p/${token}`;
  const shown = link.replace(/^https?:\/\//, "");
  const first = me.charName.replace(/[“”"][^“”"]*[“”"]/g, "").trim().split(/\s+/)[0] || me.charName;

  function copy() {
    const fallback = () => {
      const el = document.getElementById("keylink");
      if (!el) return;
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      setCopied("Selected");
    };
    try {
      navigator.clipboard.writeText(link).then(() => setCopied("Copied"), fallback);
    } catch {
      fallback();
    }
    window.setTimeout(() => setCopied(""), 2000);
  }

  return (
    <Shell>
      <div className="screen">
        {me.game.isTest && <div className="testflag">Test game · not the real party</div>}
        <span className="eyebrow">You're on the list</span>
        <h1 className="title-lg">See you inside, {first}.</h1>
        <MemberCard charName={me.charName} who={me.who} signature={me.signature} photoUrl={me.photoUrl} />
        <div className="key">
          <span className="eyebrow">Your key for party night</span>
          <code id="keylink">{shown}</code>
          <div className="key-row">
            <button type="button" className="copy" onClick={copy}>
              {copied || "Copy link"}
            </button>
            <a className="copy" href={`sms:?&body=${encodeURIComponent(`My Velvet Room link: ${link}`)}`}>
              Text it to me
            </a>
          </div>
          <span className="help">
            Bookmark this page or add it to your Home Screen. It's how you get back in on party night.
          </span>
        </div>
        {me.game.open ? (
          <>
            <p className="help">Want to change something? You can edit until {me.game.deadlineLabel}.</p>
            <div className="actions">
              <button type="button" className="ghost-btn" onClick={() => setEditing(true)}>
                Edit my entry
              </button>
            </div>
          </>
        ) : (
          <p className="help">The guest list is closed and your entry is locked in.</p>
        )}
      </div>
    </Shell>
  );
}
