// The narrator: every line the host says, in both scripts, for both hosts, steady or Unstable.
// Pure data, shared by the TV, the MC sheet, the recording script and the custom-line maker.
//
// Lines are generic on purpose (no guest names), so one set of recordings serves every party.
// Bracketed tags are delivery direction for ElevenLabs Eleven v4; captions and the live reader drop them.

export type Tone = "classic" | "adult";
export type HostKey = "ivy" | "duke";

export const HOSTS: Record<HostKey, { name: string; voiceId: string; describe: string }> = {
  ivy: { name: "Ivy", voiceId: "MftN0gvsFPPOYnV3DU0Y", describe: "Ivy runs the floor tonight: an old-Hollywood, transatlantic voice." },
  duke: { name: "Duke", voiceId: "QzTKubutNn9TjrB7Xb2Q", describe: "Duke runs the floor tonight: a New York mobster's voice." },
};

/** Eleven v4 settings. Unstable drops stability to zero: no two takes alike. */
export const VOICE_SETTINGS = {
  steady: { stability: 0.45, similarity_boost: 0.8 },
  unstable: { stability: 0.0, similarity_boost: 0.75 },
};
export const TTS_MODEL = "eleven_v4";

/** Folder name for one recorded set: ivy, ivy-unstable, duke, duke-unstable. */
export const voiceKey = (host: HostKey, unstable: boolean) => `${host}${unstable ? "-unstable" : ""}`;

type Cue = {
  when: string;
  classic: string;
  adult: string;
  /** Unstable delivery: direction before and after the line. */
  wild: [string, string];
};

export const CUES = {
  // ---- doors ----
  doors: {
    when: "When the doors open",
    classic: "[warm, smoky voice] Welcome to the Velvet Room. I'm {host}, your host tonight. Drinks are on the house. [short pause] Mostly.",
    adult: "[warm, smoky voice] Welcome to the Velvet Room. I'm {host}, your host tonight. Drinks are cheap, the company's cheaper, and nobody leaves till I say so.",
    wild: ["[manic, way too excited]", "[unhinged laughter]"],
  },
  doorsReminder: {
    when: "Every few minutes while guests arrive",
    classic: "If you haven't checked in on your phone, now's the time.",
    adult: "Still haven't checked in? Do it now, before I lose my patience.",
    wild: ["[suddenly impatient, shouting]", "[mutters to self]"],
  },
  // ---- rules ----
  rules1: {
    when: "Rules, card 1",
    classic: "Before the lights go down, the house rules.",
    adult: "Listen up, you degenerates. House rules.",
    wild: ["[clapping hands, way over the top]", ""],
  },
  rules2: {
    when: "Rules, card 2",
    classic: "Your phone holds your secret role. Press and hold to read it, and keep your screen to yourself.",
    adult: "Your phone has your secret role. Press and hold to read it, and keep your nosy eyes off everyone else's.",
    wild: ["[conspiratorial whisper]", "[giggles nervously]"],
  },
  rules3: {
    when: "Rules, card 3 (all rooms open)",
    classic: "Search the house for evidence markers and scan them. New evidence lands on this screen every round.",
    adult: "Search the joint for evidence markers and scan them. New dirt lands on this screen every round.",
    wild: ["[shouting like a carnival barker]", ""],
  },
  rules3Waves: {
    when: "Rules, card 3 (rooms in waves)",
    classic: "Search the open rooms for evidence markers and scan them. More rooms open every round, and new evidence lands on this screen.",
    adult: "Search the open rooms for markers and scan them. More rooms open every round. Stay out of the sealed ones.",
    wild: ["[shouting like a carnival barker]", ""],
  },
  rules4: {
    when: "Rules, card 4",
    classic: "Everyone may lie about their own secrets. [short pause] Only the killer may lie about the murder.",
    adult: "Lie about your own secrets all you want. [short pause] Only the killer gets to lie about the murder.",
    wild: ["[deadly serious]", "[bursts out laughing]"],
  },
  rules5: {
    when: "Rules, card 5",
    classic: "When the evidence runs out, accuse someone: who, which exhibit, and where. Get all three and you're an Ace Detective. If most of you get it wrong, the killer wins.",
    adult: "When the evidence runs dry, accuse somebody: who, with what, and where. Nail all three and you're an Ace Detective. Screw it up, and the killer walks.",
    wild: ["[building to a frenzy]", "[maniacal laughter]"],
  },
  // ---- roll call (before the murder) ----
  rollCallOpen: {
    when: "Roll call begins",
    classic: "[warm, conspiratorial] Before the lights go down, let's meet tonight's guests.",
    adult: "[warm, conspiratorial] Before somebody ends up dead, let's meet the lowlifes in this room.",
    wild: ["[way too excited, like a game show host]", "[cackles]"],
  },
  rollCallClose: {
    when: "Roll call ends",
    classic: "That's everyone. [short pause] Remember these faces.",
    adult: "That's the whole sorry bunch. [short pause] Remember their faces.",
    wild: ["[suddenly sinister]", "[evil laugh]"],
  },
  // ---- intro ----
  intro1: {
    when: "Start: lights down",
    classic: "[low, gravelly voice] Chicago. October, 1929. [long pause]",
    adult: "[low, gravelly voice] Chicago. October, 1929. [long pause]",
    wild: ["[dramatic hushed whisper]", ""],
  },
  intro2: {
    when: "Start: the body",
    classic: "Tonight, the Velvet Room lost its owner. Don Carmine Velluto has been found dead.",
    adult: "Tonight the Velvet Room lost its owner. Don Carmine Velluto is dead as hell.",
    wild: ["[suddenly shouting]", "[sobbing dramatically]"],
  },
  intro3: {
    when: "Start: the accusation",
    classic: "[whispers] One of you did it.",
    adult: "[whispers] One of you sorry bastards did it.",
    wild: ["[whispers, wild-eyed]", "[cackling]"],
  },
  intro4: {
    when: "Start: check your phone",
    classic: "Check your phone. Press and hold your card, and keep it to yourself.",
    adult: "Check your damn phone. Press and hold your card, and keep it to yourself.",
    wild: ["[frantic, talking way too fast]", ""],
  },
  // ---- round 1 ----
  round1: {
    when: "Round 1 begins (all rooms open)",
    classic: "Round one. Search the house. Find the markers. Question everyone.",
    adult: "Round one. Search the joint. Find the markers, and don't touch my liquor.",
    wild: ["[shouting like a drill sergeant]", ""],
  },
  round1Waves: {
    when: "Round 1 begins (rooms in waves)",
    classic: "Round one. Only some rooms are open. Search them, and question everyone.",
    adult: "Round one. Only some rooms are open, so keep your grubby hands out of the rest.",
    wild: ["[shouting like a drill sergeant]", ""],
  },
  oneMinute: {
    when: "One minute left in a round (timer)",
    classic: "One minute left in this round.",
    adult: "One minute left. Move your asses.",
    wild: ["[panicking]", "[hyperventilating]"],
  },
  // ---- rounds 2 and 3 ----
  round2: {
    when: "Round 2 begins",
    classic: "Fresh evidence has come in.",
    adult: "Fresh evidence, you lucky degenerates.",
    wild: ["[gasps theatrically]", "[cackles]"],
  },
  roomsOpen: {
    when: "More rooms open (waves)",
    classic: "More rooms are open. Get searching.",
    adult: "More rooms are open. Go dig.",
    wild: ["[squealing with delight]", ""],
  },
  round3: {
    when: "Round 3 begins",
    classic: "The last of the evidence. [short pause] And one final twist.",
    adult: "Last round. Brace yourselves, because this one's a kick in the teeth.",
    wild: ["[ominous, way too slow]", "[evil laugh]"],
  },
  twist: {
    when: "Right before the twist card",
    classic: "[building] And now, the twist.",
    adult: "[building] And here's the twist, you bastards.",
    wild: ["[building to a scream]", ""],
  },
  // ---- accusations ----
  accuse: {
    when: "Accusations open",
    classic: "The time for talk is over. Make your accusations.",
    adult: "Time's up, gumshoes. Put your money where your mouth is.",
    wild: ["[pounding the table, shouting]", ""],
  },
  accuseLastCall: {
    when: "Thirty seconds left (timer)",
    classic: "Thirty seconds. Lock in your accusation.",
    adult: "Thirty seconds, you indecisive bastards. Lock it in.",
    wild: ["[panicked shriek]", ""],
  },
  // ---- reveal ----
  reveal1: {
    when: "Reveal: the drumroll",
    classic: "[long pause] The killer of Don Carmine Velluto is…",
    adult: "[long pause] The son of a bitch who killed Don Carmine Velluto is…",
    wild: ["[trembling with excitement]", ""],
  },
  reveal2: {
    when: "Reveal: the killer (if custom lines are off)",
    classic: "…standing right here among you.",
    adult: "…right here, drinking our booze.",
    wild: ["[screaming]", "[sobbing]"],
  },
  reveal3: {
    when: "Reveal: weapon and room (if custom lines are off)",
    classic: "With this weapon, in this room.",
    adult: "With this, in there. Disgusting.",
    wild: ["[horrified]", ""],
  },
  verdictDetectives: {
    when: "Verdict: most named the killer",
    classic: "The detectives got their killer. [short pause] Confess, you rat.",
    adult: "The detectives nailed the bastard. [short pause] Confess, you rat.",
    wild: ["[ecstatic, shouting]", "[wild applause]"],
  },
  verdictKiller: {
    when: "Verdict: most got it wrong",
    classic: "Most of you got it wrong. [short pause] The killer walks free tonight.",
    adult: "Most of you got it dead wrong. The killer walks, and you should all be embarrassed.",
    wild: ["[sobbing uncontrollably]", ""],
  },
  votePrompt: {
    when: "After the verdict",
    classic: "Now vote on your phones: Best Dressed and Best Liar.",
    adult: "Now vote on your phones. Best Dressed and Best Liar. Be honest, for once.",
    wild: ["[sing-song, mocking]", ""],
  },
  // ---- awards and goodnight ----
  awards: {
    when: "Awards open",
    classic: "And now, the awards.",
    adult: "Now for the awards nobody asked for.",
    wild: ["[over-the-top game show host]", ""],
  },
  awardDetective: {
    when: "Before the Best Detective name",
    classic: "Best Detective goes to…",
    adult: "Best Detective, the one person here with a working brain, goes to…",
    wild: ["[building, breathless]", ""],
  },
  awardDressed: {
    when: "Before the Best Dressed name",
    classic: "Best Dressed goes to…",
    adult: "Best Dressed goes to…",
    wild: ["[swooning]", ""],
  },
  awardLiar: {
    when: "Before the Best Liar name",
    classic: "And Best Liar goes to…",
    adult: "And the biggest liar in the room is…",
    wild: ["[whispers, scandalized]", ""],
  },
  goodnight: {
    when: "Night over",
    classic: "The Velvet Room is closed for the night. Settle your debts in chips.",
    adult: "We're closed. Pay your tab and get the hell out.",
    wild: ["[weeping, then suddenly cheerful]", "[hiccups]"],
  },
  // ---- any time ----
  paused: {
    when: "The host pauses",
    classic: "Hold everything.",
    adult: "Everybody shut up for a second.",
    wild: ["[screeching]", ""],
  },
  resumed: {
    when: "The host resumes",
    classic: "Carry on.",
    adult: "Alright, back to it.",
    wild: ["[sweetly, as if nothing happened]", ""],
  },
  soundCheck: {
    when: "Sound check",
    classic: "Sound check. If you can hear this, the TV is ready.",
    adult: "Sound check. If you can hear this, the TV works. Congratulations.",
    wild: ["[tapping the microphone, way too close]", "[cackles]"],
  },
} satisfies Record<string, Cue>;

export type CueKey = keyof typeof CUES;
export const CUE_KEYS = Object.keys(CUES) as CueKey[];

/** Pauses survive in Unstable takes; every other direction is replaced by the wild one. */
const KEEP = /^\[(short pause|long pause)\]$/i;
const TAG = /\[[^\]]*\]/g;

/** Text without any direction tags: captions, the live reader, the MC sheet. */
export const plain = (text: string) => text.replace(TAG, "").replace(/\s{2,}/g, " ").trim();

/** The exact text sent to ElevenLabs for one recording. */
export function recordingText(cue: CueKey, tone: Tone, host: HostKey, unstable: boolean): string {
  const c: Cue = CUES[cue];
  const base = (tone === "adult" ? c.adult : c.classic).replaceAll("{host}", HOSTS[host].name);
  if (!unstable) return base;
  const kept = base.replace(TAG, (t) => (KEEP.test(t) ? t : "")).replace(/\s{2,}/g, " ").trim();
  return [c.wild[0], kept, c.wild[1]].filter(Boolean).join(" ");
}

/** What the TV caption and the live reader say for a cue. */
export function captionText(cue: CueKey, tone: Tone, host: HostKey): string {
  const c: Cue = CUES[cue];
  return plain((tone === "adult" ? c.adult : c.classic).replaceAll("{host}", HOSTS[host].name));
}

// ---------- custom lines: made per party from what guests typed and from the draw ----------
// None of these gives the answer away: at Start the game records one clip for every guest,
// every exhibit and every room, and the reveal just plays the right ones.

const WILD_POOL = ["[cackling]", "[shouting]", "[whispers, wild-eyed]", "[sobbing dramatically]", "[squealing]", "[growls]"];
const pickWild = (seed: string) => WILD_POOL[[...seed].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % WILD_POOL.length];
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const mid = (l: string) => l.replace(/^The /, "the ");

export type CustomKind = "arrival" | "body" | "rooms" | "killer" | "exhibit" | "room" | "winner" | "roll";

/** The words for a custom line. Pass a name as it should sound (the guest's "say it like", when they gave one). */
export function customText(kind: CustomKind, tone: Tone, v: { name?: string; who?: string; room?: string; rooms?: string[]; letter?: string; weapon?: string; real?: string; line?: string }): string {
  const adult = tone === "adult";
  switch (kind) {
    case "arrival":
      return `Now arriving: ${v.name}.${v.who ? ` ${v.who}` : ""}`;
    case "body":
      return adult ? `They found him in ${mid(v.room!)}. What a mess.` : `He was found in ${mid(v.room!)}.`;
    case "rooms":
      return adult ? `Now open: ${list((v.rooms ?? []).map(mid))}. Go dig.` : `Now open: ${list((v.rooms ?? []).map(mid))}.`;
    case "killer":
      return adult ? `${v.name}, you rotten bastard.` : `${v.name}.`;
    case "exhibit":
      return `With Exhibit ${v.letter}, the ${(v.weapon ?? "").toLowerCase()},`;
    case "room":
      return `in ${mid(v.room!)}.`;
    case "winner":
      return `${v.name}!`;
    case "roll":
      return `${rollIntro(tone, v.name ?? "", v.real ?? "")} ${v.line ?? ""}`.trim();
  }
}

// ---------- roll call ----------

/** The question guests answer at sign-up. The narrator reads the answer at the roll call. */
export const ROLL_PROMPT = {
  label: "Roll call: what's the word on the street about you?",
  placeholder: "e.g. Once cheated a priest at cards, and won.",
  help: "Before the murder, the narrator introduces every guest on the TV. Keep it short and funny. Everyone will hear it.",
};

const ROLL_INTROS: Record<Tone, string[]> = {
  classic: ["Introducing {char}, played by {real}.", "Next, {char}. Better known as {real}.", "Say hello to {char}, played by {real}."],
  adult: ["Introducing {char}, played by {real}, God help us.", "Next up, {char}, a.k.a. {real}.", "Look who crawled in: {char}, played by {real}."],
};

const hashOf = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** "Introducing Velma, played by Jordan." Varied per guest so the roll call doesn't drone. */
export function rollIntro(tone: Tone, char: string, real: string): string {
  const list = ROLL_INTROS[tone];
  const real1 = real.trim() || "a mystery guest";
  // Picked by the real name, so the caption and the recording (which may spell the name the guest's way) match.
  return list[hashOf(real1) % list.length].replace("{char}", char).replace("{real}", real1);
}

const endStop = (s: string) => (/[.!?…"'”]$/.test(s) ? s : `${s}.`);

/** The funny line under a guest's roll-call card: the host's edit, else their rumor, else who they are. */
export function rollLineFor(p: { rollLine?: string; rumor?: string; who: string }): string {
  if (p.rollLine?.trim()) return endStop(p.rollLine.trim());
  if (p.rumor?.trim()) return `Word on the street: ${endStop(p.rumor.trim())}`;
  return endStop(p.who.trim());
}

/** The text sent to ElevenLabs for a custom line; Unstable adds a wild direction. */
export function customRecordingText(text: string, unstable: boolean): string {
  return unstable ? `${pickWild(text)} ${text}` : text;
}
