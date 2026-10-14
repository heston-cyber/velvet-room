/** Pulls a marker code out of whatever the camera read: our marker URL or a bare code. */
export function codeFromScan(text: string): string | null {
  const m = /\/m\/([a-z0-9]{4,12})\b/i.exec(text) ?? /^\s*([a-z0-9]{4,12})\s*$/i.exec(text);
  return m ? m[1].toLowerCase() : null;
}
