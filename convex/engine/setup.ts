// Recommended setups by guest count (Oct 16). Heston first asked to "eliminate the setup options for number of rooms
// and markers to better optimize the gameplay based on player count", then: "we may need to add back the ability to
// edit room names and room count so others can match it to their house. as well as evidence. But put a small ledger
// for recommended setups for different arrangements of rooms to evidence ratio for playability and difficulty". So
// the host sets rooms and cards; this table is the ledger the menu shows, and the cards a game gets if the host sets
// none.
//
// From the simulations (scripts/difficulty.ts and friends): with the v3 evidence, how hard the case is barely moves
// with rooms or cards (the engine balances it). What they change is the search: each room past 6 leaves one more room
// open going into Round 3 (harder), 3 rooms leave only 2 (easier); and past about one card per guest, the extra cards
// are dead ends, while far fewer cards push the evidence onto the TV.
export type Setup = { rooms: number; markers: number; weapons?: number };

/** The old way, for comparison: whatever the host set; the simulations used 5 rooms and 15 markers. */
export const LEGACY_SETUP: Setup = { rooms: 5, markers: 15 };

/** The ledger: for each size of party, the rooms and evidence cards that play best. */
// Weapons (Oct 16): the game draws them now that guests don't pick one; 6 like Clue, more for bigger parties.
export const RECOMMENDED: { guests: [number, number]; rooms: number; markers: number; weapons: number }[] = [
  { guests: [3, 6], rooms: 4, markers: 8, weapons: 6 },
  { guests: [7, 9], rooms: 5, markers: 10, weapons: 6 },
  { guests: [10, 12], rooms: 5, markers: 15, weapons: 8 },
  { guests: [13, 16], rooms: 6, markers: 18, weapons: 8 },
  { guests: [17, 24], rooms: 7, markers: 21, weapons: 10 },
];

export function setupFor(guests: number): Setup {
  if (typeof process !== "undefined" && process.env?.LEGACY_SETUP) return LEGACY_SETUP;
  const row = RECOMMENDED.find((r) => guests <= r.guests[1]) ?? RECOMMENDED[RECOMMENDED.length - 1];
  return { rooms: row.rooms, markers: row.markers, weapons: row.weapons };
}

/** Cards 1 to N, dealt round the rooms in order (card 1 in the first room, card 2 in the second…). */
export function dealCards(n: number, rooms: { key: string }[]): { number: number; roomKey: string }[] {
  if (!rooms.length) return [];
  return Array.from({ length: n }, (_, i) => ({ number: i + 1, roomKey: rooms[i % rooms.length].key }));
}

/** The recommended cards for a game this size, dealt round its rooms. */
export const cardPlan = (guests: number, rooms: { key: string }[]) => dealCards(setupFor(guests).markers, rooms);
