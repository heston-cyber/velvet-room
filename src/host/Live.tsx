// The host's game steps and the phone rescue, used by the host screen (src/pages/Host.tsx).
import { showParts } from "../../convex/show";
import { scriptOf } from "../../convex/voiceLines";
import { heardForStart } from "../lib/heard";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { friendlyError } from "../lib/errors";
import { Qr } from "../lib/qr";
import { Swap } from "../lib/Swap";
import { navigate } from "../lib/router";
import { useConfirm, type Roster } from "./common";
import { Sec } from "./Menu";

type Step = { label: string; confirm?: string; help: string; run: () => Promise<unknown>; disabled?: boolean };

/** The host's next step right now (the pause menu's skip button, and the button after the reveal). */
export function useNextStep(data: Roster, slug: string, hostKey: string, now: number): Step {
  const openDoors = useMutation(api.game.openDoors);
  const startGame = useMutation(api.game.startGame);
  const skipIntro = useMutation(api.game.skipIntro);
  const skipShow = useMutation(api.game.skipShow);
  const advance = useMutation(api.game.advanceRound);
  const finish = useMutation(api.game.finish);
  const endNight = useMutation(api.game.endNight);
  const newGame = useMutation(api.replay.newGame);
  const g = data.game;
  const c = data.counts;
  const args = { slug, hostKey };
  const intro = g.status === "playing" && g.round === 1 && !!g.introEndsAt && g.introEndsAt > now;
  if (g.status === "registration") return { label: "Open the doors", help: "Guests can check in on their phones.", run: () => openDoors(args) };
  if (g.status === "lobby")
    return {
      label: "Start the game",
      confirm: `Tap again to start · ${c.checkedIn} of ${c.total} checked in`,
      help: "Runs the secret draw and picks where the body turns up. Anyone not checked in can't join after this.",
      run: () => startGame({ ...args, ...heardForStart(scriptOf(g)) }),
    };
  if (intro && g.show) {
    // The show (v2): skip one part at a time.
    const s = g.show;
    // This game's order (Oct 16: How to play, the Don dies, the roll call).
    const nextPart = showParts(s, g.startedAt ?? now).find((x) => x.at > now)?.part;
    const next = nextPart ?? (!s.phonesAt || now < s.phonesAt ? "phones" : "round");
    const label = { how: "Skip to How to play", intro: "Skip to the murder", roll: "Skip to the roll call", phones: "Skip to the roles", round: "Begin Round 1" }[next];
    return { label, help: "Or let the show run on its own. Round 1 starts after the roles.", run: () => skipShow(args) };
  }
  if (intro) return { label: "Begin Round 1", help: "Or let the intro finish on its own.", run: () => skipIntro(args) };
  if (g.status === "playing") {
    // v2: a round ends in its votes; the host can close a vote early and skip its verdict.
    const vt = g.round <= 3 ? g.vote : null;
    if (vt && !vt.closedAt) return { label: "Close the vote", help: "Counts the votes now. More than half on one guest is needed.", run: () => advance(args) };
    if (vt && vt.closedAt && (vt.nextAt ?? 0) > now) return { label: g.round === 3 ? "On to the lock-in" : `On to Round ${g.round + 1}`, help: "Skips the rest of the verdict.", run: () => advance(args) };
    if (g.round <= 3)
      return {
        label: `End Round ${g.round}`,
        // Oct 16: Round 1 has no vote, Round 2 ends in the jail vote, Round 3 in the release vote (if anyone's in jail).
        help: g.round === 1 ? "On to Round 2. No vote after Round 1." : g.round === 2 ? "Ends the round in the jail vote." : "Ends the round in the release vote if anyone's in jail, then the lock-in.",
        run: () => advance(args),
      };
    const allIn = c.accused >= c.inGame;
    return {
      label: "Start the reveal",
      confirm: allIn ? undefined : `Tap again: only ${c.accused} of ${c.inGame} have locked in`,
      help: "Starts on its own once everyone's in.",
      run: () => advance(args),
    };
  }
  if (g.status === "reveal") return { label: "Show the awards", help: "Closes the voting for Best Dressed and Best Liar.", run: () => finish(args) };
  if (!g.endedAt) return { label: "End the night", help: "The TV shows the closing card. After that you can start a new game.", run: () => endNight(args) };
  const goTo = (next: string) => navigate(`/host?game=${encodeURIComponent(next)}&key=${encodeURIComponent(hostKey)}`);
  if (g.nextSlug) return { label: "Go to the new game", help: "The new game is open for sign-ups. The TV has already switched to it.", run: async () => goTo(g.nextSlug!) };
  return {
    label: "Start a new game",
    confirm: `Tap again: Game ${g.gameNumber + 1} opens sign-ups`,
    help: "Same rooms and marker cards. Everyone signs up again with a new character, and the TV switches over.",
    run: async () => goTo((await newGame(args)).slug),
  };
}

export function Rescue({ data, slug, hostKey }: { data: Roster; slug: string; hostKey: string }) {
  const rescuePhone = useMutation(api.host.rescuePhone);
  const [who, setWho] = useState<Id<"players"> | "">("");
  const [link, setLink] = useState<{ charName: string; token: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { armed, arm, disarm } = useConfirm();
  const url = link ? `${window.location.origin}/p/${link.token}` : "";
  async function go() {
    if (!who) return;
    if (armed !== who) return arm(who);
    disarm();
    setErr(null);
    try {
      setLink(await rescuePhone({ slug, hostKey, playerId: who }));
    } catch (e) {
      setErr(friendlyError(e));
    }
  }
  return (
    <Sec title="Rescue a phone">
      <span className="help">
        A guest's phone died, they lost their link, or someone else joined as them? This frees their name and makes a new link. Their old link stops working,
        and the TV says so. They scan the new link below, or join again with the room code.
      </span>
      <div className="hx-fields">
        <select
          className="inp"
          value={who}
          onChange={(e) => {
            setWho(e.target.value as Id<"players"> | "");
            setLink(null);
            disarm();
          }}
        >
          <option value="">Pick a guest</option>
          {data.players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.charName} ({p.realName})
            </option>
          ))}
        </select>
        <button type="button" className={`btn ${armed && armed === who ? "armed" : ""}`} disabled={!who} onClick={go}>
          <Swap show={armed && armed === who ? 1 : 0}>
            <span>Make a new link</span>
            <span>Tap again: old link stops</span>
          </Swap>
        </button>
      </div>
      <div className="hx-rescue">
        {url ? <Qr className="qr" text={url} label={`New personal link for ${link?.charName}`} /> : <div className="qr empty">QR code</div>}
        <span className="help">{url ? `New link for ${link?.charName}. Have them scan it now.` : err ?? "\u00a0"}</span>
      </div>
    </Sec>
  );
}
