import { useCallback, useEffect, useRef, useState } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";

export type Roster = FunctionReturnType<typeof api.host.roster>;
export type Game = Roster["game"];

export const TZ = "America/Chicago";

export function useNow(ms: number) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Time left on the round clock (a paused clock stores its remaining time as a negative number). */
export function timeLeft(g: Game, now: number): number | null {
  if (g.roundEndsAt === null) return null;
  return g.roundEndsAt < 0 ? -g.roundEndsAt : Math.max(0, g.roundEndsAt - now);
}

/** Two-tap confirm for anything that can't be undone. The second tap must come within 5 seconds. */
export function useConfirm() {
  const [armed, setArmed] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const arm = useCallback((key: string) => {
    setArmed(key);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setArmed(null), 5000);
  }, []);
  const disarm = useCallback(() => setArmed(null), []);
  return { armed, arm, disarm };
}

/** A button that can't be double-fired: it waits for the action, then a short cooldown. */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      window.setTimeout(() => setBusy(false), 1200);
    }
  }, [busy]);
  return { busy, run };
}

/** Opens the TV with its own key (never the host key), which the TV then removes from its address bar. */
export function openTvWindow(slug: string, tvKey: string | null) {
  if (!tvKey) return;
  const url = `/tv?game=${encodeURIComponent(slug)}&key=${encodeURIComponent(tvKey)}`;
  window.open(url, "velvet-room-tv", "popup,width=1280,height=720");
}

export const initials = (n: string) => {
  const w = n.split(/\s+/).map((x) => x.replace(/[^A-Za-z]/g, "")[0]).filter(Boolean);
  return (w.length > 1 ? w[0] + w[w.length - 1] : w[0] || "?").toUpperCase();
};
