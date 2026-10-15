// Heckles (Oct 15): the narrator fills the lulls (searching, the lock-in, the votes) with roasts of the guests and
// asides about the night. Heston: "Add in random roasts of a player or jokes during voting and other lull moments",
// "Sometimes it could be funny if its the same player who keeps getting roasted", and "Short punchy insults are
// great too." Each game picks one guest as its running gag, who keeps coming back, a little worse each time.
// Recorded at Start with the guests' real first names (custom lines, like the roll call). Drafts for Heston's review.
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { customRecordingText, plain, sprinkle, type Tone } from "./narration";
import { firstOf } from "./roasts";
import { narratorOf, voiceOf, type Wanted } from "./voiceLines";

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

export const HECKLES: Record<Tone, Pools> = {
  classic: {
    bit: [
      "A message from management: {real}, the {weapon} is not a party favor. Please stop offering it to people.",
      "Update from the coat check: {real}'s coat is fine. {real}'s alibi is not.",
      "Bulletin: {real} has been very quiet for the last few minutes. Make of that what you will.",
      "{real}, the bartender has asked me to ask you to please stop interrogating the ice.",
      "Breaking news: {real} has found a clue. [short pause] Correction: {real} has found a coaster.",
      "The band has dedicated a song to {real}. It's called Are You Sure About That.",
      "Lost and found: one alibi, belonging to {real}. It has holes in it.",
      "A reminder that {real} is still in the building, and still holding the {weapon}. That's all.",
      "{real} has asked me to say they're not the killer. [short pause] Noted. Suspiciously noted.",
      "Telegram for {real}. It says, stop. That's the whole telegram.",
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
    ],
    gag: [
      "Quick note about {real}: we're watching you.",
      "Back to {real}. Still watching.",
      "{real} again. We can't help it, and neither can {real}.",
      "We promised we'd stop mentioning {real}. That was a lie. Lies happen here.",
      "This one's for {real}. They know why.",
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
    ],
  },
  adult: {
    bit: [
      "A message from management: {real}, please stop telling people the {weapon} is for decoration.",
      "Update from the coat check: {real}'s coat has asked to go home with someone else.",
      "Police bulletin: be on the lookout for {real}. Last seen near the snacks. Armed with a {weapon}, and hungry.",
      "This just in: {real} has been searching the same drawer for six minutes. The drawer would like some privacy.",
      "The bartender reports that {real} has been investigating the gin. Thoroughly. Repeatedly.",
      "A reminder that {real} is still in the building. That's all. Just a reminder.",
      "The Don's lawyer has asked me to read a statement: {real} is not in the will. {real} was never going to be in the will.",
      "Medical update: {real} is fine. {real}'s judgment remains in critical condition.",
      "Weather report for the corner where {real} is standing: overcast, with a strong chance of lying.",
      "Lost and found: one sense of shame, belonging to {real}. It's been in the box since 1925.",
      "{real} has asked me to tell everyone they're not the killer. [short pause] That's exactly what the killer would ask me to say.",
      "Correction from the roll call: {real} is not as charming as we said. We were being polite.",
      "Notice to all guests: {real} keeps patting the {weapon} and smiling. Nobody stand behind {real}.",
      "The band has a request for {real}. It's called Please Sit Down.",
      "Breaking news: {real} has found a clue. [short pause] Correction: {real} has found a coaster.",
      "Telegram for {real}. It says, stop. That's the whole telegram.",
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
    ],
    gag: [
      "Quick note about {real}: no. [short pause] That's the note.",
      "Back to {real} for a moment. Still no.",
      "We promised we'd stop talking about {real}. We lied. This is a murder party.",
      "{real}. Again. At this point it's personal, and {real} knows what they did.",
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
export type HeckleLine = { purpose: string; text: string; target: string | null; figure: string | null; gag: boolean };

/**
 * A night's heckles, in order. The game's seed picks the running gag's guest, the order of the others and which
 * lines are used, so no line repeats in a game and every replay is different.
 */
export function heckleLines(tone: Tone, seed: string, guests: HeckleGuest[]): HeckleLine[] {
  if (!guests.length) return [];
  const pools = HECKLES[tone];
  const order = shuffled(guests, `${seed}|guests`);
  const gagGuest = order[0];
  const others = order.length > 1 ? order.slice(1) : order;
  const left = { bit: shuffled(pools.bit, `${seed}|bit`), jab: shuffled(pools.jab, `${seed}|jab`), aside: shuffled(pools.aside, `${seed}|aside`) };
  let gags = 0;
  let next = 0;
  const out: HeckleLine[] = [];
  for (const kind of PATTERN) {
    let template: string | undefined;
    let who: HeckleGuest | null = null;
    if (kind === "gag") {
      template = pools.gag[gags++];
      who = gagGuest;
    } else {
      template = left[kind].shift();
      if (kind !== "aside") who = others[next++ % others.length];
    }
    if (!template) continue;
    const text = template.replaceAll("{real}", firstOf(who?.real ?? "") || "this one").replaceAll("{weapon}", (who?.weapon ?? "weapon").toLowerCase());
    out.push({ purpose: `heckle:${out.length}`, text, target: who?.id ?? null, figure: who?.figure ?? null, gag: kind === "gag" });
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
  return heckleLines(game.tone ?? "classic", game.slug, guests).map((line) => ({
    purpose: line.purpose,
    caption: plain(line.text),
    text: customRecordingText(sprinkle(line.text, game.tone ?? "classic", `${game.slug}|${line.purpose}`), n.unstable),
    voice: voiceOf(n),
    line,
  }));
}
