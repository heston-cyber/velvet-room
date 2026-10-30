// Phase 3 (Oct 20): three simulated nights, written out for Heston to read before Phase 4 ("You read sample stories
// from 3 simulated nights before Phase 4"). The party cast's first names, his house's rooms, the recommended cards.
//   npx tsx scripts/sample-nights.ts > sample-nights.md
import { buildCase, remainingAfter } from "../convex/engine/build";
import { ROOMS_5 } from "../convex/engine/fake";
import { seeded, shuffle } from "../convex/engine/rng";
import { setupFor, dealCards } from "../convex/engine/setup";
import { CAST } from "../convex/figures";
import { WEAPONS, drawWeapons } from "../convex/weapons";
import type { CaseInput } from "../convex/engine/types";

const NIGHTS: { guests: number; seed: number; tone: "classic" | "adult" }[] = [
  { guests: 8, seed: 31, tone: "adult" },
  { guests: 10, seed: 57, tone: "classic" },
  { guests: 6, seed: 12, tone: "adult" },
];

const out: string[] = [];
const say = (s = "") => out.push(s);
say("# Velvet Room: the house stories, 3 sample nights (Oct 29)");
say();
say("Your test-night notes, Oct 29: every story now happens somewhere in your house or right outside it, from your list (restroom, master bathroom, front porch, back porch, kitchen, garage, laundry room, driveway, curb, a walk around the neighborhood, a car on the street, master bedroom), never in one of the 5 search rooms. The halal cart, the bodega, the rideshare and the rest of the New York spots are gone, and the late tips are about the party at the house. Built on dev with the party cast's first names, your 5 rooms and the recommended cards. Each night: what every phone says, every card and TV drop by round, the late tips, the debts, and how a table that finds every card gets to the killer. No jail vote any more.");
say();
say("**Spoilers for these three made-up nights only.** Real games draw everything fresh at Start.");

for (const [i, n] of NIGHTS.entries()) {
  const rng = seeded(n.seed);
  const people = shuffle(rng, CAST).slice(0, n.guests);
  const setup = setupFor(n.guests);
  const weapons = drawWeapons(setup.weapons ?? 6, rng).map((k) => WEAPONS.find((w) => w.key === k)!);
  const input: CaseInput = {
    suspects: people.map((p) => ({ id: p.key, name: p.name, signature: "", who: "", killerOk: true, sex: p.sex })),
    exhibits: weapons.map((w, j) => ({ id: w.key, letter: "ABCDEFGHJK"[j], name: w.name, description: "", kind: w.kind })),
    rooms: ROOMS_5,
    markers: dealCards(setup.markers, ROOMS_5),
    search: "waves",
    tone: n.tone,
  };
  const cf = buildCase(input, rng);
  const name = (id: string) => input.suspects.find((s) => s.id === id)!.name;
  const room = (k: string) => ROOMS_5.find((r) => r.key === k)!.label;
  const killer = name(cf.solution.killerId);
  const end = [...remainingAfter(input, cf.clues, 3).suspects];
  const byDetail = (d?: string) => cf.stories!.find((s) => s.detail === d && s.playerId !== cf.solution.killerId);
  say();
  say(`## Night ${i + 1}: ${n.guests} guests, ${setup.markers} cards, ${n.tone === "adult" ? "Adult" : "Classic"}`);
  say();
  say(`**The answer:** ${killer}, with the ${weapons.find((w) => w.key === cf.solution.exhibitId)!.name.toLowerCase()}, in ${room(cf.solution.roomKey)}. The body turns up in ${room(cf.bodyRoomKey)}.`);
  say();
  say(`**Left standing by the evidence after Round 3:** ${end.map(name).join(", ")}.`);
  say();
  say("### What each phone says (\"Where you were\")");
  say();
  for (const s of cf.stories!) say(`- **${name(s.playerId)}**${s.playerId === cf.solution.killerId ? " *(the killer: this is the cover)*" : ""}: ${s.text}`);
  say();
  say("### The cards and the TV, by round");
  for (const r of [1, 2, 3]) {
    say();
    say(`**Round ${r}**`);
    say();
    const rows = cf.clues.filter((c) => c.round === r).sort((a, b) => (a.channel === b.channel ? (a.markerNumber ?? 0) - (b.markerNumber ?? 0) : a.channel === "marker" ? -1 : 1));
    for (const c of rows) {
      const where = c.channel === "marker" ? `Card ${c.markerNumber} (${room(input.markers.find((m) => m.number === c.markerNumber)!.roomKey)})` : "TV";
      let note = "";
      if (c.kind === "story" && c.facts?.breaks) note = ` *(the deciding card: breaks ${killer}'s story)*`;
      else if (c.kind === "story") note = ` *(backs up ${byDetail(c.facts?.detail)?.playerId ? name(byDetail(c.facts?.detail)!.playerId) : "?"}'s story)*`;
      else if (c.kind === "stash") note = " *(the stash: the first phone gets this; everyone after finds an empty envelope)*";
      else if (c.kind === "flavor") note = " *(the comedy card)*";
      else if (c.kind === "herring") note = " *(a red herring)*";
      say(`- ${where}: ${c.text}${note}`);
    }
  }
  say();
  say("### Late tips (land on the TV when Round 2 ends)");
  say();
  for (const t of cf.lateTips!) say(`- ${t.text}`);
  say();
  say("### Debts (on the phones)");
  say();
  for (const d of cf.debts!) say(`- ${name(d.fromId)} owes ${name(d.toId)} $${d.amount}.`);
  say();
  say("### How a table that finds everything gets there");
  say();
  const innocentsLeft = end.filter((id) => id !== cf.solution.killerId);
  const backed = innocentsLeft.find((id) => cf.clues.some((c) => c.kind === "story" && !c.facts?.breaks && c.facts?.detail === cf.stories!.find((s) => s.playerId === id)!.detail));
  const unbacked = innocentsLeft.find((id) => id !== backed);
  const dec = cf.clues.find((c) => c.facts?.breaks)!;
  say(`- The evidence leaves ${end.map(name).join(", ")}. All three were alone, so being alone proves nothing.`);
  if (backed) say(`- A story card backs up ${name(backed)}'s detail.`);
  if (unbacked) say(`- ${name(unbacked)}'s story is true, but nothing confirms it. Until the deciding card turns up, ${name(unbacked)} and ${killer} look exactly alike.`);
  say(`- The deciding card (${dec.channel === "marker" ? `Card ${dec.markerNumber}, ${room(input.markers.find((m) => m.number === dec.markerNumber)!.roomKey)}, Round ${dec.round}` : "on the TV"}) says the opposite of ${killer}'s detail. Whoever matches it to ${killer}'s story has the killer. The card never names anyone, so someone has to make the match.`);
}

console.log(out.join("\n"));
