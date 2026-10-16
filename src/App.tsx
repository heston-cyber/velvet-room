import { useLocation } from "./lib/router";
import Register from "./pages/Register";
import Guest from "./pages/Guest";
import Host from "./pages/Host";
import Marker from "./pages/Marker";
import Join from "./pages/Join";
import Landing from "./pages/Landing";
import Shell from "./components/Shell";
import { Deco } from "./components/MemberCard";

export default function App() {
  const { path, search } = useLocation();
  const params = new URLSearchParams(search);
  if (path.startsWith("/m/")) return <Marker code={decodeURIComponent(path.slice(3)).replace(/\/$/, "")} />;
  if (path.startsWith("/p/")) return <Guest token={decodeURIComponent(path.slice(3)).replace(/\/$/, "")} />;
  if (path.replace(/\/$/, "") === "/join") return <Join initialCode={params.get("code") ?? ""} />;
  if (path.replace(/\/$/, "") === "/tv") return <TvMoved />;
  if (path.replace(/\/$/, "") === "/host") {
    return <Host slug={params.get("game") ?? ""} hostKey={params.get("key") ?? ""} />;
  }
  // The main page has no game of its own (Oct 16, anyone can host): sign-up links name their game.
  const game = params.get("game");
  if (!game) return <Landing />;
  return <Register slug={game} walkIn={params.get("walkin") ?? undefined} />;
}

/** v2: the host screen is the TV. Old links to the separate TV window (/tv?game=…&key=…) land here. */
function TvMoved() {
  return (
    <Shell>
      <div className="screen center">
        <span className="eyebrow">The Velvet Room</span>
        <Deco />
        <h1 className="title-lg">The TV now runs on the host screen.</h1>
        <p className="lede">Open the host link on the party laptop.</p>
        <a className="copy" href="/host">
          Go to the host screen
        </a>
      </div>
    </Shell>
  );
}
