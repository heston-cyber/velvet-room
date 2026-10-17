// Clue wording. Every template only states what its clue proves, so the logic in
// build.ts stays the single source of truth. A game picks one Script: Classic or Adult.
import { shuffle } from "./rng";
import type { Rng, WeaponKind } from "./types";

export const q = (s: string) => `“${s}”`;

/** "The Back Office" -> "the Back Office" for use mid-sentence. */
export function mid(label: string): string {
  return label.replace(/^The /, "the ");
}

/**
 * Deals sentence patterns from a shuffled deck per clue type, so one game only repeats
 * a pattern after it has used every other pattern of that type.
 */
export function deckPicker(rng: Rng) {
  const decks = new Map<string, number[]>();
  return function say<T>(key: string, items: readonly T[]): T {
    let deck = decks.get(key);
    if (!deck || deck.length === 0) {
      deck = shuffle(rng, items.map((_, i) => i));
      decks.set(key, deck);
    }
    return items[deck.pop()!];
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
  suspectClear: (say: Say, n: string) => string;
  suspectPairClear: (say: Say, a: string, b: string) => string;
  /** v3: three alibis in one clue. */
  suspectTrioClear: (say: Say, a: string, b: string, c: string) => string;
  /** v3: the killer is a man ("m") or a woman ("f"); names everyone of the other sex it clears. */
  witness: (say: Say, killerSex: "m" | "f", cleared: string[]) => string;
  /**
   * v3: the coroner's report. positive: the weapon was of this kind (rules out every other kind); otherwise it was
   * not of this kind. weapons: the ones it rules out, by name, lower case.
   */
  coroner: (say: Say, kind: WeaponKind, positive: boolean, weapons: string[]) => string;
  /**
   * v2: weapons go by name (lower case: "the lawn gnome"); exhibit letters are gone. Oct 16: weapon and room clears
   * never reason from blood, wounds or a struggle, which would hint at how the Don died (and can contradict it). They
   * say where the thing was all night, or, for a gun, that it was never fired.
   */
  exhibitClear: (say: Say, name: string, kind?: WeaponKind) => string;
  exhibitPairClear: (say: Say, a: string, b: string) => string;
  roomClear: (say: Say, label: string) => string;
  roomClearHere: (label: string) => string;
  twistMoved: (bodyLabel: string) => string;
  twistStayed: (bodyLabel: string) => string;
  /** Oct 16: points at a guest by name (signature items are gone). Always someone the evidence clears later. */
  herring: (say: Say, name: string) => string;
  flavor: string[];
  /** I8 (Oct 17): dead-end cards that leak a motive about a guest picked at random (the killer as likely as anyone).
   *  They clear nobody and prove nothing: material for the final read. */
  leaks: (n: string) => string[];
  /** Shown above a guest's private tip. */
  tipLabel: string;
  motives: string[];
  secrets: string[];
  killerLines: (f: KillerFacts) => string[];
  innocentLines: string[];
  /** Killer + accomplice games (v2). */
  accompliceLines: (f: AccompliceFacts) => string[];
  innocentLinesAcc: string[];
};

export const CLASSIC: Script = {
  suspectClear: (say, n) =>
    say("s1", [
      `The coat-check girl swears ${n} never left her sight while the Don was alone. ${n} is in the clear.`,
      `A flash photo from the bar shows ${n} mid-toast at the very moment the Don went quiet. Cleared.`,
      `${n} was losing at cards in the back the whole time. Five sore winners vouch for it. Cleared.`,
      `The bandleader says ${n} requested the same song three times running and never left the dance floor. Cleared.`,
      `${n} spent the whole stretch arguing with the doorman about a bar tab. He's sure of it. Cleared.`,
    ]),
  suspectPairClear: (say, a, b) =>
    say("s2", [
      `${a} and ${b} were stuck together by the piano all evening, trading insults. The piano player backs them both. Both cleared.`,
      `The bartender kept ${a} and ${b} in his sights all night. Neither one left the bar. Both cleared.`,
      `${a} and ${b} were caught sneaking a smoke out back together when it happened. Both cleared.`,
    ]),
  suspectTrioClear: (say, a, b, c) =>
    say("s3", [
      `${a}, ${b} and ${c} were all in the club photographer's group shot, taken the very minute the Don died. All three cleared.`,
      `${a}, ${b} and ${c} were at the craps table the whole time, and the dealer will swear to it. All three cleared.`,
      `The band saw ${a}, ${b} and ${c} dancing the Charleston, badly, right through it. All three cleared.`,
    ]),
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
  exhibitClear: (say, name, kind) =>
    kind === "gun"
      ? say("e1g", [
          `The ${name} is still fully loaded and hasn't been fired tonight. Not the weapon.`,
          `Not a whiff of powder on the ${name}. Nobody fired it tonight. Not the weapon.`,
        ])
      : // Weapon names can be plural ("the gloves", "the garden shears"): no "it" and no "was" after the name.
        say("e1", [
          `The ${name} sat in the coat check all night, and the coat-check girl never let anyone near. Not the weapon.`,
          `The Don locked the ${name} in his office safe before the party, and only he knew the combination. Not the weapon.`,
          `The dust around the ${name} hasn't been disturbed all night. Not the weapon.`,
        ]),
  exhibitPairClear: (say, a, b) =>
    say("e2", [
      `The ${a} and the ${b} were behind the bar under the bartender's nose all evening. Neither one was used.`,
      `The Don locked the ${a} and the ${b} in his office safe before the party, and only he knew the combination. Neither is the weapon.`,
    ]),
  roomClear: (say, label) =>
    say("r1", [
      `${label} was locked all evening, and the manager never let go of the key. The Don wasn't killed there.`,
      `The dust on the floor of ${mid(label)} hasn't been disturbed all night. Nobody died in there.`,
      `${label} was full of witnesses all evening. Nobody could have killed the Don there unseen.`,
    ]),
  roomClearHere: (label) => `The dust on the floor in here hasn't been disturbed all night. The Don wasn't killed in ${mid(label)}.`,
  twistMoved: (body) =>
    `The twist: the Don wasn't killed in ${mid(body)} at all. Drag marks say someone moved him there after he was dead.`,
  twistStayed: (body) =>
    `The twist: there are no drag marks anywhere. The Don was killed right where he was found, in ${mid(body)}.`,
  herring: (say, n) =>
    say("h", [
      `Found near the body: a matchbook with ${n}'s name scribbled inside. Could be nothing. Could be everything.`,
      `A cigarette girl swears she saw ${n} whispering with the Don just before he died. Then again, it was dark.`,
    ]),
  flavor: [
    "An empty bottle of the Don's private gin. Somebody helped themselves. Nothing more.",
    "A torn betting slip on a long shot that never paid. It tells you nothing about tonight.",
    "Lipstick on a champagne glass. Half the room wears that shade.",
    "A stack of unpaid tabs with the Don's angry notes in the margins. Everybody owed him.",
    "A matchbook from a joint across town. Plenty of people here drink there.",
    "A cold cigar in an ashtray, barely smoked. The Don hated waste. Odd, but it proves nothing.",
  ],
  leaks: (n) => [
    `A crumpled IOU signed by ${n}: five hundred dollars, owed to the Don. It doesn't say who did it. It says who had a reason.`,
    `A note in the Don's handwriting: "${n} knows too much. Deal with it Monday." Monday never came.`,
    `A torn page from the Don's ledger with ${n}'s name circled twice. Circled by whom, and why?`,
    `A telegram for ${n}, unopened: "THE DON KNOWS. LEAVE TOWN." It proves nothing either way.`,
    `A photograph of ${n} shaking hands with the Don. Someone has scratched out the Don's face.`,
    `The Don's appointment book: "${n}, 9 PM, about the money." The rest of the page is smudged.`,
  ],
  tipLabel: "Other guests may have this same tip. If someone tells it differently, ask why.",
  motives: [
    "The Don owed you a small fortune and laughed when you asked for it.",
    "He caught you skimming from the till and promised you'd regret it.",
    "He threatened to tell everyone what you're really hiding.",
    "He fired your sweetheart from the band last week, in front of everyone.",
    "You lost your car to him in a card game, and you're sure he cheated.",
    "He cut you out of a deal you'd spent a year setting up.",
    "He knew about your past in Detroit and never let you forget it.",
    "He promised you a cut of the bootleg money and never paid.",
    "He was about to marry the person you love.",
    "He sold your favorite booth to a rival, and he did it to spite you.",
    "He called you a two-bit nobody in front of the whole room.",
    "He was holding your family's watch as collateral and wouldn't give it back.",
    "He framed your brother for a job the Don pulled himself.",
    "He was going to shut down the business you run out of the back.",
  ],
  secrets: [
    "You've been passing notes to the Feds.",
    "Your best suit is stolen, and its real owner is somewhere in this room.",
    "You're flat broke. Every dollar you flash tonight is borrowed.",
    "You snuck somewhere off-limits earlier tonight looking for something. You didn't find it.",
    "You aren't who you say you are. Your real name is on a wanted poster in Cleveland.",
    "You've been watering down the gin for months.",
    "You're secretly engaged to someone at this party.",
    "You owe money to a rival outfit, and they're getting impatient.",
    "You cheated at cards tonight and won big.",
    "You were supposed to deliver a message to the Don tonight, and you didn't.",
    "You've been writing the Don's love letters for him, and they weren't to his wife.",
    "You were fired from your last job for stealing, and nobody here knows.",
    "You've been sending the Don anonymous threats as a joke.",
    "You took a payment to keep an eye on someone here tonight.",
  ],
  killerLines: (f) => [
    `You did it. You killed Don Ray Sanders with the ${f.weapon.toLowerCase()} in ${mid(f.room)}.`,
    // Only older games had weapons that belonged to a guest.
    ...(f.ownWeapon ? [`The ${f.weapon.toLowerCase()} is the weapon you brought. If anyone works that out, you'll need a good story.`] : []),
    ...(f.accompliceName ? [`Your accomplice is ${f.accompliceName}. They know what you did, and they'll lie to protect you.`] : []),
    "Over three rounds, the evidence will close in on you. Your job is to keep them guessing.",
    ...(f.herringName ? [`One clue points at ${f.herringName}. Lean on it.`] : []),
    f.accompliceName
      ? `You may lie about anything tonight, and so may ${f.accompliceName}. Everyone else may only lie about their own secrets.`
      : "You may lie about anything tonight. Everyone else may only lie about their own secrets.",
    ...(f.accompliceName ? [`If the heat gets too close, you can try pinning it on ${f.accompliceName}. Loyalty only goes so far.`] : []),
    "Stay out of jail: jailbirds can't lock in. Getting someone else jailed is fair game.",
    f.accompliceName
      ? "You and your accomplice win unless more than half of the lock-ins get you, the weapon and the room."
      : "You win unless more than half of the lock-ins get you, the weapon and the room.",
  ],
  innocentLines: [
    "You're innocent. You didn't kill the Don.",
    "You may lie about your secret, but not about the murder. Only the killer may lie about that.",
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
    "You may lie about anything tonight, just like the killer. Everyone else may only lie about their own secrets.",
    `You didn't do it, so the evidence can't prove you did, and sooner or later it will clear you. Careful: if things get hot, ${f.killerName} may try to pin it on you.`,
    "Stay out of jail: jailbirds can't lock in. You win if the killer wins.",
  ],
  innocentLinesAcc: [
    "You're innocent. You didn't kill the Don.",
    "Tonight the killer has an accomplice: someone who didn't do it, knows who did, and will lie to protect them.",
    "You may lie about your secret, but not about the murder. Only the killer and the accomplice may lie about that.",
    "Find the evidence cards, compare notes, and work out who did it, with which weapon, and where. When you lock in, you can guess the accomplice too.",
    "After every round, vote someone into jail if most of you agree. Jailbirds can't search, vote or lock in.",
  ],
};
