// Every guest's motive (Oct 18, Heston: "at the roll call each persons motive is read aloud for everyone to hear").
// The game writes them all: "you" goes on the guest's phone, "they" is read out at the roll call. A game deals them
// without repeats (16 guests, 16 different motives at least). Sailor mode reads the Adult ones.
export type Motive = { you: string; they: string };

// Draft (replaced by the approved list).
const draft = (you: string): Motive => ({
  you,
  they: you
    .replace(/\byou're\b/gi, "they're")
    .replace(/\byou'd\b/gi, "they'd")
    .replace(/\byour\b/gi, "their")
    .replace(/\bYou\b/g, "They")
    .replace(/\byou\b/g, "them"),
});

export const MOTIVES_CLASSIC: Motive[] = [
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
  "He had your name on a list for the Feds.",
  "He won your grandmother's house in a poker game.",
].map(draft);

export const MOTIVES_ADULT: Motive[] = [
  "The Don owed you a fortune and laughed in your face when you asked for it.",
  "He caught you skimming from the till and swore he'd break your kneecaps, left one first.",
  "He told everyone what you keep in your coat pocket, and now nobody will shake your hand.",
  "He fired your sweetheart from the band for sounding like a cat in a blender.",
  "You lost your car to him in a card game, and that cheating crook had aces up both sleeves.",
  "He cut you out of a deal you'd busted your ass on for a year.",
  "He knew what you did in Detroit, and he wouldn't shut the hell up about it.",
  "He promised you a cut of the bootleg money and paid you in IOUs and bad advice.",
  "He was about to marry the person you've been in love with for years.",
  "He gave your favorite booth to a rival and spat in your potted plant.",
  "He called you a two-bit nobody in front of the whole damn room. Twice.",
  "He was holding your granddad's watch as collateral and wearing it just to rub it in.",
  "He framed your brother for a job the Don pulled himself.",
  "He was going to shut down the hustle you run out of the back.",
  "He had your name on a list for the Feds.",
  "He won your grandmother's house in a poker game and moved his mistress in.",
].map(draft);
