// Clue wording. Every template only states what its clue proves, so the logic
// in build.ts stays the single source of truth. Later, Claude can rewrite these
// in richer 1929 voice before the draw; these templates are the reliable fallback.
import { shuffle } from "./rng";
import type { Rng } from "./types";

const q = (s: string) => `“${s}”`;

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

/** "The Back Office" -> "the Back Office" for use mid-sentence. */
export function mid(label: string): string {
  return label.replace(/^The /, "the ");
}

export function suspectClear(say: Say, n: string): string {
  return say("s1", [
    `The coat-check girl swears ${n} never left her sight while the Don was alone. ${n} is in the clear.`,
    `A flash photo from the bar shows ${n} mid-toast at the very moment the Don went quiet. Cleared.`,
    `${n} was losing at cards in the back the whole time. Five sore winners vouch for it. Cleared.`,
    `The bandleader says ${n} requested the same song three times running and never left the dance floor. Cleared.`,
    `${n} spent the whole stretch arguing with the doorman about a bar tab. He's sure of it. Cleared.`,
  ]);
}

export function suspectPairClear(say: Say, a: string, b: string): string {
  return say("s2", [
    `${a} and ${b} were stuck together by the piano all evening, trading insults. The piano player backs them both. Both cleared.`,
    `The bartender kept ${a} and ${b} in his sights all night. Neither one left the bar. Both cleared.`,
    `${a} and ${b} were caught sneaking a smoke out back together when it happened. Both cleared.`,
  ]);
}

export function exhibitClear(say: Say, letter: string, name: string): string {
  return say("e1", [
    `The coroner rules out Exhibit ${letter} (${name}). The wounds don't match. Not the weapon.`,
    `Exhibit ${letter} (${name}) came back from the lab clean: no blood, no prints. Not the weapon.`,
    `Exhibit ${letter} (${name}) sat in the coat check all night and nobody touched it. Not the weapon.`,
  ]);
}

export function exhibitPairClear(say: Say, a: string, b: string): string {
  return say("e2", [
    `Exhibits ${a} and ${b} were behind the bar under the bartender's nose all evening. Neither one was used.`,
    `The lab cleared Exhibits ${a} and ${b}. Spotless, both of them. Neither is the weapon.`,
  ]);
}

export function roomClear(say: Say, label: string): string {
  const r = mid(label);
  return say("r1", [
    `Not a speck of blood in ${r}, and nothing is out of place. The Don wasn't killed there.`,
    `The dust on the floor of ${r} hasn't been disturbed all night. Nobody died in there.`,
    `${label} was full of witnesses all evening. Nobody could have killed the Don there unseen.`,
  ]);
}

/** Room clue read on a marker that sits in that same room. */
export function roomClearHere(label: string): string {
  return `This room is clean. No blood, no struggle. The Don wasn't killed in ${mid(label)}.`;
}

export function twistMoved(bodyLabel: string): string {
  return `The twist: the Don wasn't killed in ${mid(bodyLabel)} at all. Drag marks say someone moved him there after he was dead.`;
}

export function twistStayed(bodyLabel: string): string {
  return `The twist: there are no drag marks anywhere. The Don was killed right where he was found, in ${mid(bodyLabel)}.`;
}

export function herring(say: Say, signature: string): string {
  return say("h", [
    `Found near the body: ${q(signature)}. Whoever that belongs to has some explaining to do.`,
    `A witness swears they saw ${q(signature)} near the Don just before he died. Then again, it was dark.`,
  ]);
}

export const FLAVOR = [
  "An empty bottle of the Don's private gin. Somebody helped themselves. Nothing more.",
  "A torn betting slip on a long shot that never paid. It tells you nothing about tonight.",
  "Lipstick on a champagne glass. Half the room wears that shade.",
  "A stack of unpaid tabs with the Don's angry notes in the margins. Everybody owed him.",
  "A matchbook from a joint across town. Plenty of people here drink there.",
  "A cold cigar in an ashtray, barely smoked. The Don hated waste. Odd, but it proves nothing.",
];

export function tipIntro(text: string): string {
  return `A tip, just for you. Use it, trade it or keep it to yourself: ${text}`;
}

export const MOTIVES = [
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
];

export const SECRETS = [
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
];

export function fill(template: string, signature: string): string {
  return template.replace("{s}", q(signature));
}
