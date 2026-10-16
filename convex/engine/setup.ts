// The game picks its own size from the guest count (Heston, Oct 16: "eliminate the setup options for number of rooms
// and markers to better optimize the gameplay based on player count"). Rooms: the five on the house map, always.
// Evidence cards: about one per guest, so everyone finds something; most carry nothing useful.
export type Setup = { rooms: number; markers: number };

/** The old way, for comparison: whatever the host set; the simulations used 5 rooms and 15 markers. */
export const LEGACY_SETUP: Setup = { rooms: 5, markers: 15 };

export const HOUSE_ROOMS = 5;

export function setupFor(guests: number): Setup {
  if (process.env.LEGACY_SETUP) return LEGACY_SETUP;
  const markers = guests <= 6 ? 10 : guests <= 9 ? 12 : guests <= 12 ? 15 : guests <= 16 ? 18 : 20;
  return { rooms: HOUSE_ROOMS, markers };
}
