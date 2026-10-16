// One night's evidence, round by round, with the party cast and the real weapons: what a table that finds every
// marker sees, the TV drops, and the tips.
//   npx tsx scripts/preview-evidence.ts [seed=7] [guests=12] [tone=classic]
import { buildCase } from "../convex/engine/build";
import { seeded, shuffle } from "../convex/engine/rng";
import { roomsN } from "../convex/engine/fake";
import { CAST } from "../convex/figures";
import { WEAPONS } from "../convex/weapons";
import { setupFor } from "../convex/engine/setup";
import type { CaseInput } from "../convex/engine/types";

const seed = Number(process.argv[2] ?? 7);
const guests = Number(process.argv[3] ?? 12);
const tone = (process.argv[4] ?? "classic") as "classic" | "adult";
const rng = seeded(seed);
const SIGS = ["a silver flask", "a red feather boa", "green dice", "a gold toothpick", "a pearl hatpin", "a cigar cutter", "white spats", "a monocle", "a rabbit-fur stole", "a pinky ring", "a tin harmonica", "a lace fan", "a pocket watch", "a cigarette holder", "a bowler hat", "opera glasses"];
const people = shuffle(rng, CAST).slice(0, guests);
const weapons = shuffle(rng, WEAPONS).slice(0, guests);
const setup = setupFor(guests);
const rooms = roomsN(setup.rooms);
const input: CaseInput = {
  suspects: people.map((m, i) => ({ id: `p${i}`, name: m.name, signature: SIGS[i % SIGS.length], who: "", killerOk: true, sex: m.sex })),
  exhibits: weapons.map((w, i) => ({ id: `w${i}`, letter: "ABCDEFGHJKLMNPQRSTUV"[i], name: w.name, description: "", ownerId: `p${i}`, kind: w.kind })),
  rooms,
  markers: Array.from({ length: setup.markers }, (_, i) => ({ number: i + 1, roomKey: rooms[i % rooms.length].key })),
  search: "waves",
  tone,
};
const cf = buildCase(input, rng);
const nameOf = (id: string) => input.suspects.find((s) => s.id === id)!.name;
const label = (k: string) => rooms.find((r) => r.key === k)!.label;
console.log(`${guests} guests · ${setup.rooms} rooms · ${setup.markers} markers · rooms open in waves`);
console.log(`Guests: ${input.suspects.map((s) => s.name).join(", ")}`);
console.log(`Weapons: ${input.exhibits.map((e) => e.name).join(", ")}`);
console.log(`ANSWER: ${nameOf(cf.solution.killerId)} · the ${input.exhibits.find((e) => e.id === cf.solution.exhibitId)!.name.toLowerCase()} · ${label(cf.solution.roomKey)} (body found in ${label(cf.bodyRoomKey)})`);
for (const r of [1, 2, 3]) {
  console.log(`\n— Round ${r} —`);
  for (const c of cf.clues.filter((c) => c.round === r && c.kind !== "flavor").sort((a, b) => (a.channel === b.channel ? 0 : a.channel === "marker" ? -1 : 1))) {
    console.log(`  [${c.channel === "marker" ? `Marker ${c.markerNumber}` : "TV"}] ${c.text}`);
  }
  const dead = cf.clues.filter((c) => c.round === r && c.kind === "flavor").length;
  if (dead) console.log(`  (+ ${dead} markers with nothing useful)`);
  const v = cf.validation.stages[r - 1];
  console.log(`  Still possible after Round ${r} (public evidence): ${v.suspects} suspects, ${v.exhibits} weapons, ${v.rooms} rooms`);
}
console.log(`\n— Tips (${new Set(cf.tips.map((t) => t.clueId)).size} different) —`);
const byTip = new Map<string, string[]>();
for (const t of cf.tips) byTip.set(t.text, [...(byTip.get(t.text) ?? []), nameOf(t.playerId)]);
for (const [text, who] of byTip) console.log(`  ${who.join(", ")}: ${text}`);
