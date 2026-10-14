import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import ProfileForm, { EMPTY_PROFILE } from "../components/ProfileForm";
import Shell, { Loading } from "../components/Shell";
import { Deco } from "../components/MemberCard";
import { navigate } from "../lib/router";
import { saveToken, savedToken } from "../lib/storage";

export default function Register({ slug }: { slug?: string }) {
  const game = useQuery(api.registration.publicGame, { slug });
  const [another, setAnother] = useState(false);

  if (game === undefined) return <Loading />;
  if (game === null) {
    return (
      <Shell>
        <div className="screen center">
          <span className="eyebrow">Chicago · 1929</span>
          <Deco />
          <h1 className="title-xl">The Velvet Room</h1>
          <p className="lede">The doors are locked. Check back soon.</p>
        </div>
      </Shell>
    );
  }

  const saved = savedToken(game.slug);

  if (saved && !another) {
    return (
      <Shell>
        <div className="screen center">
          <span className="eyebrow">Welcome back</span>
          <Deco />
          <h1 className="title-lg">You're already on the list</h1>
          <p className="lede">This phone is holding your membership card.</p>
          <div className="actions wide">
            <button type="button" className="primary" onClick={() => navigate(`/p/${saved}`)}>
              Open my card
            </button>
            {game.partyOn && (
              <button type="button" className="ghost-btn" onClick={() => navigate("/join")}>
                Join as someone else with the room code
              </button>
            )}
            {game.open && (
              <button type="button" className="back center-text" onClick={() => setAnother(true)}>
                Sign up someone else on this phone
              </button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  if (!game.open) {
    return (
      <Shell>
        <div className="screen center">
          <span className="eyebrow">Chicago · 1929</span>
          <Deco />
          <h1 className="title-lg">{game.partyOn ? "The party's on" : "The guest list is closed"}</h1>
          {game.partyOn ? (
            <>
              <p className="lede">Signed up? Type the room code from the TV and tap your name.</p>
              <div className="actions wide">
                <button type="button" className="primary" onClick={() => navigate("/join")}>
                  Join with the room code
                </button>
              </div>
            </>
          ) : (
            <p className="lede">If you already signed up, open the personal link you saved. Your host can resend it.</p>
          )}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {game.partyOn && !another && (
        <div className="sealed join-offer">
          <p className="help">Already signed up? Type the room code from the TV and tap your name.</p>
          <button type="button" className="primary" onClick={() => navigate("/join")}>
            Join with the room code
          </button>
        </div>
      )}
      <ProfileForm
        game={game}
        mode="new"
        initial={EMPTY_PROFILE}
        onDone={(token) => {
          saveToken(game.slug, token);
          navigate(`/p/${token}`);
        }}
      />
    </Shell>
  );
}
