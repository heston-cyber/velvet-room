// Fake casts for test mode and the simulation tests. Clearly invented people and props.
import { shuffle } from "./rng";
import type { CaseInput, Exhibit, Marker, Rng, Room, Suspect } from "./types";

export const FAKE_GUESTS: { name: string; who: string; signature: string; weapon: string; weaponDesc: string; rumor?: string }[] = [
  { name: "Velma “Two-Bits” Kowalski", who: "Cigarette girl who sells secrets by the pack.", signature: "Silver cigarette case", weapon: "Brass candlestick", weaponDesc: "Heavy, a foot tall, dented base.", rumor: "Sold the same secret to three different men in one night." },
  { name: "Father Malone", who: "A priest who drinks more than he prays.", signature: "Rosary he twirls", weapon: "Rubber chicken", weaponDesc: "Yellow and squeaky.", rumor: "Hears confessions, then bets on them." },
  { name: "Lucky Lou", who: "Bookie with famously bad luck.", signature: "Green dice", weapon: "Snapped pool cue", weaponDesc: "Chalky tip, splintered end.", rumor: "Once lost a bet on whether he'd lose a bet." },
  { name: "Dolores Vane", who: "Lounge singer with a grudge and a great voice.", signature: "Red feather boa", weapon: "Silk stocking", weaponDesc: "Sheer, black seam.", rumor: "Her ex-husbands all moved to different states." },
  { name: "Big Sal Moretti", who: "The Don's driver. Sees everything, says nothing.", signature: "Driving gloves", weapon: "Tire iron", weaponDesc: "Rusty, two feet long.", rumor: "Has never once used a turn signal." },
  { name: "Professor Pip", who: "Claims to be a magician. Mostly does card tricks.", signature: "Deck of cards", weapon: "Magic wand", weaponDesc: "Black with white tips.", rumor: "Made a man's wallet disappear. It's still missing." },
  { name: "Mabel Finch", who: "Society columnist hunting for a scoop.", signature: "Notebook and pencil", weapon: "Fountain pen", weaponDesc: "Gold nib, leaks ink.", rumor: "Keeps a file on everyone in this room." },
  { name: "Tommy Two-Tone", who: "Trumpet player who owes everybody.", signature: "Two-tone shoes", weapon: "Trumpet mute", weaponDesc: "Dented copper cone.", rumor: "Owes the band four months of pay and a trumpet." },
  { name: "Countess Olga", who: "Nobody knows which country she's a countess of.", signature: "Opera glasses", weapon: "Hat pin", weaponDesc: "Six inches, pearl head.", rumor: "Her accent changes depending on who's buying." },
  { name: "Officer Doyle", who: "Beat cop on the take.", signature: "Tin badge", weapon: "Nightstick", weaponDesc: "Black wood, leather strap.", rumor: "Arrests people, then sells them their own alibi." },
  { name: "Bunny LaRue", who: "Chorus girl who wants out of Chicago.", signature: "Rabbit-fur stole", weapon: "Champagne bottle", weaponDesc: "Empty, green glass.", rumor: "Can cry on cue, and does it at every card table." },
  { name: "Doc Halloran", who: "A doctor who lost his license and found a bar.", signature: "Black medical bag", weapon: "Stethoscope", weaponDesc: "Rubber tubing, steel bell.", rumor: "Still writes prescriptions. For gin." },
];

export const ROOMS_5: Room[] = [
  { key: "lounge", label: "The Lounge" },
  { key: "bar", label: "The Bar" },
  { key: "office", label: "The Back Office" },
  { key: "private", label: "The Private Room" },
  { key: "conservatory", label: "The Conservatory" },
];
export const ROOMS_6: Room[] = [...ROOMS_5, { key: "dock", label: "The Loading Dock" }];
export const ROOMS_8: Room[] = [...ROOMS_6, { key: "cellar", label: "The Wine Cellar" }, { key: "cloak", label: "The Cloakroom" }];
/** Any number of rooms from 2 to 8, for the simulations. */
export const roomsN = (n: number): Room[] => ROOMS_8.slice(0, n);

export const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ".split("");

export function fakeCast(opts: {
  rng: Rng;
  guests: number;
  rooms?: Room[];
  markers?: number;
  optInRate?: number; // 0..1
  weaponsHandedIn?: number; // default: everyone
}): CaseInput {
  const rooms = opts.rooms ?? ROOMS_5;
  const people = shuffle(opts.rng, FAKE_GUESTS).slice(0, opts.guests);
  const suspects: Suspect[] = people.map((g, i) => ({
    id: `p${i + 1}`,
    name: g.name,
    signature: g.signature,
    who: g.who,
    killerOk: opts.rng() < (opts.optInRate ?? 0.8),
  }));
  const letters = shuffle(opts.rng, LETTERS.slice(0, opts.guests));
  const exhibits: Exhibit[] = people
    .slice(0, opts.weaponsHandedIn ?? opts.guests)
    .map((g, i) => ({ id: `w${i + 1}`, letter: letters[i], name: g.weapon, description: g.weaponDesc, ownerId: `p${i + 1}` }));
  const markers: Marker[] = Array.from({ length: opts.markers ?? 15 }, (_, i) => ({
    number: i + 1,
    roomKey: rooms[i % rooms.length].key,
  }));
  return { suspects, exhibits, rooms, markers };
}
