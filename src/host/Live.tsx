// The host's game steps and the phone rescue, used by the host screen (src/pages/Host.tsx).
import { showParts } from "../../convex/show";
import { scriptOf } from "../../convex/voiceLines";
import { heardForStart } from "../lib/heard";
import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { friendlyError } from "../lib/errors";
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
      // Oct 17 (D8): a count only, never who opted out.
      help: `Runs the secret draw and picks where the body turns up. Anyone not checked in can't join after this.${
        c.checkedIn && c.killerPool < c.checkedIn
          ? c.killerPool
            ? ` ${c.killerPool} of the ${c.checkedIn} checked in can be drawn as the killer (the rest opted out).`
            : " Everyone checked in opted out of being the killer, so anyone can be drawn."
          : ""
      }${c.checkedIn && !g.jailVote ? " Under 5 guests: no jail vote tonight." : ""}`,
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
        // Oct 20: Round 1 has no vote, Round 2 ends in the jail vote, Round 3 goes straight to the lock-in (no release vote).
        help:
          g.round === 1
            ? "On to Round 2. No vote after Round 1."
            : g.round === 2
              ? g.jailVote
                ? "Ends the round in the jail vote."
                : "On to Round 3. Under 5 guests, there's no jail vote."
              : "On to the lock-in. Anyone in jail is let out for it.",
        run: () => advance(args),
      };
    const allIn = c.accused >= c.inGame;
    return {
      // F12 (Oct 17): on screen during the lock-in, with the count, so one dead phone can't hold up the reveal.
      label: `Start the reveal (${c.accused} of ${c.inGame} in)`,
      confirm: allIn ? undefined : `Tap again: only ${c.accused} of ${c.inGame} have locked in`,
      help: g.pacing.mode === "timer" ? "Starts on its own once everyone's in, or when the clock runs out." : "Starts on its own once everyone's in.",
      run: () => advance(args),
    };
  }
  if (g.status === "reveal") {
    // F7 (Oct 17): not before the verdict. Oct 20: Best Dressed was voted in the lobby, so the awards follow on their own.
    const early = !!g.verdictAt && now < g.verdictAt;
    return {
      label: "Show the awards",
      help: early ? "After the verdict." : "They start on their own in a few seconds. Only awards someone won are shown.",
      disabled: early,
      run: () => finish(args),
    };
  }
  if (!g.endedAt) return { label: "End the night", help: "The TV shows the closing card.", run: () => endNight(args) };
  const goTo = (next: string) => navigate(`/host?game=${encodeURIComponent(next)}&key=${encodeURIComponent(hostKey)}`);
  if (g.nextSlug) return { label: "Go to the new game", help: "The new game is open for sign-ups. The TV has already switched to it.", run: async () => goTo(g.nextSlug!) };
  return playAgainStep(g, () => newGame(args), goTo);
}

/** S10 (Oct 17): after the awards, Play again sits next to End the night. */
export function playAgainStep(g: Roster["game"], newGame: () => Promise<{ slug: string }>, goTo: (slug: string) => void): Step {
  return {
    label: "Play again",
    confirm: `Tap again: Game ${g.gameNumber + 1} opens sign-ups`,
    help: "Same rooms and cards. Everyone signs up again (a new nickname if they like), and the TV switches over.",
    run: async () => goTo((await newGame()).slug),
  };
}

/** The extra step beside the next one: Play again, after the awards and before the night ends. */
export function useSideStep(data: Roster, slug: string, hostKey: string): Step | null {
  const newGame = useMutation(api.replay.newGame);
  const g = data.game;
  if (g.status !== "done" || g.endedAt || g.nextSlug) return null;
  const goTo = (next: string) => navigate(`/host?game=${encodeURIComponent(next)}&key=${encodeURIComponent(hostKey)}`);
  return playAgainStep(g, () => newGame({ slug, hostKey }), goTo);
}

export function Rescue({ data, slug, hostKey }: { data: Roster; slug: string; hostKey: string }) {
  const rescuePhone = useMutation(api.host.rescuePhone);
  const [who, setWho] = useState<Id<"players"> | "">("");
  const [done, setDone] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const { armed, arm, disarm } = useConfirm();
  async function go() {
    if (!who) return;
    if (armed !== who) return arm(who);
    disarm();
    setErr(null);
    try {
      setDone((await rescuePhone({ slug, hostKey, playerId: who })).charName);
    } catch (e) {
      setErr(friendlyError(e));
    }
  }
  // F3 (Oct 17): no QR code here. This screen is the TV, so a QR would let anyone in the room open that guest's role.
  const code = data.game.roomCode;
  return (
    <Sec title="Rescue a phone">
      <span className="help">
        A guest's phone died, they lost their link, or someone else joined as them? This frees their name and stops their old link. They rejoin on any phone
        with the room code and tap their name.
      </span>
      <div className="hx-fields">
        <select
          className="inp"
          value={who}
          onChange={(e) => {
            setWho(e.target.value as Id<"players"> | "");
            setDone(null);
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
            <span>Free their name</span>
            <span>Tap again: old link stops</span>
          </Swap>
        </button>
      </div>
      <span className="help" role="status">
        {done
          ? `${done} is free. On their phone: ${window.location.host}/join${code ? `, room code ${code}` : ""}, then tap their name.`
          : err ?? "\u00a0"}
      </span>
    </Sec>
  );
}
