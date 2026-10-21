import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import ProfileForm, { EMPTY_PROFILE } from "../components/ProfileForm";
import Shell, { Loading } from "../components/Shell";
import { Deco } from "../components/MemberCard";
import { navigate } from "../lib/router";
import { saveToken, savedToken } from "../lib/storage";

export default function Register({ slug, walkIn }: { slug?: string; walkIn?: string }) {
  const game = useQuery(api.registration.publicGame, { slug });

  if (game === undefined) return <Loading />;
  if (game === null) {
    return (
      <Shell>
        <div className="screen center">
          <span className="eyebrow">New York City · 2026</span>
          <Deco />
          <h1 className="title-xl">The Velvet Room</h1>
          <p className="lede">The doors are locked. Check back soon.</p>
        </div>
      </Shell>
    );
  }

  // F5 (Oct 17): after Start, a new guest watches this game and joins the next.
  if (walkIn && game.started && game.partyOn) {
    return (
      <Shell>
        <div className="screen center">
          <span className="eyebrow">The Velvet Room</span>
          <Deco />
          <h1 className="title-lg">The game's started</h1>
          <p className="lede">Grab a drink and watch this one. You're in the next.</p>
        </div>
      </Shell>
    );
  }
  // Party night: someone new at the door signs up with the room code (Join → "New here? Sign up").
  if (walkIn && game.partyOn) {
    return (
      <Shell>
        <ProfileForm
          game={game}
          mode="new"
          roomCode={walkIn}
          initial={EMPTY_PROFILE}
          onDone={(token) => {
            saveToken(game.slug, token);
            navigate(`/p/${token}`);
          }}
          onCancel={() => navigate(`/join?code=${walkIn}`)}
        />
      </Shell>
    );
  }

  const saved = savedToken(game.slug);

  if (saved) {
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
            {/* S2 (Oct 17): no "sign up someone else on this phone": a second sign-up would replace this one's saved card. Each guest signs up on their own phone. */}
          </div>
        </div>
      </Shell>
    );
  }

  if (!game.open) {
    return (
      <Shell>
        <div className="screen center">
          <span className="eyebrow">New York City · 2026</span>
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
      {game.partyOn && (
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
