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
      "A message from management: {real}, please stop describing the {weapon} as decorative.",
      "Update from the coat check: {real}'s coat has asked to go home with someone else.",
      "Police bulletin: be on the lookout for {real}. Last seen near the snacks. Armed with the {weapon}, and hungry.",
      "This just in: {real} has been searching the same drawer for six minutes. The drawer would like some privacy.",
      "The bartender reports that {real} has been investigating the gin. Thoroughly. Repeatedly.",
      "The Don's lawyer has asked me to read a statement: {real} is not in the will. {real} was never going to be in the will.",
      "Medical update: {real} is fine. {real}'s judgment remains in critical condition.",
      "Weather report for the corner where {real} is standing: overcast, with a strong chance of lying.",
      "Lost and found: one sense of shame, belonging to {real}. It's been in the box since 1925.",
      "{real} has asked me to tell everyone that {real} is not the killer. [short pause] That's exactly what the killer would ask me to say.",
      "Notice to all guests: {real} keeps patting the {weapon} and smiling. Nobody stand behind {real}.",
      "The band has a request for {real}. It's called Please Sit Down.",
      "Breaking news: {real} has found a clue. [short pause] Correction: {real} has found a coaster.",
      "Telegram for {real}. It says, stop. That's the whole telegram.",
      "Stock report: shares in {real} have lost ninety percent of their value since the doors opened. Wall Street calls it a correction. Everyone who's met {real} calls it overdue.",
      "From the racing desk at Belmont Park: {real} is now the favorite to be the killer, mostly because {real} has the look of a horse that's done something.",
      "Insurance finding on the {weapon}: total loss. No damage was reported until {real} got involved.",
      "Help wanted: one alibi for {real}. Must be discreet, free tonight, and comfortable lying to police. Tammany Hall need not apply. They're already on the payroll.",
      "Police file on {real}, known associates: the {weapon}, one bartender, and nobody else. Nobody else would sign.",
      "Dispatch from Hell's Kitchen: the toughest men in New York have heard about {real}. They're not scared. They're confused.",
      "Verdict from the mock trial in the kitchen: {real} is guilty of something. The jury is still working out what, but they're very sure.",
      "Babe Ruth hit sixty home runs this year. {real} found one clue and has told everybody about it sixty times.",
      "{real} has been interrogating the cheese plate like it owes {real} money. It's brie, {real}. It doesn't know a goddamn thing.",
      "The Prohibition agent outside would like a word with {real}. Not about the murder. About the smell.",
    ],
    jab: [
      "{real}. Bless your heart.",
      "{real}: all hat, no cattle.",
      "{real}, you're doing great. For you.",
      "Look at {real}, trying.",
      "{real}, sit down.",
      "{real}: the human equivalent of a warm martini.",
      "{real} has the face of a suspect and the brain of a witness.",
      "{real}. A disappointment in a nice outfit.",
      "{real} couldn't find the bar with a map and a dog.",
      "{real}, nobody's buying it.",
      "Somebody give {real} a hint. Not a clue. A hint about life.",
      "{real}, the Don liked you. That's not a compliment. He liked his parrot too.",
      "{real}: dressed like a millionaire, investigating like a lamp.",
      "{real} is the reason the doors are locked.",
      "{real}: technically present.",
      "{real}, the killer would like to thank you for your contributions.",
    ],
    gag: [
      "Quick note about {real}: no. [short pause] That's the note.",
      "Back to {real} for a moment. Still no.",
      "We promised we'd stop talking about {real}. We lied. This is a murder party.",
      "{real}. Again. At this point it's personal, and {real} knows why.",
      "The management would like to apologize to {real}. [short pause] The management has been advised not to.",
      "And one more for {real}, because it's tradition now, and you can't fight tradition. Sit down, {real}.",
    ],
    aside: [
      "A note from the Don's lawyer: the Don is still dead. Thank you for your attention.",
      "Bulletin from the kitchen: the ice is running low. Somebody used it for something. We're not asking.",
      "If you find a marker under a couch cushion, congratulations. If you find anything else under a couch cushion, that's between you and the couch.",
      "Attention: one of you is a killer, and most of you are out of chips. Only one of those problems is ours.",
      "The band would like to remind everyone that they are being paid in gin, and it's starting to show.",
      "Reminder: the Don's will leaves everything to whoever finds his reading glasses. Nobody is looking for his reading glasses.",
      "Somebody in this room just lied. [short pause] Sorry. Somebody in this room just lied again.",
      "The fire marshal called. He'd like to know how many people are in here. We told him one fewer than before.",
      "Market report: it's October 1929, the stock market is about to fall off a cliff, and somebody in here is still drinking the expensive gin. Bold.",
      "A message from the Prohibition office: there is no alcohol at this party. Please keep pretending.",
      "Housekeeping reminds guests that the guest room is a crime scene tonight. Please keep it that way. Only that way.",
      "A note for the killer: you're doing great. Don't let it go to your head. We'll catch you, but mostly by accident.",
    ],
  },
};

/** The order a night's heckles come in: bits and jabs about the others, the running gag every third or so, asides between. */
const PATTERN: ("bit" | "jab" | "gag" | "aside")[] = ["bit", "gag", "aside", "jab", "gag", "bit", "aside", "jab", "gag", "bit", "jab", "gag", "aside", "bit", "gag", "jab", "aside", "gag", "bit", "jab"];

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
export const SAILOR_HECKLES: Partial<Pools> = {};
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
  let gags = 0;
  let swaps = 0;
  let next = 0;
  const out: HeckleLine[] = [];
  for (const slot of PATTERN) {
    // No gag tonight: its turns go to bits and jabs.
    const kind = slot === "gag" && !gagNight ? (swaps++ % 2 ? "jab" : "bit") : slot;
    let pickd: { t: string; id: string } | undefined;
    let who: HeckleGuest | null = null;
    if (kind === "gag") {
      const i = gags++;
      pickd = pools.gag[i] === undefined ? undefined : { t: pools.gag[i], id: `${poolTag(tone, "gag")}:${i}` };
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
