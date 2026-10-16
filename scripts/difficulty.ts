// How hard is the mystery? Simulates many cases per guest count and reports what a table of honest players who pool
// everything (every marker found, every tip shared) still has open after each round.
//   npx tsx scripts/difficulty.ts [games=400]
import { buildCase } from "../convex/engine/build";
import { fakeCast, roomsN } from "../convex/engine/fake";
import { seeded } from "../convex/engine/rng";
import type { CaseFile, CaseInput } from "../convex/engine/types";
import { setupFor } from "../convex/engine/setup";

const GAMES = Number(process.argv[2] ?? 400);

type Open = { s: number; e: number; r: number };
function openAfter(input: CaseInput, cf: CaseFile, round: number, withTips: boolean): Open {
  const s = new Set(input.suspects.map((x) => x.id));
  const e = new Set(input.exhibits.map((x) => x.id));
  const r = new Set(input.rooms.map((x) => x.key));
  const elims = cf.clues.filter((c) => c.round <= round).map((c) => c.elim);
  if (withTips) elims.push(...cf.tips.map((t) => t.elim));
  for (const el of elims) {
    el.suspects.forEach((id) => s.delete(id));
    el.exhibits.forEach((id) => e.delete(id));
    el.rooms.forEach((k) => r.delete(k));
  }
  return { s: s.size, e: e.size, r: r.size };
}

const pct = (a: number, b: number) => `${Math.round((100 * a) / b)}%`;
console.log(`${GAMES} games per row. Open after each round = suspects/weapons/rooms still possible, pooling every marker and every tip.`);
for (const guests of [6, 8, 10, 12, 14, 16]) {
  const setup = setupFor(guests);
  const rows: { r1: Open; r2: Open; r1NoTip: Open; solvedR1: boolean; solvedR2: boolean; markers: number; clueMarkers: number; distinctTips: number; info: number; attempts: number }[] = [];
  for (let g = 0; g < GAMES; g++) {
    const rng = seeded(1000 * guests + g);
    const input: CaseInput = { ...fakeCast({ rng, guests: Math.min(guests, 12), rooms: roomsN(setup.rooms), markers: setup.markers }), search: "waves", tone: "classic" };
    // more than 12 guests: clone fake guests
    while (input.suspects.length < guests) {
      const i = input.suspects.length + 1;
      input.suspects.push({ ...input.suspects[i % 12], id: `p${i}`, name: `Guest ${i}` });
      input.exhibits.push({ ...input.exhibits[i % 12], id: `w${i}`, name: `Weapon ${i}`, ownerId: `p${i}` });
    }
    const cf = buildCase(input, rng);
    const r1 = openAfter(input, cf, 1, true);
    const r2 = openAfter(input, cf, 2, true);
    rows.push({
      r1,
      r2,
      r1NoTip: openAfter(input, cf, 1, false),
      solvedR1: r1.s * r1.e * r1.r === 1,
      solvedR2: r2.s * r2.e * r2.r === 1,
      markers: input.markers.length,
      clueMarkers: cf.clues.filter((c) => c.channel === "marker" && c.kind !== "flavor" && c.kind !== "herring").length,
      distinctTips: new Set(cf.tips.map((t) => t.clueId)).size,
      info: cf.clues.filter((c) => c.kind !== "flavor" && c.kind !== "herring").length,
      attempts: cf.attempts,
    });
  }
  const avg = (f: (x: (typeof rows)[number]) => number) => (rows.reduce((a, x) => a + f(x), 0) / rows.length).toFixed(1);
  const W = Math.min(guests, 22);
  console.log(
    `${String(guests).padStart(2)} guests, ${setup.rooms} rooms, ${setup.markers} markers (${avg((x) => x.clueMarkers)} with evidence), ${avg((x) => x.info)} clues, ${avg((x) => x.distinctTips)} different tips, max tries ${Math.max(...rows.map((x) => x.attempts))} | ` +
      `start ${guests}/${W}/${setup.rooms} | after R1, markers only: ${avg((x) => x.r1NoTip.s)}/${avg((x) => x.r1NoTip.e)}/${avg((x) => x.r1NoTip.r)} | ` +
      `after R1 + tips: ${avg((x) => x.r1.s)}/${avg((x) => x.r1.e)}/${avg((x) => x.r1.r)} | after R2: ${avg((x) => x.r2.s)}/${avg((x) => x.r2.e)}/${avg((x) => x.r2.r)} | ` +
      `solved by R1 ${pct(rows.filter((x) => x.solvedR1).length, rows.length)}, by R2 ${pct(rows.filter((x) => x.solvedR2).length, rows.length)}`,
  );
}
