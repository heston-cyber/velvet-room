// Clue wording. Every template only states what its clue proves, so the logic in
// build.ts stays the single source of truth. A game picks one Script: Classic or Adult.
//
// Oct 18 (Heston: "at each start of the game you have to look at all the evidence and rooms and weapons and players and
// make sure everything lines up properly and makes sense without any contradictions"): every alibi, weapon clear and
// room clear says where things were (its Facts), and the builder checks those against the night (where the Don died,
// where the body turned up, which rooms were sealed or crowded) before a word is written. See build.ts, worldProblems.
import { shuffle } from "./rng";
import type { Place, Rng, WeaponKind } from "./types";

export const q = (s: string) => `“${s}”`;

/** "The Back Office" -> "the Back Office" for use mid-sentence. */
export function mid(label: string): string {
  return label.replace(/^The /, "the ");
}

/**
 * Deals sentence patterns from a shuffled deck per clue type, so one game only repeats a pattern after it has used
 * every other pattern of that type. With ok, deals the next pattern that fits (Oct 18: one that doesn't contradict the
 * night); when none in the deck fits, any that fits.
 */
export function deckPicker(rng: Rng) {
  const decks = new Map<string, number[]>();
  return function say<T>(key: string, items: readonly T[], ok?: (x: T) => boolean): T {
    let deck = decks.get(key);
    if (!deck || deck.length === 0) {
      deck = shuffle(rng, items.map((_, i) => i));
      decks.set(key, deck);
    }
    if (!ok) return items[deck.pop()!];
    for (let j = deck.length - 1; j >= 0; j--) if (ok(items[deck[j]])) return items[deck.splice(j, 1)[0]];
    const fits = items.filter(ok);
    return fits.length ? fits[Math.floor(rng() * fits.length)] : items[deck.pop()!];
  };
}
export type Say = ReturnType<typeof deckPicker>;

/** "Sam", "Sam and Josh", "Sam, Josh and Reily". */
export function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
/** Weapons by name in a list: "the knife, the rope and the revolver". */
export const theList = (names: string[]) => list(names.map((n) => `the ${n}`));

export function fill(template: string, signature: string): string {
  return template.replace("{s}", q(signature));
}

/**
 * A sentence pattern and what it claims about the night.
 * - at: where the guests (alibis) or the watched weapon (clears) were while the Don was killed. "out" is never one
 *   of the house's rooms; the rest match a room by its name (build.ts, roomOfPlace).
 * - seal: a room clear that says nobody was in the room (locked, untouched) until the body turned up.
 * - crowd: a room clear that says the room was full of people all night.
 */
export type Line<A extends unknown[]> = { t: (...a: A) => string; at?: Place[]; seal?: boolean; crowd?: boolean };

export type KillerFacts = {
  weapon: string;
  room: string; // label
  ownWeapon: boolean;
  herringName?: string;
  /** Killer + accomplice games: the accomplice's character name. */
  accompliceName?: string;
};

/** What the accomplice's phone says (v2): who did it, with what and where, and how to help. */
export type AccompliceFacts = {
  killerName: string;
  weapon: string;
  room: string; // label
  /** The murder weapon is the one the accomplice picked at sign-up. */
  ownWeapon: boolean;
  /** A clue points at this innocent (not the accomplice). */
  herringName?: string;
  /** A clue points at the accomplice themselves. */
  herringIsMe: boolean;
};

export type Script = {
  suspectClear: Line<[string]>[];
  suspectPairClear: Line<[string, string]>[];
  /** v3: three alibis in one clue. */
  suspectTrioClear: Line<[string, string, string]>[];
  /** v3: the killer is a man ("m") or a woman ("f"); names everyone of the other sex it clears. */
  witness: (say: Say, killerSex: "m" | "f", cleared: string[]) => string;
  /**
   * v3: the coroner's report. positive: the weapon was of this kind (rules out every other kind); otherwise it was
   * not of this kind. weapons: the ones it rules out, by name, lower case.
   */
  coroner: (say: Say, kind: WeaponKind, positive: boolean, weapons: string[]) => string;
  /**
   * Weapons go by name (lower case: "the lawn gnome"). Oct 16: weapon and room clears never reason from blood, wounds
   * or a struggle. They say where the thing was all night, or, for a gun, that it was never fired. Weapon names can be
   * plural ("the gloves"), so no "it" or "was" right after a name.
   */
  exhibitClear: Line<[string]>[];
  exhibitGunClear: Line<[string]>[];
  exhibitPairClear: Line<[string, string]>[];
  roomClear: Line<[string]>[];
  twistMoved: (bodyLabel: string) => string;
  twistStayed: (bodyLabel: string) => string;
  /**
   * Oct 18: a herring casts suspicion without saying where anyone was when the Don died (an alibi later clears them,
   * so "seen near the Don right before" would contradict it), and never says where it was found.
   */
  herring: Line<[string]>[];
  flavor: string[];
  killerLines: (f: KillerFacts) => string[];
  innocentLines: string[];
  /** Killer + accomplice games (v2). */
  accompliceLines: (f: AccompliceFacts) => string[];
  innocentLinesAcc: string[];
};

export const CLASSIC: Script = {
  suspectClear: [
    { at: ["front"], t: (n) => `The coat-check girl swears ${n} never left her sight while the Don was alone. ${n} is in the clear.` },
    { at: ["bar"], t: (n) => `A flash photo from the bar shows ${n} mid-toast at the very moment the Don went quiet. Cleared.` },
    { at: ["cards"], t: (n) => `${n} was losing at cards the whole time. Five sore winners vouch for it. Cleared.` },
    { at: ["lounge"], t: (n) => `The bandleader says ${n} requested the same song three times running and never left the dance floor. Cleared.` },
    { at: ["front"], t: (n) => `${n} spent the whole stretch arguing with the doorman about a bar tab. He's sure of it. Cleared.` },
    { at: ["out"], t: (n) => `A cab driver waited at the curb while ${n} hunted through every pocket for the fare. That took the whole stretch. Cleared.` },
    { at: ["bath"], t: (n) => `${n} was stuck in the line for the powder room the entire time, and four people in that line will swear to it. Cleared.` },
    { at: ["out"], t: (n) => `The beat cop on the corner chatted with ${n} on the front steps right through it. A cop's word is good enough. Cleared.` },
    { at: ["front"], t: (n) => `${n} was on the hall telephone to a sister in Brooklyn the whole stretch, and the operator logged the call. Cleared.` },
    { at: ["kitchen"], t: (n) => `The cook says ${n} spent the whole stretch in the kitchen begging for another plate of oysters. Cleared.` },
    { at: ["out"], t: (n) => `${n} was out on the fire escape getting some air, in plain view of half the street. Cleared.` },
  ],
  suspectPairClear: [
    { at: ["lounge"], t: (a, b) => `${a} and ${b} were stuck together by the piano all evening, trading insults. The piano player backs them both. Both cleared.` },
    { at: ["bar"], t: (a, b) => `The bartender kept ${a} and ${b} in his sights all night. Neither one left the bar. Both cleared.` },
    { at: ["out"], t: (a, b) => `${a} and ${b} were caught sneaking a smoke out back together when it happened. Both cleared.` },
    { at: ["kitchen"], t: (a, b) => `${a} and ${b} played checkers in the kitchen with the dishwasher the whole time. He won every game and remembers them both. Both cleared.` },
    { at: ["out"], t: (a, b) => `${a} and ${b} were on a liquor run across town and walked back in after the Don was already dead. The cab driver confirms it. Both cleared.` },
    { at: ["front"], t: (a, b) => `The coat-check girl watched ${a} and ${b} argue over the same fur coat for twenty minutes. Neither won. Both cleared.` },
    { at: ["out"], t: (a, b) => `${a} and ${b} spent the whole stretch on the front steps arguing about baseball with the doorman. Both cleared.` },
  ],
  suspectTrioClear: [
    { t: (a, b, c) => `${a}, ${b} and ${c} were all in the club photographer's group shot, taken the very minute the Don died. All three cleared.` },
    { at: ["cards"], t: (a, b, c) => `${a}, ${b} and ${c} were at the craps table the whole time, and the dealer will swear to it. All three cleared.` },
    { at: ["lounge"], t: (a, b, c) => `The band saw ${a}, ${b} and ${c} dancing the Charleston, badly, right through it. All three cleared.` },
    { at: ["out"], t: (a, b, c) => `${a}, ${b} and ${c} were in the alley helping push a stalled delivery truck, and the driver will swear to it. All three cleared.` },
    { at: ["out"], t: (a, b, c) => `${a}, ${b} and ${c} were on the front steps serenading a passing streetcar, and half the block heard them. All three cleared.` },
    { t: (a, b, c) => `A fortune teller had ${a}, ${b} and ${c} at her table the whole stretch, reading three palms very slowly. All three cleared.` },
  ],
  witness: (say, sex, cleared) =>
    say("w", [
      sex === "m"
        ? `The hat-check girl saw the killer slip out the side door: a man, with his hat pulled low. That clears ${list(cleared)}.`
        : `The hat-check girl saw the killer slip out the side door: a woman, in a long dark coat. That clears ${list(cleared)}.`,
      sex === "m"
        ? `A cabbie parked outside heard a man shouting at the Don just before he died. The killer is a man, so ${list(cleared)} are in the clear.`
        : `A cabbie parked outside heard a woman shouting at the Don just before he died. The killer is a woman, so ${list(cleared)} are in the clear.`,
      sex === "m"
        ? `Footprints in spilled gin lead away from the body: a man's wingtips. That clears ${list(cleared)}.`
        : `Footprints in spilled gin lead away from the body: a woman's heels. That clears ${list(cleared)}.`,
      sex === "m"
        ? `The cigarette girl brushed past the killer in the dark right after: a man, tall, smelling of cheap cologne. That clears ${list(cleared)}.`
        : `The cigarette girl brushed past the killer in the dark right after: a woman, smelling of French perfume. That clears ${list(cleared)}.`,
      sex === "m"
        ? `A newsboy across the street saw someone hurry out a back window right after: a man in a fedora. That clears ${list(cleared)}.`
        : `A newsboy across the street saw someone hurry out a back window right after: a woman in a cloche hat. That clears ${list(cleared)}.`,
    ]),
  coroner: (say, kind, positive, weapons) => {
    const out = `That rules out ${theList(weapons)}.`;
    if (positive)
      return {
        blunt: `The coroner's report: the Don was struck with something heavy. ${out}`,
        blade: `The coroner's report: one deep, clean cut. Something sharp did this. ${out}`,
        gun: `The coroner's report: the Don was shot. ${out}`,
        cord: `The coroner's report: marks around the Don's neck. He was strangled. ${out}`,
        other: `The coroner's report: not a mark on him. No wound of any kind. ${out}`,
      }[kind];
    return say(`c-${kind}`, [
      {
        blunt: `The coroner's report: no fractures, no crushing injuries. Nothing heavy was used. ${out}`,
        blade: `The coroner's report: no stab wounds, no slashes. Nothing sharp was used. ${out}`,
        gun: `The coroner's report: no gunshot wound, and nobody heard a shot all night. ${out}`,
        cord: `The coroner's report: no marks around the Don's neck. He wasn't strangled. ${out}`,
        other: `The coroner's report: no poison in his blood, no water in his lungs. ${out}`,
      }[kind],
    ]);
  },
  exhibitClear: [
    { at: ["front"], t: (w) => `The ${w} sat in the coat check all night, and the coat-check girl never let anyone near. Not the weapon.` },
    { t: (w) => `The Don locked the ${w} in his office safe before the party, and only he knew the combination. Not the weapon.` },
    { t: (w) => `The dust around the ${w} hasn't been disturbed all night. Not the weapon.` },
    { t: (w) => `The ${w} spent the whole night in a locked display case, and the only key was in the Don's own pocket. Not the weapon.` },
    { t: (w) => `A bouncer guarded the crate with the ${w} in it all night, and nobody got past him. Not the weapon.` },
    { at: ["lounge"], t: (w) => `The ${w} sat on the bandstand in plain view of the whole room all night. Not the weapon.` },
    { t: (w) => `The ${w} came back from the repair shop this morning, still wrapped in brown paper with the string unbroken. Not the weapon.` },
  ],
  exhibitGunClear: [
    { t: (w) => `The ${w} is still fully loaded and hasn't been fired tonight. Not the weapon.` },
    { t: (w) => `Not a whiff of powder on the ${w}. Nobody fired it tonight. Not the weapon.` },
    { t: (w) => `The ${w} is rusted solid. It couldn't fire tonight if it tried. Not the weapon.` },
    { t: (w) => `The ${w} is still wrapped in the Don's oilcloth with the knots untouched. Not the weapon.` },
  ],
  exhibitPairClear: [
    { at: ["bar"], t: (a, b) => `The ${a} and the ${b} were behind the bar under the bartender's nose all evening. Neither one was used.` },
    { t: (a, b) => `The Don locked the ${a} and the ${b} in his office safe before the party, and only he knew the combination. Neither is the weapon.` },
    { at: ["out"], t: (a, b) => `The ${a} and the ${b} were in the trunk of the Don's car, and the chauffeur sat on the bumper all night. Neither is the weapon.` },
    { t: (a, b) => `The ${a} and the ${b} were locked in the supply closet, and the manager has the only key. Neither one was used.` },
  ],
  roomClear: [
    { seal: true, t: (r) => `${r} was locked from the start of the party until the body turned up, and the manager never let go of the key. The Don wasn't killed there.` },
    { seal: true, t: (r) => `Until the body turned up, the dust on the floor of ${mid(r)} hadn't been disturbed all night. Nobody died in there.` },
    { seal: true, t: (r) => `The staff tied a ribbon across the door of ${mid(r)} before the party, and it was still unbroken when the body turned up. Not there.` },
    { crowd: true, t: (r) => `${r} was full of witnesses all evening. Nobody could have killed the Don there unseen.` },
    { crowd: true, t: (r) => `A card game ran in ${mid(r)} all night, a dozen players and a dealer who never blinked. Nobody was killed in there.` },
    { crowd: true, t: (r) => `${r} hosted a birthday toast for the bandleader right through the evening. Thirty guests, and not one murder. Not there.` },
  ],
  twistMoved: (body) =>
    `The twist: the Don wasn't killed in ${mid(body)} at all. Drag marks say someone moved him there after he was dead.`,
  twistStayed: (body) =>
    `The twist: there are no drag marks anywhere. The Don was killed right where he was found, in ${mid(body)}.`,
  herring: [
    { t: (n) => `A matchbook with ${n}'s name scribbled inside turned up in the Don's coat pocket. Could be nothing. Could be everything.` },
    { t: (n) => `Earlier tonight, ${n} was heard telling the bartender the Don wouldn't live to see Sunday. Could be talk. Could be a plan.` },
    { t: (n) => `A note in ${n}'s handwriting, tucked in the Don's hatband: "We need to talk. Tonight." Talking isn't killing. Or is it?` },
    { t: (n) => `${n} asked the coat-check girl twice tonight where the Don had gone. Curious. Very curious.` },
  ],
  flavor: [
    "An empty bottle of the Don's private gin. Somebody helped themselves. Nothing more.",
    "A torn betting slip on a long shot that never paid. It tells you nothing about tonight.",
    "Lipstick on a champagne glass. Half the room wears that shade.",
    "A stack of unpaid tabs with the Don's angry notes in the margins. Everybody owed him.",
    "A matchbook from a joint across town. Plenty of people here drink there.",
    "A cold cigar in an ashtray, barely smoked. The Don hated waste. Odd, but it proves nothing.",
    "A bent hairpin on the stairs. Half the room wears them. It proves nothing.",
    "A deck of cards with every ace missing. Somebody's been cheating, just not at murder.",
    "A torn ticket stub for a picture show nobody here admits to seeing.",
    "A rhinestone off somebody's dress, rolled under a radiator. Pretty, and no help at all.",
  ],
  killerLines: (f) => [
    `You did it. You killed Don Ray Sanders with the ${f.weapon.toLowerCase()} in ${mid(f.room)}.`,
    // Only older games had weapons that belonged to a guest.
    ...(f.ownWeapon ? [`The ${f.weapon.toLowerCase()} is the weapon you brought. If anyone works that out, you'll need a good story.`] : []),
    ...(f.accompliceName ? [`Your accomplice is ${f.accompliceName}. They know what you did, and they'll lie to protect you.`] : []),
    "Over three rounds, the evidence will close in on you. Your job is to keep them guessing.",
    ...(f.herringName ? [`One clue points at ${f.herringName}. Lean on it.`] : []),
    f.accompliceName ? `You may lie about anything tonight, and so may ${f.accompliceName}. Everyone else has to tell the truth.` : "You may lie about anything tonight. Everyone else has to tell the truth.",
    ...(f.accompliceName ? [`If the heat gets too close, you can try pinning it on ${f.accompliceName}. Loyalty only goes so far.`] : []),
    "Stay out of jail: jailbirds can't lock in. Getting someone else jailed is fair game.",
    f.accompliceName
      ? "You and your accomplice win unless more than half of the lock-ins get you, the weapon and the room."
      : "You win unless more than half of the lock-ins get you, the weapon and the room.",
  ],
  innocentLines: [
    "You're innocent. You didn't kill the Don.",
    "Tell the truth. Only the killer may lie.",
    "Find the evidence cards, compare notes, and work out who did it, with which weapon, and where.",
    "After Round 2 you can vote someone into jail, if most of you agree; after Round 3, a vote to let them out. Jailbirds can't search, vote or lock in.",
  ],
  accompliceLines: (f) => [
    `You're the accomplice. You didn't kill the Don, but you know who did: ${f.killerName}.`,
    `${f.killerName} did it with the ${f.weapon.toLowerCase()} in ${mid(f.room)}.`,
    ...(f.ownWeapon ? [`The ${f.weapon.toLowerCase()} is the weapon you brought. Expect some questions.`] : []),
    `Your job is to keep ${f.killerName} out of trouble: steer the others wrong, cast doubt, and keep the heat off your partner.`,
    ...(f.herringIsMe
      ? [`One clue points at you. Good: every minute they spend on you is a minute they don't spend on ${f.killerName}.`]
      : f.herringName
        ? [`One clue points at ${f.herringName}. Help it stick.`]
        : []),
    "You may lie about anything tonight, just like the killer. Everyone else has to tell the truth.",
    `You didn't do it, so the evidence can't prove you did, and sooner or later it will clear you. Careful: if things get hot, ${f.killerName} may try to pin it on you.`,
    "Stay out of jail: jailbirds can't lock in. You win if the killer wins.",
  ],
  innocentLinesAcc: [
    "You're innocent. You didn't kill the Don.",
    "Tonight the killer has an accomplice: someone who didn't do it, knows who did, and will lie to protect them.",
    "Tell the truth. Only the killer and the accomplice may lie.",
    "Find the evidence cards, compare notes, and work out who did it, with which weapon, and where. When you lock in, you can guess the accomplice too.",
    "After every round, vote someone into jail if most of you agree. Jailbirds can't search, vote or lock in.",
  ],
};
