// Clue wording. Every template only states what its clue proves, so the logic in
// build.ts stays the single source of truth. A game picks one Script: Classic or Adult.
import { shuffle } from "./rng";
import type { Rng } from "./types";

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
  /** v2: weapons go by name (lower case: "the lawn gnome"); exhibit letters are gone. */
  exhibitClear: (say: Say, name: string) => string;
  exhibitPairClear: (say: Say, a: string, b: string) => string;
  roomClear: (say: Say, label: string) => string;
  roomClearHere: (label: string) => string;
  twistMoved: (bodyLabel: string) => string;
  twistStayed: (bodyLabel: string) => string;
  herring: (say: Say, signature: string) => string;
  flavor: string[];
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
  exhibitClear: (say, name) =>
    say("e1", [
      `The coroner rules out the ${name}. The wounds don't match. Not the weapon.`,
      `The ${name} came back from the lab clean: no blood, no prints. Not the weapon.`,
      `The ${name} sat in the coat check all night and nobody touched it. Not the weapon.`,
    ]),
  exhibitPairClear: (say, a, b) =>
    say("e2", [
      `The ${a} and the ${b} were behind the bar under the bartender's nose all evening. Neither one was used.`,
      `The lab cleared the ${a} and the ${b}. Spotless, both of them. Neither is the weapon.`,
    ]),
  roomClear: (say, label) =>
    say("r1", [
      `Not a speck of blood in ${mid(label)}, and nothing is out of place. The Don wasn't killed there.`,
      `The dust on the floor of ${mid(label)} hasn't been disturbed all night. Nobody died in there.`,
      `${label} was full of witnesses all evening. Nobody could have killed the Don there unseen.`,
    ]),
  roomClearHere: (label) => `This room is clean. No blood, no struggle. The Don wasn't killed in ${mid(label)}.`,
  twistMoved: (body) =>
    `The twist: the Don wasn't killed in ${mid(body)} at all. Drag marks say someone moved him there after he was dead.`,
  twistStayed: (body) =>
    `The twist: there are no drag marks anywhere. The Don was killed right where he was found, in ${mid(body)}.`,
  herring: (say, s) =>
    say("h", [
      `Found near the body: ${q(s)}. Whoever that belongs to has some explaining to do.`,
      `A witness swears they saw ${q(s)} near the Don just before he died. Then again, it was dark.`,
    ]),
  flavor: [
    "An empty bottle of the Don's private gin. Somebody helped themselves. Nothing more.",
    "A torn betting slip on a long shot that never paid. It tells you nothing about tonight.",
    "Lipstick on a champagne glass. Half the room wears that shade.",
    "A stack of unpaid tabs with the Don's angry notes in the margins. Everybody owed him.",
    "A matchbook from a joint across town. Plenty of people here drink there.",
    "A cold cigar in an ashtray, barely smoked. The Don hated waste. Odd, but it proves nothing.",
  ],
  tipLabel: "A tip, just for you. Use it, trade it or keep it to yourself.",
  motives: [
    "The Don owed you a small fortune and laughed when you asked for it.",
    "He caught you skimming from the till and promised you'd regret it.",
    "He threatened to tell everyone what your {s} is really hiding.",
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
    "Your {s} is stolen, and its real owner is somewhere in this room.",
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
    f.ownWeapon
      ? `The ${f.weapon.toLowerCase()} is the weapon you brought. If anyone works that out, you'll need a good story.`
      : `The ${f.weapon.toLowerCase()} isn't the weapon you brought. That's lucky for you.`,
    ...(f.accompliceName ? [`Your accomplice is ${f.accompliceName}. They know what you did, and they'll lie to protect you.`] : []),
    "Over three rounds, the clues will clear the other guests one by one. Your job is to keep them guessing.",
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
    "Find the markers, compare notes, and work out who did it, with which weapon, and where.",
    "After every round, vote someone into jail if most of you agree. Jailbirds can't search, vote or lock in.",
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
    "Find the markers, compare notes, and work out who did it, with which weapon, and where. When you lock in, you can guess the accomplice too.",
    "After every round, vote someone into jail if most of you agree. Jailbirds can't search, vote or lock in.",
  ],
};
