import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import Shell from "../components/Shell";
import { Deco } from "../components/MemberCard";
import { friendlyError } from "../lib/errors";
import Menu, { type SettingsPatch } from "../host/Menu";
import Live, { NextButton } from "../host/Live";
import "../host/host.css";

class Boundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown };
  static getDerivedStateFromError(error: unknown) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <Shell>
          <div className="screen center">
            <span className="eyebrow">Host controls</span>
            <Deco />
            <h1 className="title-lg">That host link isn't valid</h1>
            <p className="lede">Use the full host link Claude gave you, including the part after "key=".</p>
          </div>
        </Shell>
      );
    }
    return this.props.children;
  }
}

export default function Host(props: { slug: string; hostKey: string }) {
  return (
    <Boundary>
      <HostInner {...props} />
    </Boundary>
  );
}

function HostInner({ slug, hostKey }: { slug: string; hostKey: string }) {
  const data = useQuery(api.host.roster, { slug, hostKey });
  const updateSettings = useMutation(api.host.updateSettings);
  const ensureTvKey = useMutation(api.host.ensureTvKey);
  const needsTvKey = data !== undefined && !data.game.tvKey;
  // Games made before the TV had its own key get one the first time the host page opens.
  useEffect(() => {
    if (needsTvKey) void ensureTvKey({ slug, hostKey }).catch(() => undefined);
  }, [needsTvKey, ensureTvKey, slug, hostKey]);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"menu" | "live" | null>(null);
  const lastStatus = useRef<string | null>(null);

  // Before the doors open, start on the game menu; after, on Live. Opening the doors switches to Live once.
  useEffect(() => {
    if (!data) return;
    const s = data.game.status;
    if (tab === null) setTab(s === "registration" ? "menu" : "live");
    else if (lastStatus.current === "registration" && s === "lobby") setTab("live");
    lastStatus.current = s;
  }, [data, tab]);

  if (data === undefined || tab === null) {
    return (
      <Shell>
        <div className="screen center">
          <Deco />
          <p className="lede">Opening the books…</p>
        </div>
      </Shell>
    );
  }
  const { game, counts } = data;

  async function save(patch: SettingsPatch) {
    setError(null);
    try {
      await updateSettings({ slug, hostKey, ...patch });
    } catch (err) {
      setError(friendlyError(err));
    }
  }

  return (
    <div className="hx">
      <header className="hx-head">
        <div className="hx-title">
          <span className="eyebrow">Host controls{game.isTest ? " · test game" : ""}</span>
          <h1>{game.title}</h1>
        </div>
        <div className="stats">
          <div>
            <b>{counts.total}</b>
            <span>signed up</span>
          </div>
          <div>
            <b>{counts.optedIn}</b>
            <span>up for killer</span>
          </div>
          <div>
            <b>{counts.checkedIn}</b>
            <span>checked in</span>
          </div>
          <div>
            <b className={game.open ? "ok" : "warn"}>{game.open ? "Open" : "Closed"}</b>
            <span>sign-ups</span>
          </div>
        </div>
      </header>
      <nav className="hx-tabs" aria-label="Host screens">
        <button type="button" aria-pressed={tab === "menu"} onClick={() => setTab("menu")}>
          Game menu
        </button>
        <button type="button" aria-pressed={tab === "live"} onClick={() => setTab("live")}>
          Live
        </button>
      </nav>
      <div className="hx-err" role="alert">
        {error ? <div className="errbox">{error}</div> : null}
      </div>
      {tab === "menu" ? (
        <>
          <Menu data={data} slug={slug} hostKey={hostKey} save={save} onError={setError} />
          <div className="hx-foot">
            <NextButton data={data} slug={slug} hostKey={hostKey} onError={setError} />
          </div>
        </>
      ) : (
        <Live data={data} slug={slug} hostKey={hostKey} onError={setError} />
      )}
    </div>
  );
}
