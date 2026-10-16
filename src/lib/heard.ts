// What this laptop's games have said lately (Oct 16, Heston: "a better selection system for each game that picks what
// lines will be used, so that jokes are not repeated", per host laptop). Start sends it, so the new game picks the
// versions heard least lately; every third game started here gets the running gag ("every 3rd game played, single one
// player out and continuously roast that one player"). Kept in this browser only; it's a convenience, so anything
// that goes wrong just means a game picks fresh.

const KEY = "velvet-room:heard";
const KEEP_PER_LINE = 3; // a line has 3 to 4 versions: remember the last 3 picks
const KEEP_HECKLES = 120; // about 15 games' worth

type PerScript = { lines: Record<string, number[]>; heckles: string[] };
type Store = { games: string[]; scripts: Record<string, PerScript> };

function load(): Store {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (s && Array.isArray(s.games) && s.scripts && typeof s.scripts === "object") return s as Store;
  } catch {
    /* fresh */
  }
  return { games: [], scripts: {} };
}

function save(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: skip */
  }
}

/** What to send at Start: lines and heckles heard lately in this script, and whether tonight gets the running gag. */
export function heardForStart(script: string): { heard: PerScript; gag: boolean } {
  const s = load();
  const mine = s.scripts[script] ?? { lines: {}, heckles: [] };
  // Every third game started on this laptop: the 3rd, 6th, 9th…
  return { heard: { lines: mine.lines, heckles: mine.heckles.slice(-KEEP_HECKLES) }, gag: s.games.length % 3 === 2 };
}

/** Once a game has started: remember what it picked (once per game). */
export function rememberGame(slug: string, heard: { script: string; lines: Record<string, number>; heckles: string[] }) {
  const s = load();
  if (s.games.includes(slug)) return;
  s.games = [...s.games, slug].slice(-60);
  const mine = (s.scripts[heard.script] ??= { lines: {}, heckles: [] });
  for (const [key, v] of Object.entries(heard.lines)) mine.lines[key] = [...(mine.lines[key] ?? []), v].slice(-KEEP_PER_LINE);
  mine.heckles = [...mine.heckles.filter((id) => !heard.heckles.includes(id)), ...heard.heckles].slice(-KEEP_HECKLES);
  save(s);
}
