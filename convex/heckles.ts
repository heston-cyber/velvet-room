// Heckles: the narrator's lines in the lulls (searching and the awards vote).
// Oct 18, Heston: "no more random jokes mid game. its confusing. Only simple insults delivered deadpan, aimed at players
// real names every now and then. the randomizer that every 3rd game, its the same player who keeps getting insulted."
// So every heckle is a short, flat insult at one guest's real first name (typed at sign-up), and on a gag night (every
// third game on a laptop) every insult goes to the same guest. Recorded at Start with the names, like the roll call.
// The cast includes family: nothing suggestive at a named guest. During the lock-in and the votes there are none (W22:
// no line about a guest sways the call).
import type { Doc } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { customRecordingText, plain, sprinkle, type Tone } from "./narration";
import { firstOf } from "./roasts";
import { guestNames, narratorOf, scriptOf, voiceOf, type Wanted } from "./voiceLines";

/** Oct 18: simple deadpan insults, {real} = the guest's real first name. Sailor has its own. */
export const HECKLES: Record<Tone, string[]> = {
  classic: [
    "{real} has the personality of a damp cracker.",
    "{real} is the human version of a wet blanket.",
    "{real} has never once been the smartest person in a room. Including empty rooms.",
    "{real} looks like a wanted poster nobody wants.",
    "{real} talks like a radio with one station, and it's static.",
    "{real} has the charm of a cold bowl of soup.",
    "{real} could get lost in a phone booth.",
    "{real} dresses like a lampshade with ambition.",
    "{real} is about as sharp as a bowl of oatmeal.",
    "{real} has the brains of a hat rack.",
    "{real} is a flat tire on a Sunday drive.",
    "{real} has the face of a disappointed horse.",
    "{real} is what happens when nobody says no.",
    "{real} laughs at their own jokes. Somebody has to.",
    "{real} has the backbone of a wet noodle.",
    "{real} could put a pot of coffee to sleep.",
    "{real} is proof that the doorman needs glasses.",
    "{real} dances like a folding chair.",
    "{real} is a dewdropper with a nice haircut.",
    "{real} has the sense of direction of a pinball.",
    "{real} is a pill. A big, sour pill.",
    "{real} has all the warmth of a coat-check ticket.",
    "{real} is the reason the menu has pictures.",
    "{real} has a face for radio and a voice for silent pictures.",
    "{real} is not the sharpest knife. Or a knife at all. A spoon, maybe.",
    "{real} has the get-up-and-go of a parked car.",
    "{real} is as interesting as a train timetable.",
    "{real} has the luck of a man selling ice in January.",
    "{real} is a chump, and the other chumps are embarrassed.",
    "{real} could bore the paint off a wall.",
  ],
  adult: [
    "{real} has the personality of a damp cracker, and the cracker's suing.",
    "{real} is a flat tire with a nice haircut.",
    "{real} has the brains of a hat rack and half the charm.",
    "{real} is a dumbass. Not an opinion. A fact.",
    "{real} looks like a wanted poster nobody wants.",
    "{real} has the backbone of wet spaghetti.",
    "{real} is a wet blanket somebody spilled gin on.",
    "{real} has a face for radio and a voice for silent pictures.",
    "{real} could screw up a free lunch.",
    "{real} is about as sharp as a bowl of cold oatmeal.",
    "{real} is the reason the doorman drinks.",
    "{real} has all the charm of a parking ticket.",
    "{real} is a pill. A big, bitter, stupid pill.",
    "{real} dances like a folding chair falling down the stairs.",
    "{real} is proof that God has a sense of humor, and it's crap.",
    "{real} is a jackass in a nice coat.",
    "{real} has the get-up-and-go of a dead horse.",
    "{real} could bore the paint off a damn wall.",
    "{real} is a chump. Even the other chumps say so.",
    "{real} has the luck of a guy selling ice in January.",
    "{real} is a sap, and proud of it.",
    "{real} has the face of a horse that lost money.",
    "{real} is dumb as a bag of hammers, and the hammers are offended.",
    "{real} is a dewdropper with big ideas and no job.",
    "{real} is full of horsefeathers, top to bottom.",
    "{real}, nobody likes you. That's not an insult. It's a survey.",
    "{real} is about as useful as a sundial in a coal mine.",
    "{real} has the instincts of a lost umbrella.",
    "{real} is a bloody menace with a nice smile.",
    "{real} could get outsmarted by a hat. A cheap hat.",
  ],
  sailor: [
    "{real}. [dead serious] You useless bag of shit.",
    "[growling] {real} has the brains of a goddamn hat rack.",
    "{real}, [dead serious] you're a flat fucking tire.",
    "[seething] {real}. Dumbass. That's it. That's the whole thought.",
    "[through gritted teeth] {real} has the personality of a soggy crap sandwich.",
    "{real}. [growling] Nobody likes you, you sorry bastard.",
    "[dead serious] {real} could screw up a free lunch. [roaring] A free lunch, damnit!",
    "{real}, [flat] you dance like a folding chair falling down the goddamn stairs.",
    "[seething] {real} is a jackass in a nice coat. [short pause] Not even your coat, is it? Shit.",
    "{real}. [growling] Face like a horse that lost money. Bastard.",
    "[dead serious] {real}, you're dumb as a bag of hammers. [roaring] And the hammers are pissed!",
    "{real}, [through gritted teeth] you gin-soaked sack of crap.",
    "[growling] {real} is a pill. A big, stupid, fucking pill.",
    "[roaring] Shut your goddamn trap, {real}.",
    "[dead serious] {real} has the backbone of wet spaghetti. Fuck.",
    "{real}, [seething] you could bore the paint off a goddamn wall.",
    "[growling] {real}: dewdropper. Freeloader. Son of a bitch.",
    "[dead serious] {real}, you're the reason the doorman drinks. [shouting] I'm the doorman, damnit!",
    "{real}, [flat] you've got a face for radio and a voice for silent pictures, you miserable bastard.",
    "[seething] {real} is a sap. A dumb, soggy, fucking sap.",
    "[through gritted teeth] Go fly a kite, {real}. Into a goddamn power line.",
    "{real}. [dead serious] Wet blanket. [growling] Wet, shitty blanket.",
    "[growling] {real} has the luck of a man selling ice in January. Dumb bastard.",
    "{real}, [roaring] you absolute wanker!",
    "[dead serious] {real}. Horsefeathers. All of you. Horsefeathers. Shit.",
    "{real}, [seething] you couldn't outsmart a cheap hat, you hell-bound chump.",
    "[growling] {real} is full of crap and proud of it.",
    "{real}. [flat] I've seen smarter furniture. [roaring] Smarter fucking furniture!",
    "[dead serious] Nobody likes {real}. [short pause] That's not an insult. It's a goddamn survey.",
    "[through gritted teeth] {real}, you bloody menace. Sit your ass down.",
  ],
};

/** How many a night records: more than the lulls ever use, so none repeats. */
export const HECKLES_A_NIGHT = 24;

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

export type HeckleGuest = { id: string; real: string; figure: string | null };
export type HeckleLine = { purpose: string; text: string; target: string | null; figure: string | null; gag: boolean; /** Which line of which pool ("adult:insult:12"), so a laptop can avoid it next game. */ id: string };

/** Options a game picked at Start: the gag night (every third game on a laptop), and lines that laptop heard lately go last. */
export type HeckleOpts = { gag?: boolean; avoid?: string[]; /** Oct 20: the host's pick for tonight's gag (a guest id). */ gagOn?: string };

/**
 * A night's insults, in order. The game's seed picks the guests' order, which lines and (on a gag night) who gets them
 * all, so no line repeats in a game and every replay is different. Otherwise the guests take turns.
 */
export function heckleLines(tone: Tone, seed: string, guests: HeckleGuest[], opts: HeckleOpts = {}): HeckleLine[] {
  if (!guests.length) return [];
  const gagNight = !!opts.gag;
  const avoid = new Set(opts.avoid ?? []);
  const order = shuffled(guests, `${seed}|guests`);
  const tagged = HECKLES[tone].map((t, i) => ({ t, id: `${tone}:insult:${i}` }));
  const mixed = shuffled(tagged, `${seed}|insult`);
  const dealt = [...mixed.filter((x) => !avoid.has(x.id)), ...mixed.filter((x) => avoid.has(x.id))].slice(0, HECKLES_A_NIGHT);
  return dealt.map((x, k) => {
    const who = gagNight ? order.find((g) => g.id === opts.gagOn) ?? order[0] : order[k % order.length];
    const text = x.t.replaceAll("{real}", firstOf(who.real) || "this one");
    return { purpose: `heckle:${k}`, text, target: who.id, figure: who.figure, gag: gagNight, id: x.id };
  });
}

/** The game's heckles, ready to record: one custom line each, in the game's voice. */
export async function heckleWanted(ctx: QueryCtx, game: Doc<"games">): Promise<(Wanted & { line: HeckleLine })[]> {
  const players = (
    await ctx.db
      .query("players")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect()
  ).filter((p) => p.inGame);
  const guests = players.sort((a, b) => a.createdAt - b.createdAt).map((p) => ({ id: p._id as string, real: guestNames(p).real, figure: p.figure ?? null }));
  const n = narratorOf(game);
  const tone = scriptOf(game);
  return heckleLines(tone, game.slug, guests, { gag: game.lines?.gag, avoid: game.lines?.avoid, gagOn: game.lines?.gagOn }).map((line) => ({
    purpose: line.purpose,
    caption: plain(line.text),
    text: customRecordingText(sprinkle(line.text, tone, `${game.slug}|${line.purpose}`), n.unstable),
    voice: voiceOf(n),
    line,
  }));
}
