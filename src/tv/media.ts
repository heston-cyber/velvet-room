import { useEffect, useState } from "react";

// The Resolve-built graphics: background loops (20 s, seamless) and title cards (3 to 4 s).
// Made in DaVinci Resolve for this game; see the Velvet Room Game Visuals 2026 project.

export type LoopKey = "doors" | "dark" | "search" | "evidence" | "accuse" | "spotlight" | "awards" | "lastcall" | "rollcall";
export type CardKey = "opening" | "lightsout" | "round1" | "round2" | "round3" | "twist" | "accuse" | "lastcall" | "reveal" | "awards" | "rollcall";

export const LOOPS: LoopKey[] = ["doors", "dark", "search", "evidence", "accuse", "spotlight", "awards", "lastcall", "rollcall"];
export const CARDS: CardKey[] = ["opening", "lightsout", "round1", "round2", "round3", "twist", "accuse", "lastcall", "reveal", "awards", "rollcall"];

/** How long each title card runs (ms). The scene underneath fades in as it ends. */
export const CARD_MS: Record<CardKey, number> = {
  opening: 4000,
  lightsout: 3000,
  round1: 4000,
  round2: 4000,
  round3: 4000,
  twist: 4000,
  accuse: 4000,
  lastcall: 4000,
  reveal: 4000,
  awards: 4000,
  rollcall: 4000,
};

export const loopUrl = (k: LoopKey) => `/media/loops/${k}.mp4`;
export const cardUrl = (k: CardKey) => `/media/cards/${k}.mp4`;

type Bank = { urls: Record<string, string>; loaded: number; total: number; failed: number };

/**
 * Loads every video into memory when the TV opens (about 27 MB), so nothing buffers mid-game,
 * even if the Wi-Fi gets busy. Until a file is in, the TV plays it straight from the site.
 */
export function useMediaBank(): Bank & { src: (path: string) => string; ready: boolean } {
  const [bank, setBank] = useState<Bank>({ urls: {}, loaded: 0, total: LOOPS.length + CARDS.length, failed: 0 });
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    // The first things the night needs come first.
    const order = [loopUrl("doors"), cardUrl("opening"), cardUrl("rollcall"), loopUrl("rollcall"), cardUrl("lightsout"), loopUrl("dark"), cardUrl("round1"), loopUrl("search")];
    for (const k of LOOPS) if (!order.includes(loopUrl(k))) order.push(loopUrl(k));
    for (const k of CARDS) if (!order.includes(cardUrl(k))) order.push(cardUrl(k));
    (async () => {
      for (const path of order) {
        try {
          const res = await fetch(path);
          if (!res.ok) throw new Error(String(res.status));
          const url = URL.createObjectURL(await res.blob());
          made.push(url);
          if (!alive) return;
          setBank((b) => ({ ...b, urls: { ...b.urls, [path]: url }, loaded: b.loaded + 1 }));
        } catch {
          if (!alive) return;
          setBank((b) => ({ ...b, failed: b.failed + 1 }));
        }
      }
    })();
    return () => {
      alive = false;
      for (const u of made) URL.revokeObjectURL(u);
    };
  }, []);
  return { ...bank, src: (path: string) => bank.urls[path] ?? path, ready: bank.loaded === bank.total };
}
