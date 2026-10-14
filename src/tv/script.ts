// The narrator's lines for the TV, by cue. Generic on purpose: no guest names, so the
// same pre-made ElevenLabs recordings work for any cast (Phase 5 maps each cue to a file).
// Names, weapons and rooms appear on screen, not in the voice.

export type Tone = "classic" | "adult";

export type Cue =
  | "doors"
  | "intro1"
  | "intro2"
  | "intro3"
  | "intro4"
  | "round1"
  | "round1Waves"
  | "round2"
  | "round3"
  | "twist"
  | "accuse"
  | "paused"
  | "reveal1"
  | "reveal2"
  | "reveal3"
  | "verdictDetectives"
  | "verdictKiller"
  | "awards"
  | "goodnight"
  | "soundCheck";

type Line = { text: string; sound?: string };

const CLASSIC: Record<Cue, Line> = {
  doors: { text: "Welcome to the Velvet Room. Drinks are on the house tonight. Mostly.", sound: "low jazz, glasses clinking" },
  intro1: { text: "Chicago. October, 1929.", sound: "lights cut, needle scratch" },
  intro2: { text: "Tonight, the Velvet Room lost its owner. Don Carmine Velluto has been found dead.", sound: "a scream, then a body hitting the floor" },
  intro3: { text: "One of you did it.", sound: "low strings, heartbeat" },
  intro4: { text: "Check your phone. Press and hold your card, and keep it to yourself.", sound: "music swells" },
  round1: { text: "Round one. Search the house. Find the markers. Question everyone.", sound: "ticking clock under the music" },
  round1Waves: { text: "Round one. Only some rooms are open. Search them, and question everyone.", sound: "ticking clock under the music" },
  round2: { text: "Fresh evidence has come in.", sound: "telegraph clatter as each card lands" },
  round3: { text: "The last of the evidence. And one final twist.", sound: "telegraph clatter" },
  twist: { text: "And now, the twist.", sound: "thunder crack" },
  accuse: { text: "The time for talk is over. Make your accusations.", sound: "drumroll loop until everyone's in" },
  paused: { text: "Hold everything.", sound: "record scratch, music ducks" },
  reveal1: { text: "The killer of Don Carmine Velluto is…", sound: "drumroll" },
  reveal2: { text: "…standing right here among you.", sound: "cymbal crash" },
  reveal3: { text: "With this weapon, in this room.", sound: "two stings" },
  verdictDetectives: { text: "The detectives got their killer. Confess, you rat.", sound: "brass fanfare" },
  verdictKiller: { text: "Most of you got it wrong. The killer walks free tonight.", sound: "sinister brass" },
  awards: { text: "And now, the awards.", sound: "applause, jazz back up" },
  goodnight: { text: "The Velvet Room is closed for the night. Settle your debts in chips.", sound: "last call bell, jazz out" },
  soundCheck: { text: "Sound check. If you can hear this, the TV is ready.", sound: "a short chime" },
};

const ADULT: Record<Cue, Line> = {
  doors: { text: "Welcome to the Velvet Room. Drinks are cheap, the company's cheaper, and nobody leaves till I say so.", sound: "low jazz, glasses clinking" },
  intro1: { text: "Chicago. October, 1929.", sound: "lights cut, needle scratch" },
  intro2: { text: "Tonight the Velvet Room lost its owner. Don Carmine Velluto is dead as hell.", sound: "a scream, then a body hitting the floor" },
  intro3: { text: "One of you sorry bastards did it.", sound: "low strings, heartbeat" },
  intro4: { text: "Check your damn phone. Press and hold your card, and keep it to yourself.", sound: "music swells" },
  round1: { text: "Round one. Search the joint. Find the markers, and don't touch my liquor.", sound: "ticking clock under the music" },
  round1Waves: { text: "Round one. Only some rooms are open, so keep your grubby hands out of the rest.", sound: "ticking clock under the music" },
  round2: { text: "Fresh evidence, you lucky degenerates.", sound: "telegraph clatter as each card lands" },
  round3: { text: "Last round. Brace yourselves, because this one's a kick in the teeth.", sound: "telegraph clatter" },
  twist: { text: "And here's the twist, you bastards.", sound: "thunder crack" },
  accuse: { text: "Time's up, gumshoes. Put your money where your mouth is.", sound: "drumroll loop until everyone's in" },
  paused: { text: "Everybody shut up for a second.", sound: "record scratch, music ducks" },
  reveal1: { text: "The son of a bitch who killed Don Carmine Velluto is…", sound: "drumroll" },
  reveal2: { text: "…right here, drinking our booze.", sound: "cymbal crash" },
  reveal3: { text: "With this, in there. Disgusting.", sound: "two stings" },
  verdictDetectives: { text: "The detectives nailed the bastard. Confess, you rat.", sound: "brass fanfare" },
  verdictKiller: { text: "Most of you got it dead wrong. The killer walks, and you should all be embarrassed.", sound: "sinister brass" },
  awards: { text: "Now for the awards nobody asked for.", sound: "applause, jazz back up" },
  goodnight: { text: "We're closed. Pay your tab and get the hell out.", sound: "last call bell, jazz out" },
  soundCheck: { text: "Sound check. If you can hear this, the TV works. Congratulations.", sound: "a short chime" },
};

export function line(cue: Cue, tone: Tone): Line {
  return (tone === "adult" ? ADULT : CLASSIC)[cue];
}
