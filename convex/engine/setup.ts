// The game picks its own size from the guest count (Heston, Oct 16: "eliminate the setup options for number of rooms
// and markers to better optimize the gameplay based on player count"). Rooms: the five on the house map, always.
// Evidence cards: about one per guest, so everyone finds something; most carry nothing useful.
export type Setup = { rooms: number; markers: number };

/** The old way, for comparison: whatever the host set; the simulations used 5 rooms and 15 markers. */
export const LEGACY_SETUP: Setup = { rooms: 5, markers: 15 };

export const HOUSE_ROOMS = 5;

export function setupFor(guests: number): Setup {
  if (typeof process !== "undefined" && process.env?.LEGACY_SETUP) return LEGACY_SETUP;
  const markers = guests <= 6 ? 10 : guests <= 9 ? 12 : guests <= 12 ? 15 : guests <= 16 ? 18 : 20;
  return { rooms: HOUSE_ROOMS, markers };
}

/** The evidence cards for a game this size: numbers 1 to N, dealt round the rooms in order (card 1 in the first
 *  room, card 2 in the second…), so every room gets about the same. */
export function cardPlan(guests: number, rooms: { key: string }[]): { number: number; roomKey: string }[] {
  if (!rooms.length) return [];
  return Array.from({ length: setupFor(guests).markers }, (_, i) => ({ number: i + 1, roomKey: rooms[i % rooms.length].key }));
}
