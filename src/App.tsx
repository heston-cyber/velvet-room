import { useLocation } from "./lib/router";
import Register from "./pages/Register";
import Guest from "./pages/Guest";
import Host from "./pages/Host";

export default function App() {
  const { path, search } = useLocation();
  const params = new URLSearchParams(search);
  if (path.startsWith("/p/")) return <Guest token={decodeURIComponent(path.slice(3)).replace(/\/$/, "")} />;
  if (path.replace(/\/$/, "") === "/host") {
    return <Host slug={params.get("game") ?? ""} hostKey={params.get("key") ?? ""} />;
  }
  return <Register slug={params.get("game") ?? undefined} />;
}
