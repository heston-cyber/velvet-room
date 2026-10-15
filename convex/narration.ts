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
  // ---- how to play (after the roll call; replaced the five house rules, Oct 14) ----
  howTo1: {
    when: "How to play, card 1 (the Don)",
    classic: "[warm, conspiratorial] Before the lights go down, here's how tonight works.",
    adult: "[warm, conspiratorial] Listen up, you degenerates. Here's how tonight works.",
    wild: ["[clapping hands, way over the top]", ""],
  },
  howTo2: {
    when: "How to play, card 2 (the masked killer)",
    classic: "Tonight, the Don dies. [short pause] And one of you did it.",
    adult: "Tonight, the Don gets whacked. [short pause] And one of you is holding the bag.",
    wild: ["[deadly serious]", "[giggles nervously]"],
  },
  howTo3: {
    when: "How to play, card 3 (your phone)",
    classic: "Your phone holds your secret role. Press and hold to read it, and keep your screen to yourself.",
    adult: "Your phone has your secret role. Press and hold to read it, and keep your nosy eyes off everyone else's.",
    wild: ["[conspiratorial whisper]", "[giggles]"],
  },
  howTo4: {
    when: "How to play, card 4 (searching; every room open)",
    classic: "Then search the house. Evidence markers are hidden in every room on the map. Scan each one you find.",
    adult: "Then tear the joint apart. Evidence markers are stashed in every room on the map. Scan every one you find.",
    wild: ["[shouting like a carnival barker]", ""],
  },
  howTo4Waves: {
    when: "How to play, card 4 (searching; rooms open in waves)",
    classic: "Then search the house. Evidence markers are hidden in the rooms on the map. Sealed rooms open a few at a time, so stay out until they do.",
    adult: "Then tear the joint apart. Markers are stashed in the rooms on the map. Sealed rooms open a few at a time. Stay out till they do.",
    wild: ["[shouting like a carnival barker]", ""],
  },
  howTo5: {
    when: "How to play, card 5 (the map)",
    classic: "Every marker that's found gets stamped on the map, so everyone can see what's left.",
    adult: "Every marker somebody finds gets stamped on the map. No hogging the good stuff.",
    wild: ["[proudly, like a game show host]", ""],
  },
  howTo6: {
    when: "How to play, card 6 (rounds; tap Ready)",
    classic: "When you've searched enough, tap Ready. Fresh evidence lands on this screen every round, and the last round brings a twist.",
    adult: "When you're done snooping, tap Ready. Fresh dirt lands on this screen every round, and the last round's got a nasty twist.",
    wild: ["[urgent, fast]", "[gasps]"],
  },
  howTo6Timer: {
    when: "How to play, card 6 (rounds on the clock)",
    classic: "Each round runs on the clock. Fresh evidence lands on this screen every round, and the last round brings a twist.",
    adult: "Each round runs on the clock, so move it. Fresh dirt lands on this screen every round, and the last one's got a nasty twist.",
    wild: ["[urgent, fast]", "[gasps]"],
  },
  howTo7: {
    when: "How to play, card 7 (lying)",
    classic: "Talk to everyone. You may lie about your own secrets. [short pause] Only the killer may lie about the murder.",
    adult: "Talk to everybody. Lie about your own secrets all you want. [short pause] Only the killer gets to lie about the murder.",
    wild: ["[deadly serious]", "[bursts out laughing]"],
  },
  howTo8: {
    when: "How to play, card 8 (accusing)",
    classic: "After the last round, accuse someone on your phone: who did it, with which exhibit, and where. Get all three and you're an Ace Detective.",
    adult: "After the last round, point the finger on your phone: who, with what, and where. Nail all three and you're an Ace Detective.",
    wild: ["[building to a frenzy]", ""],
  },
  howTo9: {
    when: "How to play, card 9 (winning)",
    classic: "If most of you get it wrong, the killer wins. Then we vote for Best Dressed and Best Liar. [short pause] Good luck. You'll need it.",
    adult: "Screw it up, and the killer walks. Then we vote for Best Dressed and Best Liar. [short pause] Good luck. You're gonna need it.",
    wild: ["[maniacal laughter]", "[cackles]"],
  },
  // ---- How to play, v2 (Oct 15): after the murder, before the roll call. Drafts for Heston's review. ----
  howKiller: {
    when: "How to play v2, card 1 (the masked killer)",
    classic: "[warm, conspiratorial] Here's how tonight works. One of you is the killer. [short pause] Everyone else has to prove it.",
    adult: "[warm, conspiratorial] Here's how this goes. One of you is a killer. The rest of you are witnesses with a drinking problem. [short pause] Nail the killer anyway.",
    wild: ["[clapping hands, way over the top]", "[cackles]"],
  },
  howAccomplice: {
    when: "How to play v2, the accomplice (killer + accomplice games only)",
    classic: "Tonight the killer has an accomplice. The accomplice didn't do it, but knows who did, and will lie to protect them. [short pause] When you lock in, you can guess the accomplice too. It won't change who wins, but it can win you Best Detective.",
    adult: "Tonight the killer brought a friend. The accomplice didn't do it, but knows exactly who did, and will lie to your face about it. [short pause] When you lock in, take a guess at the accomplice too. It won't change who wins. It will make you look smart.",
    wild: ["[conspiratorial whisper, way too close to the mic]", "[giggles]"],
  },
  howRoles: {
    when: "How to play v2, card 2 (your phone)",
    classic: "After the roll call, your phone shows your secret role. Press and hold to read it, and keep your screen to yourself.",
    adult: "After the roll call, your phone shows your secret role. Press and hold to read it. Looking at somebody else's screen is a felony in this house.",
    wild: ["[conspiratorial whisper]", "[giggles]"],
  },
  howWeapons: {
    when: "How to play v2, card 3 (the weapons)",
    classic: "Every guest brought a weapon, and one of them did the deed. [short pause] That doesn't mean its owner did.",
    adult: "Everybody brought a weapon, and one of them did the job. [short pause] Owning the murder weapon doesn't make you the murderer. It just makes you weird.",
    wild: ["[deadly serious]", "[giggles nervously]"],
  },
  howJail: {
    when: "How to play v2, the jail vote",
    classic: "After every round, you vote someone into jail. It takes more than half of you, or nobody goes. [short pause] Jailed guests can talk and bribe, but they can't search, vote or accuse.",
    adult: "After every round, you vote somebody into jail. It takes more than half of you, or nobody goes. [short pause] Jailbirds can talk and bribe. They can't search, vote or accuse. This is called the justice system.",
    wild: ["[banging on the bars, shouting]", "[evil laugh]"],
  },
  howRelease: {
    when: "How to play v2, the release vote",
    classic: "From the second vote on, you can spring someone first. Same rule: more than half of you.",
    adult: "From the second vote on, you can spring somebody first. Same rule, more than half of you. Bail, like everything else in Chicago, is a popularity contest.",
    wild: ["[jingling keys, way too excited]", ""],
  },
  howTo7Acc: {
    when: "How to play v2, lying (killer + accomplice games)",
    classic: "Talk to everyone. You may lie about your own secrets. [short pause] Only the killer and the accomplice may lie about the murder.",
    adult: "Talk to everybody. Lie about your own secrets all you want. [short pause] Only the killer and the accomplice get to lie about the murder.",
    wild: ["[deadly serious]", "[bursts out laughing]"],
  },
  howLockIn: {
    when: "How to play v2, the lock-in",
    classic: "After the last round, everyone who's free locks in on their phone: who did it, with which weapon, and in which room.",
    adult: "After the last round, everybody who isn't behind bars locks in on their phone: who did it, with what, and where. Once you lock in, that's it. No appeals, no recounts, no crying.",
    wild: ["[building to a frenzy]", ""],
  },
  howWin: {
    when: "How to play v2, winning",
    classic: "Most of you need the right killer, the right weapon and the right room. Exactly half won't do. [short pause] Miss, and the killer walks. Then we vote for Best Dressed and Best Liar. Good luck.",
    adult: "More than half of you need the right killer, more than half the right weapon, and more than half the right room. Exactly half is a tie, and ties go to the killer. [short pause] Then we vote for Best Dressed and Best Liar.",
    wild: ["[maniacal laughter]", "[cackles]"],
  },
  // ---- roll call, v2: after How to play ----
  rollLocked: {
    when: "Roll call v2 begins",
    classic: "[low, grave] The doors are locked until we figure out who did it. [short pause] Now, let's meet the suspects.",
    adult: "[low, grave] The doors are locked until we figure out which one of you did it. The fire marshal has been informed, and does not care. [short pause] Let's meet the suspects.",
    wild: ["[slamming the door, shouting]", "[cackles]"],
  },
  // ---- votes (v2): after every round. Drafts for Heston's review. ----
  voteJail: {
    when: "The jail vote opens",
    classic: "Time to vote. Who goes to jail? Vote on your phone. You can pick nobody.",
    adult: "Time to vote. Somebody's going to jail, or nobody is. Pick on your phone.",
    wild: ["[banging a gavel, way too hard]", ""],
  },
  voteRelease: {
    when: "The release vote opens (before the jail vote, from Round 2, if anyone is in jail)",
    classic: "Before the jail vote: does anyone get out of jail? Vote on your phone.",
    adult: "Before we lock anyone else up: does anybody get out? Vote on your phone.",
    wild: ["[jingling keys, giggling]", ""],
  },
  voteLastCall: {
    when: "Fifteen seconds left to vote",
    classic: "Fifteen seconds left to vote.",
    adult: "Fifteen seconds. Vote now, or let everyone else decide for you, like usual.",
    wild: ["[panicking]", ""],
  },
  voteTally: {
    when: "The vote closes: who voted for whom",
    classic: "The votes are in. Here's how you voted.",
    adult: "The votes are in. Here's how you voted. No take-backs.",
    wild: ["[drumroll noises with mouth]", ""],
  },
  jailNobody: {
    when: "Jail vote: not enough votes",
    classic: "Not enough votes. Nobody goes to jail this time.",
    adult: "Not enough votes. Nobody goes to jail. Democracy is a beautiful, useless thing.",
    wild: ["[deeply disappointed sigh]", ""],
  },
  releaseNobody: {
    when: "Release vote: not enough votes",
    classic: "Not enough votes. Everyone in jail stays put.",
    adult: "Not enough votes. The jailbirds stay in their cage.",
    wild: ["[cackling]", ""],
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
  revealAccomplice: {
    when: "Reveal: before the accomplice's name (killer + accomplice games)",
    classic: "[short pause] And the accomplice who helped them is…",
    adult: "And the accomplice, who helped, loosely speaking, is…",
    wild: ["[whispering, scandalized]", ""],
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

/**
 * More adult versions of each line (Heston, Oct 15: "swappable scripts for each section chosen at random so replays
 * of the game we hear new words and jokes"). Version 0 is the line in CUES; these are versions 1, 2, …
 * A game picks one version per line (cueVariant). Written with Heston's comedy notes: deadpan and specific; swearing
 * rationed and inventive (a crude word plus an absurdly specific image), saved for moments under pressure; innuendo
 * implied under an innocent surface, ideally by a narrator who doesn't seem to notice. No marriage jokes.
 * The noisy takes are a separate bank (NOISY below), played only now and then.
 */
export const ADULT_MORE: Partial<Record<CueKey, string[]>> = {
  doors: [
    "[warm, smoky voice] Welcome to the Velvet Room. I'm {host}. The gin was made in a bathtub this afternoon, and the bathtub did its best.",
    "[warm, smoky voice] Good evening, and welcome to the Velvet Room. I'm {host}, your host. Please keep your hands to yourselves. [short pause] Or don't. I'm a host, not a nun.",
  ],
  doorsReminder: [
    "If you haven't opened your link yet, do it now. The bouncer has been told you're a fed.",
    "Friendly reminder: open your link and come in. Unfriendly reminder: same thing, but louder.",
  ],
  howKiller: [
    "[warm, conspiratorial] Here's how tonight works. One of you killed the Don. [short pause] The rest of you are suspects, witnesses and, frankly, a fire hazard.",
    "[warm, conspiratorial] The rules are simple. One of you is a killer. Everyone else has to figure out who, while drinking. [short pause] Mostly while drinking.",
  ],
  howAccomplice: [
    "Tonight the killer has an accomplice: someone who didn't do it, knows who did, and has decided that's fine. [short pause] When you lock in, guess the accomplice too. It won't change who wins, but it can win you Best Detective.",
    "This is a two-person job. One killer, one accomplice. The accomplice didn't swing anything. They just lie for the person who did. Loyalty, in this economy. [short pause] When you lock in, take a guess at the accomplice too.",
  ],
  howRoles: [
    "After the roll call, your phone shows your secret role. Press and hold to read it. Keep it to yourself, the way you keep everything else to yourself. Poorly.",
    "After the roll call, check your phone for your secret role. Press and hold to read it. If someone leans over to look, lean back. Harder.",
  ],
  howWeapons: [
    "Every guest brought a weapon, and one of them was used on the Don. [short pause] If it's yours, that doesn't make you the killer. It does make you a person who owns that.",
    "Each of you brought a weapon, which is not normal party etiquette. [short pause] One of them did the job. Its owner may be completely innocent. Its owner may also be lying.",
  ],
  voteJail: [
    "Jail vote. Look around the room, find the face you trust least, and vote on your phone.",
    "Phones out. Who's going to jail? More than half of you have to agree. Good luck with that.",
  ],
  voteRelease: [
    "Release vote. Somebody in that cell might be innocent. Somebody in that cell might also owe you money. Vote.",
    "Time to decide whether anyone gets out of jail. Mercy is allowed. It just isn't popular.",
  ],
  voteLastCall: [
    "Fifteen seconds left. If you haven't voted, this is the part where you panic.",
    "Fifteen seconds. Pick somebody. Anybody. Not literally anybody.",
  ],
  voteTally: [
    "Let's see who voted for whom, and who's going to hold a grudge.",
    "The votes are in. Some of you are about to find out who your friends are.",
  ],
  jailNobody: [
    "Nobody goes to jail. You couldn't agree on anything, which is very on brand.",
    "Not enough votes. Everybody stays free, for now. Act natural.",
  ],
  releaseNobody: [
    "Nobody gets out. The cell is cozy, and the company is probably guilty.",
    "Not enough votes. Release denied. Somebody bring them a sandwich.",
  ],
  howTo4: [
    "Then search the house. Evidence markers are hidden in every room on the map. Feel around under things. Nobody here is a stranger to feeling around under things. Scan every one you find.",
    "Then search the house. Every room on the map has markers stashed in it. Open drawers, check under cushions, and if you find something that isn't a marker, put it back and never speak of it. Scan every marker you find.",
  ],
  howTo4Waves: [
    "Then search the house. Markers are hidden in the rooms on the map, and the sealed rooms open a few at a time. A closed door means no. This should not be a new concept for anyone here.",
    "Then search the house. The rooms on the map open a few at a time. Until a room opens, stay out of it. A locked door is not a challenge. It's a door.",
  ],
  howTo6: [
    "When you've searched enough, tap Ready. Once most of you are ready, fresh evidence lands on this screen. The last round has a twist. Pace yourselves.",
    "Tap Ready when you're done snooping. Nothing happens until most of you are ready, which is also how this party got started. The last round brings a twist.",
  ],
  howTo6Timer: [
    "Each round runs on the clock. When it hits zero, fresh evidence lands on this screen, ready or not. The last round has a twist.",
    "Every round is timed, like a parking meter. When time's up, new evidence lands here whether you're done or not. The last round brings a twist.",
  ],
  howJail: [
    "After every round, you vote someone into jail. More than half of you have to agree, or nobody goes. [short pause] Jailbirds can talk and bribe. They can't search, vote or accuse. Bring chips. Bring a lot of chips.",
    "After every round there's a jail vote. It takes more than half of you to lock someone up, which, in this crowd, is the hard part. [short pause] Jailed guests can talk and bribe, but they can't search, vote or accuse.",
  ],
  howRelease: [
    "From the second vote on, you can spring somebody before you lock somebody else up. Same rule: more than half of you. The cell has a revolving door, and it squeaks.",
    "Starting with the second vote, you can let someone out first. It takes more than half of you. Bribe the judge. The judge is all of you.",
  ],
  howTo7: [
    "Talk to everybody. Lie about your own secrets. It's encouraged. [short pause] Only the killer may lie about the murder. Everyone else, tell the truth about that one thing, just this once.",
    "You may lie about your own secrets. Most of you have been practicing for years. [short pause] Only the killer gets to lie about the murder.",
  ],
  howTo7Acc: [
    "Talk to everybody. Lie about your own secrets. It's encouraged. [short pause] Only the killer and the accomplice may lie about the murder. Everyone else, tell the truth about that one thing, just this once.",
    "You may lie about your own secrets. Most of you have been practicing for years. [short pause] Only the killer and their accomplice get to lie about the murder.",
  ],
  howLockIn: [
    "After the last round, everyone who's free locks in: who did it, with which weapon, and in which room. Jailbirds sit this one out and watch, which, for some of you, is how you like it.",
    "After the last round, if you're not in jail, you lock in on your phone: who, with what, and where. Commit. Some of you have never committed to anything, and tonight is a good night to start.",
  ],
  howWin: [
    "To win, more than half of you need the right killer, more than half the right weapon, and more than half the right room. Half is not more than half. We checked with an accountant. [short pause] Then we vote for Best Dressed and Best Liar.",
    "More than half of you have to get the killer, more than half the weapon, and more than half the room. Miss one, and the killer walks out a free and very smug individual. [short pause] Then we vote for Best Dressed and Best Liar.",
  ],
  rollLocked: [
    "[low, grave] The doors are locked until we figure out which one of you did it. [short pause] Bathroom breaks will be supervised. Let's meet the suspects.",
    "[low, grave] Nobody leaves until we know who did it. The doors are locked, the windows are painted shut, and the coat check has your keys. [short pause] Let's meet the suspects.",
  ],
  rollCallClose: [
    "That's everyone. [short pause] One of those lovely faces is lying to you.",
    "And that's the lineup. [short pause] Take a good look. The police sketch artist is drunk.",
  ],
  intro1: [
    "[low, gravelly voice] Chicago. October, 1929. Prohibition is the law of the land, [short pause] and nobody in this room has noticed. [long pause]",
    "[low, gravelly voice] Chicago. October, 1929. The gin is illegal, the band is loud, and the Don is in a very good mood. [long pause] For now.",
  ],
  intro2: [
    "Tonight the Velvet Room lost its owner. Don Carmine Velluto is dead. He leaves behind a nightclub, eleven unpaid cops and a very confused parrot.",
    "Don Carmine Velluto, owner of the Velvet Room, beloved by nobody, is dead. The family asks that you don't touch anything. The family is also suspects.",
  ],
  intro3: [
    "[whispers] One of you did it. [short pause] And frankly, we're all a little impressed.",
    "[whispers] And one of you did it. [short pause] Don't look so innocent. It doesn't suit you.",
  ],
  intro4: [
    "Check your phone. Press and hold your card to see who you are tonight, and keep it to yourself. Some secrets are worth a murder.",
    "Phones out. Press and hold your card. If it says you did it, try to look less pleased about it.",
  ],
  round1: [
    "Round one. Search the house, find the markers, and question everyone. If someone answers too quickly, that's a clue. If someone answers too slowly, that's the gin.",
    "Round one. Go search. Open the closets, check the drawers, find the markers. Whatever you find in a nightstand, keep it to yourself.",
  ],
  round1Waves: [
    "Round one. Only some rooms are open. Search those and only those. The rest are closed, out of respect for the Don, and because of the smell.",
    "Round one. A few rooms are open. Search them. A locked door is not an invitation. It's barely even a suggestion, but tonight it's a rule.",
  ],
  oneMinute: [
    "One minute left in this round. Whatever you're doing, do it faster.",
    "One minute. If you've been flirting instead of searching, this is your wake-up call.",
    "Sixty seconds. Hurry it up, you overdressed herd of snails.",
  ],
  round2: [
    "Round two. Fresh evidence just came in, still warm.",
    "Round two. New evidence. Read it slowly. Some of you move your lips. That's fine.",
  ],
  roomsOpen: [
    "More rooms just opened. Go on. Get in there.",
    "New rooms are open. Same rules: look everywhere, and touch nothing you can't explain.",
  ],
  round3: [
    "Round three. The last of the evidence. After this, you're on your own, morally and legally.",
    "Last round. This is the evidence you'll wish you'd seen first. [short pause] And a twist.",
  ],
  twist: [
    "[building] And now, the part nobody saw coming. Except the killer. The killer saw it coming.",
    "[building] Hold on to something. [short pause] Not each other. Something.",
  ],
  accuse: [
    "That's it. No more evidence. Lock in who did it, with what, and where.",
    "The talking is over. Point the finger on your phone, and pick carefully. Fingers have been broken for less.",
  ],
  accuseLastCall: [
    "Thirty seconds. Lock it in, or forever hold your peace, your drink and your shame.",
    "Thirty seconds left. If you haven't locked in, you're either thinking very hard or hiding something. Both look bad.",
  ],
  reveal1: [
    "[long pause] The person who murdered Don Carmine Velluto, in his own club, in front of his own gin, is…",
    "[long pause] The police have been called. They're on their way. They've been paid. [short pause] The killer of Don Carmine Velluto is…",
  ],
  reveal2: [
    "…standing right here, in a very nice outfit.",
    "…in this room, and has been the whole time. Of course they have.",
  ],
  reveal3: [
    "With that, in there. The cleaning crew is furious.",
    "With this weapon, in this room. We'll be steaming the carpet for weeks.",
  ],
  revealAccomplice: [
    "And the accomplice, who lied to all of you with a straight face, is…",
    "And the one who held the coats and asked no questions is…",
  ],
  verdictDetectives: [
    "The detectives got it right. [short pause] Killer, you may now confess, cry, or both.",
    "Justice, for once in Chicago. [short pause] The killer is caught, and is welcome to blame the gin.",
  ],
  verdictKiller: [
    "Most of you got it wrong. [short pause] The killer walks out of here tonight, free, smug and, frankly, better dressed than any of you.",
    "The killer wins. [short pause] You had the evidence, the weapon and the room, and you still investigated like a sack of drunk-ass ferrets.",
  ],
  votePrompt: [
    "Now vote on your phones: Best Dressed and Best Liar. Vote for yourself if you must. Everyone will know.",
    "Phones out. Best Dressed and Best Liar. This is the only honest thing you'll do all night.",
  ],
  awards: [
    "And now, the awards. The trophies are real. The talent is debatable.",
    "The awards. Please hold your applause, your drinks, and each other, in that order.",
  ],
  awardDetective: [
    "Best Detective, the only person who read the evidence instead of the bar menu, goes to…",
    "Best Detective goes to someone who will now be insufferable for a full year. It goes to…",
  ],
  awardDressed: [
    "Best Dressed, as judged by people who are themselves dressed questionably, goes to…",
    "Best Dressed goes to the outfit that turned the most heads, and at least one stomach…",
  ],
  awardLiar: [
    "And Best Liar, a title several of you have been training for since grade school, goes to…",
    "And Best Liar goes to someone who looked every one of you in the eye tonight and lied. Congratulations to…",
  ],
  goodnight: [
    "The Velvet Room is closed. Settle your debts in chips. If you're staying the night, the couch has seen worse.",
    "That's the night. The bar is closed, the case is closed, and so, frankly, are most of your eyes. Go home.",
  ],
  paused: [
    "Hold everything. Put the drinks down. [short pause] Not you. You can keep yours.",
    "Freeze. Nobody move. [short pause] Especially you. Yes, you.",
  ],
  resumed: ["As you were. Lying, mostly.", "Carry on. Resume your crimes."],
  soundCheck: [
    "Sound check. If you can hear this, the TV works, which makes it the most reliable thing at this party.",
    "Sound check. One, two. If you can hear me, nod. If you can't, how are you nodding?",
  ],
};

/** FNV-1a with a final mix, so small differences in a game's seed spread across the versions. */
const hashOf = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return h >>> 0;
};

/**
 * The noisy bank (Heston, Oct 15): "random sounds they make before or after or mid sentence like a fart or burp or
 * hiccup, or stutter … very very sparingly", "an extra bank of scripts that sometimes get played", never written
 * into the clean lines. One noisy take for about half the lines, in each script; a game plays a line's noisy take
 * NOISY_PCT of the time, so about one line in ten heard has a noise. ElevenLabs tags like [hiccups] (captions drop
 * them) or a written stutter ("c- c- caught"). Classic has no farts.
 */
export const NOISY: Record<Tone, Partial<Record<CueKey, string>>> = {
  classic: {
    doors: "[warm, smoky voice] Welcome to the Velvet Room. I'm {host}, your host tonight. [hiccups] Drinks are on the house. [short pause] Mostly.",
    howKiller: "[warm, conspiratorial] Here's how tonight works. One of you is the k- k- killer. [short pause] Everyone else has to prove it.",
    howWeapons: "Every guest brought a weapon, and one of them did the deed. [hiccups] [short pause] That doesn't mean its owner did.",
    howJail: "After every round, you vote someone into jail. [sneezes] Excuse me. It takes more than half of you, or nobody goes. Jailed guests can talk and bribe, but they can't search, vote or accuse.",
    howTo7: "Talk to everyone. You may lie about your own secrets. [clears throat] [short pause] Only the killer may lie about the murder.",
    rollLocked: "[low, grave] The doors are locked until we figure out who did it. [hiccups] [short pause] Now, let's meet the suspects.",
    rollCallClose: "That's everyone. [short pause] Remember these faces. [hiccups]",
    intro4: "Check your phone. [coughs] Press and hold your card, and keep it to yourself.",
    round2: "Fresh evidence has come in. [burps] Pardon me.",
    oneMinute: "One minute left in this round. [sneezes] Excuse me. One minute.",
    twist: "[building] And now, the t- t- twist.",
    reveal1: "[long pause] The killer of Don Carmine Velluto is… [hiccups] is…",
    verdictDetectives: "The detectives got their killer. [short pause] C- c- confess, you rat.",
    votePrompt: "Now vote on your phones: Best Dressed and [hiccups] Best Liar.",
    voteJail: "Time to vote. [clears throat] Who goes to jail? Vote on your phone. You can pick nobody.",
    jailNobody: "Not enough votes. Nobody goes to jail this t- t- time.",
    awards: "And now, the awards. [clears throat]",
    paused: "Hold everything. [sneezes] Excuse me.",
    goodnight: "The Velvet Room is closed for the night. [hiccups] Settle your debts in chips.",
    howAccomplice: "Tonight the killer has an accomplice. [hiccups] The accomplice didn't do it, but knows who did, and will lie to protect them. [short pause] When you lock in, you can guess the accomplice too. It won't change who wins, but it can win you Best Detective.",
    revealAccomplice: "[short pause] And the a- a- accomplice who helped them is…",
  },
  adult: {
    doors: "[warm, smoky voice] Welcome to the Velvet Room. I'm {host}. The gin was made in a bathtub this afternoon, [hiccups] and the bathtub did its best.",
    doorsReminder: "If you haven't opened your link yet, do it now. [burps] The bouncer has been told you're a fed.",
    howKiller: "[warm, conspiratorial] Here's how this goes. One of you is a k- k- killer. [short pause] The rest of you have to nail them.",
    howWeapons: "Everybody brought a weapon, and one of them did the job. [hiccups] [short pause] Doesn't mean its owner did.",
    howJail: "After every round, you vote someone into jail. [farts] [short pause] That was the chair. More than half of you have to agree, or nobody goes. Jailbirds can talk and bribe. They can't search, vote or accuse.",
    howTo7: "You may lie about your own secrets. Most of you have been practicing for years. [burps] [short pause] Only the killer gets to lie about the murder.",
    howWin: "More than half of you need the right killer, more than half the right weapon, and more than half the right room. [sneezes] Excuse me. Exactly half is a tie, and ties go to the killer. [short pause] Then we vote for Best Dressed and Best Liar.",
    rollLocked: "[low, grave] The doors are locked until we figure out which one of you did it. [hiccups] [short pause] Let's meet the suspects.",
    rollCallClose: "And that's the lineup. [short pause] Take a good look. The police sketch artist is drunk. [hiccups]",
    intro3: "[whispers] One of you did it. [short pause] And frankly, we're all a little impressed. [hiccups]",
    intro4: "Phones out. Press and hold your card. [burps] If it says you did it, try to look less pleased about it.",
    round1: "Round one. Search the house, find the markers, and question everyone. [clears throat] Everyone.",
    round2: "Round two. Fresh evidence just came in, still warm. [burps] Pardon me.",
    oneMinute: "Sixty seconds. [sneezes] Hurry it up, you overdressed herd of snails.",
    twist: "[building] Hold on to something. [farts] [short pause] Not that.",
    accuseLastCall: "Thirty seconds left. Lock it in. [hiccups] Lock it in.",
    reveal1: "[long pause] The person who murdered Don Carmine Velluto, in his own club, in front of his own gin, is… [hiccups] is…",
    verdictDetectives: "Justice, for once in Chicago. [short pause] The killer is c- c- caught, and is welcome to blame the gin.",
    votePrompt: "Now vote on your phones: Best Dressed and Best Liar. Vote for yourself if you must. [snorts] Everyone will know.",
    awards: "And now, the awards. [clears throat] [clears throat again] The trophies are real. The talent is debatable.",
    awardLiar: "And Best Liar goes to someone who looked every one of you in the eye tonight and l- l- lied. Congratulations to…",
    goodnight: "The Velvet Room is closed. [burps] Settle your debts in chips. If you're staying the night, the couch has seen worse.",
    paused: "Freeze. Nobody move. [farts] [short pause] Nobody say a word, either.",
    voteJail: "Time to vote. Somebody's going to jail, or nobody is. [burps] Pick on your phone.",
    voteTally: "The votes are in. [hiccups] Here's how you voted. No take-backs.",
    releaseNobody: "Not enough votes. [farts] [short pause] The jailbirds stay in their cage.",
    howAccomplice: "Tonight the killer brought a friend. [hiccups] The accomplice didn't do it, but knows exactly who did, and will lie to your face about it. [short pause] When you lock in, take a guess at the accomplice too.",
    revealAccomplice: "And the accomplice, who lied to all of you with a straight face, is… [burps] is…",
  },
};
/** How often a line with a noisy take plays it (so about one line in ten heard has a noise). */
export const NOISY_PCT: Record<Tone, number> = { classic: 25, adult: 20 };

/** The clean versions of a line: one in Classic; in Adult, the CUES line and then ADULT_MORE's. */
export function cleanVersions(cue: CueKey, tone: Tone): string[] {
  const c: Cue = CUES[cue];
  return tone === "adult" ? [c.adult, ...(ADULT_MORE[cue] ?? [])] : [c.classic];
}

/** Every version of a line in this script: the clean ones, then its noisy take (if it has one) last. */
export function cueVersions(cue: CueKey, tone: Tone): string[] {
  const noisy = NOISY[tone][cue];
  return noisy ? [...cleanVersions(cue, tone), noisy] : cleanVersions(cue, tone);
}

/** Whether version v of a line is its noisy take. */
export const isNoisy = (cue: CueKey, tone: Tone, v: number) => !!NOISY[tone][cue] && v === cleanVersions(cue, tone).length;

/**
 * Which version of a line this game uses: picked from the game (its slug) so every replay sounds different, and the
 * server, the TV and the recordings agree. A line that repeats in one game (the one-minute warning, say) passes
 * which time it is, so it changes each time too.
 */
export function cueVariant(tone: Tone, cue: CueKey, seed = "", occurrence = ""): number {
  const n = cleanVersions(cue, tone).length;
  // Now and then, the noisy take.
  if (NOISY[tone][cue] && hashOf(`${seed}|${cue}|${occurrence}|noise`) % 100 < NOISY_PCT[tone]) return n;
  return n <= 1 ? 0 : hashOf(`${seed}|${cue}|${occurrence}`) % n;
}

/** The recording's file name (without .mp3): version 0 is the cue's own name, the rest add their number. */
export const cueFile = (cue: CueKey, v = 0) => (v ? `${cue}.${v}` : cue);

/** Every recording a script needs: each line, in each of its versions. */
export function cueFiles(tone: Tone): { cue: CueKey; v: number; file: string }[] {
  return CUE_KEYS.flatMap((cue) => cueVersions(cue, tone).map((_, v) => ({ cue, v, file: cueFile(cue, v) })));
}

/** Pauses survive in Unstable takes; every other direction is replaced by the wild one. */
const KEEP = /^\[(short pause|long pause)\]$/i;
const TAG = /\[[^\]]*\]/g;

/** Text without any direction tags: captions, the live reader, the MC sheet. */
export const plain = (text: string) => text.replace(TAG, "").replace(/\s{2,}/g, " ").trim();

/** The exact text sent to ElevenLabs for one recording (version v of the line). */
export function recordingText(cue: CueKey, tone: Tone, host: HostKey, unstable: boolean, v = 0): string {
  const c: Cue = CUES[cue];
  const versions = cueVersions(cue, tone);
  const base = (versions[v] ?? versions[0]).replaceAll("{host}", HOSTS[host].name);
  if (!unstable) return base;
  const kept = base.replace(TAG, (t) => (KEEP.test(t) ? t : "")).replace(/\s{2,}/g, " ").trim();
  return [c.wild[0], kept, c.wild[1]].filter(Boolean).join(" ");
}

/** What the TV caption and the live reader say for a cue (version v of the line). */
export function captionText(cue: CueKey, tone: Tone, host: HostKey, v = 0): string {
  const versions = cueVersions(cue, tone);
  return plain((versions[v] ?? versions[0]).replaceAll("{host}", HOSTS[host].name));
}

// ---------- custom lines: made per party from what guests typed and from the draw ----------
// None of these gives the answer away: at Start the game records one clip for every guest,
// every exhibit and every room, and the reveal just plays the right ones.

const WILD_POOL = ["[cackling]", "[shouting]", "[whispers, wild-eyed]", "[sobbing dramatically]", "[squealing]", "[growls]"];
const pickWild = (seed: string) => WILD_POOL[[...seed].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % WILD_POOL.length];
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const mid = (l: string) => l.replace(/^The /, "the ");

export type CustomKind = "arrival" | "body" | "rooms" | "killer" | "accomplice" | "exhibit" | "room" | "winner" | "roll" | "jailed" | "released";

/** The words for a custom line. Pass a name as it should sound (the guest's "say it like", when they gave one). */
export function customText(
  kind: CustomKind,
  tone: Tone,
  v: { name?: string; who?: string; room?: string; rooms?: string[]; letter?: string; weapon?: string; real?: string; line?: string; seed?: string },
): string {
  const adult = tone === "adult";
  // Adult lines come in versions, picked per game (by its seed) so replays sound different.
  const pick = (xs: string[]) => xs[hashOf(`${v.seed ?? ""}|${kind}`) % xs.length];
  switch (kind) {
    case "arrival":
      return `Now arriving: ${v.name}.${v.who ? ` ${v.who}` : ""}`;
    case "body": {
      const r = mid(v.room!);
      return adult ? pick([`They found him in ${r}. What a mess.`, `He was found in ${r}. Face down. On the good rug.`, `They found him in ${r}, looking surprised, which for the Don was a first.`]) : `He was found in ${r}.`;
    }
    case "rooms": {
      const rs = list((v.rooms ?? []).map(mid));
      return adult ? pick([`Now open: ${rs}. Go dig.`, `Now open: ${rs}. Wipe your feet.`, `Unlocked: ${rs}. Behave. Or don't, but quietly.`]) : `Now open: ${rs}.`;
    }
    case "killer":
      return adult ? pick([`${v.name}, you rotten bastard.`, `${v.name}. Of course it was.`, `${v.name}. We're not even surprised. We're a little proud.`]) : `${v.name}.`;
    case "accomplice":
      return adult ? pick([`${v.name}. The getaway driver, minus the car.`, `${v.name}, who has been nodding along all night.`, `${v.name}. Loyal, quiet, and no help to anyone else.`]) : `${v.name}.`;
    case "exhibit":
      // v2: weapons have names, not exhibit letters.
      return `With the ${(v.weapon ?? "").toLowerCase()},`;
    case "room":
      return `in ${mid(v.room!)}.`;
    case "winner":
      return `${v.name}!`;
    case "jailed":
      return adult ? pick([`${v.name} is going to jail. Think about what you did.`, `${v.name}, into the cell. Mind the bars.`, `${v.name} is going to jail. Bring a sweater.`]) : `${v.name} is going to jail.`;
    case "released":
      return adult ? pick([`${v.name} is out. Behave.`, `${v.name} walks. For now.`, `${v.name} is free. The cell will miss you.`]) : `${v.name} is free to go.`;
    case "roll":
      return `${rollIntro(tone, v.name ?? "", v.real ?? "")} ${v.line ?? ""}`.trim();
  }
}

// ---------- roll call ----------

/** The question guests answer at sign-up. The narrator reads the answer at the roll call. */
export const ROLL_PROMPT = {
  label: "Roll call: what's the word on the street about you?",
  placeholder: "e.g. Once cheated a priest at cards, and won.",
  help: "At the roll call, the narrator reads this out right before your roast. Keep it short and funny. Everyone will hear it.",
};

const ROLL_INTROS: Record<Tone, string[]> = {
  classic: ["Introducing {char}, played by {real}.", "Next, {char}. Better known as {real}.", "Say hello to {char}, played by {real}."],
  adult: [
    "Introducing {char}, played by {real}, God help us.",
    "Next up, {char}, a.k.a. {real}.",
    "Look who crawled in: {char}, played by {real}.",
    "Exhibit A: {char}, played by {real}.",
    "From the files of the Chicago Police Department: {char}, played by {real}.",
    "Please welcome {char}, played by {real}, who was not technically invited.",
  ],
};

/** "Introducing Velma, played by Jordan." Varied per guest (and, given a game's seed, per game) so it doesn't drone. */
export function rollIntro(tone: Tone, char: string, real: string, seed = ""): string {
  const list = ROLL_INTROS[tone];
  const real1 = real.trim() || "a mystery guest";
  // Picked by the real name, so the caption and the recording (which may spell the name the guest's way) match.
  return list[hashOf(`${seed}${real1}`) % list.length].replace("{char}", char).replace("{real}", real1);
}

const endStop = (s: string) => (/[.!?…"'”]$/.test(s) ? s : `${s}.`);

/** The funny line under a guest's roll-call card: the host's edit, else their rumor, else who they are. */
export function rollLineFor(p: { rollLine?: string; rumor?: string; who: string }): string {
  if (p.rollLine?.trim()) return endStop(p.rollLine.trim());
  if (p.rumor?.trim()) return `Word on the street: ${endStop(p.rumor.trim())}`;
  return endStop(p.who.trim());
}

/** What the roll call (v2) says about one guest. The motive is theirs (first person) or the house's (second person). */
export type RollParts = { name: string; real: string; signature: string; weapon: string; motive: string; motiveOwn: boolean; rumor: string; rumorLead?: string; roast: string; seed?: string };

/**
 * The v2 roll-call line: "Introducing Velma, played by Ana. Signature: … Weapon: the candlestick. Velma, your motive: …
 * Overheard at the bar: … [roast]". The motive goes with the character's name (Heston, Oct 15), and the guest's
 * "word on the street" leads into the roast, each guest with a different lead-in (convex/roasts.ts). Also where each part starts, as a share of the line, so the TV card
 * can bring its rows in with the voice.
 */
export function rollNarration(tone: Tone, p: RollParts) {
  let text = rollIntro(tone, p.name, p.real, p.seed);
  const add = (part: string) => {
    if (!part) return text.length;
    const at = text.length + 1;
    text += ` ${part}`;
    return at;
  };
  const sig = add(p.signature.trim() ? `Signature: ${endStop(p.signature.trim())}` : "");
  const weapon = add(p.weapon ? `Weapon: the ${p.weapon.toLowerCase()}.` : "");
  const m = p.motive.trim();
  const motive = add(m ? (p.motiveOwn ? `${p.name}'s motive, in their own words: “${endStop(m)}”` : `${p.name}, your motive: ${endStop(m)}`) : "");
  // No lead at all is allowed: the guest's line lands flat, as fact.
  const lead = p.rumorLead === undefined ? "Word on the street:" : p.rumorLead.trim();
  const word = p.rumor.trim() ? [lead, endStop(p.rumor.trim())].filter(Boolean).join(" ") : "";
  const roast = add([word, p.roast.trim() ? endStop(p.roast.trim()) : ""].filter(Boolean).join(" "));
  const share = (n: number) => Math.round((n / Math.max(1, text.length)) * 1000) / 1000;
  return { text, marks: { signature: share(sig), weapon: share(weapon), motive: share(motive), roast: share(roast) } };
}

const NOISES: Record<Tone, string[]> = {
  classic: ["[hiccups]", "[burps]", "[sneezes]", "[coughs]", "[clears throat]", "[snorts]"],
  adult: ["[hiccups]", "[burps]", "[sneezes]", "[coughs]", "[clears throat]", "[snorts]", "[farts]", "[burps loudly]"],
};

/**
 * A custom line (roll call, heckles, the names) recorded per game: about one in ten gets a noise before, after or
 * between its sentences, or a stutter on one word (Heston, Oct 15). Picked from the game's seed and the line, so the
 * clean line is what most games hear. Captions use the clean text.
 */
export function sprinkle(text: string, tone: Tone, key: string): string {
  const h = hashOf(`${key}|sprinkle`);
  if (h % 10 !== 0) return text;
  const pick = Math.floor(h / 10);
  const kinds = NOISES[tone];
  const where = pick % 4;
  if (where === 3) {
    // a stutter on the first longer word
    const m = /\b([A-Za-z])([a-z]{3,})\b/.exec(text.replace(/\[[^\]]*\]/g, (t) => " ".repeat(t.length)));
    if (m) return text.slice(0, m.index) + `${m[1]}- ${m[1].toLowerCase()}- ` + text.slice(m.index);
  }
  const noise = kinds[Math.floor(pick / 4) % kinds.length];
  if (where === 0) return `${noise} ${text}`;
  if (where === 1) return `${text} ${noise}`;
  const cut = text.search(/[.!?…]\s/);
  return cut > 0 ? `${text.slice(0, cut + 1)} ${noise}${text.slice(cut + 1)}` : `${text} ${noise}`;
}

/** The text sent to ElevenLabs for a custom line; Unstable adds a wild direction. */
export function customRecordingText(text: string, unstable: boolean): string {
  return unstable ? `${pickWild(text)} ${text}` : text;
}
