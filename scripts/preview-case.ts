// Dumps one fake case as JSON for the Phase 3 preview. Fake guests only.
import { buildCase } from "../convex/engine/build";
import { fakeCast, ROOMS_5 } from "../convex/engine/fake";
import { seeded } from "../convex/engine/rng";

const rng = seeded(2026);
const input = fakeCast({ rng, guests: 9, rooms: ROOMS_5, markers: 15 });
const cf = buildCase(input, rng);
const killer = cf.solution.killerId;
const innocent = cf.tips[0].playerId;
const brief = (id: string) => {
  const b = cf.briefings.find((x) => x.playerId === id)!;
  const tip = cf.tips.find((t) => t.playerId === id)?.text ?? null;
  return { ...b, tip, name: input.suspects.find((s) => s.id === id)!.name };
};
const out = {
  suspects: input.suspects.map((s) => ({ id: s.id, name: s.name, signature: s.signature })),
  exhibits: input.exhibits.map((e) => ({ id: e.id, letter: e.letter, name: e.name, owner: e.ownerId })).sort((a, b) => a.letter.localeCompare(b.letter)),
  rooms: input.rooms,
  markers: cf.clues.filter((c) => c.channel === "marker").map((c) => ({ number: c.markerNumber, room: input.markers.find((m) => m.number === c.markerNumber)!.roomKey, text: c.text })).sort((a, b) => a.number! - b.number!),
  round2: cf.clues.filter((c) => c.round === 2 && c.channel === "tv").map((c) => c.text),
  round3: cf.clues.filter((c) => c.round === 3).map((c) => ({ text: c.text, twist: c.kind === "twist" })),
  innocent: brief(innocent),
  killer: brief(killer),
};
console.log(JSON.stringify(out));
