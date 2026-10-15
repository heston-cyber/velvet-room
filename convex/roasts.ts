// Roll call roasts (v2, Oct 15): fill-in-the-blank jokes the narrator reads at the end of each
// guest's introduction. Written ahead of time, filled in from sign-up answers. Drafts for Heston's review.
//
// Blanks: {char} the character name, {real} the guest's real name, {weapon} the weapon they picked
// (lower case, no article: "lawn gnome"). Guests are "they" so every line works for anyone.
// No AI at the party: these are fixed, and each guest in a game gets a different one.
import type { Tone } from "./narration";

export const ROASTS: Record<Tone, string[]> = {
  classic: [
    "{real} picked the {weapon}. Somewhere, a therapist just felt a chill.",
    "{char} says they're here for the music. Nobody here has ever been here for the music.",
    "They say {char} never forgets a face. Mostly because they still owe most of them money.",
    "{real} practiced with the {weapon} all week. The neighbors have questions.",
    "{char} walked in like they own the place. The Don checked. They don't.",
    "{char} has a heart of gold. Stolen, but gold.",
    "{real} insisted on the {weapon}. Said it matched the outfit. Sadly, it does.",
    "{char} once talked their way out of a speeding ticket. In a horse and buggy.",
    "Keep an eye on {char}. Better yet, keep an eye on your wallet.",
    "{char} came dressed to kill. Let's hope that's just a figure of speech.",
    "{real} brought the {weapon} to a party. Bold. Weird. But bold.",
    "{char} has never lost at cards. Mostly because nobody lets them deal anymore.",
    "{char} swears they're innocent. They also swore the gin wasn't watered down.",
    "The {weapon} was {real}'s idea. Nobody's sure whether to be impressed or concerned.",
    "{char} knows everybody's secrets. Nobody knows {char}'s. Suspicious.",
    "{char} tips well, smiles often, and has never once been where they said they were.",
    "{real} spent an hour on that costume and ten seconds on that alibi.",
    "{char} is so charming, the cops apologized for arresting them.",
    "If {char} looks nervous, that's just their face. Probably.",
    "{char} chose the {weapon}. Not the weapon of a criminal mastermind. Or is it?",
    "{char} has two rules: never trust a stranger, and never pay full price for gin.",
    "Word is {char} once stole a racehorse. The horse came back. {char} did not.",
    "{char} could sell ice to a penguin. And did. The penguin is still upset.",
    "{real} has a poker face. Unfortunately, it's the face of someone holding a pair of twos.",
    "{char} owes money to half this room and gives advice to the other half.",
    "Nobody's seen {char} pay for a drink since 1926.",
    "{char} is the kind of guest who arrives fashionably late and leaves with the silverware.",
    "{real} picked the {weapon} because it was the only one they could spell.",
    "{char} is famous for their memory. They remember every favor you owe them.",
    "{char} came in through the front door tonight. A first.",
    "Don't let the smile fool you. {char} has been planning something since the coat check.",
    "{real} is a great dancer and a lousy liar. Tonight we find out about the liar part.",
    "{char} says they found the {weapon} in the lost and found. That's what they all say.",
    "If {char} offers you a drink tonight, maybe let them take the first sip.",
    "{char} is the only person ever thrown out of a speakeasy for looking too suspicious.",
    "{real} has been practicing an innocent face in the mirror. It needs work.",
    "{char} keeps a little black book. It's mostly IOUs.",
    "Everyone loves {char}. Everyone also checks their pockets after a hug from {char}.",
    "{char} has been to every party in Chicago. Funny how the trouble always follows.",
    "{real} wanted the {weapon} for sentimental reasons. We didn't ask. We're not going to ask.",
  ],
  adult: [
    "{real} picked the {weapon}. Which says a lot about their last relationship.",
    "{char} has been around the block so many times the block named a street after them.",
    "{char} is here for a good time, not a long time. Mostly because the cops are on their way.",
    "{real} brought the {weapon}. Compensating for something? We'll never know. We know.",
    "{char} has the morals of an alley cat and the bar tab of a sailor.",
    "{char} says they're a lover, not a fighter. Ask their exes how the loving went.",
    "{real} has been drinking since noon, and honestly, so have we.",
    "{char} is so crooked they have to screw their hat on.",
    "If {char} says trust me, run. If {char} says hold my drink, run faster.",
    "{char} walked in, looked around, and immediately started lying. Respect.",
    "{real} chose the {weapon}. Nothing says I have issues quite like it.",
    "{char} owes money to every bookie in Chicago and two in Milwaukee.",
    "{char} has a body count. We're just not sure which kind.",
    "{char} is the reason the Don kept his good gin locked up.",
    "{real} spent more on that outfit than on rent. Priorities, you magnificent bastard.",
    "Watch your drink around {char}. Not because of poison. They'll just drink it.",
    "{char} is the only person the Don was ever afraid of, and he was afraid of his own mother.",
    "{real} swears they're innocent. {real} also swore they'd only have one drink.",
    "{char}'s alibi is that they were in the bathroom. For forty-five minutes. We have questions.",
    "{char} would sell their own grandmother. Has, actually. Twice.",
    "{real} grabbed the {weapon} before anyone else could. Eager little psycho.",
    "{char} doesn't have enemies. Everyone who hated them is dead. Total coincidence.",
    "If brains were bootleg, {char} couldn't fill a shot glass.",
    "{char} is a professional. Of what, nobody's allowed to say.",
    "{real} has been flirting with the bartender all night. The bartender is a coat rack.",
    "{char} has been banned from three speakeasies, two churches and one bowling alley.",
    "{char} says they've never killed anyone. Sober.",
    "{real} looks hot tonight. Like, sweaty. Somebody open a damn window.",
    "{char} is one bad night away from a wanted poster. Tonight might be the night.",
    "{char} talks a big game for someone who cried at the coat check.",
    "{real} picked the {weapon} because they've used one before. Allegedly.",
    "{char} has more skeletons in the closet than a medical school.",
    "Every family has a black sheep. {char} is the black sheep of a family of black sheep.",
    "{char} doesn't gamble. They just lose money on purpose to the wrong people.",
    "{real} promised to behave tonight. That's lie number one. Keep count.",
    "{char} is a cheap date and an expensive mistake.",
    "{char} smells like gin, gunpowder and bad decisions. Same as the rest of you, really.",
    "{real} calls themselves adventurous. Their rap sheet calls it everything else.",
    "{char} has kissed a lot of frogs. None turned into a prince, but one turned state's evidence.",
    "{char} came to the party with a date. Nobody's seen the date since. Just saying.",
  ],
};

const hashOf = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/**
 * Which roast a guest gets: the game picks a starting point and a stride, and each guest (by sign-up
 * order) takes the next one. Different for every guest in a game, until there are more guests than roasts.
 */
export function roastIndex(gameSeed: string, rank: number, n: number): number {
  const h = hashOf(gameSeed);
  let step = 1 + (h % (n - 1));
  while (gcd(step, n) !== 1) step++;
  return (h + rank * step) % n;
}

/** Fills the blanks. The weapon reads in lower case ("the lawn gnome"). */
export function fillRoast(template: string, v: { char: string; real: string; weapon: string }): string {
  return template.replaceAll("{char}", v.char).replaceAll("{real}", v.real.trim() || v.char).replaceAll("{weapon}", v.weapon.toLowerCase() || "weapon");
}

export function roastFor(tone: Tone, gameSeed: string, rank: number, v: { char: string; real: string; weapon: string }): string {
  const list = ROASTS[tone];
  return fillRoast(list[roastIndex(gameSeed, rank, list.length)], v);
}
