// The narrator: every line the host says, in both scripts, for both hosts, steady or Unstable.
// Pure data, shared by the TV, the recording script and the custom-line maker.
//
// Lines are generic on purpose (no guest names), so one set of recordings serves every party.
// Bracketed tags are delivery direction for ElevenLabs Eleven v4; captions and the live reader drop them.

/**
 * Which script the narrator reads. A game's own setting is Classic or Adult (GameTone); Sailor mode (Oct 16, Heston:
 * "a toggle in the voice setup area that is 'Sailor mode'", "totally unhinged, delivered with utmost intensity and
 * seriousness") is Joel (Mister Gruff's voice since Oct 17) reading his own furious, filthy script over an Adult game.
 */
export type Tone = "classic" | "adult" | "sailor";
export type GameTone = "classic" | "adult";
export type HostKey = "ivy" | "duke";

export const HOSTS: Record<HostKey, { name: string; voiceId: string; describe: string }> = {
  ivy: { name: "Ivy", voiceId: "MftN0gvsFPPOYnV3DU0Y", describe: "Ivy runs the floor tonight: an old-Hollywood, transatlantic voice." },
  duke: { name: "Duke", voiceId: "QzTKubutNn9TjrB7Xb2Q", describe: "Duke runs the floor tonight: a New York mobster's voice." },
};

/** Eleven v4 settings. Unstable drops stability to zero: no two takes alike. */
export const VOICE_SETTINGS = {
  steady: { stability: 0.45, similarity_boost: 0.8 },
  unstable: { stability: 0.0, similarity_boost: 0.75 },
  /** Sailor: more range, so the fury comes through. */
  sailor: { stability: 0.3, similarity_boost: 0.8 },
};
export const settingsFor = (voice: string) => (voice.endsWith("-sailor") ? VOICE_SETTINGS.sailor : voice.endsWith("-unstable") ? VOICE_SETTINGS.unstable : VOICE_SETTINGS.steady);
export const TTS_MODEL = "eleven_v4";

/**
 * Sailor mode's own voice (Oct 17, Heston: "a different voice that sounds like an angry old man", then picked
 * "mister gruff"): Mister Gruff from the ElevenLabs voice library. Until then Sailor mode was Duke (duke-sailor).
 */
export const SAILOR_VOICE = { voice: "Mister Gruff", voiceId: "mSOmKHC6GZcZbSTGlqHO" };

/** Sailor mode's narrator calls himself Joel (Oct 17, Heston: "Sailors name is Joel"). */
export const SAILOR_NAME = "Joel";

/** The name the narrator goes by: Ivy or Duke, or Joel in Sailor mode. */
export const narratorName = (host: HostKey, tone: Tone) => (tone === "sailor" ? SAILOR_NAME : HOSTS[host].name);

/** Folder name for one recorded set: ivy, ivy-unstable, duke, duke-unstable, gruff-sailor (duke-sailor before Oct 17). */
export const voiceKey = (host: HostKey, unstable: boolean, sailor = false) => (sailor ? "gruff-sailor" : `${host}${unstable ? "-unstable" : ""}`);

/** The ElevenLabs voice behind a recorded set. */
export const voiceIdFor = (voice: string) =>
  voice === "gruff-sailor" ? SAILOR_VOICE.voiceId : HOSTS[voice.startsWith("duke") ? "duke" : "ivy"].voiceId;

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
    adult: "[warm, smoky voice] Welcome to the Velvet Room. I'm {host}. Please leave your guns with the nice man by the door. He's only missing the one thumb, so don't be a jackass about it.",
    wild: ["[manic, way too excited]", "[unhinged laughter]"],
  },
  doorsReminder: {
    when: "Every few minutes while guests arrive",
    classic: "If you haven't checked in on your phone, now's the time.",
    adult: "Not checked in on your phone? Until you do, you're legally a damn coat rack.",
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
    classic: "Talk to everyone. You may lie about your own secrets. [short pause] Only the guilty may lie about the murder.",
    adult: "Talk to everybody. Lie about your own secrets all you want. [short pause] Only the guilty get to lie about the murder.",
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
    classic: "You need more than half the lock-ins on the killer, more than half on the weapon and more than half on the room, or the killer wins. The killer locks in too. Then we vote for Best Dressed and Best Liar. [short pause] Good luck. You'll need it.",
    adult: "More than half the lock-ins on the killer, more than half on the weapon, more than half on the room, and the killer locks in too. Screw up one, and the killer walks. Then we vote for Best Dressed and Best Liar. [short pause] Good luck. You're gonna need it.",
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
    classic: "Tonight the killer has an accomplice. They didn't do it, but they know who did, and they'll lie for them. [short pause] When you lock in, take a guess at the accomplice too.",
    adult: "The killer placed an ad. Help wanted: one accomplice. Didn't do it, knows who did, lies for them. No pay. Must be a two-faced rat. Saps need not apply. [short pause] Guess who got the job when you lock in.",
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
    classic: "Nobody brought a weapon tonight. The house picked them, and here they are. [short pause] One of them is about to do the deed.",
    adult: "Nobody brought a weapon tonight. The house supplied them, like towels at the Waldorf, and you'll steal them like towels at the Waldorf. [short pause] One of them is about to do the job.",
    wild: ["[deadly serious]", "[giggles nervously]"],
  },
  howJail: {
    when: "How to play v2, the jail vote",
    classic: "After Round 2, you can vote one guest into jail. It takes more than half of you, or nobody goes. [short pause] The jailbird can talk and bribe, but can't search, vote or lock in.",
    adult: "After Round 2, you can vote somebody into jail. It takes more than half of you, or nobody goes. [short pause] The jailbird can talk and bribe, but can't search, vote or lock in. This is called the justice system.",
    wild: ["[banging on the bars, shouting]", "[evil laugh]"],
  },
  howRelease: {
    when: "How to play v2, the release vote",
    classic: "After Round 3, before the lock-in, you can vote the jailbird back out. Same rule: more than half of you.",
    adult: "After Round 3, before the lock-in, you can spring the jailbird. Same rule, more than half of you. Bail, like everything else at Tammany Hall, is a popularity contest.",
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
    classic: "More than half the lock-ins need the right killer, more than half the right weapon, and more than half the right room. The killer locks in too. Exactly half won't do. [short pause] Miss one, and the killer walks. Then we vote for Best Dressed and Best Liar. Good luck.",
    adult: "More than half the lock-ins need the right killer, more than half the right weapon, and more than half the right room, and the killer locks in too. Exactly half is a tie, and ties go to the killer. [short pause] Then we vote for Best Dressed and Best Liar.",
    wild: ["[maniacal laughter]", "[cackles]"],
  },
  // ---- How to play, v3 (Oct 16, Heston: "the rules need to be simplified", "use visuals to help explain the rules,
  // and condense the rules if possible"): five cards (six with an accomplice), each with a picture that shows the
  // rule. Same rules as v2, fewer words. Drafts for Heston's review. ----
  howCase: {
    when: "How to play v3, card 1 (one of you did it; your phone; lying)",
    classic: "[warm, conspiratorial] Here's how tonight works. Any minute now, Don Ray Sanders is going to die, and one of you will have done it. Your phone will tell you if it was you. [short pause] Only the guilty may lie. Everyone else tells the truth, the whole truth, and nothing but.",
    adult: "[warm, conspiratorial] Here's the deal. Any minute, Don Ray Sanders drops dead, and one of you will have done it. Your phone will tell you if it was you. If it says you're innocent, try to look less disappointed. [short pause] Only the guilty may lie. Everyone else tells the truth, and only the truth. Your age, your money and Atlantic City are, sadly, under oath.",
    wild: ["[clapping hands, way over the top]", "[cackles]"],
  },
  howSearch: {
    when: "How to play v3, searching",
    classic: "Three rounds. Each round, search the house for evidence cards and scan them with your phone. [short pause] What a card says stays on your phone; the map up here just ticks it off. So compare notes.",
    adult: "Three rounds. Raid the house like a fed: every drawer, every damn fake bookcase. Scan the evidence cards with your phone. [short pause] The dirt stays on your phone; up here, the map just ticks the card off. So compare notes.",
    wild: ["[shouting like a carnival barker]", ""],
  },
  howJail2: {
    when: "How to play v3, the jail vote",
    classic: "After Round 2, you can vote one guest into jail. You don't have to: if you're not sure, vote nobody. It takes more than half of you. [short pause] The jailbird can't search, vote or lock in. After Round 3, you can vote them back out.",
    adult: "After Round 2, the court of public opinion is in session. You can vote one guest into jail. You don't have to; you can vote nobody. That's not cowardice, it's caution. It's also cowardice. More than half of you must agree. [short pause] The jailbird can't search, vote or lock in. After Round 3, you can vote them back out.",
    wild: ["[banging on the bars, shouting]", "[evil laugh]"],
  },
  howRound: {
    when: "How to play v3, how a round ends (Ready pacing; rooms open in waves)",
    classic: "Each round, tap Ready on your phone when you're done searching. The round ends when most of you are ready.",
    adult: "When you're done snooping, tap Ready on your phone. The round ends when most of you are ready, so don't be the wet blanket holding everybody up.",
    wild: ["[impatient, tapping a watch]", ""],
  },
  howRoundTimer: {
    when: "How to play v3, how a round ends (timer; rooms open in waves)",
    classic: "Each round runs on the clock. When the clock runs out, the round ends, ready or not.",
    adult: "Each round runs on the clock. When the clock runs out, the round ends, whether you've found anything or not. Most of you won't have.",
    wild: ["[impatient, tapping a watch]", ""],
  },
  howRoundAll: {
    when: "How to play v3, how a round ends (Ready pacing; every room open from Round 1)",
    classic: "Every card is out from Round 1, so search anywhere. Tap Ready on your phone when you're done; the round ends when most of you are ready. Rounds 2 and 3 bring new evidence on the TV.",
    adult: "Every card is out from Round 1, so the whole house is fair game. Tap Ready when you're done searching; the round ends when most of you are ready. Rounds 2 and 3 bring fresh dirt to the TV.",
    wild: ["[impatient, tapping a watch]", ""],
  },
  howRoundTimerAll: {
    when: "How to play v3, how a round ends (timer; every room open from Round 1)",
    classic: "Every card is out from Round 1, so search anywhere. Each round ends when the clock runs out. Rounds 2 and 3 bring new evidence on the TV.",
    adult: "Every card is out from Round 1, so the whole house is fair game. The round ends when the clock runs out, ready or not. Rounds 2 and 3 bring fresh dirt to this screen.",
    wild: ["[impatient, tapping a watch]", ""],
  },
  howWin2: {
    when: "How to play v3, locking in and winning",
    classic: "After round three, lock in who did it, with what, and where. The killer locks in too. [short pause] You win only if more than half of the lock-ins get the killer, more than half get the weapon, and more than half get the room. If not, the killer walks.",
    adult: "After round three, lock in your bets: who, with what, and where. The killer locks in too. [short pause] You need more than half the lock-ins on the killer, more than half on the weapon, and more than half on the room. Miss one, and the killer walks, and you lose your shirt like a dumbass at Belmont.",
    wild: ["[maniacal laughter]", "[cackles]"],
  },
  // ---- roll call, v2: after How to play ----
  rollLocked: {
    when: "Roll call v2 begins",
    classic: "[low, grave] The doors are locked until we figure out who did it. [short pause] Now, let's meet the suspects.",
    adult: "[low, grave] The doors are locked until we know which one of you did it. I've hidden the key somewhere none of you will ever look: inside a book. [short pause] Let's meet the suspects.",
    wild: ["[slamming the door, shouting]", "[cackles]"],
  },
  // ---- votes (v2): after every round. Drafts for Heston's review. ----
  voteJail: {
    when: "The jail vote opens",
    classic: "Time to vote. Who goes to jail? Vote on your phone. You can pick nobody.",
    adult: "Jail vote. Somebody's going up the river, or nobody is. Vote on your phone.",
    wild: ["[banging a gavel, way too hard]", ""],
  },
  voteRelease: {
    when: "The release vote opens (after Round 3, before the lock-in, if anyone is in jail)",
    classic: "Before the lock-in: does our jailbird get out? Vote on your phone.",
    adult: "The parole board is now in session. That's you. Every one of you is four gins deep. Before the lock-in, vote on your phone: does the jailbird get out?",
    wild: ["[jingling keys, giggling]", ""],
  },
  voteLastCall: {
    when: "Fifteen seconds left to vote",
    classic: "Fifteen seconds left to vote.",
    adult: "Fifteen seconds. Get a wiggle on, or the dead guy votes for you. He's been leaning your way.",
    wild: ["[panicking]", ""],
  },
  voteTally: {
    when: "The vote closes: who voted for whom",
    classic: "The votes are in. Here's how you voted.",
    adult: "The votes are in. Here's who knifed who in the back.",
    wild: ["[drumroll noises with mouth]", ""],
  },
  jailNobody: {
    when: "Jail vote: not enough votes",
    classic: "Not enough votes. Nobody goes to jail this time.",
    adult: "Not enough votes. Nobody goes to jail. The killer thanks you for your service.",
    wild: ["[deeply disappointed sigh]", ""],
  },
  releaseNobody: {
    when: "Release vote: not enough votes",
    classic: "Not enough votes. Our jailbird stays put.",
    adult: "Not enough votes. The jailbird stays put. Rot well.",
    wild: ["[cackling]", ""],
  },
  // Oct 17 (D10): the evidence already cleared the guest in jail, so there's no release vote. Their name follows.
  releaseCleared: {
    when: "End of Round 3: the evidence has cleared the guest in jail, no vote",
    classic: "No vote needed. The evidence says our jailbird didn't do it.",
    adult: "No vote needed. The evidence says the jailbird's innocent. Of this, anyway.",
    wild: ["[jangling keys, disappointed]", ""],
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
    adult: "What a sorry-ass lot. [short pause] I've seen classier lineups at the Tombs.",
    wild: ["[suddenly sinister]", "[evil laugh]"],
  },
  // ---- intro ----
  intro1: {
    when: "Start: lights down",
    classic: "[low, gravelly voice] New York City. October, 1929. [long pause]",
    adult: "[low, gravelly voice] New York City. October, 1929. [long pause]",
    wild: ["[dramatic hushed whisper]", ""],
  },
  intro2: {
    when: "Start: the body",
    classic: "Tonight, the Velvet Room lost its owner. Don Ray Sanders has been found dead.",
    adult: "Don Ray Sanders is dead. Tammany Hall registered the poor sap to vote within the hour.",
    wild: ["[suddenly shouting]", "[sobbing dramatically]"],
  },
  intro3: {
    when: "Start: the accusation",
    classic: "[whispers] One of you did it.",
    adult: "[whispers] One of you did it. [short pause] Didn't even finish your drink. Wasteful jackass.",
    wild: ["[whispers, wild-eyed]", "[cackling]"],
  },
  intro4: {
    when: "Start: check your phone",
    classic: "Check your phone. Press and hold your card, and keep it to yourself.",
    adult: "Check your phone. Press and hold your card. If it says killer, for crying out loud, don't announce it.",
    wild: ["[frantic, talking way too fast]", ""],
  },
  // ---- round 1 ----
  round1: {
    when: "Round 1 begins (all rooms open)",
    classic: "Round one. Search the house. Find the markers. Question everyone.",
    adult: "Round one. Search the house. Question whoever smells most like gin and bullshit.",
    wild: ["[shouting like a drill sergeant]", ""],
  },
  round1Waves: {
    when: "Round 1 begins (rooms in waves)",
    classic: "Round one. Only some rooms are open. Search them, and question everyone.",
    adult: "Round one. Some rooms are open. The rest are closed out of respect for the Don, and the smell.",
    wild: ["[shouting like a drill sergeant]", ""],
  },
  oneMinute: {
    when: "One minute left in a round (timer)",
    classic: "One minute left in this round.",
    adult: "One minute. Get a wiggle on, like the place is on fire and well insured.",
    wild: ["[panicking]", "[hyperventilating]"],
  },
  // ---- rounds 2 and 3 ----
  round2: {
    when: "Round 2 begins",
    classic: "Fresh evidence has come in.",
    adult: "Round two. Fresh evidence just came in, still warm. Don't ask.",
    wild: ["[gasps theatrically]", "[cackles]"],
  },
  roomsOpen: {
    when: "More rooms open (waves)",
    classic: "More rooms are open. Get searching.",
    adult: "More rooms open. Search them like a Bowery pickpocket.",
    wild: ["[squealing with delight]", ""],
  },
  round3: {
    when: "Round 3 begins",
    classic: "The last of the evidence. [short pause] And one final twist.",
    adult: "Final evidence, and a twist that'll hit you like Black Tuesday, right in the bollocks.",
    wild: ["[ominous, way too slow]", "[evil laugh]"],
  },
  twist: {
    when: "Right before the twist card",
    classic: "[building] And now, the twist.",
    adult: "[building] And now, the twist. [short pause] Oh. [short pause] Oh, shit.",
    wild: ["[building to a scream]", ""],
  },
  // ---- accusations ----
  accuse: {
    when: "Accusations open",
    classic: "The time for talk is over. Make your accusations.",
    adult: "Court's in session. You're the jury, God help us all. Lock it in.",
    wild: ["[pounding the table, shouting]", ""],
  },
  accuseLastCall: {
    when: "Thirty seconds left (timer)",
    classic: "Thirty seconds. Lock in your accusation.",
    adult: "Thirty seconds. Get a wiggle on, or I pick. I've had nine bloody gins.",
    wild: ["[panicked shriek]", ""],
  },
  // ---- reveal ----
  reveal1: {
    when: "Reveal: the drumroll",
    classic: "[long pause] The killer of Don Ray Sanders is…",
    adult: "[long pause] The police have been paid. [short pause] The killer of Don Ray Sanders is…",
    wild: ["[trembling with excitement]", ""],
  },
  reveal2: {
    when: "Reveal: the killer (if custom lines are off)",
    classic: "…standing right here among you.",
    adult: "…right here, drinking the dead man's gin.",
    wild: ["[screaming]", "[sobbing]"],
  },
  reveal3: {
    when: "Reveal: weapon and room (if custom lines are off)",
    classic: "With this weapon, in this room.",
    adult: "With this, in there. Bold choice. Tacky as hell, but bold.",
    wild: ["[horrified]", ""],
  },
  revealAccomplice: {
    when: "Reveal: before the accomplice's name (killer + accomplice games)",
    classic: "[short pause] And the accomplice who helped them is…",
    adult: "And the one who held the coats and asked no questions is…",
    wild: ["[whispering, scandalized]", ""],
  },
  verdictDetectives: {
    when: "Verdict: the detectives win (more than half on the killer, more than half on the weapon, more than half on the room)",
    classic: "The detectives got their killer. [short pause] Confess, you rat.",
    adult: "You got it right. I'm shocked. [short pause] Confess, you dirty rat.",
    wild: ["[ecstatic, shouting]", "[wild applause]"],
  },
  verdictKiller: {
    when: "Verdict: the killer walks (not more than half on the killer, the weapon or the room)",
    classic: "Not enough of you got the killer, the weapon and the room. [short pause] The killer walks free tonight.",
    adult: "Not enough of you got the killer, the weapon and the room. The killer walks. The NYPD would like to offer you all jobs.",
    wild: ["[sobbing uncontrollably]", ""],
  },
  votePrompt: {
    when: "After the verdict",
    classic: "Now vote on your phones for Best Dressed. You can't vote for yourself.",
    adult: "Now vote on your phones for Best Dressed. Bribes accepted at the bar.",
    wild: ["[sing-song, mocking]", ""],
  },
  // ---- awards and goodnight ----
  awards: {
    when: "Awards open",
    classic: "And now, the awards.",
    adult: "The awards. Hollywood started doing these in May. Theirs are rigged too.",
    wild: ["[over-the-top game show host]", ""],
  },
  awardDetective: {
    when: "Before the Best Detective name",
    classic: "Best Detective goes to…",
    adult: "Best Detective, who'll be a smug pill about this until 1940, goes to…",
    wild: ["[building, breathless]", ""],
  },
  awardDressed: {
    when: "Before the Best Dressed name",
    classic: "Best Dressed goes to…",
    adult: "Best Dressed, for now, goes to…",
    wild: ["[swooning]", ""],
  },
  awardLiar: {
    when: "Before the Best Liar name (voted among the innocents only)",
    classic: "And Best Liar, the innocent guest who lied best about their own secret, goes to…",
    adult: "And Best Liar. Innocents only: the killer lies for a living. This one lied for fun. It goes to…",
    wild: ["[whispers, scandalized]", ""],
  },
  // Oct 17 (D11, D6): the innocent everyone blamed, and the killer who walked. Only played when someone won them.
  awardPrimeSuspect: {
    when: "Before the Prime Suspect name (the innocent guest the most lock-ins named)",
    classic: "The Prime Suspect award, for the innocent guest who got the most fingers pointed at them, goes to…",
    adult: "Prime Suspect. Innocent, as it turns out, but you'd never know it from the lock-ins. It goes to…",
    wild: ["[gasping, delighted]", ""],
  },
  awardGotAway: {
    when: "Before the Got Away With It name (the killer walked)",
    classic: "And for walking out of here scot-free, the Got Away With It award goes to…",
    adult: "The Got Away With It award, sponsored by the New York Police Department, goes to…",
    wild: ["[slow, menacing applause]", ""],
  },
  goodnight: {
    when: "Night over",
    classic: "The Velvet Room is closed for the night. Settle your debts in chips.",
    adult: "We're closed. Settle your debts in chips, or kneecaps.",
    wild: ["[weeping, then suddenly cheerful]", "[hiccups]"],
  },
  // ---- any time ----
  paused: {
    when: "The host pauses",
    classic: "Hold everything.",
    adult: "Everybody shut the hell up. I think the Don just twitched.",
    wild: ["[screeching]", ""],
  },
  resumed: {
    when: "The host resumes",
    classic: "Carry on.",
    adult: "Right. Back to your bollocks.",
    wild: ["[sweetly, as if nothing happened]", ""],
  },
  soundCheck: {
    when: "Sound check",
    classic: "Sound check. If you can hear this, the TV is ready.",
    adult: "Sound check. Testing, one, two. If this is too loud, drink faster.",
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
    "[warm, smoky voice] Welcome to the Velvet Room. I'm {host}. The gin was made today in a bathtub on the Bowery. Somebody's uncle was still in the tub. He says it's damn delicious, and he'd know.",
    "[warm, smoky voice] Welcome to the Velvet Room. I'm {host}. The lights are low, the drinks are strong, and the coat check girl will hold anything you hand her. [short pause] She's handled bigger.",
  ],
  doorsReminder: [
    "Check in on your phone, or I tell the whole room you moved to Hoboken on purpose.",
    "Not checked in yet? The bouncer's been told you're a fed. He's thrilled.",
  ],
  howKiller: [
    "[warm, conspiratorial] Here's how tonight works. One of you killed the Don. [short pause] The rest of you are suspects, witnesses and, frankly, a fire hazard.",
    "[warm, conspiratorial] The rules are simple. One of you is a killer. Everyone else has to figure out who, while drinking. [short pause] Mostly while drinking.",
  ],
  howAccomplice: [
    "There's an accomplice tonight. They didn't do it. They just know who did and lie about it, which in this city makes them a civil servant with a pension. [short pause] Guess them when you lock in.",
    "Tonight the killer brought a plus-one: someone who didn't do it, knows who did, and will lie to your face with a mouthful of your shrimp, the rat. [short pause] Guess them when you lock in.",
  ],
  howRoles: [
    "After the roll call, your phone shows your secret role. Press and hold to read it. Keep it to yourself, the way you keep everything else to yourself. Poorly.",
    "After the roll call, check your phone for your secret role. Press and hold to read it. If someone leans over to look, lean back. Harder.",
  ],
  howWeapons: [
    "From the Don's insurers, Lloyd's of London: tonight's weapons were drawn by the house. No guest brought one, and no guest owns one. [short pause] One of them is about to do the job. Lloyd's would like it known that none of you are covered anyway.",
    "Tonight's weapons came from the house, not from you, so calm the hell down. [short pause] One of them is about to be used on the Don. In New York, the weapon never talks. The judge, for a fee, will.",
  ],
  voteJail: [
    "Jail vote. Find the face you trust least. Vote on your phone, or pick nobody, chickenshit.",
    "Jail vote, on your phone. Pick a guest, or pick nobody. Spite is a perfectly good reason.",
  ],
  voteRelease: [
    "Release vote. Whoever's in that cell might be innocent. They might also owe you nine dollars and a hat, the deadbeat. Vote on your phone.",
    "Before the lock-in, our jailbird gets one shot at freedom. Vote on your phone. They might be innocent. They've also been licking the damn bars.",
  ],
  voteLastCall: [
    "Fifteen seconds. Get a wiggle on, before some Tammany jackass throws the ballot box in the East River.",
    "Fifteen seconds. People died for your right to vote, mostly in Chicago, mostly Tuesday. Vote.",
  ],
  voteTally: [
    "The votes are in. No secret ballot. Sorry, chumps.",
    "The votes are in. Not anonymous. Start apologizing, jackasses.",
  ],
  jailNobody: [
    "Nobody goes to jail. The jail is very disappointed. It cleaned. It bought flowers. It wrote a card.",
    "Not enough votes. Nobody goes to jail. Democracy is a beautiful thing, and a total flat tire.",
  ],
  releaseNobody: [
    "Release denied. Somebody bring them a sandwich. A crap one.",
    "Nobody gets out. Shit happens, and tonight it happened to them.",
  ],
  releaseCleared: [
    "No vote needed. The evidence says our jailbird is clean. Applesauce, but fine.",
    "Put the ballots away. The evidence cleared the jailbird, so open the damn cell.",
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
    "After Round 2, you can vote someone into jail. More than half of you have to agree, or nobody goes. [short pause] The jailbird can talk and bribe, but can't search, vote or lock in. Bring chips. Bring a lot of chips.",
    "After Round 2 there's a jail vote. It takes more than half of you to lock someone up, which, in this crowd, is the hard part. [short pause] The jailbird can talk and bribe, but can't search, vote or lock in.",
  ],
  howRelease: [
    "After Round 3, before the lock-in, you can spring the jailbird. Same rule: more than half of you. The cell has a revolving door, and it squeaks.",
    "After Round 3, before the lock-in, you can let the jailbird out. It takes more than half of you. Bribe the judge. The judge is all of you.",
  ],
  howTo7: [
    "Talk to everybody. Lie about your own secrets. It's encouraged. [short pause] Only the guilty may lie about the murder. Everyone else, tell the truth about that one thing, just this once.",
    "You may lie about your own secrets. Most of you have been practicing for years. [short pause] Only the guilty get to lie about the murder.",
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
    "To win, more than half the lock-ins need the right killer, more than half the right weapon, and more than half the right room. The killer locks in too. Half is not more than half. We checked with an accountant. [short pause] Then we vote for Best Dressed and Best Liar.",
    "More than half the lock-ins have to get the killer, more than half the weapon, and more than half the room. The killer locks in too. Miss one, and the killer walks out a free and very smug individual. [short pause] Then we vote for Best Dressed and Best Liar.",
  ],
  howCase: [
    "[warm, conspiratorial] House rules. Any minute now, Don Ray Sanders is going to die, and one of you will have done it. Your phone will tell you if it was you. That's how half of Tammany Hall found out. [short pause] Only the guilty may lie. The rest of you tell the truth. It's still bloody New York, but rules are rules.",
    "[warm, conspiratorial] Everybody, raise your right hand. Any minute now, Don Ray Sanders becomes a corpse, and one of you will have made him one. Your phone will tell you if it was you. [short pause] Do you swear that only the guilty will lie, and everyone else will tell the truth? Lovely. Nobody meant it.",
  ],
  howSearch: [
    "Three rounds. Search for evidence cards and scan them with your phone. What a card says stays on your phone; the map up here just ticks it off, so talk. [short pause] Anything else in a nightstand, put it back.",
    "Three rounds. Search the house for evidence cards and scan them. The dirt lands on your phone, not up here; the map just ticks the card off. [short pause] So compare notes. Be nosy. Be a real pill about it.",
  ],
  howJail2: [
    "After Round 2, you can vote one of these lovely people into jail. You don't have to; nobody is always an option. It takes more than half of you to agree. [short pause] The jailbird can't search, vote or lock in. They just sit there and stew. After Round 3, you can vote them back out, or leave the poor sap in there till Christmas.",
    "After Round 2, there's a jail vote. Lock one guest up, or pick nobody. Either way, more than half of you have to agree, which, in this crowd, is a bloody miracle. [short pause] The jailbird can't search, vote or lock in. After Round 3, you can vote them back out. Bake them a cake with a file in it.",
  ],
  howWin2: [
    "After round three, lock in who, with what, and where. The killer locks in too. [short pause] More than half the lock-ins must get the killer, more than half the weapon, and more than half the room. If not, the killer walks free and opens a nightclub. That's how this shithole started.",
    "After round three, lock in: who, with what, and where. Yes, the killer locks in too. Tammany Hall would be proud. [short pause] More than half the lock-ins on the killer, more than half on the weapon, more than half on the room, or the killer strolls out waving like Valentino, the smug rat.",
  ],
  rollLocked: [
    "[low, grave] The doors are locked until we know who did it. Nobody leaves. Not for a smoke, not for air, not for that sick aunt in Yonkers you pulled out of your ass. [short pause] Let's meet the suspects.",
    "[low, grave] The doors are locked until we know which one of you did it. If nature calls, there's a bucket in the kitchen. Do not drink from the bucket. Again. [short pause] Let's meet the suspects.",
  ],
  rollCallClose: [
    "One of those faces is a liar. [short pause] The rest just look like that.",
    "That's the lineup. [short pause] Look hard. The sketch artist is shit-faced.",
  ],
  intro1: [
    "[low, gravelly voice] New York City. October, 1929. Gin is illegal. [short pause] Bollocks. [long pause]",
    "[low, gravelly voice] New York City. October, 1929. [short pause] Wall Street is doing great. [long pause]",
  ],
  intro2: [
    "News bulletin: Don Ray Sanders is dead. Police are baffled. The parrot isn't talking.",
    "Don Ray Sanders is dead. In lieu of flowers, send cash. Small bills. Get a wiggle on.",
  ],
  intro3: [
    "[whispers] One of you did it. [short pause] Wipe that smile off your face. Yes, you, jackass.",
    "[whispers] One of you did it. [short pause] My money's on whoever just looked at the door.",
  ],
  intro4: [
    "Check your phone. Press and hold your card. Keep it to yourself, like the clap.",
    "Phones out. Press and hold your card, and hide it like a dirty postcard from Coney Island.",
  ],
  round1: [
    "Round one. Find the markers. Question everyone. Grab lapels if you must. Not lower.",
    "Round one. Search the house, find the markers, and assume everyone's lying their ass off.",
  ],
  round1Waves: [
    "Round one. Only some rooms are open. If a door is shut, don't knock. Somebody's busy.",
    "Round one. Only some rooms are open. Try the others and you'll lose a finger. A good one.",
  ],
  oneMinute: [
    "One minute. Whatever you're doing in the coat closet, finish up.",
    "One minute, for crying out loud. The Don isn't getting any fresher.",
  ],
  round2: [
    "Round two. New evidence, and somebody in here just quietly shit themselves.",
    "Round two. New evidence. Try reading it this time, dipshit.",
  ],
  roomsOpen: [
    "More rooms are open. Go root around, you nosy jackasses.",
    "New rooms are open. Knock first. Then go in anyway.",
  ],
  round3: [
    "Final evidence and a twist. Somebody's about to say 'I knew it.' Bullshit you did.",
    "Round three, the last evidence. After this, you're on your own, morally and legally.",
  ],
  twist: [
    "[building] Hold on to something. [short pause] Not each other. Something.",
    "[building] Here comes the twist. Clench something.",
  ],
  accuse: [
    "Lock it in. Be right, or at least be a loud jackass about it.",
    "Lock it in, gumshoes. Guess wrong and you're a jackass for life.",
  ],
  accuseLastCall: [
    "Thirty seconds. Lock it in. Commit, for once, you wankers.",
    "Thirty seconds. Get a wiggle on. The Don died faster than you decide.",
  ],
  reveal1: [
    "[long pause] The one who killed the Don, then went back for seconds, is…",
    "[long pause] The cold-blooded little rat who killed Don Ray Sanders is…",
  ],
  reveal2: [
    "…standing right there. Don't wave, you sick freak.",
    "…right here, and, damnit, they look good.",
  ],
  reveal3: [
    "With this, in there. Somebody owes me a damn deposit.",
    "Police report. Weapon: this. Room: that. Taste: none.",
  ],
  revealAccomplice: [
    "And the accomplice, who was 'in the bloody loo all night,' is…",
    "And the two-faced little wanker who helped them is…",
  ],
  verdictDetectives: [
    "Justice, for once in this city. [short pause] Confess, killer. Blame the gin.",
    "Case closed. [short pause] Confess, killer. You were sloppy as hell.",
  ],
  verdictKiller: [
    "Killer, weapon, room: you needed more than half on every one, and you didn't get there. The killer walks, and you investigated like a sack of drunk-ass ferrets.",
    "Not enough of you got the killer, the weapon and the room. The killer hails a cab and sticks you with the fare. What a bunch of chumps.",
  ],
  votePrompt: [
    "Phones out: Best Dressed. The only honest thing you jackasses will do tonight.",
    "Vote on your phones for Best Dressed. You can't vote for yourself. Some of you just tried. Sad as hell.",
  ],
  awards: [
    "Now, the awards. Every trophy here was stolen. Act surprised. You're good at that.",
    "Awards. Hold your applause, your drinks and each other, in that order.",
  ],
  awardDetective: [
    "Best Detective, the only one who could find their own ass with a map, goes to…",
    "Best Detective, who did all that work for free, like a sucker, goes to…",
  ],
  awardDressed: [
    "The best-dressed crook in the joint is…",
    "Best Dressed, first one we'd rob, goes to…",
  ],
  awardLiar: [
    "And Best Liar, innocent of murder and guilty of pure baloney, goes to…",
    "Best Liar, for the innocent who fed you horsefeathers about their own secret all night, goes to…",
  ],
  // Oct 17 drafts (in the script doc for Heston's OK).
  awardPrimeSuspect: [
    "The Prime Suspect award. The police would like to apologize to the winner. The police are lying. It goes to…",
    "Prime Suspect, for the innocent sap you pointed at the most, goes to…",
  ],
  awardGotAway: [
    "Got Away With It, for the killer who lied to every one of you saps and walked, goes to…",
    "And the Got Away With It award. Tammany Hall was nominated, but this one earned it. It goes to…",
  ],
  goodnight: [
    "We're closed. Staying over? The couch has seen worse.",
    "The Velvet Room is closed. Go chase yourselves home, the lot of you.",
  ],
  paused: [
    "Hold everything. Something came up. [short pause] Not like that, perverts.",
    "Hold it. Drinks down. [short pause] Not you. You're doing freaking great.",
  ],
  resumed: [
    "As you were. Lying, mostly.",
    "Carry on. Whatever it was, keep going.",
  ],
  soundCheck: [
    "Sound check. If you can hear this, so can the feds. Hello, boys. Kiss my ass.",
    "Sound check. If you can hear this, the TV works. Smartest guest here.",
  ],
  howRound: [
    "Done searching? Tap Ready on your phone. Once most of you are ready, the round ends. Majority rules, like at Tammany Hall, except your votes count.",
    "Tap Ready on your phone when you're done searching. The round ends when most of you are ready. Get a wiggle on, chumps.",
  ],
  howRoundTimer: [
    "Every round is timed, like a parking meter on Fifth Avenue. When the clock runs out, the round's over. No appeals.",
    "The round ends when the clock runs out. The clock doesn't care if you're done. Neither do I. Get a wiggle on.",
  ],
  howRoundAll: [
    "All the cards are out from Round 1, so tear the joint apart. Tap Ready on your phone when you're done; the round ends when most of you are. Rounds 2 and 3 bring new evidence up here.",
    "Every card is out from Round 1. Find them, then tap Ready; the round ends when most of you are ready. Rounds 2 and 3 bring new evidence on this screen. Don't be a flat tire about it.",
  ],
  howRoundTimerAll: [
    "All the cards are out from Round 1, so tear the joint apart. Each round ends when the clock runs out. Rounds 2 and 3 bring new evidence up here. Get a wiggle on.",
    "Every card is out from Round 1. The clock ends each round, and it doesn't care about your feelings. Rounds 2 and 3 bring new evidence on this screen.",
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
    howWeapons: "Nobody brought a weapon tonight. The house picked them, [hiccups] and here they are. [short pause] One of them is about to do the deed.",
    howJail: "After Round 2, you can vote one guest into jail. [sneezes] Excuse me. It takes more than half of you, or nobody goes. The jailbird can talk and bribe, but can't search, vote or lock in.",
    howTo7: "Talk to everyone. You may lie about your own secrets. [clears throat] [short pause] Only the guilty may lie about the murder.",
    rollLocked: "[low, grave] The doors are locked until we figure out who did it. [hiccups] [short pause] Now, let's meet the suspects.",
    rollCallClose: "That's everyone. [short pause] Remember these faces. [hiccups]",
    intro4: "Check your phone. [coughs] Press and hold your card, and keep it to yourself.",
    round2: "Fresh evidence has come in. [burps] Pardon me.",
    oneMinute: "One minute left in this round. [sneezes] Excuse me. One minute.",
    twist: "[building] And now, the t- t- twist.",
    reveal1: "[long pause] The killer of Don Ray Sanders is… [hiccups] is…",
    verdictDetectives: "The detectives got their killer. [short pause] C- c- confess, you rat.",
    votePrompt: "Now vote on your phones [hiccups] for Best Dressed. You can't vote for yourself.",
    voteJail: "Time to vote. [clears throat] Who goes to jail? Vote on your phone. You can pick nobody.",
    jailNobody: "Not enough votes. Nobody goes to jail this t- t- time.",
    awards: "And now, the awards. [clears throat]",
    paused: "Hold everything. [sneezes] Excuse me.",
    goodnight: "The Velvet Room is closed for the night. [hiccups] Settle your debts in chips.",
    howAccomplice: "Tonight the killer has an accomplice. [hiccups] They didn't do it, but they know who did, and they'll lie for them. [short pause] When you lock in, take a guess at the accomplice too.",
    revealAccomplice: "[short pause] And the a- a- accomplice who helped them is…",
  },
  adult: {
    doors: "[warm, smoky voice] Welcome to the Velvet Room. I'm {host}. The gin was made in a bathtub this afternoon, [hiccups] and the bathtub did its best.",
    doorsReminder: "If you haven't opened your link yet, do it now. [burps] The bouncer has been told you're a fed.",
    howKiller: "[warm, conspiratorial] Here's how this goes. One of you is a k- k- killer. [short pause] The rest of you have to nail them.",
    howWeapons: "The house picked tonight's weapons, and one of them is about to do the job. [hiccups] [short pause] None of you brought it, so quit looking so damn nervous.",
    howJail: "After Round 2, you can vote someone into jail. [farts] [short pause] That was the chair. More than half of you have to agree, or nobody goes. The jailbird can talk and bribe, but can't search, vote or lock in.",
    howTo7: "You may lie about your own secrets. Most of you have been practicing for years. [burps] [short pause] Only the guilty get to lie about the murder.",
    howWin: "More than half the lock-ins need the right killer, more than half the right weapon, and more than half the right room. The killer locks in too. [sneezes] Excuse me. Exactly half is a tie, and ties go to the killer. [short pause] Then we vote for Best Dressed and Best Liar.",
    rollLocked: "[low, grave] The doors are locked until we figure out which one of you did it. [hiccups] [short pause] Let's meet the suspects.",
    rollCallClose: "And that's the lineup. [short pause] Take a good look. The police sketch artist is drunk. [hiccups]",
    intro3: "[whispers] One of you did it. [short pause] And frankly, we're all a little impressed. [hiccups]",
    intro4: "Phones out. Press and hold your card. [burps] If it says you did it, try to look less pleased about it.",
    round1: "Round one. Search the house, find the markers, and question everyone. [clears throat] Everyone.",
    round2: "Round two. Fresh evidence just came in, still warm. [burps] Pardon me.",
    oneMinute: "Sixty seconds. [sneezes] Hurry it up, you overdressed herd of snails.",
    twist: "[building] Hold on to something. [farts] [short pause] Not that.",
    accuseLastCall: "Thirty seconds left. Lock it in. [hiccups] Lock it in.",
    reveal1: "[long pause] The person who murdered Don Ray Sanders, in his own club, in front of his own gin, is… [hiccups] is…",
    verdictDetectives: "Justice, for once in New York. [short pause] The killer is c- c- caught, and is welcome to blame the gin.",
    votePrompt: "Now vote on your phones for Best Dressed. You can't vote for yourself. [snorts] Some of you just checked.",
    awards: "And now, the awards. [clears throat] [clears throat again] The trophies are real. The talent is debatable.",
    awardLiar: "And Best Liar goes to someone who looked every one of you in the eye tonight and l- l- lied. Congratulations to…",
    goodnight: "The Velvet Room is closed. [burps] Settle your debts in chips. If you're staying the night, the couch has seen worse.",
    paused: "Freeze. Nobody move. [farts] [short pause] Nobody say a word, either.",
    voteJail: "Time to vote. Somebody's going to jail, or nobody is. [burps] Pick on your phone.",
    voteTally: "The votes are in. [hiccups] Here's how you voted. No take-backs.",
    releaseNobody: "Not enough votes. [farts] [short pause] The jailbird stays in the cage.",
    howAccomplice: "Tonight the killer brought a friend. [hiccups] The accomplice didn't do it, but they'll lie to your face for the one who did. [short pause] Guess them when you lock in.",
    revealAccomplice: "And the accomplice, who lied to all of you with a straight face, is… [burps] is…",
  },
  sailor: {},
};
/** How often a line with a noisy take plays it (so about one line in ten heard has a noise). */
export const NOISY_PCT: Record<Tone, number> = { classic: 25, adult: 20, sailor: 0 };

/**
 * Adult version D (Oct 16, Heston: "add another layer adult D also that mixes the noisy and cussing together"): its own
 * joke per line, with noises and swearing together. Plays D_PCT of the time in games that pick their lines at Start.
 */
export const ADULT_D: Partial<Record<CueKey, string>> = {
  doors: "[warm, smoky voice] Welcome to the Velvet Room. I'm {host}, your host tonight. A place of glamour, of mystery, of sophis- [hiccups] sophisti- [hiccups] [short pause] oh, bollocks to it. A place with gin.",
  doorsReminder: "Check in on your phone, dipshits, or so help me [burps] [short pause] I'll do that again. Closer.",
  howCase: "[warm, conspiratorial] Here's how this goes. Any minute now, Don Ray Sanders is going to drop dead, and one of you shifty little rats will have done it. Your phone will tell you if it was you. [short pause] Only the guilty may lie. Everybody else tells the truth. For example: [farts] [short pause] That was me, damnit. See? Honest.",
  howAccomplice: "Tonight the killer has an accomplice: didn't do it, knows who did, will lie for them. Watch for a wink, a nod, a cough. [coughs] [short pause] No, that's just me. Bloody cigars. Guess them when you lock in.",
  howWeapons: "The house drew tonight's weapons, so none of you brought one. One of them is about to do the job. [short pause] And nobody here owns the m- m- [hiccups] [short pause] murder weapon. Shit. I almost said something else.",
  howSearch: "Three rounds. Search the house for evidence cards, under every [sneezes] [short pause] bloody hell, nobody's dusted since McKinley. Scan them with your phone. What they say stays on your phone, so compare notes. The map up here just ticks them off.",
  howJail2: "[clears throat] Order. Hear ye. After Round 2, you may vote one guest into jail. You don't have to: voting nobody is a perfectly good verdict. More than half of you must agree. [short pause] The jailbird can't search, vote or lock in. After Round 3, you can vote them back out. [burps] [short pause] This court is adjourned, and shit-faced.",
  howWin2: "After round three, lock in: who, with what, and where. The killer locks in too. [short pause] You need more than half the lock-ins on the killer, more than half on the weapon, and more than half on the room. Miss one, and the killer walks out laughing, like this: [snorts] [short pause] Smug little wanker.",
  rollLocked: "[low, grave] The doors are locked until we figure out which one of you did it. Nobody gets in. Nobody gets out. [farts] [short pause] Oh, hell. That's locked in here with us now, too. Let's meet the suspects.",
  rollCallClose: "That's the lineup. [hiccups] All forty of you. Shit, I'm seeing double.",
  intro1: "[low, gravelly voice] New York City. [burps] [short pause] Damnit. [short pause] New York City. October, 1929. [long pause]",
  intro2: "Tonight, Don Ray Sanders was found dead. A moment of silence. [long pause] [farts] [short pause] Ah, shit. Moment's over.",
  intro3: "[whispers] One of you did it. [hiccups] [short pause] That was me. [short pause] The hiccup, jackass. Not the murder.",
  intro4: "Check your phone. Press and hold your card. Keep it to yourself, [burps] [short pause] unlike some of us. Freaking gin.",
  round1: "Round one. Find the markers, question everyone. [burps] [short pause] Not about that. That's private, jackass.",
  round1Waves: "Round one. Only some rooms are open. Search those. [farts] [short pause] Not this one. It's the ass end of Hoboken in here now.",
  round2: "Round two. F- f- fr- [hiccups] [short pause] frick it, damnit. New evidence. Just came in.",
  roomsOpen: "More rooms are open. Go dig, my [hiccups] dumbasses. [short pause] I meant darlings.",
  round3: "Last round. This evidence hits you right in the [sneezes] [short pause] teeth. The teeth, you filthy dumbasses.",
  oneMinute: "One minute left. [coughs] [coughs] [short pause] Forty seconds. Move your asses.",
  twist: "[building] And now, the twist. [burps loudly] [short pause] That was the shrimp, damn it all. Here's the twist.",
  accuse: "Make your accusations. [farts] [short pause] Not about that, jackass. The murder, for crying out loud.",
  accuseLastCall: "Thirty seconds. [hiccups] Twenty-nine. [hiccups] Oh, to hell with it. Lock it in.",
  voteJail: "Who goes to jail? Vote on your phone. You can pick nobody. [burps] [short pause] Or me. I smell like a Bowery crapper.",
  voteRelease: "Before the lock-in: does our jailbird get out? Vote on your phone. Think of that poor soul in the cell. Cold. Alone. [gasps] Sober. [short pause] Have a damn heart.",
  voteLastCall: "Fifteen seconds to vote. Don't overthink it. I never do, and look at me. [burps] [short pause] Bollocks. Think a little.",
  voteTally: "The votes are in. [snorts] [short pause] Oh, that's cold. Here's how you voted, dumbasses.",
  jailNobody: "Not enough votes. Nobody goes to jail. Of the people, by the people, for the [burps] [short pause] ah, hell. Democracy.",
  releaseNobody: "Not enough votes. Nobody gets out. [snorts] Sorry. Tough shit, jailbird.",
  reveal1: "[long pause] Drumroll… [farts] [short pause] Close enough, damnit. The killer of Don Ray Sanders is…",
  reveal2: "…right here, holding my drink. [gasps] [short pause] My last drink, you thieving jackass.",
  reveal3: "With this weapon, in this room. [gulps] [short pause] Oh, crap. I passed out in there.",
  revealAccomplice: "And the two-faced little jackass who helped them, [clears throat] allegedly, is…",
  verdictDetectives: "Case closed, detectives. [burps] [short pause] Pardon the court. Confess, you damn dirty rat.",
  verdictKiller: "Not enough of you got the killer, the weapon and the room. The killer walks. Let's hear it for the detectives. [farts] [short pause] That's all you get, dumbasses.",
  votePrompt: "Vote on your phones for Best Dressed. Me? Sober as a bloody judge. [hiccups] [short pause] Vote me Best Dressed.",
  awards: "The awards. I'd like to thank the Academy, [hiccups] and my liver, which has been through hell.",
  awardDetective: "Best Detective. Sharp eyes, sharp mind, sha- [sneezes] [short pause] shit. Sharp everything. It goes to…",
  awardDressed: "Best Dressed, [burps] [short pause] not me, damnit, goes to…",
  awardLiar: "And Best Liar, the innocent who lied best about their own secret, [hiccups] [short pause] the sneaky damn thing, goes to…",
  awardPrimeSuspect: "Prime Suspect, the innocent one you damn near sent up the river, [hiccups] goes to…",
  awardGotAway: "The Got Away With It award goes to someone who [hiccups] [short pause] fooled every damn one of you. It goes to…",
  releaseCleared: "No vote needed. The evidence cleared the jailbird. [burps] [short pause] Open the damn cell.",
  goodnight: "We're closed. Settle up in chips, and [burps] [short pause] get the hell out. Lovingly.",
  paused: "Everybody shut the hell up. [burps] [short pause] Including me, apparently.",
  resumed: "Carry on. [sneezes] [short pause] Nobody? Bless me, then. Wankers.",
  soundCheck: "Sound check. One, two. [burps loudly] [short pause] That's the bass. If your drink rippled, the TV works. Hell yes.",
  howRound: "Done searching? Tap Ready on your phone. The round ends when most of you are r- r- [hiccups] [short pause] ready. Damn hiccups.",
  howRoundTimer: "Each round runs on the clock. When it runs out, [burps] [short pause] the round ends. So does my dignity, apparently. Hell.",
  howRoundAll: "Every card is out from Round 1. Tap Ready when you're done; the round ends when most of you are ready. Rounds 2 and 3 bring new evidence on the [sneezes] [short pause] damn TV.",
  howRoundTimerAll: "Every card is out from Round 1. The round ends when the clock runs out. [hiccups] Rounds 2 and 3 bring new evidence on the TV. [hiccups] Oh, hell.",
};
export const D_PCT = 10;

/** Sailor mode's script: Joel, furious, swearing hard (two versions a line). Lines it lacks fall back to Adult. */
export const SAILOR: Partial<Record<CueKey, string[]>> = {
  doors: [
    "[seething] Shit. Welcome to the Velvet Room. I'm {host}, your host, God help every one of you bastards. [shouting] And if one more son of a bitch asks me where the bathroom is, [suddenly calm] it's down the hall. On the left. Fuck.",
    "[through gritted teeth, trying to sound warm] Welcome to the Velvet Room. I'm {host}, your fucking host. [shouting] Coats on the hooks, drinks at the bar, and nobody, NOBODY, touches the goddamn piano. [dead serious] The piano knows what it did.",
  ],
  doorsReminder: [
    "[seething] Shit. Damn. Hell. Still haven't checked in? [roaring] Open the goddamn link, you Hoboken-ass prick.",
    "[through gritted teeth] Check in on your phone. [screaming] It's one link! ONE fucking link! [dead serious] The bouncer thinks you're a fed.",
  ],
  howCase: [
    "[conspiratorial, seething] Here's how this goes, and I'm saying it once, because my blood pressure is a goddamn tragedy. Any minute now, Don Ray Sanders drops dead, and one of you bastards will have done it. Your phone will tell you if it was you. [short pause] [furious] Only the guilty get to lie. [screaming] ONLY THE GUILTY! [dead serious] The rest of you tell the truth. Not most of it. [growling] All of it, damnit.",
    "[conspiratorial, through gritted teeth] Any minute now, Don Ray Sanders is going to die. [short pause] Fuck. And one of you will have done it. Your phone will tell you if it was you, so keep it to your goddamn self. [short pause] [roaring] Only the guilty may lie! [dead serious] Innocent? You tell the truth. Lie to me and I will personally walk you to the Hudson, motherfucker.",
  ],
  howAccomplice: [
    "[furious] Oh, and the killer brought an accomplice, because of course the shit-bird couldn't do it alone. The accomplice didn't do it, but they'll lie to your face for the one who did. [short pause] [growling] Guess them when you lock in. Bollocks.",
    "[through gritted teeth] The killer has an accomplice. Didn't do it, knows who did, lies for them anyway. You know what we call that in Hell's Kitchen? [roaring] A goddamn Tuesday! [short pause] [dead serious] Guess them when you lock in.",
  ],
  howWeapons: [
    "[seething] Tonight's weapons were picked by the house. The house! Not you! [short pause] One of them is about to do the job. [dead serious] Nobody brought one. [shouting] And if I find one in your coat, you're a weird son of a bitch who brings a weapon to a fucking party!",
    "[growling] The house drew tonight's weapons, because I wouldn't trust you bastards to bring a spoon. [short pause] One of them is about to do the job. [roaring] None of them are yours, so keep your goddamn hands off! Shit!",
  ],
  howSearch: [
    "[seething] Three rounds. Find the evidence cards, scan them with your phone. [short pause] The dirt stays on YOUR phone. This screen just ticks the card off the map. So talk to each other, for fuck's sake. [roaring] And put the shit-fucking drawers back! I'm not your mother, you bastards!",
    "[growling] Three rounds. Evidence cards are hidden all over this house. Find them. Scan them with your phone. [short pause] [roaring] What they say stays ON YOUR PHONE, MOTHERFUCKER! [suddenly calm] Sorry. On your phone. The map up here just ticks them off. Compare notes.",
  ],
  howJail2: [
    "[growling] After Round 2, there's a jail vote. You can vote one person in, or you can vote nobody. Nobody's on the ballot, nobody's making you, nobody gives a shit. More than half of you have to agree. [short pause] [furious] The jailbird can't search. Can't vote. Can't lock in. Can't do fuck-all. [dead serious] After Round 3, you can vote them back out. That's justice. It's a bitch. Damnit.",
    "[dead serious] After Round 2, you can vote one guest into jail. You don't have to. Nobody is on the ballot, and frankly, Nobody is my favorite person here. More than half of you have to agree. [short pause] [seething] The jailbird can't search, vote or lock in. [roaring] After Round 3, you can vote them back out, you soft-hearted sons of bitches! [growling] Hell's Kitchen would eat you alive. Shit.",
  ],
  howWin2: [
    "[dead serious] After round three, you lock in. Who. With what. Where. The killer locks in too. [short pause] More than half of the lock-ins on the killer. More than half on the weapon. More than half on the room. [roaring] Miss one, and the killer walks out that door laughing, and I have to hold it open for the son of a bitch!",
    "[growling] After round three, you lock in who, with what, and where. The killer locks in too, the lying bastard. No take-backs, no fuckery. [short pause] More than half the lock-ins have to get the killer, more than half the weapon, more than half the room. [dead serious] Otherwise the killer walks, and I lose forty dollars. Bastards.",
  ],
  rollLocked: [
    "[low, grave, seething] The doors are locked. [shouting] LOCKED! Nobody leaves until we know which one of you sick bastards did it. [dead serious] Bathroom breaks will be supervised by the Don's parrot. [short pause] Let's meet the suspects.",
    "[low, grave, through gritted teeth] The doors are locked, the windows are painted shut, and the coat check has your keys. The coat check is a vindictive little prick. [short pause] Nobody leaves till we know who did it. Let's meet the suspects.",
  ],
  rollCallClose: [
    "[through gritted teeth] Shit, bastard, hell. That's everyone. [short pause] Remember these faces.",
    "[growling] That's the lineup. [short pause] Remember these faces. One of them is a lying sack of shit.",
  ],
  intro1: [
    "[low, gravelly voice, seething] New York City. October, 1929. [long pause] Fuck.",
    "[low, gravelly voice] Goddamnit. [short pause] New York City. October, 1929. [long pause]",
  ],
  intro2: [
    "[growling] The Velvet Room lost its owner. Don Ray Sanders is dead. [shouting] He owed me eleven dollars, you sons of bitches!",
    "[dead serious] The Velvet Room lost its owner. Don Ray Sanders is dead. [seething] The parrot saw everything. The parrot won't fucking talk.",
  ],
  intro3: [
    "[whispers, furious] One of you did it. [short pause] [screaming] ONE OF YOU SONS OF BITCHES!",
    "[whispers, furious] One of you shit-eating bastards did it. [short pause] Prick.",
  ],
  intro4: [
    "[seething] Phones out. Press and hold your card. [roaring] PRESS AND HOLD! Not tap! HOLD, goddamnit! [suddenly calm] And keep it to yourself.",
    "[growling] Check your phone, press and hold your card, keep it to yourself. Killer? Act normal. [screaming] NORMAL, you twitchy prick!",
  ],
  round1: [
    "[dead serious] Round one. Search the house. Find the markers. [roaring] And don't touch my liquor, you thirsty sons of bitches!",
    "[seething] Round one. Search the house, find the markers, question every lying bastard. [screaming] GO! Why are you still here? GO!",
  ],
  round1Waves: [
    "[dead serious] Round one. Only some rooms are open. The rest are locked. [furious] A locked door is not a puzzle. It's a door. Shit-for-brains.",
    "[through gritted teeth] Round one. Only some rooms are open. Search those. Touch a closed door, I break a finger. Which one? [roaring] ALL OF THEM, BASTARD!",
  ],
  round2: [
    "[barely holding it together] Shit, damn, hell, fuck. [dead serious] Round two. Fresh evidence.",
    "[growling] Round two. Fresh evidence. Read it, you illiterate bastards.",
  ],
  roomsOpen: [
    "[seething] More rooms are open. Go. Fucking. Search.",
    "[through gritted teeth] Bollocks. More rooms are open. Go dig.",
  ],
  round3: [
    "[barely holding it together] Round three. The last of the evidence. [screaming] THE LAST! There is no more! I checked the son of a bitching basement!",
    "[dead serious] Last round. Last of the evidence. After this, you're on your own. [roaring] Morally, legally, and fucking spiritually!",
  ],
  oneMinute: [
    "[dead serious] One minute left. [short pause] Motherfucker.",
    "[roaring] One minute left, you sauntering bastards! MOVE!",
  ],
  twist: [
    "[building, seething] Here comes the twist. I didn't write it. I wouldn't have written it. [screaming] FUCK this twist!",
    "[building, growling] And now, the twist. [short pause] Damn. Shit. Hell. Bollocks. [dead serious] Here it is.",
  ],
  accuse: [
    "[dead serious] No more evidence. Lock in who, with what, and where. [roaring] On your phone, you dickheads!",
    "[screaming] Shut up! Shut up! Stop talking! [dead serious] Make your accusations. On your phone. [growling] Assholes.",
  ],
  accuseLastCall: [
    "[screaming] Thirty seconds! Lock it in! Lock it in, you dithering shit-goblins!",
    "[dead serious] Thirty seconds. Lock it in. [short pause] [growling] Shit, fuck, bastard, damn, lock it in.",
  ],
  voteJail: [
    "[dead serious] Time to vote. Who goes to jail? Pick on your phone. Nobody is allowed. [growling] Somebody is encouraged. Bastards.",
    "[through gritted teeth] Jail vote. On your phone. Pick a guest, or pick nobody. [screaming] Nobody is a choice! It's on the list, for fuck's sake!",
  ],
  voteRelease: [
    "[through gritted teeth] Before the lock-in: does anybody get out of jail? Vote on your phone. [roaring] And whoever's in there, stop rattling the bars! There are no bars! Use your words, you dramatic bastard!",
    "[seething] Release vote, before the lock-in. Does anybody get out of jail? Vote on your phone. [dead serious] Mercy is allowed. [screaming] I think mercy is horseshit, but it's ALLOWED!",
  ],
  voteLastCall: [
    "[dead serious] Fifteen seconds left to vote. [short pause] Fourteen. [short pause] [roaring] I'm not counting the whole thing! Vote, goddamnit!",
    "[seething] Fifteen seconds. Tammany Hall counted faster than this, and they were counting dead people. [growling] Vote, assholes.",
  ],
  voteTally: [
    "[seething] The votes are in. Here's how you voted, you treacherous sons of bitches.",
    "[through gritted teeth] Let's see who voted for who. [shouting] And who's a back-stabbing little prick!",
  ],
  jailNobody: [
    "[dead serious] Not enough votes. Nobody's going to jail. [screaming] I cleaned that cell! I put a pillow in there! For NOTHING! Shit!",
    "[dead serious] Not enough votes. Nobody goes to jail. [short pause] Bollocks. [growling] That's English. It means you're all fucking useless.",
  ],
  releaseCleared: [
    "[grumbling] No vote. The evidence says the jailbird didn't do it. [shouting] So open the damn cell already!",
    "[seething] The evidence cleared them. [short pause] Fine. [shouting] Get the hell out of my jail!",
  ],
  releaseNobody: [
    "[seething] Not enough votes. The jailbird stays put. [shouting] Somebody throw that one a goddamn sandwich!",
    "[dead serious] Not enough votes. Nobody gets out. [whispers, furious] Rot in there. Rot, you bastard.",
  ],
  reveal1: [
    "[long pause] [barely holding it together] The shit-heeled, gin-stealing bastard who killed Don Ray Sanders is…",
    "[long pause] [growling] The killer of Don Ray Sanders, the rat, the prick, the fucking weasel, is…",
  ],
  reveal2: [
    "…right here, drinking my fucking gin.",
    "…standing right here. [roaring] In MY club! Bastard!",
  ],
  reveal3: [
    "[growling] With this, in there. [shouting] On my good rug, damnit!",
    "[dead serious] With this weapon, in this room. [seething] Shit. Shit. Shit.",
  ],
  revealAccomplice: [
    "[seething] And the accomplice, who lied to you all with a straight fucking face, is…",
    "[growling] And the son of a bitch who held the coats and asked no questions is…",
  ],
  verdictDetectives: [
    "[dead serious] The detectives nailed you. [whispers, furious] Confess. [screaming] CONFESS, YOU SHIT-WEASEL!",
    "[ice cold] The detectives got the killer. [short pause] I'm as shocked as you are. [growling] Confess, you rat bastard.",
  ],
  verdictKiller: [
    "[seething] Not enough of you got the killer, the weapon and the room. [short pause] The killer walks. [roaring] You had the evidence! You had the cards! You had the fucking MAP!",
    "[dead serious] Killer, weapon, room. You needed more than half on every one, and you blew it. The killer walks free. [growling] Babe Ruth hit sixty home runs. You lot couldn't hit three. Useless pricks.",
  ],
  votePrompt: [
    "[growling] Best Dressed. Vote on your phones. [roaring] I wore a tie for this, goddamnit! A TIE!",
    "[through gritted teeth] Phones out. Best Dressed. [furious] And you can't vote for yourself, you vain bastard, so quit looking for your own goddamn face!",
  ],
  awards: [
    "[seething] The awards. I paid for the trophies, so clap, bastards.",
    "[strained, polite] Now for the freaking awards. [roaring] Freaking! I'm being polite!",
  ],
  awardDetective: [
    "[dead serious] Best Detective, the only one of you shit-for-brains with an actual brain, goes to…",
    "[growling] Best Detective. Sharp. Smart. Annoying as hell. [shouting] Insufferable little prick. [dead serious] Congratulations. It goes to…",
  ],
  awardDressed: [
    "[growling] Best fucking Dressed goes to…",
    "[seething] Best Dressed goes to… [short pause] Shit. Fine. It goes to…",
  ],
  awardPrimeSuspect: [
    "[growling] Prime Suspect. Innocent. Completely innocent. [roaring] And you blind bastards pinned it on them anyway! [dead serious] It goes to…",
    "[dead serious] The Prime Suspect award. The one innocent person you morons were sure did it. [seething] Shit. It goes to…",
  ],
  awardGotAway: [
    "[seething] The Got Away With It award. [roaring] I've never been so proud or so goddamn sick! [dead serious] It goes to…",
    "[through gritted teeth] Got Away With It. For the slippery son of a bitch who played every one of you for chumps. [dead serious] It goes to…",
  ],
  awardLiar: [
    "[seething] Best Liar. Innocent, and lied through their teeth about their own damn secret. [growling] That's talent, you sneaky bastard. It goes to…",
    "[dead serious] Best Liar goes to an innocent. The killer doesn't count. [roaring] Lying about the murder is the killer's job! This one lied for fun, for fuck's sake! [dead serious] It goes to…",
  ],
  goodnight: [
    "[roaring] We're closed! Pay your tab and get the hell out! [suddenly tender] Drive safe.",
    "[growling] We're closed. Out. Take your coats, your secrets and your shit, and go.",
  ],
  paused: [
    "[screaming] EVERYBODY SHUT YOUR GODDAMN MOUTHS! [short pause] [suddenly polite] Thank you.",
    "[seething] Stop. Stop. Shit. Stop. [shouting] Everybody shut the fuck up for a second.",
  ],
  resumed: [
    "[growling] Carry on, you bloody wankers.",
    "[seething] Fine. Back to it. Go. Fucking go.",
  ],
  soundCheck: [
    "[growling] Sound check. One, two. [shouting] One, two, goddamnit! [dead serious] If you can hear this, the TV is ready.",
    "[dead serious] Sound check. [shouting] Shit! Fuck! Bastard! Bollocks! [calmly] If you heard all that, the TV works. [short pause] Sorry, Ma.",
  ],
  howRound: [
    "[dead serious] When you're done searching, tap Ready on your phone. [short pause] When most of you are ready, the round ends. [roaring] So get a goddamn wiggle on!",
    "[growling] Tap Ready on your phone when you're done searching. The round ends when most of you are ready. [shouting] Most! Not all! I'm not waiting on every slow bastard in this room!",
  ],
  howRoundTimer: [
    "[dead serious] Each round runs on the clock. [short pause] When it runs out, the round is over. [roaring] Over! I don't care what you're holding, you dawdling sons of bitches!",
    "[through gritted teeth] Every round is timed. When the clock hits zero, the round ends. [shouting] Ready or not, you slow-ass bastards!",
  ],
  howRoundAll: [
    "[dead serious] Every card is out from Round 1. Every damn one. Tap Ready when you're done searching; the round ends when most of you are ready. [roaring] Rounds 2 and 3, new evidence on the TV! Watch the goddamn TV!",
    "[growling] All the cards are out from Round 1, so search the whole house, you bastards. Tap Ready when you're done. When most of you are ready, the round ends. [shouting] Rounds 2 and 3, new evidence right here on the TV!",
  ],
  howRoundTimerAll: [
    "[dead serious] Every card is out from Round 1. [short pause] The round ends when the clock runs out. [roaring] Not when you're done! When the CLOCK says, goddamnit! [dead serious] Rounds 2 and 3, new evidence on the TV.",
    "[growling] All the cards are out from Round 1. Search everything. The clock ends the round, [shouting] not you, you slow bastards! [dead serious] Rounds 2 and 3, fresh evidence on this screen.",
  ],
};

/** The clean versions of a line: one in Classic; in Adult, the CUES line and then ADULT_MORE's; Sailor's own. */
export function cleanVersions(cue: CueKey, tone: Tone): string[] {
  const c: Cue = CUES[cue];
  if (tone === "sailor") return SAILOR[cue]?.length ? SAILOR[cue]! : cleanVersions(cue, "adult");
  return tone === "adult" ? [c.adult, ...(ADULT_MORE[cue] ?? [])] : [c.classic];
}

/** Every version of a line in this script: the clean ones, then its noisy take (if it has one), then Adult D. */
export function cueVersions(cue: CueKey, tone: Tone): string[] {
  const noisy = NOISY[tone][cue];
  const d = tone === "adult" ? ADULT_D[cue] : undefined;
  return [...cleanVersions(cue, tone), ...(noisy ? [noisy] : []), ...(d ? [d] : [])];
}

/** Whether version v of a line is its noisy take. */
export const isNoisy = (cue: CueKey, tone: Tone, v: number) => !!NOISY[tone][cue] && v === cleanVersions(cue, tone).length;
/** Whether version v of a line is Adult D. */
export const isD = (cue: CueKey, tone: Tone, v: number) => tone === "adult" && !!ADULT_D[cue] && v === cueVersions(cue, tone).length - 1;

/** A game's own picks (Oct 16): made at Start so this laptop doesn't hear the same jokes game after game. */
export type LinePicks = {
  /** Which clean version each line starts from (a line that repeats in a game moves on from there). */
  picks: Record<string, number>;
  /** Games that pick their lines also get Adult D now and then. */
  d?: boolean;
};

/** "2" → 2; the empty first time → 0; anything else, a stable number. */
const occIndex = (occurrence: string) => (occurrence === "" ? 0 : /^\d+$/.test(occurrence) ? Number(occurrence) : hashOf(occurrence));

/**
 * Which version of a line this game uses: picked from the game (its slug) so every replay sounds different, and the
 * server, the TV and the recordings agree. A line that repeats in one game (the one-minute warning, say) passes
 * which time it is, so it changes each time too. Games that picked their lines at Start (`lines`) start from those
 * picks, so the jokes this laptop heard lately come last.
 */
export function cueVariant(tone: Tone, cue: CueKey, seed = "", occurrence = "", lines?: LinePicks): number {
  const n = cleanVersions(cue, tone).length;
  const noisyAt = NOISY[tone][cue] ? n : -1;
  // Now and then, the noisy take; in games that pick their lines, now and then Adult D.
  if (noisyAt >= 0 && hashOf(`${seed}|${cue}|${occurrence}|noise`) % 100 < NOISY_PCT[tone]) return noisyAt;
  if (lines?.d && isD(cue, tone, cueVersions(cue, tone).length - 1) && hashOf(`${seed}|${cue}|${occurrence}|d`) % 100 < D_PCT) return cueVersions(cue, tone).length - 1;
  if (n <= 1) return 0;
  const base = lines?.picks[cue];
  return base === undefined ? hashOf(`${seed}|${cue}|${occurrence}`) % n : (base + occIndex(occurrence)) % n;
}

/**
 * Picks a version of each line for a new game, putting the ones this laptop heard lately last (Heston, Oct 16: "a
 * better selection system for each game that picks what lines will be used, so that jokes are not repeated").
 * heard: per line, the versions heard in recent games, oldest first.
 */
export function pickLines(tone: Tone, seed: string, heard: Record<string, number[]> = {}, counts: Record<string, number> = {}): Record<string, number> {
  const out: Record<string, number> = {};
  const keys = [...CUE_KEYS.map((c) => [c, cleanVersions(c, tone).length] as const), ...Object.entries(counts)];
  for (const [key, n] of keys) {
    if (n <= 1) continue;
    const recent = heard[key] ?? [];
    // Never heard first; then the one heard longest ago. Ties go by the game's seed.
    const score = (v: number) => {
      const i = recent.lastIndexOf(v);
      return i < 0 ? -1 : i;
    };
    const order = Array.from({ length: n }, (_, v) => v).sort((a, b) => score(a) - score(b) || hashOf(`${seed}|${key}|${a}`) - hashOf(`${seed}|${key}|${b}`));
    out[key] = order[0];
  }
  return out;
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

/** Text without any direction tags: captions and the live reader. */
export const plain = (text: string) => text.replace(TAG, "").replace(/\s{2,}/g, " ").trim();

/** The exact text sent to ElevenLabs for one recording (version v of the line). */
export function recordingText(cue: CueKey, tone: Tone, host: HostKey, unstable: boolean, v = 0): string {
  const c: Cue = CUES[cue];
  const versions = cueVersions(cue, tone);
  const base = (versions[v] ?? versions[0]).replaceAll("{host}", narratorName(host, tone));
  if (!unstable) return base;
  const kept = base.replace(TAG, (t) => (KEEP.test(t) ? t : "")).replace(/\s{2,}/g, " ").trim();
  return [c.wild[0], kept, c.wild[1]].filter(Boolean).join(" ");
}

/** What the TV caption and the live reader say for a cue (version v of the line). */
export function captionText(cue: CueKey, tone: Tone, host: HostKey, v = 0): string {
  const versions = cueVersions(cue, tone);
  return plain((versions[v] ?? versions[0]).replaceAll("{host}", narratorName(host, tone)));
}

// ---------- custom lines: made per party from what guests typed and from the draw ----------
// None of these gives the answer away: at Start the game records one clip for every guest,
// every exhibit and every room, and the reveal just plays the right ones.

const WILD_POOL = ["[cackling]", "[shouting]", "[whispers, wild-eyed]", "[sobbing dramatically]", "[squealing]", "[growls]"];
const pickWild = (seed: string) => WILD_POOL[[...seed].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % WILD_POOL.length];
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const mid = (l: string) => l.replace(/^The /, "the ");

export type CustomKind = "arrival" | "body" | "rooms" | "killer" | "accomplice" | "exhibit" | "room" | "winner" | "roll" | "jailed" | "released";

/** Adult's per-game lines, in versions (a game picks one of each). {room}, {rooms}, {name}. */
export const ADULT_CUSTOM: Partial<Record<CustomKind, string[]>> = {
  body: [
    "They found the poor old sap in {room}.",
    "They found him in {room}. Eyes open, wallet gone. One of those is murder. The other one's just New York.",
    "They found him in {room}, face down, shoes off. Nobody knows why the shoes were off, and nobody's asking.",
    "They found him in {room}. The doctor says he died instantly. The doctor also says he's technically a dentist.",
    "They found him in {room}, dead as a doornail and ruining a perfectly good Persian rug.",
  ],
  rooms: [
    "Now open: {rooms}. Search like your ass depends on it. One of your asses does.",
    "Now open: {rooms}. Drawers, closets, under the bed. If it's locked, leave it. If it's moving, definitely leave it.",
    "Now open for business: {rooms}. Search everything. Lick nothing.",
    "Unlocked: {rooms}. Go dig, you nosy little shits.",
    "What fresh hell is this? Now open: {rooms}.",
  ],
  killer: [
    "{name}. Holy shit.",
    "{name}. The whole damn time.",
    "{name}, you cold-blooded little rat. I've never been prouder.",
    "{name}. Bloody hell. I'd have bet the club on anybody else.",
    "{name}. And to think we let you near the punch bowl.",
  ],
  accomplice: [
    "{name}. Every rat needs a smaller rat.",
    "{name}. Didn't do it, didn't stop it, and didn't even ask for a cut. What a chump.",
    "{name}. Saw everything, said nothing, and smiled at you all night like a choirboy. The sneaky little rat.",
    "{name}, you two-faced jackass. You helped us look for the killer. For an hour.",
    "{name}. Loyal as a dog, and about as much use in court.",
  ],
  jailed: [
    "{name} is going to the Tombs. Bring a sweater and a good lawyer. Mostly the lawyer.",
    "{name} is going up the river to Sing Sing. Write if you learn a trade.",
    "{name}, you're going to jail, where you'll search nothing, vote on nothing, and help exactly as much as before.",
    "{name} goes to jail. Sit your ass down and think about what you did.",
    "{name} is locked up. The rest of you, act natural, and stop looking so bloody relieved.",
  ],
  released: [
    "{name} walks. The judge says you're welcome, and thanks for the envelope.",
    "{name} is out, on good behavior, which is a first.",
    "{name} is out. The cell would like an apology and a mop.",
    "{name} is out already? Christ. Capone's been in a cell in Philadelphia since May, and you did ten minutes.",
    "{name} is free. Don't let the bars hit your ass on the way out.",
  ],
};
/** Sailor mode's per-game lines (Joel, furious). Kinds it lacks use Adult's. */
export const SAILOR_CUSTOM: Partial<Record<CustomKind, string[]>> = {
  body: [
    "[growling] They found him in {room}. Face down. On the good fucking rug.",
    "[dead serious] He was found in {room}. [roaring] Who the hell dies in {room}?! Shit!",
    "[seething] They found him in {room}. I just mopped in there. Sons of bitches.",
    "[through gritted teeth] They found him in {room}, looking surprised, which for the Don was a fucking first.",
  ],
  rooms: [
    "[shouting] Now open: {rooms}. Go dig, you bastards!",
    "[dead serious] Now open: {rooms}. Wipe your feet, you crap-ass animals.",
    "[growling] Unlocked: {rooms}. Touch anything you can't explain and I break your fucking hand.",
    "[seething] Now open: {rooms}. Shit. Fuck. Go.",
  ],
  killer: [
    "{name}. [roaring] You rotten, rat-faced son of a bitch!",
    "{name}. [dead serious] Of course it was. [shouting] Of course it fucking was!",
    "{name}. [seething] In my club. With my gin in your hand. [screaming] You absolute bastard!",
    "{name}! [furious] I let you hold my hat, you treacherous prick!",
  ],
  accomplice: [
    "{name}. [growling] The getaway driver, minus the car, minus the brains. Bastard.",
    "{name}, [seething] who's been nodding along all night like a shit-brained pigeon.",
    "{name}. [dead serious] Loyal. Quiet. [roaring] A rat's rat, you double-crossing dickhead!",
    "{name}. [through gritted teeth] Held the coats, kept the secret, ate my olives. Prick.",
  ],
  jailed: [
    "{name} is going to jail. [roaring] Get in the cell, you son of a bitch!",
    "{name}, into the cell. [dead serious] Mind the bars. [shouting] Mind the bars, you bollocksed wanker!",
    "{name} is going to jail. [growling] Think about what you did. Think hard. Bastard.",
    "{name} is going to jail. [seething] Bring a sweater. It's cold in there, and I'm not lending you shit.",
  ],
  released: [
    "{name} is out. [growling] Behave, you shifty bastard.",
    "{name} walks. [dead serious] For now. [shouting] FOR NOW, damnit!",
    "{name} is free. [seething] The cell will miss you. I fucking won't.",
    "{name} is out. [through gritted teeth] Congratulations. Piss off.",
  ],
};

/** The per-game kinds that come in versions, and how many each script has (for picking at Start). */
export function customCounts(tone: Tone): Record<string, number> {
  const out: Record<string, number> = {};
  for (const kind of Object.keys(ADULT_CUSTOM) as CustomKind[]) {
    const pool = customPool(kind, tone);
    if (pool) out[`custom:${kind}`] = pool.length;
  }
  return out;
}
const customPool = (kind: CustomKind, tone: Tone) => (tone === "classic" ? undefined : tone === "sailor" && SAILOR_CUSTOM[kind]?.length ? SAILOR_CUSTOM[kind] : ADULT_CUSTOM[kind]);

/**
 * The words for a custom line. Pass a name as it should sound (the guest's "say it like", when they gave one).
 * `pick`: the version this game picked at Start (otherwise one by the game's seed).
 */
export function customText(
  kind: CustomKind,
  tone: Tone,
  v: { name?: string; who?: string; room?: string; rooms?: string[]; letter?: string; weapon?: string; real?: string; line?: string; seed?: string; pick?: number },
): string {
  const pool = customPool(kind, tone);
  if (pool) {
    // Adult and Sailor lines come in versions, picked per game so replays sound different.
    const t = pool[(v.pick ?? hashOf(`${v.seed ?? ""}|${kind}`)) % pool.length];
    return t
      .replaceAll("{name}", v.name ?? "")
      .replaceAll("{rooms}", list((v.rooms ?? []).map(mid)))
      .replaceAll("{room}", v.room ? mid(v.room) : "");
  }
  switch (kind) {
    case "arrival":
      return `Now arriving: ${v.name}.${v.who ? ` ${v.who}` : ""}`;
    case "body":
      return `He was found in ${mid(v.room!)}.`;
    case "rooms":
      return `Now open: ${list((v.rooms ?? []).map(mid))}.`;
    case "killer":
    case "accomplice":
      return `${v.name}.`;
    case "exhibit":
      // v2: weapons have names, not exhibit letters.
      return `With the ${(v.weapon ?? "").toLowerCase()},`;
    case "room":
      return `in ${mid(v.room!)}.`;
    case "winner":
      return `${v.name}!`;
    case "jailed":
      return `${v.name} is going to jail.`;
    case "released":
      return `${v.name} is free to go.`;
    case "roll":
      return `${rollIntro(tone, v.name ?? "", v.real ?? "")} ${v.line ?? ""}`.trim();
  }
}

// ---------- insults on real names (Oct 17, Heston: "I want to add more insults of the players (their real names in
// game) as more layers to the game") ----------
//
// Per-guest lines for moments in the night, with the guest's first name ({real}). jailed and released join the jail
// verdicts; the rest are recorded only when they're needed (the jailbird, the last to lock in, the killer, the award
// winners), so a game never pays for lines it won't play.

export type InsultKind = "jailed" | "kept" | "released" | "lastLockIn" | "caught" | "gotAway" | "primeSuspect" | "bestDetective" | "bestDressed";
/** The lines recorded only when needed (jailed and released are the verdicts, recorded at Start). Oct 18: no Best Liar. */
export const LATER_KINDS: InsultKind[] = ["kept", "lastLockIn", "caught", "gotAway", "primeSuspect", "bestDetective", "bestDressed"];
export const INSULT_KINDS: InsultKind[] = ["jailed", "kept", "released", "lastLockIn", "caught", "gotAway", "primeSuspect", "bestDetective", "bestDressed"];

/** Oct 18 (Heston: "Only simple insults delivered deadpan, aimed at players real names"): every moment line, deadpan. */
export const INSULTS: Record<InsultKind, Record<Tone, string[]>> = {
  jailed: {
    classic: [
      "{real} is going to jail. Honestly, it's an improvement.",
      "Into the cell, {real}. The furniture in there is smarter, so you'll learn something.",
      "{real} is locked up. Nobody is going to visit.",
      "{real} goes to jail. The room feels lighter already.",
      "{real}, in you go. Try not to bore the bars.",
      "{real} is behind bars, where the rest of us can't hear them.",
    ],
    adult: [
      "{real} is going to jail. Nobody's baking you a cake, {real}.",
      "Into the can, {real}. You weren't finding anything out here anyway, you sap.",
      "{real} is locked up. The jail didn't want you either. It's doing us a favor.",
      "{real} is behind bars. Best look you've had all night.",
      "{real} is going up the river. Don't write.",
      "{real} is in jail, and the average brain in this room just went up. Damn, that's nice.",
    ],
    sailor: [
      "[dead serious] {real} is going to jail. [growling] Good. Rot in there, you shifty son of a bitch.",
      "[flat] Get in the cell, {real}. [short pause] It's not a suggestion, goddamnit.",
      "[dead serious] {real}, you're in jail. Best thing you've done all night, you useless bastard.",
      "[growling] Lock {real} up. [short pause] Throw away the key. Throw away the fucking door.",
      "[seething] {real} goes to jail. [dead serious] Nobody's visiting, jackass.",
      "[through gritted teeth] {real} is behind bars, where the stink belongs. Shit.",
    ],
  },
  kept: {
    classic: [
      "{real} stays in jail. Nobody's surprised. Least of all {real}.",
      "Parole denied, {real}. The board found you too comfortable.",
      "{real} isn't going anywhere. Make yourself at home. You already have.",
      "Release denied. {real} stays put, and the room stays quiet. Everybody wins.",
    ],
    adult: [
      "{real} stays in the can. The parole board is three gins deep and still said no.",
      "Release denied. Get comfy, {real}. The cell likes you. Nobody else does.",
      "{real} stays put. You begged, {real}. It was embarrassing. Still no.",
      "Still in jail, {real}. Tough luck. The key fell in the punch bowl, and nobody's fishing.",
    ],
    sailor: [
      "[dead serious] {real} stays in jail. [growling] Sit down, you sorry son of a bitch.",
      "[flat] Release denied. {real}, stop rattling the bars. There are no bars. It's a fucking corner.",
      "[dead serious] {real} stays in. I'd say I'm sorry, {real}. I'm not, you twitchy bastard.",
      "[through gritted teeth] Nobody wants {real} out. Nobody. Not even the goddamn parrot.",
    ],
  },
  released: {
    classic: [
      "{real} is free. Try to look less guilty out here.",
      "{real} walks. The cell asked us to say it won't miss you.",
      "Out you go, {real}. Don't make us regret this. We already do.",
      "{real} is released. The bar for good behavior was very low.",
    ],
    adult: [
      "{real} is out. The judge took the bribe and called you a chump. He was right, {real}.",
      "{real} walks free. Get a wiggle on, {real}, before we change our damn minds.",
      "{real} is out on bail. Nobody paid it. They just wanted the cell back.",
      "{real} is out. The cell is relieved. You snored, {real}.",
    ],
    sailor: [
      "[dead serious] {real} is out. [growling] Don't thank me. I voted to keep your ass in there.",
      "[flat] {real} is free. [seething] Now get out of my sight before I lock you up myself, shit-heel.",
      "[dead serious] {real}, you're released. Wipe that smile off, you smug son of a bitch.",
      "[through gritted teeth] They let {real} out. [roaring] Which one of you soft-hearted fuckers voted for this?",
    ],
  },
  lastLockIn: {
    classic: [
      "Everyone's locked in except {real}. No pressure, {real}. Just everyone, staring.",
      "{real}, get a wiggle on. It's three taps.",
      "We're all waiting on {real}. As usual.",
      "{real} is still thinking. First time for everything.",
      "{real}: who, what, where. Three taps. The rest of us managed.",
      "Last call for {real}. The rest of us have aged.",
    ],
    adult: [
      "{real}, get a wiggle on. It's three taps, not the Treaty of Versailles.",
      "Everybody's locked in but {real}. For crying out loud, {real}, guess.",
      "Still waiting on {real}. The Don died faster than this.",
      "{real}, lock it in. You've been wrong all night. Why stop now?",
      "{real} is still deciding. Pick a name, {real}. Any name. Throw a damn dart.",
      "{real}, everyone else has locked in and sobered up. Hurry the hell up.",
    ],
    sailor: [
      "[dead serious] Everybody's locked in except {real}. [roaring] Lock it in, you dithering son of a bitch.",
      "[seething] {real}. Three taps. Who, what, where. My dead grandmother is faster, goddamnit.",
      "[through gritted teeth] We are all waiting on {real}. All of us. Shit.",
      "[growling] {real}, pick a goddamn name. Any name. Mine. I don't care.",
      "[dead serious] {real} is still thinking. [flat] {real} hasn't thought all night, the gin-soaked bastard.",
      "[dead serious] Every one of you has locked in. Except {real}. [short pause] For fuck's sake, {real}.",
    ],
  },
  caught: {
    classic: [
      "{real}, caught red-handed. Try to look less pleased with yourself.",
      "Case closed. {real} did it, and {real} was the last to know we knew.",
      "{real} is the killer, and a lousy liar.",
      "{real}, the jig is up. Hand over the gin and come quietly.",
      "Nice try, {real}. You fooled nobody, with real confidence.",
      "{real} did it. Not well. But {real} did it.",
    ],
    adult: [
      "Caught, {real}. Your alibi was horsefeathers, and your poker face was a white flag.",
      "{real}, you did it, and you did it badly.",
      "Got you, {real}. Tell it to the judge. He doesn't believe you either.",
      "{real}, caught by this crowd. This crowd, {real}. That's like getting outrun by a parked Packard.",
      "{real} killed a man and got caught by people who've been drinking since six. Damn.",
      "{real} is the killer. A dumb one, but still.",
    ],
    sailor: [
      "[dead serious] {real}. We got you, you murdering son of a bitch.",
      "[flat] {real}. Caught. By these idiots. You got caught by these idiots, you dumb bastard.",
      "[growling] {real} did it. In my club. Get out of my sight, you rat-faced prick.",
      "[through gritted teeth] Your lying was shit, {real}. Your alibi was shit. The whole act was shit.",
      "[seething] {real} killed the Don and couldn't even get away with it. Goddamn amateur.",
      "[dead serious] I liked you, {real}. [short pause] I don't anymore, you treacherous bastard.",
    ],
  },
  gotAway: {
    classic: [
      "{real} did it, and {real} got away with it. The rest of you, take notes.",
      "{real} walks free. The detectives in this room should be embarrassed.",
      "Well played, {real}. You lied to every face in here, and they thanked you.",
      "{real} got away with it. The rest of you couldn't catch a cold.",
      "Hats off to {real}, the only person here who did their job tonight.",
      "{real}: killer, liar, winner. Everyone else: wet blankets.",
    ],
    adult: [
      "{real} did it and walked. You had the evidence, and you got played like saps.",
      "{real} got away with murder in a room full of detectives. Some detectives.",
      "{real} is free, smug and buying the next round. The rest of you are chumps.",
      "{real} walks. Somewhere in Chicago, Al Capone feels a little jealous.",
      "{real} lied to your faces all night, and you bought every word.",
      "{real} got away with it. The rest of you couldn't find your own ass with both hands.",
    ],
    sailor: [
      "[seething] {real} did it and walked, right past every one of you blind sons of bitches.",
      "[dead serious] {real} got away with it, and you jackasses helped. Goddamnit.",
      "[growling] Congratulations, {real}. Either you're a genius, or they're all fucking idiots. It's both.",
      "[flat] {real} walks out of my club a free killer. I'm holding the door, you smug bastard.",
      "[dead serious] Look at {real}. Smiling. Wipe that grin off your face, you lucky son of a bitch.",
      "[seething] {real} fooled every one of you. I've seen sharper detectives at the fucking fish market.",
    ],
  },
  primeSuspect: {
    classic: [
      "{real}, innocent all along. The rest of you owe {real} an apology.",
      "Prime Suspect: {real}. Didn't do it. Just has that kind of face.",
      "{real} was accused more than anyone and didn't do a thing. Looked like it, though.",
      "{real} is innocent. Shocking, given that face.",
      "Most wanted, least guilty: {real}.",
      "{real} didn't do it. {real} also didn't help.",
    ],
    adult: [
      "Prime Suspect: {real}. Innocent. Guilty of looking shifty in the first degree.",
      "{real} didn't do it. You all piled on anyway. Classy.",
      "{real} is innocent and still looks like they robbed a bank. Damn.",
      "The most accused person tonight, {real}, did absolutely nothing. As usual.",
      "{real} is innocent. Most of you said otherwise. Most of you are saps.",
      "Sorry, {real}. You didn't do it. You just have a guilty face, you pill.",
    ],
    sailor: [
      "[dead serious] {real} didn't do it. You blind jackasses pinned it on {real} anyway. Shit.",
      "[seething] {real}. Innocent. But you look guilty as hell, {real}. Fix your goddamn face.",
      "[flat] Prime Suspect goes to {real}, who did nothing all night. Not even detective work, you lazy bastard.",
      "[growling] Every finger in this room pointed at {real}. And {real} was innocent. You're all shit at this.",
      "[dead serious] {real}, they all thought it was you. So did I. Act less fucking shifty.",
      "[through gritted teeth] Innocent. {real} is innocent. Then why the hell do you look like that, {real}?",
    ],
  },
  bestDetective: {
    classic: [
      "Best Detective: {real}. Sharp eyes, sharp mind, very smug face.",
      "{real} cracked the case. The rest of you were furniture.",
      "{real}, Best Detective. Please don't make it your whole personality.",
      "Best Detective goes to {real}, who did all the work while the rest of you ate the snacks.",
    ],
    adult: [
      "{real}, Best Detective. You'll be an insufferable pill about this until Christmas.",
      "{real} cracked it while the rest of you chumps licked the cheese plate.",
      "Best Detective, {real}. Don't let it go to your head. There's not much room up there.",
      "{real} solved the murder, which in this crowd is like being the tallest jockey at Belmont.",
    ],
    sailor: [
      "[dead serious] Best Detective, {real}. Congratulations, you smug, sharp-eyed son of a bitch.",
      "[seething] {real} solved it, while the rest of you sat on your asses.",
      "[through gritted teeth] {real}. Best Detective. I hate how good you are. I fucking hate it.",
      "[dead serious] Best Detective goes to {real}. Don't smile. Don't you goddamn smile.",
    ],
  },
  bestDressed: {
    classic: [
      "Best Dressed: {real}. Finally, someone who looks like they own the place.",
      "{real} wins Best Dressed. The rest of you dressed like you lost a bet.",
      "Best Dressed, {real}. The outfit has a better alibi than {real} does.",
      "{real}, Best Dressed. Sharp outfit, dull brain.",
    ],
    adult: [
      "Best Dressed: {real}. Looks like a million bucks. Investigates like a flat tire.",
      "{real} wins Best Dressed. Looks great, {real}. Shame about the detective work.",
      "{real}, Best Dressed. The outfit's a ten. The alibi is horsefeathers.",
      "Best Dressed, {real}, who looks like a Ziegfeld headliner and thinks like a coat rack.",
    ],
    sailor: [
      "[dead serious] Best Dressed, {real}. You look too goddamn good for this dump.",
      "[flat] {real} wins Best Dressed. All that tailoring and still a dumbass.",
      "[through gritted teeth] {real}. Best Dressed. I wore a tie, {real}. A tie. Shit.",
      "[dead serious] Best Dressed goes to {real}. All that money on clothes, and not one dime on a clue, you fancy bastard.",
    ],
  },
};

/**
 * The jail and release verdicts (Oct 17): the script's own lines with the guest's character name, and the insult
 * layer's with their first name, in one pool; a different one for each guest, the same all game.
 */
export function verdictText(kind: "jailed" | "released", tone: Tone, v: { name: string; real: string; seed?: string; id: string; pick?: number }): string {
  const own = customText(kind, tone, { name: v.name, seed: v.seed, pick: v.pick });
  const pool = [own, ...INSULTS[kind][tone].map((t) => t.replaceAll("{real}", v.real))];
  return pool[hashOf(`${v.seed ?? ""}|verdict:${kind}|${v.id}`) % pool.length];
}

/** One of a guest's lines for a moment: a different version for each guest, the same all game. */
export function insultText(kind: InsultKind, tone: Tone, v: { real: string; seed?: string; id: string }): string {
  const pool = INSULTS[kind][tone];
  return pool[hashOf(`${v.seed ?? ""}|${kind}|${v.id}`) % pool.length].replaceAll("{real}", v.real);
}

// ---------- roll call ----------

/** Older games: a made-up character, played by a guest. */
const ROLL_INTROS: Record<GameTone, string[]> = {
  classic: ["Introducing {char}, played by {real}.", "Next, {char}. Better known as {real}.", "Say hello to {char}, played by {real}."],
  adult: [
    "Introducing {char}, played by {real}, God help us.",
    "Next up, {char}, a.k.a. {real}.",
    "Look who crawled in: {char}, played by {real}.",
    "Exhibit A: {char}, played by {real}.",
    "From the files of the New York Police Department: {char}, played by {real}.",
    "Please welcome {char}, played by {real}, who was not technically invited.",
  ],
};

/**
 * The party cast (Heston, Oct 16: "the roll call is way to long. We should simplify to only the characters name, their
 * nickname 'aka' and the real life name of the person playing that character"): each guest is introduced by their own
 * name and their nickname, nothing else. {real} is "Josh Lee", {aka} is ", a.k.a. Two-Tone" (empty until the
 * nickname is in).
 */
export const CAST_INTROS: Record<Tone, string[]> = {
  // Oct 18 (Heston: "need more roll call jokes, enough for each person to have a unique joke made. maybe 16 total
  // jokes, assigned at random per person every game"): 16 a script, dealt so nobody in a game shares one.
  classic: [
    "Introducing {real}{aka}. Here on a dare, staying for the free gin.",
    "Next, {real}{aka}, who has already lost their coat-check ticket.",
    "Say hello to {real}{aka}, who was told this was a church social.",
    "Please welcome {real}{aka}. The doorman checked twice and let them in anyway.",
    "Late, as always: {real}{aka}.",
    "Here is {real}{aka}, who pays the tab in buttons.",
    "Ladies and gentlemen, {real}{aka}. Try not to make any sudden moves.",
    "From the cheap seats: {real}{aka}.",
    "Fresh off the trolley and still lost: {real}{aka}.",
    "Wanted for questioning in three counties: {real}{aka}.",
    "Here is {real}{aka}. The band has agreed to keep playing anyway.",
    "Next up, {real}{aka}, who owes everyone in this room a nickel.",
    "Somebody's mother made them come: {real}{aka}.",
    "The pride of Hoboken, apparently: {real}{aka}.",
    "Keep one eye on your wallet. Here's {real}{aka}.",
    "Dressed for the occasion, roughly: {real}{aka}.",
  ],
  adult: [
    "Oh, for crying out loud. It's {real}{aka}.",
    "Guilty until proven otherwise: {real}{aka}.",
    "Don't make eye contact. Damnit, too late: {real}{aka}.",
    "Wanted in three boroughs and most of New Jersey: {real}{aka}.",
    "Please hold your applause, and your wallets: {real}{aka}.",
    "{real}{aka}. Already lying. Tell it to Sweeney.",
    "Fished out of the East River, unfortunately: {real}{aka}.",
    "Mugshot number four hundred and twelve: {real}{aka}.",
    "Lock up the silverware: {real}{aka}.",
    "Trouble, party of one: {real}{aka}.",
    "The flat tire of the evening: {real}{aka}.",
    "Banned from two speakeasies and a bowling alley: {real}{aka}.",
    "Nobody invited them, and yet, here we are: {real}{aka}.",
    "Smells like bathtub gin and bad decisions: {real}{aka}.",
    "The biggest sap in Manhattan, and that's a hell of a competition: {real}{aka}.",
    "{real}{aka}. Looks innocent. That's what worries the hell out of me.",
  ],
  sailor: [
    "{real}{aka}. [growling] God help us all. Shit. Bastard. Hell.",
    "[shouting] Look what the fucking cat dragged in: {real}{aka}.",
    "[dead serious] Next up: {real}{aka}. [short pause] Shit.",
    "[seething] From the files of the New York Police Department, the big fucking file: {real}{aka}.",
    "{real}{aka}. [through gritted teeth] Who the hell let this one in?",
    "[growling] Hide the goddamn silverware: {real}{aka}.",
    "[dead serious] {real}{aka}. [roaring] I owe this one money! Shit!",
    "[growling] Oh, hell no. Not this one. [sighs] {real}{aka}.",
    "[shouting] Who invited {real}{aka}?! [dead serious] I'm firing the doorman. Goddamnit.",
    "[seething] {real}{aka}. Banned from my club in 1926. [roaring] And yet, here you fucking are!",
    "[through gritted teeth] Smile for the mugshot, {real}{aka}. Bastard.",
    "[growling] {real}{aka}. [dead serious] I've seen better faces on a fish. A dead fish. Shit.",
    "[roaring] Everybody hide your gin! It's {real}{aka}! Damnit!",
    "[dead serious] {real}{aka}. [short pause] No. [shouting] Absolutely fucking not.",
    "[seething] Here's {real}{aka}, dressed for a goddamn funeral.",
    "[growling] Keep your hands where I can see them, {real}{aka}, you shifty son of a bitch.",
  ],
};

/** "Introducing Josh Lee, a.k.a. Two-Tone." Varied per guest (and, given a game's seed, per game) so it doesn't drone. */
export function rollIntro(tone: Tone, char: string, real: string, seed = "", cast = false, nickname = "", pick?: number): string {
  const real1 = real.trim() || "a mystery guest";
  // Oct 18: the game deals each guest their own joke (pick); older callers pick by the name.
  const h = pick ?? hashOf(`${seed}${real1}`);
  if (cast) {
    const list = CAST_INTROS[tone].length ? CAST_INTROS[tone] : CAST_INTROS.adult;
    return list[h % list.length].replace("{real}", real1).replace("{aka}", nickname.trim() ? `, a.k.a. ${nickname.trim()}` : "");
  }
  const list = ROLL_INTROS[tone === "classic" ? "classic" : "adult"];
  return list[h % list.length].replace("{char}", char).replace("{real}", real1);
}

/** What the roll call says about one guest: who they are, and (cast) their nickname; Oct 18: their joke and motive. */
export type RollParts = { name: string; real: string; nickname?: string; seed?: string; cast?: boolean; pick?: number; motive?: string };

/**
 * One guest's roll-call line: the introduction (their own joke), then their motive (Oct 18, Heston: "at the roll call
 * each persons motive is read aloud for everyone to hear").
 */
export function rollNarration(tone: Tone, p: RollParts) {
  const intro = rollIntro(tone, p.name, p.real, p.seed, p.cast, p.nickname, p.pick);
  return { text: p.motive ? `${intro} Motive: ${p.motive}` : intro };
}

const NOISES: Record<Tone, string[]> = {
  classic: ["[hiccups]", "[burps]", "[sneezes]", "[coughs]", "[clears throat]", "[snorts]"],
  adult: ["[hiccups]", "[burps]", "[sneezes]", "[coughs]", "[clears throat]", "[snorts]", "[farts]", "[burps loudly]"],
  sailor: [],
};

/**
 * A custom line (roll call, heckles, the names) recorded per game: about one in ten gets a noise before, after or
 * between its sentences, or a stutter on one word (Heston, Oct 15). Picked from the game's seed and the line, so the
 * clean line is what most games hear. Captions use the clean text.
 */
export function sprinkle(text: string, tone: Tone, key: string): string {
  const h = hashOf(`${key}|sprinkle`);
  if (h % 10 !== 0 || !NOISES[tone].length) return text;
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
