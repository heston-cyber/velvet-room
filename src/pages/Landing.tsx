// The main page (Oct 16, anyone can host): no game of its own. Guests join with the room code from the TV (or open the
// sign-up link their host sent, which names the game); hosts go to /host to start one. A phone that has signed up
// before gets a way back to its card.
import Shell from "../components/Shell";
import { Deco } from "../components/MemberCard";
import { navigate } from "../lib/router";
import { lastToken } from "../lib/storage";

export default function Landing() {
  const saved = lastToken();
  return (
    <Shell>
      <div className="screen center">
        <span className="eyebrow">New York City · 1929</span>
        <Deco />
        <h1 className="title-xl">The Velvet Room</h1>
        <p className="lede">A murder mystery party. One of you did it.</p>
        <div className="actions wide">
          <button type="button" className="primary" onClick={() => navigate("/join")}>
            Join a game
          </button>
          {saved && (
            <button type="button" className="ghost-btn" onClick={() => navigate(`/p/${saved}`)}>
              Open my card
            </button>
          )}
        </div>
        <p className="help">Joining? Type the room code from the TV. Got a sign-up link from your host? Open that instead.</p>
        {/* I10 (Oct 17): hosting is for the laptop by the TV, so it's a small link here. */}
        <button type="button" className="back center-text small-link" onClick={() => navigate("/host")}>
          Hosting on a laptop? Host a game
        </button>
      </div>
    </Shell>
  );
}
