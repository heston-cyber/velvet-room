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
    classic: "If you haven't checked in on your phone, now's the time. Don't leave us on read.",
    adult: "Not checked in on your phone? Until you do, you're legally a damn coat rack.",
    wild: ["[suddenly impatient, shouting]", "[mutters to self]"],
  },
  // ---- how to play (after the roll call; replaced the five house rules, Oct 14) ----
  // ---- How to play, v2 (Oct 15): after the murder, before the roll call. Drafts for Heston's review. ----
  howAccomplice: {
    when: "How to play v2, the accomplice (killer + accomplice games only)",
    classic: "Tonight the killer has an accomplice. They didn't do it, but they know who did, and they'll lie for them. [short pause] When you lock in, take a guess at the accomplice too.",
    adult: "The killer posted a job listing. Help wanted: one accomplice. Didn't do it, knows who did, lies for them. Unpaid internship. Must be a two-faced rat. NPCs need not apply. [short pause] Guess who got the job when you lock in.",
    wild: ["[conspiratorial whisper, way too close to the mic]", "[giggles]"],
  },
  // ---- How to play, v3 (Oct 16, Heston: "the rules need to be simplified", "use visuals to help explain the rules,
  // and condense the rules if possible"): five cards (six with an accomplice), each with a picture that shows the
  // rule. Same rules as v2, fewer words. Drafts for Heston's review. ----
  howCase: {
    when: "How to play v3, card 1 (one of you did it; your phone; lying)",
    classic: "[warm, conspiratorial] Here's how tonight works. Any minute now, Don Ray Sanders is going to die, and one of you will have done it. Your phone will tell you if it was you. [short pause] Only the guilty may lie. Everyone else tells the truth, the whole truth, and nothing but.",
    adult: "[warm, conspiratorial] Here's the deal. Any minute, Don Ray Sanders drops dead, and one of you will have done it. Your phone will tell you if it was you. If it says you're innocent, try to look less disappointed. [short pause] Only the guilty may lie. Everyone else tells the truth, and only the truth. Your age, your Venmo history and your screen time are, sadly, under oath.",
    wild: ["[clapping hands, way over the top]", "[cackles]"],
  },
  // Phase 6 (Oct 21): new.
  howStory: {
    when: "How to play, your story (where you were)",
    classic: "Your phone also says where you were when the lights went out, with one detail anyone can check. The killer gets one too: a made-up cover that looks exactly like the real thing. [short pause] So never show your phone. Ask where everyone was, and check their stories against the cards.",
    adult: "Your phone also says where you were when the lights went out, plus one detail anyone can check. The killer gets one too: a fake, and it looks exactly like yours. [short pause] So keep your phone to yourself, and make everyone talk. Whose story falls apart?",
    wild: ["[conspiratorial whisper]", "[giggles]"],
  },
  howJail2: {
    when: "How to play v3, the jail vote",
    classic: "When Round 2 ends, two late tips land up here. One of them might be planted: the killer gets to frame someone, once. Then the jail vote. More than half of you must agree, or nobody goes, and nobody is always a choice. [short pause] The jailbird sits out Round 3, and is back for the lock-in.",
    adult: "When Round 2 ends, two late tips come in. One might be a plant: the killer gets one shot at framing somebody. Then the jail vote. More than half of you have to agree, or nobody goes. [short pause] The jailbird sits out Round 3 and stews, then comes back for the lock-in.",
    wild: ["[banging on the bars, shouting]", "[evil laugh]"],
  },
  // Phase 6 (Oct 21): new.
  howTips: {
    when: "How to play, the late tips (games without a jail vote)",
    classic: "When Round 2 ends, two late tips land up here. One of them might be planted: the killer gets to frame someone, once.",
    adult: "When Round 2 ends, two late tips come in. One might be a plant: the killer gets one shot at framing somebody. Choose your enemies wisely.",
    wild: ["[conspiratorial whisper]", "[evil laugh]"],
  },
  // Oct 29 (Heston, after his test night: "Need to add a section that really explains the app well at the beginning
  // and how to use it"): the phone, on the TV. Words on screen only until it's recorded.
  howPhone: {
    when: "How to play, your phone (Oct 29)",
    classic: "Your phone runs the game. When your role arrives, press and hold to read it. Then your phone walks you through its five tabs: your case file, Scan, Evidence, the Notebook and Betting. The line at the top always says what to do next.",
    adult: "Your phone runs this whole thing. When your role shows up, press and hold to read it, then your phone gives you the tour: case file, Scan, Evidence, Notebook, Betting. The line at the top always tells you what to do next, so no excuses.",
    wild: ["", ""],
  },
  // Phase 6 (Oct 21): new.
  howChips: {
    when: "How to play, chips",
    classic: "Chips buy drinks, pay debts and place bets. Someone may try to buy your vote or your silence. [short pause] You can stay quiet. You can never lie.",
    adult: "Chips buy drinks, pay debts and place bets. Somebody may try to buy your vote, or your silence. Take the money or don't. [short pause] Stay quiet if you like. But you can never lie. Not even for chips. Especially not for chips.",
    wild: ["[counting money, way too excited]", ""],
  },
  howRound: {
    when: "How to play v3, how a round ends (Ready pacing; rooms open in waves)",
    classic: "Three rounds. Rooms open a few at a time. Search them for evidence cards and scan each one. A card's words stay on your phone, so compare notes. Tap Ready when you're done; the round ends when everyone's ready.",
    adult: "Three rounds. Rooms open a few at a time, so stay out of the sealed ones. Find the evidence cards and scan them. What a card says stays on your phone, so talk. Tap Ready when you're done. The round waits for everybody, so don't be that guy.",
    wild: ["[impatient, tapping a watch]", ""],
  },
  howRoundTimer: {
    when: "How to play v3, how a round ends (timer; rooms open in waves)",
    classic: "Three rounds, each on the clock. Rooms open a few at a time. Search them for evidence cards and scan each one. A card's words stay on your phone, so compare notes. When the clock runs out, the round ends.",
    adult: "Three rounds, each on the clock. Rooms open a few at a time, so stay out of the sealed ones. Find the evidence cards and scan them. What a card says stays on your phone, so talk. When the clock hits zero, the round's over, ready or not.",
    wild: ["[impatient, tapping a watch]", ""],
  },
  howRoundAll: {
    when: "How to play v3, how a round ends (Ready pacing; every room open from Round 1)",
    classic: "Three rounds. Every room is open from the start. Search for evidence cards and scan each one. A card's words stay on your phone, so compare notes. Tap Ready when you're done; the round ends when everyone's ready.",
    adult: "Three rounds, and the whole house is open from the start. Find the evidence cards and scan them. What a card says stays on your phone, so talk. Tap Ready when you're done. The round waits for everybody, so don't be that guy.",
    wild: ["[impatient, tapping a watch]", ""],
  },
  howRoundTimerAll: {
    when: "How to play v3, how a round ends (timer; every room open from Round 1)",
    classic: "Three rounds, each on the clock. Every room is open from the start. Search for evidence cards and scan each one. A card's words stay on your phone, so compare notes. When the clock runs out, the round ends.",
    adult: "Three rounds, each on the clock, and the whole house is open from the start. Find the evidence cards and scan them. What a card says stays on your phone, so talk. When the clock hits zero, the round's over, ready or not.",
    wild: ["[impatient, tapping a watch]", ""],
  },
  howWin2: {
    when: "How to play v3, locking in and winning",
    classic: "After Round 3, everyone locks in who did it, with what, and where. The killer locks in too. [short pause] The most votes wins each one. Get all three right and you win; miss one, and the killer walks. A tie goes to a runoff.",
    adult: "After Round 3, everybody locks in: who, with what, and where. The killer locks in too. [short pause] Most votes wins each one. Nail all three and you win. Miss one, and the killer walks out laughing. A tie? Runoff.",
    wild: ["[maniacal laughter]", "[cackles]"],
  },
  // ---- the welcome (Oct 31, Heston: "it goes short welcome to the velvet room, soon someone is going to die, but first
  // lets meet tonights guests: goes into roll call, then how to play, then the don dies and the game starts"): opens the
  // show, in place of the roll call's "the doors are locked" ----
  welcome: {
    when: "Start: the welcome, then the roll call",
    classic: "Welcome to the Velvet Room. [short pause] Soon, someone is going to die. But first, let's meet tonight's guests.",
    adult: "Welcome to the Velvet Room. [short pause] Soon, somebody's going to die. Probably from the drinks. But first, let's meet tonight's guests.",
    wild: ["[warm, theatrical]", ""],
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
    adult: "Jail vote. Somebody's getting shipped to Rikers, or nobody is. Vote on your phone.",
    wild: ["[banging a gavel, way too hard]", ""],
  },
  voteRelease: {
    when: "The release vote opens (after Round 3, before the lock-in, if anyone is in jail)",
    classic: "Before the lock-in: does our jailbird get out? Vote on your phone.",
    adult: "The parole board is now in session. That's you. Every one of you is four vodka sodas deep. Before the lock-in, vote on your phone: does the jailbird get out?",
    wild: ["[jingling keys, giggling]", ""],
  },
  voteLastCall: {
    when: "Fifteen seconds left to vote",
    classic: "Fifteen seconds left to vote.",
    adult: "Fifteen seconds. Hurry up, or the dead guy votes for you. Lowkey, he's been leaning your way.",
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
  rollCallClose: {
    when: "Roll call ends",
    classic: "That's everyone. [short pause] Remember these faces. One of them is lowkey a killer.",
    adult: "What a sorry-ass lot. [short pause] I've seen classier lineups at Rikers.",
    wild: ["[suddenly sinister]", "[evil laugh]"],
  },
  // ---- intro ----
  intro1: {
    when: "Start: lights down",
    classic: "[low, gravelly voice] New York City. October 31st, 2026. [long pause]",
    adult: "[low, gravelly voice] New York City. October 31st, 2026. [long pause]",
    wild: ["[dramatic hushed whisper]", ""],
  },
  intro2: {
    when: "Start: the body",
    classic: "Tonight, the Velvet Room lost its owner. Don Ray Sanders has been found dead. [short pause] And no, it's not a costume.",
    adult: "Don Ray Sanders is dead. His landlord listed the apartment within the hour. Forty applications already.",
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
    adult: "Round one. Search the house. Question whoever smells most like vape smoke and bullshit.",
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
    adult: "One minute. Hustle, like the place is on fire and well insured.",
    wild: ["[panicking]", "[hyperventilating]"],
  },
  // ---- rounds 2 and 3 ----
  round2: {
    when: "Round 2 begins",
    classic: "Fresh evidence just dropped.",
    adult: "Round two. Fresh evidence just came in, still warm. Don't ask.",
    wild: ["[gasps theatrically]", "[cackles]"],
  },
  roomsOpen: {
    when: "More rooms open (waves)",
    classic: "More rooms are open. Get searching.",
    adult: "More rooms open. Search them like you lost your AirPods.",
    wild: ["[squealing with delight]", ""],
  },
  round3: {
    when: "Round 3 begins",
    classic: "The last of the evidence. [short pause] And one final twist.",
    adult: "Final evidence, and a twist that'll hit you like a crypto crash, right in the bollocks.",
    wild: ["[ominous, way too slow]", "[evil laugh]"],
  },
  // Phase 6 (Oct 21): new.
  askAround: {
    when: "Each round, after its opening line: the story reminder",
    classic: "Ask where everyone was when the lights went out.",
    adult: "Ask everybody where they were when the lights went out. Somebody's lying, and they've had time to practice.",
    wild: ["[conspiratorial whisper]", ""],
  },
  // Phase 6 (Oct 21): new.
  lateTips: {
    when: "End of Round 2: the two late tips land on the TV",
    classic: "Two late tips just came in. One of them might be a plant.",
    adult: "Two late tips just came in. One of them might be a plant, and the killer's no gardener.",
    wild: ["[gasps theatrically]", ""],
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
    classic: "The time for talk is over. Whose story didn't hold up? Make your accusations.",
    adult: "Court's in session. Whose story fell apart? You're the jury, God help us all. Lock it in.",
    wild: ["[pounding the table, shouting]", ""],
  },
  accuseLastCall: {
    when: "Thirty seconds left (timer)",
    classic: "Thirty seconds. Lock in your accusation.",
    adult: "Thirty seconds. Move it, or I pick. I've had nine bloody espresso martinis.",
    wild: ["[panicked shriek]", ""],
  },
  // Phase 6 (Oct 21): new.
  runoffWho: {
    when: "The lock-in tied on who: last words first",
    classic: "It's a tie. Before you vote again, last words. Thirty seconds each.",
    adult: "A tie. Of course it's a tie. Before you vote again, the accused get last words. Thirty seconds each. Make it count.",
    wild: ["[gasps]", ""],
  },
  // Phase 6 (Oct 21): new.
  runoffThings: {
    when: "The lock-in tied on the weapon or the room only",
    classic: "It's a tie. Vote again, on your phones, on just what's tied.",
    adult: "A tie. Vote again on your phones, on just what's tied, and this time, pick a side.",
    wild: ["[gasps]", ""],
  },
  // Phase 6 (Oct 21): new.
  runoffVote: {
    when: "After the last words: the runoff vote opens",
    classic: "Time's up. Vote again, on your phones.",
    adult: "Time's up. Vote again on your phones, and this time, mean it.",
    wild: ["[banging a gavel, way too hard]", ""],
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
    adult: "…right here, drinking the dead man's tequila.",
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
  // Phase 6 (Oct 21): new.
  plantReveal: {
    when: "Reveal: one of the late tips was the killer's plant",
    classic: "One more thing. One of tonight's late tips was planted by the killer.",
    adult: "One more thing. One of those late tips was a plant. The killer framed somebody, and some of you bought it.",
    wild: ["[whispers, scandalized]", ""],
  },
  // Phase 6 (Oct 21): new.
  noPlant: {
    when: "Reveal: no plant tonight (both late tips were true)",
    classic: "No plant tonight. Both late tips were true.",
    adult: "No plant tonight. Both tips were true. The killer didn't even try. Lazy.",
    wild: ["[surprised]", ""],
  },
  verdictDetectives: {
    when: "Verdict: the detectives win (more than half on the killer, more than half on the weapon, more than half on the room)",
    classic: "The detectives got their killer. [short pause] Confess, you rat.",
    adult: "You got it right. I'm shocked. [short pause] Confess, you dirty rat.",
    wild: ["[ecstatic, shouting]", "[wild applause]"],
  },
  verdictKiller: {
    when: "Verdict: the killer walks (not more than half on the killer, the weapon or the room)",
    classic: "The most votes missed the killer, the weapon or the room. [short pause] The killer walks free tonight.",
    adult: "The most votes missed. Killer, weapon or room, you whiffed one. The killer walks. The NYPD would like to offer you all jobs.",
    wild: ["[sobbing uncontrollably]", ""],
  },
  // ---- awards and goodnight ----
  awards: {
    when: "Awards open",
    classic: "And now, the awards.",
    adult: "The awards. Fully rigged, like everything else in this city.",
    wild: ["[over-the-top game show host]", ""],
  },
  awardDetective: {
    when: "Before the Best Detective name",
    classic: "Best Detective goes to…",
    adult: "Best Detective, who'll be insufferable about this in the group chat until 2030, goes to…",
    wild: ["[building, breathless]", ""],
  },
  awardDressed: {
    when: "Before the Best Dressed name",
    classic: "Best Dressed goes to…",
    adult: "Best Dressed, for now, goes to…",
    wild: ["[swooning]", ""],
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
  // ---- How to play, v5 (Oct 30, Heston: "we need even more in depth explaination of the game and how it works. rework
  // the whole opening rules sesction to be a 'how to play' and it explains the game like it would to a 2 year old.
  // This is a roudy party and needs to be simple."): the whole night in order, one small idea per card, short words.
  // Replaces the v4 cards (howCase, howPhone, howStory, howRound…, howTips, howChips, howWin2). ----
  playDies: {
    when: "How to play v5, someone dies (Oct 31, later: before the murder again)",
    classic: "[warm, conspiratorial] Here's the game. In a minute, the lights go out and Don Ray Sanders dies. One of you did it. Your job: find out who.",
    adult: "[warm, conspiratorial] Here's the game. In a minute, the lights go out and Don Ray Sanders drops dead. One of you did it. Find out who. That's it. That's the whole game.",
    wild: ["[clapping hands, way over the top]", "[cackles]"],
  },
  playAccomplice: {
    when: "How to play v5, the helper (killer + accomplice games only)",
    classic: "Tonight the killer has a helper. The helper didn't do it, but lies for the killer. [short pause] Guess the helper too when you lock in.",
    adult: "Tonight the killer brought a helper. The helper didn't do it, but lies for the killer like a little rat. [short pause] Guess the helper when you lock in.",
    wild: ["[conspiratorial whisper]", "[giggles]"],
  },
  playPhone: {
    when: "How to play v5, your phone",
    classic: "Your phone tells you if you're the killer. Hold the card to read it. Don't show anyone. [short pause] Stuck? The top of your phone always says what to do.",
    adult: "Your phone tells you if you're the killer. Hold the card to read it, and don't show anybody. [short pause] Lost? The top of your phone always tells you what to do. Read it.",
    wild: ["", ""],
  },
  playLie: {
    when: "How to play v5, only the killer lies",
    classic: "The killer is going to lie. That's their job. [short pause] Your job: catch them.",
    adult: "The killer is going to lie to your face. That's the job. [short pause] Your job: catch them.",
    wild: ["[dead serious]", ""],
  },
  playStory: {
    when: "How to play v5, where were you",
    classic: "Your phone says where you were when he died. Tell people. Ask people. [short pause] The killer's story is fake. Catch it.",
    adult: "Your phone says where you were when he died. Tell people. Grill people. [short pause] The killer's story is fake. Catch the liar.",
    wild: ["[conspiratorial whisper]", ""],
  },
  playCards: {
    when: "How to play v5, find the cards",
    classic: "Evidence cards are hidden around the house. Find one. Scan it with your phone. Leave it there. [short pause] Then tell people what it said.",
    adult: "Evidence cards are hidden around the house. Find one, scan it, put it back. [short pause] Then run your mouth about what it said.",
    wild: ["", ""],
  },
  playRooms: {
    when: "How to play v5, open rooms only (rooms open in waves)",
    classic: "Only search rooms that are open. The TV shows which ones. More rooms open every round.",
    adult: "Only search the open rooms. The TV shows which ones. Closed means closed. More rooms open every round.",
    wild: ["", ""],
  },
  playRounds: {
    when: "How to play v5, three rounds (untimed)",
    classic: "There are three rounds. When you're done searching, tap Done searching. When everyone's done, the next round starts.",
    adult: "Three rounds. Done searching? Tap Done searching. When everybody's done, next round. [short pause] Don't be the one we're all waiting on.",
    wild: ["[impatient, tapping a watch]", ""],
  },
  playRoundsTimer: {
    when: "How to play v5, three rounds (on the clock)",
    classic: "There are three rounds, each with a clock. When the clock hits zero, the next round starts.",
    adult: "Three rounds, each on a clock. Clock hits zero, next round. Ready or not.",
    wild: ["[impatient, tapping a watch]", ""],
  },
  playHeat: {
    when: "How to play v5, point the finger (the heat)",
    classic: "Think you know who did it? Tag them in your Notebook. If three of you tag the same person, the TV puts the heat on them.",
    adult: "Got a hunch? Tag them in your Notebook. Three tags on the same person, and the TV puts them on blast.",
    wild: ["", ""],
  },
  playTips: {
    when: "How to play v5, the late tips",
    classic: "After Round 2, two tips pop up on the TV. One of them might be a lie from the killer.",
    adult: "After Round 2, two tips hit the TV. One might be a lie the killer planted. Trust nobody.",
    wild: ["[conspiratorial whisper]", "[evil laugh]"],
  },
  playChips: {
    when: "How to play v5, chips",
    classic: "Chips are money. Buy drinks, pay what you owe, and bet on who did it. [short pause] Someone may pay you to stay quiet. That's allowed.",
    adult: "Chips are money. Drinks, debts, bets. [short pause] Somebody might pay you to keep quiet. Take the money.",
    wild: ["[counting money, way too excited]", ""],
  },
  playLock: {
    when: "How to play v5, pick who did it (the lock-in)",
    classic: "After Round 3, everyone picks three things: who did it, with what, and where. You get three minutes. Then it's locked.",
    adult: "After Round 3, everybody picks: who did it, with what, and where. Three minutes. Then it's locked. No take-backs.",
    wild: ["", ""],
  },
  playWin: {
    when: "How to play v5, who wins",
    classic: "Most votes wins. Get all three right, and the good guys win. Miss one, and the killer wins. [short pause] A tie? Vote again.",
    adult: "Most votes wins. Get all three right, and the good guys win. Miss one, and the killer walks. [short pause] A tie? Vote again.",
    wild: ["[maniacal laughter]", "[cackles]"],
  },
  // ---- Gameplay (Oct 31, Heston: "we need also a gameplay section after the rules to explain how the game works and how
  // to play" → "both the round walkthrough and phone tour"): after How to play, right before "check your phone". The
  // night round by round, then a tour of the phone's tabs over real phone screens. ----
  nightR1: {
    when: "Gameplay, the night: Round 1",
    classic: "Here's how the night goes. Round one: search the open rooms, scan the cards, and ask where everyone was. Then tap Done searching.",
    adult: "Here's how the night goes. Round one: search the open rooms, scan the cards, and grill everybody. Then tap Done searching.",
    wild: ["", ""],
  },
  nightR2: {
    when: "Gameplay, the night: Round 2",
    classic: "Round two: more rooms open, and new evidence shows up on the TV. Search again.",
    adult: "Round two: more rooms open, and fresh evidence hits the TV. Back out there. Sober up a little.",
    wild: ["", ""],
  },
  nightR3: {
    when: "Gameplay, the night: Round 3",
    classic: "Round three: the last rooms open, and two tips show up on the TV. Compare stories.",
    adult: "Round three: the last rooms open, and two tips hit the TV. One might be garbage. Compare stories.",
    wild: ["", ""],
  },
  nightLock: {
    when: "Gameplay, the night: the lock-in",
    classic: "Then everyone picks who did it, with what, and where. And the TV shows who got it right.",
    adult: "Then everybody picks who, with what, and where. The TV shows who got it right. [short pause] Somebody's going to be insufferable.",
    wild: ["[drumroll noises with mouth]", ""],
  },
  tourCase: {
    when: "Gameplay, your phone: the Case tab",
    classic: "Now, your phone. Case is home. Your secret, your story, and the Done searching button are all here.",
    adult: "Now, your phone. Case is home base. Your secret, your story, and the Done searching button. Guard it like your browser history.",
    wild: ["", ""],
  },
  tourScan: {
    when: "Gameplay, your phone: the Scan tab",
    classic: "Found an evidence card? Tap Scan, and point your camera at the code.",
    adult: "Found a card? Tap Scan and point your camera at the code. Can't work a QR code? Ask anyone under forty.",
    wild: ["", ""],
  },
  tourEvidence: {
    when: "Gameplay, your phone: the Evidence tab",
    classic: "Evidence keeps every card you've scanned, plus everything shown on the TV.",
    adult: "Evidence keeps every card you've scanned, plus everything on the TV. Your memory's shot. Use it.",
    wild: ["", ""],
  },
  tourNotebook: {
    when: "Gameplay, your phone: the Notebook tab",
    classic: "Notebook is for your hunches. Cross off who didn't do it. Tag who did.",
    adult: "Notebook is for your hunches. Cross off who didn't do it. Tag who did. Grudges welcome.",
    wild: ["", ""],
  },
  tourBetting: {
    when: "Gameplay, your phone: the Betting tab",
    classic: "Betting is for your chips. Bet on who did it, if you're feeling lucky.",
    adult: "Betting is for your chips. Bet on who did it. It's not real money, so go nuts.",
    wild: ["[counting money, way too excited]", ""],
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
  // Phase 6 (Oct 21): new and rewritten lines, one more Adult version each.
  howRound: ["Three rounds. Rooms open a few at a time. Raid them, scan every evidence card, and compare notes, because the cards only talk to the phone that scanned them. Tap Ready when you're done. Nobody moves on till everybody's ready. No cap."],
  howRoundTimer: ["Three rounds, and the clock doesn't care about your feelings. Rooms open a few at a time. Scan every evidence card you find and compare notes; the cards only talk to the phone that scanned them. Clock runs out, round's over."],
  howRoundAll: ["Three rounds. Every room's open, so tear the place apart. Scan every evidence card and compare notes, because the cards only talk to the phone that scanned them. Tap Ready when you're done. Nobody moves on till everybody's ready."],
  howRoundTimerAll: ["Three rounds, and the clock doesn't care about your feelings. Every room's open. Scan every evidence card you find and compare notes; the cards only talk to the phone that scanned them. Clock runs out, round's over."],
  howJail2: ["End of Round 2: two late tips hit this screen, and one of them might be the killer's handiwork. Then you vote somebody into jail, or nobody. It takes more than half of you, which in this crowd is a miracle. [short pause] The jailbird misses Round 3 and is back for the lock-in."],
  howWin2: ["After Round 3, lock it in: who, with what, and where. Yes, the killer votes too. Very on brand for this city. [short pause] Most votes wins each one. All three right, you win; one wrong, the killer walks. Ties go to a runoff, with last words."],
  verdictKiller: ["Close, but no. The most votes missed the killer, the weapon or the room. The killer calls an Uber and sticks you with the surge pricing. What a bunch of NPCs."],
  howStory: ["Everyone's phone says where they were when the lights went out, with one detail you can check. The killer's is a lie dressed up as the truth, like every dating profile in Brooklyn. [short pause] Never show your phone. Ask around, and check the stories against the cards."],
  howTips: ["End of Round 2: two late tips hit this screen. One of them might be the killer's handiwork. Trust nothing. Especially the juicy one."],
  // Oct 29: the phone card.
  howPhone: ["Your phone is the whole game. When your role shows up, hold the card to read it, then follow the little tour: case file, Scan, Evidence, Notebook, Betting. Lost? Read the line at the top. It's right there. It's always right there."],
  howChips: ["Chips are money: drinks, debts, bets, and the occasional bribe. Somebody may pay you for your vote or your silence. [short pause] Keeping quiet is allowed. Lying is not. Rules are rules, even in this city."],
  askAround: ["Where was everybody when the lights went out? Ask. One of them is lying through their veneers."],
  lateTips: ["Late tips, hot off the group chat. One might be planted. Trust nobody, especially about yourself."],
  runoffWho: ["It's a tie, you indecisive jackasses. Last words first: thirty seconds each. Beg, cry, or throw somebody under the bus."],
  runoffThings: ["Tied. Again. Vote on your phones, on just what's tied. Use your brains this time. Both of them."],
  runoffVote: ["Last words are over. Vote again. If it ties again, the killer walks, so no pressure."],
  plantReveal: ["And that juicy late tip? Planted. The killer framed somebody. Caught in 4K, eventually."],
  noPlant: ["Both late tips were true. No plant. The killer kept it simple, and honestly, respect."],
  doors: [
    "[warm, smoky voice] Welcome to the Velvet Room. I'm {host}. The espresso martinis were mixed today in a bathtub in Bushwick. Somebody's uncle was still in the tub. He says they slap, no cap, and he'd know.",
    "[warm, smoky voice] Welcome to the Velvet Room. I'm {host}. The lights are low, the drinks are strong, and the coat check guy will hold anything you hand him. [short pause] He's handled bigger.",
  ],
  doorsReminder: [
    "Check in on your phone, or I tell the whole room you moved to Hoboken on purpose.",
    "Not checked in yet? The bouncer's been told you're a narc. He's thrilled.",
  ],
  howAccomplice: [
    "There's an accomplice tonight. They didn't do it. They just know who did and lie about it, which in this city makes them a civil servant with a pension. [short pause] Guess them when you lock in.",
    "Tonight the killer brought a plus-one: someone who didn't do it, knows who did, and will lie to your face with a mouthful of your shrimp, the rat. [short pause] Guess them when you lock in.",
  ],
  voteJail: [
    "Jail vote. Find the face you trust least. Vote on your phone, or pick nobody, chickenshit.",
    "Jail vote, on your phone. Pick a guest, or pick nobody. Spite is a perfectly good reason.",
  ],
  voteRelease: [
    "Release vote. Whoever's in that cell might be innocent. They might also owe you nine dollars on Venmo, the deadbeat. Vote on your phone.",
    "Before the lock-in, our jailbird gets one shot at freedom. Vote on your phone. They might be innocent. They've also been licking the damn bars.",
  ],
  voteLastCall: [
    "Fifteen seconds. Move it, before some city council jackass throws the ballot box in the East River.",
    "Fifteen seconds. People died for your right to vote, mostly in Chicago, mostly Tuesday. Vote.",
  ],
  voteTally: [
    "The votes are in. No secret ballot. Sorry, besties.",
    "The votes are in. Not anonymous. Start apologizing, jackasses.",
  ],
  jailNobody: [
    "Nobody goes to jail. The jail is very disappointed. It cleaned. It bought flowers. It wrote a card.",
    "Not enough votes. Nobody goes to jail. Democracy is a beautiful thing, and also so mid.",
  ],
  releaseNobody: [
    "Release denied. Somebody bring them a sandwich. A crap one.",
    "Nobody gets out. Shit happens, and tonight it happened to them.",
  ],
  releaseCleared: [
    "No vote needed. The evidence says our jailbird is innocent. Sus, but fine.",
    "Put the ballots away. The evidence cleared the jailbird, so open the damn cell.",
  ],
  howCase: [
    "[warm, conspiratorial] House rules. Any minute now, Don Ray Sanders is going to die, and one of you will have done it. Your phone will tell you if it was you. That's how half of City Hall found out. [short pause] Only the guilty may lie. The rest of you tell the truth. It's still bloody New York, but rules are rules.",
    "[warm, conspiratorial] Everybody, raise your right hand. Any minute now, Don Ray Sanders becomes a corpse, and one of you will have made him one. Your phone will tell you if it was you. [short pause] Do you swear that only the guilty will lie, and everyone else will tell the truth? Lovely. Nobody meant it.",
  ],
  rollLocked: [
    "[low, grave] The doors are locked until we know who did it. Nobody leaves. Not for a vape, not for air, not for that sick aunt in Yonkers you pulled out of your ass. [short pause] Let's meet the suspects.",
    "[low, grave] The doors are locked until we know which one of you did it. If nature calls, there's a bucket in the kitchen. Do not drink from the bucket. Again. [short pause] Let's meet the suspects.",
  ],
  rollCallClose: [
    "One of those faces is a liar. [short pause] The rest just look like that.",
    "That's the lineup. [short pause] Look hard. The sketch artist is shit-faced.",
  ],
  intro1: [
    "[low, gravelly voice] New York City. October 31st, 2026. A cocktail costs twenty-six dollars. [short pause] Bollocks. [long pause]",
    "[low, gravelly voice] New York City. October 31st, 2026. [short pause] Rent is reasonable. [long pause]",
  ],
  intro2: [
    "Breaking news: Don Ray Sanders is dead. Police are baffled. The parrot isn't talking.",
    "Don Ray Sanders is dead. In lieu of flowers, Venmo the club. Small amounts. Lots of them.",
  ],
  intro3: [
    "[whispers] One of you did it. [short pause] Wipe that smile off your face. Yes, you, jackass.",
    "[whispers] One of you did it. [short pause] My money's on whoever just looked at the door.",
  ],
  intro4: [
    "Check your phone. Press and hold your card. Keep it to yourself, like the clap.",
    "Phones out. Press and hold your card, and hide it like your weekly screen time report.",
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
    "Round two. New evidence. Try reading it this time, dumbass.",
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
    "Lock it in, true-crime podcasters. Guess wrong and you're a jackass for life.",
  ],
  accuseLastCall: [
    "Thirty seconds. Lock it in. Commit, for once, you wankers.",
    "Thirty seconds. Move it. The Don died faster than you decide.",
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
  awards: [
    "Now, the awards. Every trophy here was stolen. Act surprised. You're good at that.",
    "Awards. Hold your applause, your drinks and each other, in that order.",
  ],
  awardDetective: [
    "Best Detective, the only one who could find their own ass with a map, goes to…",
    "Best Detective, who did all that work for free, like a sucker, goes to…",
  ],
  awardDressed: [
    "The best-dressed crook in the building is…",
    "Best Dressed, first one we'd rob, goes to…",
  ],
  // Oct 17 drafts (in the script doc for Heston's OK).
  awardPrimeSuspect: [
    "The Prime Suspect award. The police would like to apologize to the winner. The police are lying. It goes to…",
    "Prime Suspect, for the innocent bestie you pointed at the most, goes to…",
  ],
  awardGotAway: [
    "Got Away With It, for the killer who lied to every one of you clowns and walked, goes to…",
    "And the Got Away With It award. City Hall was nominated, but this one earned it. It goes to…",
  ],
  goodnight: [
    "We're closed. Staying over? The couch has seen worse.",
    "The Velvet Room is closed. Go home and touch grass, the lot of you.",
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
  welcome: ["Welcome to the Velvet Room. [short pause] Somebody in here won't make it to midnight. But first, let's meet tonight's guests."],
  // How to play and Gameplay have one Adult version, never a second (Oct 31, Heston: "we need to keep the rules and
  // gameplay sections the same every adult game without changing the script. its important to convey the information
  // clearly every time").
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
    rollLocked: "[low, grave] The doors are locked until we figure out who did it. [hiccups] [short pause] Now, let's meet the suspects.",
    rollCallClose: "That's everyone. [short pause] Remember these faces. [hiccups]",
    intro4: "Check your phone. [coughs] Press and hold your card, and keep it to yourself.",
    round2: "Fresh evidence just dropped. [burps] Pardon me.",
    oneMinute: "One minute left in this round. [sneezes] Excuse me. One minute.",
    twist: "[building] And now, the t- t- twist.",
    reveal1: "[long pause] The killer of Don Ray Sanders is… [hiccups] is…",
    verdictDetectives: "The detectives got their killer. [short pause] C- c- confess, you rat.",
    voteJail: "Time to vote. [clears throat] Who goes to jail? Vote on your phone. You can pick nobody.",
    jailNobody: "Not enough votes. Nobody goes to jail this t- t- time.",
    awards: "And now, the awards. [clears throat]",
    paused: "Hold everything. [sneezes] Excuse me.",
    goodnight: "The Velvet Room is closed for the night. [hiccups] Settle your debts in chips.",
    howAccomplice: "Tonight the killer has an accomplice. [hiccups] They didn't do it, but they know who did, and they'll lie for them. [short pause] When you lock in, take a guess at the accomplice too.",
    revealAccomplice: "[short pause] And the a- a- accomplice who helped them is…",
  },
  adult: {
    doors: "[warm, smoky voice] Welcome to the Velvet Room. I'm {host}. The tequila came from the bodega this afternoon, [hiccups] and the bodega did its best.",
    doorsReminder: "If you haven't opened your link yet, do it now. [burps] The bouncer has been told you're a narc.",
    rollLocked: "[low, grave] The doors are locked until we figure out which one of you did it. [hiccups] [short pause] Let's meet the suspects.",
    rollCallClose: "And that's the lineup. [short pause] Take a good look. The police sketch artist is drunk. [hiccups]",
    intro3: "[whispers] One of you did it. [short pause] And frankly, we're all a little impressed. [hiccups]",
    intro4: "Phones out. Press and hold your card. [burps] If it says you did it, try to look less pleased about it.",
    round1: "Round one. Search the house, find the markers, and question everyone. [clears throat] Everyone.",
    round2: "Round two. Fresh evidence just came in, still warm. [burps] Pardon me.",
    oneMinute: "Sixty seconds. [sneezes] Hurry it up, you overdressed herd of snails.",
    twist: "[building] Hold on to something. [farts] [short pause] Not that.",
    accuseLastCall: "Thirty seconds left. Lock it in. [hiccups] Lock it in.",
    reveal1: "[long pause] The person who murdered Don Ray Sanders, in his own club, in front of his own espresso martini, is… [hiccups] is…",
    verdictDetectives: "Justice, for once in New York. No cap. [short pause] The killer is c- c- caught, and is welcome to blame the tequila.",
    awards: "And now, the awards. [clears throat] [clears throat again] The trophies are real. The talent is debatable.",
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
  doors: "[warm, smoky voice] Welcome to the Velvet Room. I'm {host}, your host tonight. A place of glamour, of mystery, of sophis- [hiccups] sophisti- [hiccups] [short pause] oh, bollocks to it. A place with tequila.",
  doorsReminder: "Check in on your phone, dumbasses, or so help me [burps] [short pause] I'll do that again. Closer.",
  howCase: "[warm, conspiratorial] Here's how this goes. Any minute now, Don Ray Sanders is going to drop dead, and one of you shifty little rats will have done it. Your phone will tell you if it was you. [short pause] Only the guilty may lie. Everybody else tells the truth. For example: [farts] [short pause] That was me, damnit. See? Honest.",
  howAccomplice: "Tonight the killer has an accomplice: didn't do it, knows who did, will lie for them. Watch for a wink, a nod, a cough. [coughs] [short pause] No, that's just me. Bloody vape. Guess them when you lock in.",
  rollLocked: "[low, grave] The doors are locked until we figure out which one of you did it. Nobody gets in. Nobody gets out. [farts] [short pause] Oh, hell. That's locked in here with us now, too. Let's meet the suspects.",
  rollCallClose: "That's the lineup. [hiccups] All forty of you. Shit, I'm seeing double.",
  intro1: "[low, gravelly voice] New York City. [burps] [short pause] Damnit. [short pause] New York City. October 31st, 2026. [long pause]",
  intro2: "Tonight, Don Ray Sanders was found dead. A moment of silence. [long pause] [farts] [short pause] Ah, shit. Moment's over.",
  intro3: "[whispers] One of you did it. [hiccups] [short pause] That was me. [short pause] The hiccup, jackass. Not the murder.",
  intro4: "Check your phone. Press and hold your card. Keep it to yourself, [burps] [short pause] unlike some of us. Freaking tequila.",
  round1: "Round one. Find the markers, question everyone. [burps] [short pause] Not about that. That's private, jackass.",
  round1Waves: "Round one. Only some rooms are open. Search those. [farts] [short pause] Not this one. It's the ass end of Hoboken in here now.",
  round2: "Round two. F- f- fr- [hiccups] [short pause] frick it, damnit. New evidence. Just came in.",
  roomsOpen: "More rooms are open. Go dig, my [hiccups] dumbasses. [short pause] I meant darlings.",
  round3: "Last round. This evidence hits you right in the [sneezes] [short pause] teeth. The teeth, you filthy dumbasses.",
  oneMinute: "One minute left. [coughs] [coughs] [short pause] Forty seconds. Move your asses.",
  twist: "[building] And now, the twist. [burps loudly] [short pause] That was the shrimp, damn it all. Here's the twist.",
  accuse: "Make your accusations. [farts] [short pause] Not about that, jackass. The murder, for crying out loud.",
  accuseLastCall: "Thirty seconds. [hiccups] Twenty-nine. [hiccups] Oh, to hell with it. Lock it in.",
  voteJail: "Who goes to jail? Vote on your phone. You can pick nobody. [burps] [short pause] Or me. I smell like a Port Authority crapper.",
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
  verdictKiller: "The most votes missed. The killer walks. Let's hear it for the detectives. [farts] [short pause] That's all you get, dumbasses.",
  awards: "The awards. I'd like to thank the Academy, [hiccups] and my liver, which has been through hell.",
  awardDetective: "Best Detective. Sharp eyes, sharp mind, sha- [sneezes] [short pause] shit. Sharp everything. It goes to…",
  awardDressed: "Best Dressed, [burps] [short pause] not me, damnit, goes to…",
  awardPrimeSuspect: "Prime Suspect, the innocent one you damn near sent to Rikers, [hiccups] goes to…",
  awardGotAway: "The Got Away With It award goes to someone who [hiccups] [short pause] fooled every damn one of you. It goes to…",
  releaseCleared: "No vote needed. The evidence cleared the jailbird. [burps] [short pause] Open the damn cell.",
  goodnight: "We're closed. Settle up in chips, and [burps] [short pause] get the hell out. Lovingly.",
  paused: "Everybody shut the hell up. [burps] [short pause] Including me, apparently.",
  resumed: "Carry on. [sneezes] [short pause] Nobody? Bless me, then. Wankers.",
  soundCheck: "Sound check. One, two. [burps loudly] [short pause] That's the bass. If your drink rippled, the TV works. Hell yes.",
};
export const D_PCT = 10;

/** Sailor mode's script: Joel, furious, swearing hard (two versions a line). Lines it lacks fall back to Adult. */
export const SAILOR: Partial<Record<CueKey, string[]>> = {
  doors: [
    "[seething] Shit. Welcome to the Velvet Room. I'm {host}, your host, God help every one of you bastards. [shouting] And if one more son of a bitch asks me where the bathroom is, [suddenly calm] it's down the hall. On the left. Fuck.",
    "[through gritted teeth, trying to sound warm] Welcome to the Velvet Room. I'm {host}, your fucking host. [shouting] Coats on the hooks, drinks at the bar, and nobody, NOBODY, touches the goddamn DJ booth. [dead serious] The DJ knows what he did.",
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
  rollLocked: [
    "[low, grave, seething] The doors are locked. [shouting] LOCKED! Nobody leaves until we know which one of you sick bastards did it. [dead serious] Bathroom breaks will be supervised by the Don's parrot. [short pause] Let's meet the suspects.",
    "[low, grave, through gritted teeth] The doors are locked, the windows are painted shut, and the coat check has your keys. The coat check is a vindictive little prick. [short pause] Nobody leaves till we know who did it. Let's meet the suspects.",
  ],
  rollCallClose: [
    "[through gritted teeth] Shit, bastard, hell. That's everyone. [short pause] Remember these faces.",
    "[growling] That's the lineup. [short pause] Remember these faces. Every one of them is sus as fuck.",
  ],
  intro1: [
    "[low, gravelly voice, seething] New York City. October 31st, 2026. [long pause] Fuck.",
    "[low, gravelly voice] Goddamnit. [short pause] New York City. October 31st, 2026. [long pause]",
  ],
  intro2: [
    "[growling] The Velvet Room lost its owner. Don Ray Sanders is dead. [shouting] He owed me eleven dollars on Venmo, you sons of bitches!",
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
    "[seething] Fifteen seconds. The DMV moves faster than this, and the DMV is where hope goes to die. [growling] Vote, assholes.",
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
    "[long pause] [barely holding it together] The shit-heeled, Venmo-dodging bastard who killed Don Ray Sanders is…",
    "[long pause] [growling] The killer of Don Ray Sanders, the rat, the prick, the fucking weasel, is…",
  ],
  reveal2: [
    "…right here, drinking my fucking espresso martini.",
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
    "[through gritted teeth] Got Away With It. For the slippery son of a bitch who played every one of you like NPCs. [dead serious] It goes to…",
  ],
  goodnight: [
    "[roaring] We're closed! Pay your tab and get the hell out! [suddenly tender] Share your location.",
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
    "They found the poor old guy in {room}. Rest easy, king.",
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
    "{name}. Didn't do it, didn't stop it, and didn't even ask for a cut. Total NPC behavior.",
    "{name}. Saw everything, said nothing, and smiled at you all night like a choirboy. The sneaky little rat.",
    "{name}, you two-faced jackass. You helped us look for the killer. For an hour.",
    "{name}. Loyal as a dog, and about as much use in court.",
  ],
  jailed: [
    "{name} is going to Rikers. Bring a sweater and a good lawyer. Mostly the lawyer.",
    "{name} is going upstate. Text us if you learn a trade.",
    "{name}, you're going to jail, where you'll search nothing, vote on nothing, and help exactly as much as before.",
    "{name} goes to jail. Sit your ass down and think about what you did.",
    "{name} is locked up. The rest of you, act natural, and stop looking so bloody relieved.",
  ],
  released: [
    "{name} walks. The judge says you're welcome, and thanks for the Venmo.",
    "{name} is out, on good behavior, which is a first.",
    "{name} is out. The cell would like an apology and a mop.",
    "{name} is out already? Damn. People wait longer for a table at Carbone, and you did ten minutes.",
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
    "{name}. [seething] In my club. With my tequila in your hand. [screaming] You absolute bastard!",
    "{name}! [furious] I let you use my phone charger, you treacherous prick!",
  ],
  accomplice: [
    "{name}. [growling] The Uber driver, minus the car, minus the five stars. Bastard.",
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
      "Into the cell, {real}. You weren't finding anything out here anyway, you NPC.",
      "{real} is locked up. The jail didn't want you either. It's doing us a favor.",
      "{real} is behind bars. Best look you've had all night.",
      "{real} is going upstate. Don't text.",
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
      "{real} stays in jail. The parole board is three espresso martinis deep and still said no.",
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
      "{real} is out. The judge took the bribe and called you mid. He was right, {real}.",
      "{real} walks free. Move it, {real}, before we change our damn minds.",
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
      "{real}, any day now. It's literally three taps.",
      "We're all waiting on {real}. As usual.",
      "{real} is still thinking. First time for everything.",
      "{real}: who, what, where. Three taps. The rest of us managed.",
      "Last call for {real}. The rest of us have aged.",
    ],
    adult: [
      "{real}, hurry up. It's three taps, not the terms and conditions.",
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
      "[dead serious] {real} is still thinking. [flat] {real} hasn't thought all night, the tequila-soaked bastard.",
      "[dead serious] Every one of you has locked in. Except {real}. [short pause] For fuck's sake, {real}.",
    ],
  },
  caught: {
    classic: [
      "{real}, caught red-handed. Try to look less pleased with yourself.",
      "Case closed. {real} did it, and {real} was the last to know we knew.",
      "{real} is the killer, and a lousy liar.",
      "{real}, it's over. Put the phone down and come quietly.",
      "Nice try, {real}. You fooled nobody, with real confidence.",
      "{real} did it. Not well. But {real} did it.",
    ],
    adult: [
      "Caught in 4K, {real}. Your alibi was mid, and your poker face was a white flag.",
      "{real}, you did it, and you did it badly.",
      "Got you, {real}. Tell it to the judge. He doesn't believe you either.",
      "{real}, caught by this crowd. This crowd, {real}. That's like getting outrun by a parked Citi Bike.",
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
      "{real}: killer, liar, winner. Everyone else: background characters.",
    ],
    adult: [
      "{real} did it and walked. You had the evidence, and you got played like NPCs.",
      "{real} got away with murder in a room full of detectives. Some detectives.",
      "{real} is free, smug and buying the next round. The rest of you got finessed.",
      "{real} walks. Somewhere, a true-crime podcast just found its next season.",
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
      "{real} is innocent. Most of you said otherwise. Most of you are delulu.",
      "Sorry, {real}. You didn't do it. You just have a guilty face. It's giving mugshot.",
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
      "{real}, Best Detective. You'll be insufferable about this until Christmas. Main character behavior.",
      "{real} cracked it while the rest of you NPCs licked the cheese plate.",
      "Best Detective, {real}. Don't let it go to your head. There's not much room up there.",
      "{real} solved the murder, which in this crowd is like being the tallest kid at day care.",
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
      "{real}, Best Dressed. The outfit's a ten. The alibi is a two.",
      "Best Dressed, {real}, who looks like a Met Gala headliner and thinks like a coat rack.",
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
    "Introducing {real}{aka}. Here on a dare, staying for the free Wi-Fi.",
    "Next, {real}{aka}, who has already lost their coat-check ticket.",
    "Say hello to {real}{aka}, who was told this was a book club.",
    "Please welcome {real}{aka}. The bouncer checked their ID twice and let them in anyway.",
    "Late, as always: {real}{aka}.",
    "Here is {real}{aka}, who splits the check to the penny.",
    "Ladies and gentlemen, {real}{aka}. Try not to make any sudden moves.",
    "From the cheap seats: {real}{aka}.",
    "Fresh off the subway and still lost: {real}{aka}.",
    "Wanted for questioning in three counties: {real}{aka}.",
    "Here is {real}{aka}. The DJ has agreed to keep playing anyway.",
    "Next up, {real}{aka}, who owes everyone in this room twenty bucks on Venmo.",
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
    "{real}{aka}. Already lying. Caught in 4K.",
    "Fished out of the East River, unfortunately: {real}{aka}.",
    "Mugshot number four hundred and twelve: {real}{aka}.",
    "Lock up the silverware: {real}{aka}.",
    "Trouble, party of one: {real}{aka}.",
    "The flat tire of the evening: {real}{aka}.",
    "Banned from two rooftop bars and a Chuck E. Cheese: {real}{aka}.",
    "Nobody invited them. Main character energy anyway: {real}{aka}.",
    "Smells like tequila, vape smoke and bad decisions: {real}{aka}.",
    "The most delulu person in Manhattan, and that's a hell of a competition: {real}{aka}.",
    "{real}{aka}. Looks innocent. That's exactly why they're so damn sus.",
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
    "[shouting] Who invited {real}{aka}?! [dead serious] I'm firing the bouncer. Goddamnit.",
    "[seething] {real}{aka}. Banned from my club in 2019. [roaring] And yet, here you fucking are!",
    "[through gritted teeth] Smile for the mugshot, {real}{aka}. Bastard.",
    "[growling] {real}{aka}. [dead serious] I've seen better faces on a fish. A dead fish. Shit.",
    "[roaring] Everybody hide your tequila! It's {real}{aka}! Damnit!",
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

/** What the roll call says about one guest: who they are, and (cast) their nickname; Oct 18: their joke. */
export type RollParts = { name: string; real: string; nickname?: string; seed?: string; cast?: boolean; pick?: number };

/** One guest's roll-call line: the introduction, with their own joke. Oct 20: no motive (Heston: "Motives: cut them"). */
export function rollNarration(tone: Tone, p: RollParts) {
  return { text: rollIntro(tone, p.name, p.real, p.seed, p.cast, p.nickname, p.pick) };
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
