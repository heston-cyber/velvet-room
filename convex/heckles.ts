// Heckles (Oct 15): the narrator fills the lulls (searching, the lock-in, the votes) with roasts of the guests and
// asides about the night. Heston: "Add in random roasts of a player or jokes during voting and other lull moments",
// "Sometimes it could be funny if its the same player who keeps getting roasted", and "Short punchy insults are
// great too." Each game picks one guest as its running gag, who keeps coming back, a little worse each time.
// Recorded at Start with the guests' real first names (custom lines, like the roll call).
// Oct 16, Heston: "Dont be specific with the jokes, be generic. Follow the funny guidlines i gave you." So every line
// works for any guest (first name and weapon only, no facts about anyone), written to his comedy notes (the v2 rulebook):
// deadpan formats played straight, 1929 New York specifics, no puns, swearing rationed, innuendo only about nobody in
// particular, no marriage jokes. The cast includes family, so nothing suggestive is aimed at a named guest. Weapons
// can be plural ("the gloves"), so no line puts a verb or "it" right after {weapon}.
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { customRecordingText, plain, sprinkle, type Tone } from "./narration";
import { firstOf } from "./roasts";
import { narratorOf, scriptOf, voiceOf, type Wanted } from "./voiceLines";

type Pools = {
  /** A bit about one guest, in a borrowed format (a bulletin, a telegram, a notice). {real}, {weapon}. */
  bit: string[];
  /** Short, straight, punchy. {real}. */
  jab: string[];
  /** The running gag: the same guest, again and again, in this order. {real}. */
  gag: string[];
  /** About the night, nobody named. */
  aside: string[];
};

export const HECKLES: Record<"classic" | "adult", Pools> & { sailor?: Pools } = {
  classic: {
    bit: [
      "A message from management: {real}, please stop offering the {weapon} to people as a party favor.",
      "Update from the coat check: {real}'s coat is fine. {real}'s alibi is not.",
      "Bulletin: {real} has been very quiet for the last few minutes. Make of that what you will.",
      "{real}, the bartender has asked me to ask you to please stop interrogating the ice.",
      "Breaking news: {real} has found a clue. [short pause] Correction: {real} has found a coaster.",
      "The band has dedicated a song to {real}. It's called Are You Sure About That.",
      "Lost and found: one alibi, belonging to {real}. It has holes in it.",
      "A reminder that {real} is still in the building, and still holding the {weapon}. That's all.",
      "{real} has asked me to make it clear that {real} is not the killer. [short pause] Noted. Suspiciously noted.",
      "Telegram for {real}. It says, stop. That's the whole telegram.",
      "Stock report: shares in {real} opened strong and have been falling all evening. Analysts blame the {weapon}.",
      "From the racing desk at Belmont Park: the odds on {real} being the killer just went from fifty to one, to five to one. Somebody knows something.",
      "Help wanted: one honest person to vouch for {real}. Good pay. Short hours. Nobody has applied.",
      "Police file on {real}. Height: average. Build: average. Alibi: well below average.",
      "Insurance notice: the {weapon}, covered for fire, flood and theft. Not covered: {real}.",
      "Radio bulletin: Babe Ruth hit sixty home runs this year. {real} has found zero clues. Both are records.",
      "Classified ad: for sale, the {weapon}, barely used, no questions asked. Contact {real}. Or, actually, the police.",
      "The detective's notebook, entry nine: {real} smiled at me just now. I did not care for it.",
      "Society pages: {real} wore a lovely outfit tonight, and the face of someone who has never even seen the {weapon}. Very convincing.",
    ],
    jab: [
      "{real}. Bless your heart.",
      "{real}, you're doing great. For you.",
      "Look at {real}, trying.",
      "{real}: all hat, no cattle.",
      "{real}, nobody's buying it.",
      "{real}, the Don liked you. He liked his parrot too.",
      "{real} has the face of a suspect and the brain of a witness.",
      "Somebody give {real} a hint.",
      "{real}, that's not a clue. That's a napkin.",
      "{real}: confident, wrong, and still talking.",
      "{real} has checked under the same rug three times. The rug is innocent.",
      "{real}, the killer thanks you for your help.",
    ],
    gag: [
      "Quick note about {real}: we're watching you.",
      "Back to {real}. Still watching.",
      "{real} again. We can't help it, and neither can {real}.",
      "We promised we'd stop mentioning {real}. That was a lie. Lies happen here.",
      "This one's for {real}. {real} knows why.",
      "And one more for {real}, because it's tradition now.",
    ],
    aside: [
      "A note from the Don's lawyer: the Don is still dead. Thank you for your attention.",
      "Reminder: the snacks are evidence-free. Probably.",
      "If you think you've found every marker, check again. Then check your conscience.",
      "Somebody in this room just lied. [short pause] Somebody just did it again.",
      "The band would like to remind everyone that they are being paid in gin.",
      "The fire marshal called. He'd like to know how many people are in here. We told him one fewer than before.",
      "Reminder: the Don's will leaves everything to whoever finds his reading glasses. Nobody is looking for his reading glasses.",
      "Market report: it's October 1929, and everyone is feeling very confident about the stock market. That's all. Just making a note.",
      "Police note: the killer is somewhere in this room. So is the snack table. Only one of them is being thoroughly searched.",
      "A reminder from management: the Don's chair is still reserved. The Don will not be needing it.",
    ],
  },
  adult: {
    bit: [
      "Western Union, for {real}: 'We know what you did. Stop. We don't know what you did. Stop. Stop doing it anyway. Stop.'",
      "A fortune teller at Coney Island read {real}'s palm, said 'oh, shit,' and gave back the nickel.",
      "Sworn testimony of {real}: 'I was in the kitchen the whole time.' Sworn testimony of the kitchen: 'Bullshit.'",
      "Insurance update: the Don was covered for acts of God. Claim denied. God has confirmed, in writing, that {real} was not His idea.",
      "Ticker report: {real} is down forty points. Brokers advise selling at any price. Brokers will now pay you to take {real}, and they'll throw in a goddamn Packard.",
      "Federal agents raided this club in the spring. They seized forty cases of gin, two roulette wheels and {real}. Next morning, they sent {real} back with a note: 'No, thank you.'",
      "Doctor's note, excusing {real} from tonight's investigation: 'Patient suffers from a chronic condition. The condition is being a pain in the ass. There is no known cure, and I've stopped looking.'",
      "The bail bondsman on Centre Street has put up a new sign: 'No checks. No dogs. No {real}.'",
      "The police ran a lineup. Three witnesses picked {real}. So did the bartender, the coat check, and a dog that wasn't even here tonight.",
      "Booking sheet, Ninth Precinct. Name: {real}. Charge: pending. Distinguishing marks: none. Distinguishing anything: none. Officer's note: 'Jackass.'",
      "Live on the radio: here's {real} at the evidence. Picks it up. Looks at it. Puts it back exactly where it was. Folks, I've called the World Series, and what the hell was that?",
      "Dance marathon update: {real} has been the prime suspect for fifty-one straight minutes. The record is fifty-two. Dig deep, {real}. Don't you quit on us now, you magnificent bastard.",
      "The Times keeps an obituary on file for every important New Yorker. They've written one for {real}, just in case. It's three words long: 'Oh. Well. Anyway.'",
      "Horn and Hardart's Automat now has {real} behind one of the little glass doors. Price: one nickel. Nobody's taken one since the freaking Coolidge administration.",
      "Classified ad, Daily News: For sale, the {weapon}. Barely used. One owner. Please do not ask {real} what 'barely' means.",
      "Arnold Rothstein got shot last year and wouldn't name the shooter, God rest the son of a bitch. {real} has been here an hour and has named eleven suspects and a coat rack.",
      "The bootlegger's ledger, page nine: {real}. Owes nine dollars, four favors, and one fucking explanation for the {weapon}.",
      "The bouncer has put {real} on the list. Not the guest list. The other list. The one with the photographs and the shovel.",
      "Sworn statement from the bartender regarding {real}: 'I didn't see nothing, I don't know nothing, and I wish {real} would quit giving me the freaking thumbs-up like we planned this.'",
      "The Bartenders' Union has filed a grievance about {real}. It's one page long. Most of it is the word 'why,' in capitals. At the bottom, in pencil, somebody's added 'prick.'",
      "Report card for {real}. Searching: F. Questioning: F. Lying: A-plus. The teacher wrote 'please see me,' crossed it out, and wrote 'actually, piss off.'",
      "Ransom note, found under the door: 'We have {real}. Leave twenty dollars on Mulberry Street.' An hour later, a second note: 'Forget the money. Come get {real}, damnit. We'll pay you.'",
      "Joe Kennedy says when the shoeshine boy starts giving you stock tips, it's time to sell. The shoeshine boy outside just gave us a tip: sell {real}.",
      "The Hell's Kitchen gangs voted on who in this room they'd least like to share a cell with. It wasn't close, {real}. One of them cried, and that son of a bitch has killed eleven men.",
      "The jury for {real}'s trial has been chosen. Eleven want guilty. The twelfth wants guilty, a drink, and to never hear {real} say another bloody word.",
      "We hooked {real} up to the new lie detector. We asked {real}'s name, and the needle jumped. We asked about the {weapon}, and the whole damn machine caught fire.",
      "The telephone operator has been listening in on {real} all night. She'd like to stop. She's asked for a transfer to Philadelphia. Nobody asks for fucking Philadelphia.",
      "[low, grave] The night was cold. The gin was warm. And {real} was standing too close to the {weapon} again, like a dog near a dropped ham sandwich.",
      "Police wiretap, nine-fourteen p.m. First voice: 'Is {real} still there?' Second voice: 'Yeah.' First voice: 'Shit.' [short pause] End of transcript.",
      "Yankees scouting report on {real}: can't hit, can't catch, can't run, lies to the umpire. Recommendation: trade to Boston. Boston will take any old crap.",
      "The Don's will mentions {real} exactly once, in the section titled 'Under No Circumstances.'",
      "The pawnbroker on the Bowery took one look at the {weapon}, one look at {real}, and paid {real} a dollar to get the hell out.",
      "The Department of Sanitation came by for {real} at six. They were very polite about it, but they were firm.",
      "Movietone newsreel: and here we see {real}, investigating. Note the furrowed brow. The steady hand. The total absence of a single fucking clue.",
      "Inventory of {real}'s pockets: one handkerchief, two dice, three of the Don's cigars, and a note in {real}'s own handwriting that says 'act natural, dumbass.'",
      "Field report from the Prohibition agent hiding in the hall closet: '{real} has opened this closet four times, looked right at me, and closed it again. Is this a trap, or is {real} dumb as a box of rocks? Please advise.'",
      "President Hoover says the economy is fundamentally sound. {real} says {real} is innocent. Those are the two biggest loads of horseshit told in America this week.",
      "The Ziegfeld Follies are casting the back end of a horse. They saw {real} and said, 'Perfect. No notes.'",
      "Velvet Room house rules. One: no cops. Two: no rats. Three: no {real}. Rule three went up tonight, about ten minutes after {real} touched the goddamn piano.",
      "Expert opinion from Scotland Yard, brought over at great expense: {real}'s alibi is, quote, 'complete bollocks.' He's on the next boat home.",
    ],
    jab: [
      "{real}, you absolute sack of doorknobs.",
      "{real}, you couldn't find the bar in a freaking speakeasy.",
      "{real}, even the Don thinks you're slow, and the Don is dead.",
      "{real}: Hoboken, in human form.",
      "{real}, you've been wrong so often the Yankees want you as an umpire.",
      "{real}, if brains were bathtub gin, you couldn't get a fly drunk.",
      "{real}, you're as subtle as a tommy gun at a christening.",
      "{real}, you've got the poker face of a golden retriever who just shit on the rug.",
      "{real}, next to you, the stock market looks like a sure damn thing.",
      "{real}, you've got the face of an altar boy and the alibi of a goddamn pickpocket.",
      "{real}, you're about as honest as a Tammany ballot box.",
      "{real}, sit the hell down.",
      "{real}, piss off. Politely. But piss off.",
      "{real}, you're a douchebag. That word won't exist for forty years. You'll inspire it.",
      "{real}, you dickhead. Sorry. There's no other word, and I looked.",
      "{real}, you bloody menace. Somebody put a bell on you.",
      "{real}, you ass. Respectfully. No. Not respectfully.",
      "{real}, you've got shit for brains, and the shit is embarrassed.",
      "{real}, you're a fucking delight. Go away.",
      "{real}, everything you've said tonight is bollocks. That's British for horseshit.",
      "{real}, your theory is crap, your alibi is crap, and your shoes are lovely.",
      "{real}, the Don hated you, and he was an excellent judge of assholes.",
      "Damnit, {real}. Just. Damnit.",
      "{real}, you have the alibi of a raccoon in a trash can.",
      "{real}, the killer would like to send you a fruit basket.",
      "{real}, you've got the instincts of a detective and the results of a jackass.",
      "{real}, you couldn't sell gin during Prohibition, and every dumbass in New York does.",
      "{real}, the cops have been paid off and they still won't vouch for you.",
      "{real}, you're not a suspect. Nobody thinks you could pull it off.",
      "{real}, you look guilty as sin just standing there. Imagine if you moved.",
    ],
    gag: [
      "Before we go on, a quick word about {real}. [short pause] No. Actually, I'll wait. It's a long night, and I want to pace myself.",
      "Management has opened a file on {real}. It's empty. Management just likes knowing it's there, like a fire exit. Or a shotgun under the bar.",
      "The staff have signed a petition about {real}. The bartender signed. The band signed. The coat check signed twice. It just says, 'Make it fucking stop.'",
      "The {real} file has been sent to the Ninth Precinct. It came back unopened, with a note: 'Not our problem, asshole.'",
      "Tammany Hall has rigged elections, judges and the fifth race at Belmont. They took one look at {real} and said, quote, 'Are you shitting me? Not even us.'",
      "Mayor Jimmy Walker has proclaimed tonight {real} Night in New York City. Citizens are to know where {real} is at all times. Do not feed {real}. And for God's sake, do not ask {real} for a theory.",
      "Governor Roosevelt has telephoned from Albany. He'd like me to stop sending him telegrams about {real}. So I've sent him one more, telling him to kiss my ass.",
      "I'll be honest, I've lost all perspective on {real}. I've started a scrapbook. It's called 'Evidence.' Three hundred pages, and not one of them is about the bloody murder.",
      "J. Edgar Hoover has opened a federal file on {real}. It's now thicker than Al Capone's, and every damn page is in my handwriting.",
      "Final notice. By order of the Mayor, the Governor, Tammany Hall, the Bureau of Investigation and me, personally, {real} is banished from New York City. Hoboken has been notified. Hoboken has refused delivery.",
    ],
    aside: [
      "A reminder from management: the coat room is for coats. Mostly coats. Whoever's in there, finish up and give the mink back. It's not yours, and it's seen enough.",
      "The gin tonight was made fresh this afternoon by a man named Sal, in a bathtub, which Sal was in at the time.",
      "Somebody in this room is a murderer. Somebody else is wearing somebody else's underwear. Only one of those is our business.",
      "Reminder: the guest room is a crime scene, and the door is locked. Whoever's in there anyway: we can hear you, and so can Brooklyn.",
      "The police have arrived. They've been paid off. They're in the kitchen now, eating the evidence, the greedy pricks.",
      "A message from Tammany Hall: thank you all for voting in next month's election. Your votes have already been counted. Several of you voted twice, and one of you has been dead since 1911.",
      "Somebody's been drinking out of the flower vase. I'm not saying who. I'm saying the flowers were still in it.",
      "To whoever's been necking in the hallway: congratulations, you're each other's alibi. Unfortunately, now everybody knows.",
      "The neighbor upstairs has complained three times. Once about the music, once about the murder, and once about whatever the hell is happening in the bathtub, which is where we make the gin.",
      "The Volstead Act makes it illegal to make, sell or move liquor. It says nothing about drinking it. So cheers, you lawless sons of bitches.",
      "Bloody hell. Somebody's drunk the Don's private stock. He's dead, so technically it isn't stealing. It's inheritance.",
      "There's no ice machine. It's 1929. A man named Gus brings the ice. Gus is late. Gus is always fucking late. Frankly, I think Gus did it.",
      "Please stop putting shit in the punch bowl. So far: a pocket watch, a cigar, and something we've all agreed never to discuss.",
      "The Don's parrot has picked up some new words tonight. It just called the bartender a wanker, and nobody in this building is even British.",
      "Reminder: when the lights go out, keep your hands where everybody can see them. Not because of the murder. Last year it was a whole damn thing.",
      "Some of you are drinking like the stock market's about to crash. In fairness, it bloody is.",
      "Things found under the couch so far: three markers, a cigar, a garter and somebody's dignity. Only the markers are evidence. The dignity is beyond saving.",
      "Please do not feed the Don. He's dead, it's bad for him, and some jackass has already tried.",
      "The Prohibition agent outside has been told this is a prayer meeting. If he comes in, everybody kneel and look sorry. Some of you look like you've done this before.",
      "Bathtub gin safety tip: if you can see through it, it's water. If you can see through time, put it the fuck down.",
      "Someone has written 'the butler did it' on the bathroom mirror. There is no butler. Whoever wrote that, you're a smartass, and now you're a suspect.",
      "Please stop resting your drinks on the Don. He's evidence, not a goddamn coaster.",
      "The stock market fell forty points today. A broker on Wall Street was overheard saying a word I can't repeat. [short pause] It was 'motherfucker.' He said it forty times. One for each point.",
      "Three gins at the bar tonight: the good gin, the bathtub gin, and a jar with a label that just says 'no.' Stay the hell away from 'no.'",
    ],
  },
};

/** The order a night's heckles come in: bits and jabs about the others, the running gag every third or so, asides between. */
const PATTERN: ("bit" | "jab" | "gag" | "aside")[] = ["bit", "gag", "aside", "jab", "gag", "bit", "aside", "jab", "gag", "bit", "jab", "gag", "aside", "bit", "gag", "jab", "aside", "gag", "bit", "jab"];
/**
 * A gag night (Oct 16, every third game on a laptop: "single one player out and continuously roast that one player
 * randomly in conjunction with the other jokes"): longer, with the gag every third heckle, its arc played in order
 * from the first line to the last.
 */
const GAG_PATTERN: ("bit" | "jab" | "gag" | "aside")[] = ["bit", "gag", "aside", "jab", "gag", "bit", "aside", "gag", "jab", "bit", "gag", "aside", "jab", "gag", "bit", "aside", "gag", "jab", "bit", "gag", "aside", "jab", "gag", "bit"];

/** The gag lines a night plays, in order: always the first and the last, and as many from between as fit. */
function gagArc(lines: string[], slots: number, seed: string): number[] {
  const n = lines.length;
  if (n <= slots) return lines.map((_, i) => i);
  const middle = shuffled(Array.from({ length: n - 2 }, (_, i) => i + 1), `${seed}|gag`).slice(0, slots - 2).sort((a, b) => a - b);
  return [0, ...middle, n - 1];
}

const hashOf = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
/** A shuffle that's the same for the same seed (so the server, the TV and the recordings agree). */
function shuffled<T>(xs: T[], seed: string): T[] {
  const out = [...xs];
  let h = hashOf(seed) || 1;
  for (let i = out.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type HeckleGuest = { id: string; real: string; weapon: string; figure: string | null };
export type HeckleLine = { purpose: string; text: string; target: string | null; figure: string | null; gag: boolean; /** Which line of which pool ("adult:bit:12"), so a laptop can avoid it next game. */ id: string };

/** Sailor mode's heckles (Duke, furious). Until they're written, Adult's. */
export const SAILOR_HECKLES: Partial<Pools> = {
  bit: [
    "[seething] A message from management. {real}, put the {weapon} down. [roaring] Put the goddamn {weapon} DOWN! [dead serious] Thank you.",
    "[dead serious] Police bulletin. Be on the lookout for {real}. Last seen near the snacks, armed with the {weapon}, and acting like a shifty little prick. [shouting] Which is normal! For {real}!",
    "[growling] Telegram for {real}. It says: stop. [short pause] Stop, you son of a bitch. Stop. Full stop. That's the whole fucking telegram.",
    "[through gritted teeth] Stock report. Shares in {real} opened at nothing and have been falling all bastard night. [screaming] It's October 1929! Everything is falling! {real} is falling FASTER!",
    "[dead serious] From the racing desk at Belmont Park: {real} is now the favorite to be the killer. [roaring] Ten to one! I put forty dollars on {real}, so act guilty, goddamnit!",
    "[growling] Insurance finding on the {weapon}. Covered for fire, flood and theft. [shouting] Not covered: {real}! Nobody covers {real}! Not Lloyd's of fucking London!",
    "[barely holding it together] {real} has been searching the same drawer for six minutes. It's a drawer, {real}. It's got spoons in it. [screaming] SPOONS, you dense bastard!",
    "[seething] Police file on {real}. Height: average. Build: average. Alibi: [shouting] dog shit!",
    "[through gritted teeth] The bartender reports that {real} has been investigating the gin. Thoroughly. Repeatedly. [roaring] That's my gin, you thirsty son of a bitch!",
    "[dead serious] Dispatch from Hell's Kitchen: the toughest men in New York have heard about {real}. They're not scared. They're confused. [growling] I'm confused. Fuck.",
    "[seething] Notice to all guests: {real} keeps patting the {weapon} and smiling. [shouting] Nobody stand behind {real}! Nobody! Shit!",
    "[dead serious] {real} has been interrogating the cheese plate for ten minutes. [screaming] It's cheese, {real}! It didn't see shit!",
    "[growling] Classified ad: for sale, the {weapon}, barely used, no questions asked. Contact {real}. [shouting] Or don't! Call the cops, for shit's sake!",
    "[seething] The detective's notebook, entry nine: {real} smiled at me just now. [shouting] I did not care for it! Wipe that shit off your face, {real}!",
    "[dead serious] Radio bulletin: Babe Ruth hit sixty home runs. {real} has found zero clues. [roaring] ZERO! The Babe drinks more than you do, {real}! What's your fucking excuse?!",
    "[through gritted teeth] Weather report for wherever {real} is standing: overcast, with a hundred percent chance of bullshit.",
  ],
  jab: [
    "{real}. [growling] Sit the fuck down.",
    "{real}, [dead serious] you magnificent dumbass.",
    "{real}: all hat, no cattle, no fucking clue.",
    "{real}. [short pause] No. [short pause] [roaring] Fuck no.",
    "{real}: a disappointment in a nice outfit. A well-dressed bag of crap.",
    "{real} couldn't find the bar with a map, a dog and a priest. [short pause] Bollocks.",
    "{real}: dressed like a millionaire, investigating like a fucking lamp.",
    "Look at {real}. Trying. [roaring] Stop fucking trying!",
    "{real} has the face of a suspect and the brain of a goddamn witness.",
    "{real}. [dead serious] Dickhead.",
    "[seething] Shit, fuck, damn. [flat] Oh. It's {real}.",
    "{real}, [growling] I've met smarter gin. [short pause] Bathtub gin, you dipshit.",
    "{real}, you're the reason the doors are locked, you son of a bitch.",
    "{real}, you gin-soaked douchebag.",
    "{real}: confident, wrong, and still fucking talking.",
    "[through gritted teeth] {real}. You absolute wanker. [short pause] I don't know what it means. I mean it.",
  ],
  gag: [
    "[dead serious] Quick note about {real}. No. [short pause] That's the note. [short pause] Prick.",
    "[growling] Back to {real}. Still no. [short pause] Still fucking no.",
    "[seething] I promised I'd stop talking about {real}. I lied. This is a murder party. Shit happens.",
    "[through gritted teeth] {real}. Again. I don't want to. I have to. [shouting] It's a sickness, {real}, and you are the goddamn disease!",
    "[barely holding it together] Management would like to apologize to {real}. [short pause] [roaring] Management has been advised not to! By me! To hell with {real}! Shit!",
    "[screaming] {real}! {real}! {real}, you son of a bitch! [short pause] [dead serious] Sit down. It's tradition now. [whispers, furious] Fuck tradition. Sit down.",
  ],
  aside: [
    "[dead serious] A note from the Don's lawyer: the Don is still dead. [roaring] STILL DEAD! [suddenly calm] Thank you for your goddamn attention.",
    "[seething] Bulletin from the kitchen: the ice is running low. Somebody used it for something. [shouting] I'm not asking! I don't want to know! Shit!",
    "[growling] The band would like to remind everyone they're being paid in gin. [furious] The band has drunk the gin. There is no band now. Fuck.",
    "[through gritted teeth] Market report: it's October 1929, and somebody in here is still drinking the expensive gin. [screaming] The market is about to collapse, you optimistic bastard!",
    "[dead serious] Reminder: the Don's will leaves everything to whoever finds his reading glasses. [shouting] Nobody is looking for the motherfucking reading glasses!",
    "[barely holding it together] If you find a marker under a couch cushion, good. If you find anything else under a couch cushion, [dead serious] that's between you and the couch, you nasty bastard.",
    "[growling] A message from the Prohibition office: there is no alcohol at this party. [roaring] So who the hell drank all of it?!",
    "[seething] A note for the killer: you're doing great. [dead serious] Don't let it go to your head. [shouting] We'll catch you, you smug little shit, mostly by accident!",
    "[dead serious] The Don's chair is still reserved. The Don will not be needing it. [growling] Whoever's sitting in it, get your ass out of the Don's chair.",
    "[seething] Attention: one of you is a killer, and most of you are out of chips. [roaring] Only one of those is my fucking problem!",
  ],
};
const poolsFor = (tone: Tone): Pools => (tone === "sailor" ? { ...HECKLES.adult, ...Object.fromEntries(Object.entries(SAILOR_HECKLES).filter(([, v]) => v?.length)) } : HECKLES[tone]);
const poolTag = (tone: Tone, kind: string) => `${tone === "sailor" && SAILOR_HECKLES[kind as keyof Pools]?.length ? "sailor" : tone === "classic" ? "classic" : "adult"}:${kind}`;

/** Options a game picked at Start (Oct 16): the running gag only every third game on a laptop, and lines that laptop
 *  heard lately go last. Older games: a gag every game, nothing avoided. */
export type HeckleOpts = { gag?: boolean; avoid?: string[] };

/**
 * A night's heckles, in order. The game's seed picks the running gag's guest, the order of the others and which
 * lines are used, so no line repeats in a game and every replay is different.
 */
export function heckleLines(tone: Tone, seed: string, guests: HeckleGuest[], opts: HeckleOpts = {}): HeckleLine[] {
  if (!guests.length) return [];
  const pools = poolsFor(tone);
  const gagNight = opts.gag ?? true;
  const avoid = new Set(opts.avoid ?? []);
  const order = shuffled(guests, `${seed}|guests`);
  const gagGuest = order[0];
  // Without a running gag, everyone takes turns.
  const others = !gagNight ? order : order.length > 1 ? order.slice(1) : order;
  // Each pool in this game's order, with the lines this laptop heard lately moved to the back.
  const deal = (kind: "bit" | "jab" | "aside") => {
    const tagged = pools[kind].map((t, i) => ({ t, id: `${poolTag(tone, kind)}:${i}` }));
    const mixed = shuffled(tagged, `${seed}|${kind}`);
    return [...mixed.filter((x) => !avoid.has(x.id)), ...mixed.filter((x) => avoid.has(x.id))];
  };
  const left = { bit: deal("bit"), jab: deal("jab"), aside: deal("aside") };
  // New games (that chose at Start) get the longer gag-night order; older games keep theirs.
  const pattern = gagNight && opts.gag !== undefined ? GAG_PATTERN : PATTERN;
  const arc = gagArc(pools.gag, pattern.filter((k) => k === "gag").length, seed);
  let gags = 0;
  let swaps = 0;
  let next = 0;
  const out: HeckleLine[] = [];
  for (const slot of pattern) {
    // No gag tonight: its turns go to bits and jabs.
    const kind = slot === "gag" && !gagNight ? (swaps++ % 2 ? "jab" : "bit") : slot;
    let pickd: { t: string; id: string } | undefined;
    let who: HeckleGuest | null = null;
    if (kind === "gag") {
      const i = arc[gags++];
      pickd = i === undefined ? undefined : { t: pools.gag[i], id: `${poolTag(tone, "gag")}:${i}` };
      who = gagGuest;
    } else {
      pickd = left[kind].shift();
      if (kind !== "aside") who = others[next++ % others.length];
    }
    if (!pickd) continue;
    const text = pickd.t.replaceAll("{real}", firstOf(who?.real ?? "") || "this one").replaceAll("{weapon}", (who?.weapon ?? "weapon").toLowerCase());
    out.push({ purpose: `heckle:${out.length}`, text, target: who?.id ?? null, figure: who?.figure ?? null, gag: kind === "gag", id: pickd.id });
  }
  return out;
}

/** The game's heckles, ready to record: one custom line each, in the game's voice. */
export async function heckleWanted(ctx: QueryCtx, game: Doc<"games">): Promise<(Wanted & { line: HeckleLine })[]> {
  const players = (
    await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect()
  ).filter((p) => p.inGame);
  const weapons = await ctx.db
    .query("weapons")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .collect();
  const guests = players
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((p) => ({ id: p._id as string, real: p.realName, weapon: weapons.find((w) => w.playerId === p._id)?.name ?? "", figure: p.figure ?? null }));
  const n = narratorOf(game);
  const tone = scriptOf(game);
  return heckleLines(tone, game.slug, guests, { gag: game.lines?.gag, avoid: game.lines?.avoid }).map((line) => ({
    purpose: line.purpose,
    caption: plain(line.text),
    text: customRecordingText(sprinkle(line.text, tone, `${game.slug}|${line.purpose}`), n.unstable),
    voice: voiceOf(n),
    line,
  }));
}
