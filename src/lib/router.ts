import { useEffect, useState } from "react";

const EVENT = "vr:navigate";

function read() {
  return { path: window.location.pathname, search: window.location.search };
}

export function useLocation() {
  const [loc, setLoc] = useState(read);
  useEffect(() => {
    const update = () => setLoc(read());
    window.addEventListener("popstate", update);
    window.addEventListener(EVENT, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(EVENT, update);
    };
  }, []);
  return loc;
}

export function navigate(to: string) {
  window.history.pushState(null, "", to);
  window.dispatchEvent(new Event(EVENT));
  window.scrollTo(0, 0);
}
