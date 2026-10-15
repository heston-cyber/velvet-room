// Roll call roasts (v2, Oct 15): fill-in-the-blank jokes the narrator reads at the end of each
// guest's introduction. Written ahead of time, filled in from sign-up answers. Drafts for Heston's review.
//
// Blanks: {real} the guest's real first name (Heston, Oct 15: roasts use the player's real name; the motive
// uses the character's), {weapon} the weapon they picked (lower case, no article: "lawn gnome").
// Guests are "they" so every line works for anyone.
// No AI at the party: these are fixed, and each guest in a game gets a different one.
import type { Tone } from "./narration";

export const ROASTS: Record<Tone, string[]> = {
  classic: [
    "{real} picked the {weapon}. Somewhere, a therapist just felt a chill.",
    "{real} says they're here for the music. Nobody here has ever been here for the music.",
    "They say {real} never forgets a face. Mostly because they still owe most of them money.",
    "{real} practiced with the {weapon} all week. The neighbors have questions.",
    "{real} walked in like they own the place. The Don checked. They don't.",
    "{real} has a heart of gold. Stolen, but gold.",
    "{real} insisted on the {weapon}. Said it matched the outfit. Sadly, it does.",
    "{real} once talked their way out of a speeding ticket. In a horse and buggy.",
    "Keep an eye on {real}. Better yet, keep an eye on your wallet.",
    "{real} came dressed to kill. Let's hope that's just a figure of speech.",
    "{real} brought the {weapon} to a party. Bold. Weird. But bold.",
    "{real} has never lost at cards. Mostly because nobody lets them deal anymore.",
    "{real} swears they're innocent. They also swore the gin wasn't watered down.",
    "The {weapon} was {real}'s idea. Nobody's sure whether to be impressed or concerned.",
    "{real} knows everybody's secrets. Nobody knows {real}'s. Suspicious.",
    "{real} tips well, smiles often, and has never once been where they said they were.",
    "{real} spent an hour on that costume and ten seconds on that alibi.",
    "{real} is so charming, the cops apologized for arresting them.",
    "If {real} looks nervous, that's just their face. Probably.",
    "{real} chose the {weapon}. Not the weapon of a criminal mastermind. Or is it?",
    "{real} has two rules: never trust a stranger, and never pay full price for gin.",
    "{real} once stole a racehorse. The horse came back. {real} did not.",
    "{real} could sell ice to a penguin. And did. The penguin is still upset.",
    "{real} has a poker face. Unfortunately, it's the face of someone holding a pair of twos.",
    "{real} owes money to half this room and gives advice to the other half.",
    "Nobody's seen {real} pay for a drink since 1926.",
    "{real} is the kind of guest who arrives fashionably late and leaves with the silverware.",
    "{real} picked the {weapon} because it was the only one they could spell.",
    "{real} is famous for their memory. They remember every favor you owe them.",
    "{real} came in through the front door tonight. A first.",
    "Don't let the smile fool you. {real} has been planning something since the coat check.",
    "{real} is a great dancer and a lousy liar. Tonight we find out about the liar part.",
    "{real} says they found the {weapon} in the lost and found. That's what they all say.",
    "If {real} offers you a drink tonight, maybe let them take the first sip.",
    "{real} is the only person ever thrown out of a speakeasy for looking too suspicious.",
    "{real} has been practicing an innocent face in the mirror. It needs work.",
    "{real} keeps a little black book. It's mostly IOUs.",
    "Everyone loves {real}. Everyone also checks their pockets after a hug from {real}.",
    "{real} has been to every party in Chicago. Funny how the trouble always follows.",
    "{real} wanted the {weapon} for sentimental reasons. We didn't ask. We're not going to ask.",
  ],
  // Adult (rewritten Oct 15 with Heston's comedy notes: deadpan, specific, formats with rules, many drafts and only
  // the best kept). These are the fallback: in an adult game each guest gets a roast about their own weapon
  // (WEAPON_ROASTS below), so no two roasts in a game can match.
  adult: [
    "{real}'s last employer described {real} as present.",
    "The Pinkerton Agency keeps a whole drawer on {real}. It's labeled Miscellaneous.",
    "{real}'s character witness is a parrot.",
    "{real} has a heart of gold. It was reported stolen in 1924.",
    "{real} is wanted in three states, and only for questioning, which is frankly embarrassing for {real}.",
    "{real}'s mother would like it known that she did her best.",
    "{real} was voted most likely to succeed, in an election {real} ran, by {real}.",
    "Help wanted: one person to vouch for {real}. Excellent pay. Nobody has applied.",
    "{real}'s rap sheet is longer than tonight's guest list, and {real} wrote most of the guest list.",
    "{real} has been banned from three speakeasies, two churches and one bowling alley.",
    "{real} says they've never killed anyone. Sober.",
    "{real} doesn't gamble. {real} just loses money on purpose to the wrong people.",
    "{real}'s alibi is that they were in the bathroom. For forty-five minutes. We have questions.",
    "{real} owes money to every bookie in Chicago and two in Milwaukee.",
    "{real} is one bad night away from a wanted poster. Tonight might be the night.",
    "{real} is a cheap date and an expensive mistake.",
    "Let the record show {real} arrived with a date. Let the record also show nobody has seen the date since.",
    "{real} would sell their own grandmother. Has, actually. Twice.",
    "{real} smells like gin, gunpowder and bad decisions. Same as the rest of you, really.",
    "{real} talks a big game for someone who cried at the coat check.",
  ],
};

/**
 * Adult roasts, one set per weapon (Oct 15). The weapon is the one specific thing every guest has, and each weapon
 * goes to one guest, so these never repeat in a game. Written the Toplyn way: the weapon's associations on one
 * side, the guest and 1929 Chicago on the other, linked into the punch line. Played straight. {real} is the
 * guest's first name. A game picks one line per weapon.
 */
export const WEAPON_ROASTS: Record<string, string[]> = {
  candlestick: [
    "{real} picked the candlestick. Investigators note it is the only thing in {real}'s life ever described as romantic.",
    "{real} took the candlestick, the original Clue weapon. Bold, for someone who has never finished a board game without flipping it.",
  ],
  knife: [
    "{real} picked the knife. Friends confirm {real} has never used one to cook anything, which raises questions.",
    "{real} took the knife. Not a steak knife. Not a butter knife. Just a knife. Legally, that's worse.",
  ],
  leadpipe: [
    "{real} chose the lead pipe. The plumbers' union has issued a statement distancing itself from {real}.",
    "{real} took the lead pipe, which explains a lot about how {real} turned out.",
  ],
  revolver: [
    "{real} picked the revolver, a gun that holds six bullets and still shows more commitment than {real}.",
    "{real} took the revolver, the least subtle weapon in the room, picked by the least subtle person in the room.",
  ],
  rope: [
    "{real} picked the rope. When asked if it was for the murder, {real} said, not only.",
    "The rope belongs to {real}, a former Boy Scout who was asked to leave for reasons the Scouts still won't discuss.",
  ],
  wrench: [
    "{real} picked the wrench. Nobody has ever seen {real} fix anything, so it's either a murder weapon or a costume.",
    "{real} took the wrench, the closest {real} has ever come to a day of honest work.",
  ],
  poison: [
    "{real} chose poison. A coward's weapon. The correct choice.",
    "Poison goes to {real}, who has been asked not to bring anything to a potluck since 1926.",
  ],
  horseshoe: [
    "{real} took the horseshoe. The horse would like it back, and has retained a lawyer.",
    "{real} picked the horseshoe, for luck. {real} is down forty dollars at Hawthorne this month, so the horseshoe is not working.",
  ],
  axe: [
    "{real} took the hatchet, in what Lizzie Borden's lawyers are calling a clear case of copying.",
    "{real} picked the hatchet. When asked about firewood, {real} said, what firewood.",
  ],
  trophy: [
    "{real} picked the trophy. It is the first thing {real} has ever won, and {real} won it by grabbing it.",
    "The trophy goes to {real}. For participation.",
  ],
  dumbbell: [
    "{real} took the dumbbell, carried it in, and has mentioned it nine times. Everybody knows {real} lifts. Nobody asked.",
    "The dumbbell belongs to {real}, who lifts it twice a year, both times in front of a mirror.",
  ],
  bat: [
    "{real} chose the baseball bat, the weapon of choice for Al Capone and for every Cubs fan since 1908.",
    "{real} took the bat. {real} says they're a White Sox fan, which, after 1919, is also a crime.",
  ],
  flaregun: [
    "{real} picked the flare gun, which is a cry for help with a trigger.",
    "The flare gun belongs to {real}, who has never owned a boat, been on a boat, or been invited onto a boat.",
  ],
  fishingline: [
    "{real} picked the fishing line. {real} once told us about a fish this big. The fish has since come forward with its own version.",
    "The fishing line belongs to {real}, who spent last summer on Lake Michigan and caught nothing but a cold and a summons.",
  ],
  hammer: [
    "{real} took the hammer, which {real} has used exactly once, to hang a portrait of {real}.",
    "The hammer belongs to {real}, who built one birdhouse in 1922 and has talked about it every day since.",
  ],
  racquet: [
    "{real} took the tennis racquet. {real} doesn't play tennis. {real} just likes holding things that cost more than other people's rent.",
    "The tennis racquet belongs to {real}, who was banned from the Lake Shore Club for conduct. Just conduct. Nothing after it.",
  ],
  gnome: [
    "{real} picked the lawn gnome. Police have called it not a weapon and deeply concerning, in the same sentence.",
    "{real} took the lawn gnome, which {real} has named, dressed, and refers to as my associate.",
    "The lawn gnome belongs to {real}. It has watched {real}'s house for six years. It has seen things.",
  ],
  bucket: [
    "{real} picked the water bucket, for cleaning up afterwards. {real} has clearly done this before.",
    "{real} took the water bucket, the only cleaning supply {real} has touched in their adult life.",
  ],
  shears: [
    "{real} chose the garden shears. {real} says it's for the roses. {real} does not have roses.",
    "{real} took the garden shears, which is suspicious for a person whose only houseplant died of neglect in 1927.",
  ],
  blunderbuss: [
    "{real} picked the blunderbuss, a gun that went out of fashion in 1780. {real} is sure it's coming back.",
    "{real} took the blunderbuss, which can hit anything within ten feet, including, statistically, {real}.",
  ],
  crowbar: [
    "{real} chose the crowbar, the tool of a burglar, and would like everyone to know it's just for the trunk.",
    "{real} took the crowbar. Three hardware stores on Halsted have {real}'s picture behind the counter.",
  ],
  gloves: [
    "{real} picked the gloves. Not a weapon. Just a person who doesn't want to leave fingerprints, which is worse.",
    "{real} took the gloves. {real} has worn gloves to every party this year and has never once been cold.",
  ],
};


/**
 * How the narrator leads into a guest's own "word on the street" (their sign-up answer), so the roasts don't all
 * open the same way (Heston, Oct 15). A few say it's a rumor; more state it flat out as fact ("sometimes it would be
 * funnier if you just flat out roast someone as a fact"); and some have no lead at all, so it lands deadpan.
 * Each guest in a game gets a different one. {real} is their first name. The guest's words follow as they wrote them.
 */
export const RUMOR_LEADS: Record<Tone, string[]> = {
  classic: [
    "Word on the street:",
    "Overheard at the bar:",
    "A little bird told me:",
    "Fact:",
    "For the record:",
    "True story:",
    "Not a rumor. A fact:",
    "Let the record show:",
    "Confirmed by three witnesses:",
    "It's in the police report:",
    "Look it up:",
    "We checked. It's true:",
    "",
    "",
    "",
  ],
  adult: [
    "From {real}'s parole file:",
    "Sworn testimony:",
    "Per the Chicago Police Department:",
    "Insurance investigators confirmed:",
    "Entered into evidence:",
    "According to three ex-lovers and one priest:",
    "{real}'s mother asked us not to mention this:",
    "We wish we were making this up:",
    "Fact:",
    "No lie:",
    "Hand to God:",
    "The dirt on {real}:",
    "",
    "",
    "",
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

/** The first word of the real name: "Ana Ruiz" → "Ana". */
export const firstOf = (real: string) => real.trim().split(/\s+/)[0] ?? "";

/** Fills the blanks. The weapon reads in lower case ("the lawn gnome"); the real name by its first word. */
export function fillRoast(template: string, v: { real: string; weapon: string; fallback?: string }): string {
  const name = firstOf(v.real) || v.fallback || "this one";
  return template.replaceAll("{real}", name).replaceAll("{weapon}", v.weapon.toLowerCase() || "weapon");
}

/** The lead into a guest's word on the street: a different one for each guest in a game. */
export function rumorLead(tone: Tone, gameSeed: string, rank: number, real: string, fallback = ""): string {
  const list = RUMOR_LEADS[tone];
  const name = firstOf(real) || fallback || "them";
  return list[roastIndex(`${gameSeed}:word`, rank, list.length)].replaceAll("{real}", name);
}

/** An adult game's roast for this weapon (one of its lines, picked per game), or null for a weapon with none. */
export function weaponRoast(gameSeed: string, weaponKey: string | undefined): string | null {
  const list = weaponKey ? WEAPON_ROASTS[weaponKey] : undefined;
  if (!list?.length) return null;
  return list[hashOf(`${gameSeed}:${weaponKey}`) % list.length];
}

/** The roast template for a guest: in an adult game, their weapon's own; otherwise the next one in the game's order. */
export function roastTemplate(tone: Tone, gameSeed: string, rank: number, weaponKey?: string): string {
  if (tone === "adult") {
    const own = weaponRoast(gameSeed, weaponKey);
    if (own) return own;
  }
  const list = ROASTS[tone];
  return list[roastIndex(gameSeed, rank, list.length)];
}

export function roastFor(tone: Tone, gameSeed: string, rank: number, v: { real: string; weapon: string; weaponKey?: string; fallback?: string }): string {
  return fillRoast(roastTemplate(tone, gameSeed, rank, v.weaponKey), v);
}
