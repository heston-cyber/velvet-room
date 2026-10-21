// Fingerprints for the narrator's recordings (see narration-sets.ts).
//   npx tsx scripts/narration-texts.ts --snapshot <older convex/narration.ts>
//       What the existing recordings say: fingerprints each recording that exists from the words in that older script
//       (the one they were made from), into texts.json. Run once, Oct 21, from the last commit before the rewrite.
//   npx tsx scripts/narration-texts.ts
//       Rebuilds manifest.json from texts.json against today's script: lines whose words changed drop out (caption
//       only on the TV) until they're recorded again.
import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import * as current from "../convex/narration";
import { OUT, TEXTS, fingerprint, readJson, wanted, writeManifest, type Narration, type Texts } from "./narration-sets";

const i = process.argv.indexOf("--snapshot");
if (i >= 0) {
  const older = (await import(pathToFileURL(resolve(process.argv[i + 1])).href)) as Narration;
  const texts: Texts = {};
  let n = 0;
  for (const w of wanted(older)) {
    if (!existsSync(join(OUT, w.vk, w.tone, `${w.file}.mp3`))) continue;
    ((texts[w.vk] ??= {})[w.tone] ??= {})[w.file] = fingerprint(w.text);
    n++;
  }
  writeFileSync(TEXTS, JSON.stringify(texts, null, 1));
  console.log(`fingerprinted ${n} existing recordings`);
}
const r = writeManifest(current as unknown as Narration, readJson<Texts>(TEXTS, {}));
const byVoice = new Map<string, number>();
for (const s of r.stale) byVoice.set(s.split("/").slice(0, 2).join("/"), (byVoice.get(s.split("/").slice(0, 2).join("/")) ?? 0) + 1);
console.log(`manifest: ${r.kept} lines current, ${r.stale.length} out of date (words changed), ${r.missing} never recorded`);
for (const [k, v] of byVoice) console.log(`  ${k}: ${v} out of date`);
