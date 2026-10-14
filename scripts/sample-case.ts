import { buildCase } from "../convex/engine/build";
import { fakeCast, ROOMS_5 } from "../convex/engine/fake";
import { seeded } from "../convex/engine/rng";

const seed = Number(process.argv[2] ?? 2026);
const rng = seeded(seed);
const input = fakeCast({ rng, guests: 9, rooms: ROOMS_5, markers: 15 });
const cf = buildCase(input, rng);
const nameOf = (id: string) => input.suspects.find((s) => s.id === id)!.name;
const ex = input.exhibits.find((e) => e.id === cf.solution.exhibitId)!;
console.log(`ANSWER: ${nameOf(cf.solution.killerId)} · Exhibit ${ex.letter} (${ex.name}) · ${cf.solution.roomKey}`);
console.log(`stages (suspects/exhibits/rooms/combos):`, cf.validation.stages.map((s) => `${s.suspects}/${s.exhibits}/${s.rooms}=${s.combos}`).join("  →  "));
for (const r of [1, 2, 3]) {
  console.log(`\n— Round ${r} —`);
  for (const c of cf.clues.filter((c) => c.round === r).sort((a, b) => (a.markerNumber ?? 99) - (b.markerNumber ?? 99))) {
    const where = c.channel === "marker" ? `Marker ${c.markerNumber} (${input.markers.find((m) => m.number === c.markerNumber)!.roomKey})` : "TV";
    console.log(`[${where}] ${c.text}`);
  }
}
console.log(`\n— Tips —`);
for (const t of cf.tips.slice(0, 3)) console.log(`${nameOf(t.playerId)}: ${t.text}`);
const k = cf.briefings.find((b) => b.role === "killer")!;
console.log(`\n— Killer's phone —\n${k.lines.join("\n")}\nMotive: ${k.motive}\nSecret: ${k.secret}`);
