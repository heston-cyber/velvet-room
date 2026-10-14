// Remembers a guest's personal code on their phone. Purely a convenience:
// the personal link itself is the real key, so every read and write may fail safely.
const KEY = "velvet-room:tokens";

type Saved = Record<string, string>; // game slug -> token

function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") as Saved;
  } catch {
    return {};
  }
}

export function savedToken(slug: string): string | null {
  return load()[slug] ?? null;
}

export function saveToken(slug: string, token: string) {
  try {
    const all = load();
    all[slug] = token;
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* private mode or blocked storage: the link still works */
  }
}
