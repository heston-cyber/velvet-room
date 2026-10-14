// AES-GCM sealing for the case file. The key lives in the SEAL_KEY environment
// variable, so the answer never sits in the database as plain text.

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function key(): Promise<CryptoKey> {
  // process.env is provided by the Convex runtime; read it via globalThis so the
  // browser build (which type-checks these files too) doesn't need Node types.
  const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env;
  const raw = env?.SEAL_KEY;
  if (!raw) throw new Error("SEAL_KEY isn't set on this deployment.");
  return crypto.subtle.importKey("raw", unb64(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(value: unknown): Promise<{ iv: string; data: string }> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), plain);
  return { iv: b64(iv), data: b64(new Uint8Array(cipher)) };
}

export async function unseal<T>(box: { iv: string; data: string }): Promise<T> {
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(box.iv) }, await key(), unb64(box.data));
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}
