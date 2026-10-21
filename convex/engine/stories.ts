// Stories (Phase 3, Oct 20). Every guest's phone says where they were when the lights went out, with one detail
// someone can check. Innocents' stories are true; the killer's is a cover that looks exactly the same ("Where you
// were", never "cover"). Story cards in the house back up details, and one card, the deciding card, breaks the
// killer's. Decided in the Oct 19-20 design round (claude/velvet-room-rebuild-plan.md, section 2):
// - Pairs ("on the fire escape with Josh") only for guests the evidence clears anyway. The 3 left standing are alone,
//   and so are at least 2 cleared guests (1 in games of 6 or fewer), so being alone gives nobody away.
// - The killer's detail never names a guest, and only the deciding card can break it.
// - One innocent left standing gets a story card that backs them up; the other's detail is true, but nothing confirms
//   it, the same as the killer's until the deciding card.
// - Stories happen in spots that are never one of the game's rooms, so nobody's story says where the Don wasn't killed.
// - Debts are always true. Late tips are rumours: true, harmless, about the evening, never where anyone was.
// Pure: no database. build.ts lays the night out; validateCase (build.ts) checks it.
import { list } from "./text";
import { pick, shuffle } from "./rng";
import type { Place, Rng, Room } from "./types";

/** A checkable detail: what the phone says happened there, a card that backs it up, and a card that breaks it. */
export type Detail = {
  id: string;
  /** What happened, said the same way on every phone that has it: no "you", no guest's name. */
  story: string;
  /** Two ways a story card backs it up (the second only when a game needs more cards). Never names a guest. */
  confirm: [string, string];
  /** The deciding card's words when this detail is the killer's cover. Never names a guest. */
  breaks: string;
  /** Details that can't share a night (a cab strike and a cab ride). */
  topic?: string;
};

export type Spot = {
  key: string;
  /** Which kind of place it is: a spot is only used when no room in play is that kind of place. */
  place: Place;
  /** "out on the fire escape": reads after "you were" and "was". */
  at: string;
  /** Who saw them there, for the alibis ("the lady across the airshaft"). */
  witness: string;
  details: Detail[];
};

export const SPOTS: Spot[] = [
  {
    key: "alley",
    place: "out",
    at: "out in the alley behind the club",
    witness: "the bootlegger's driver",
    details: [
      {
        id: "alley-gin",
        story: "A bootlegger's truck was unloading crates of gin, and the driver dropped three of them.",
        confirm: [
          "The bootlegger's delivery slip: forty crates of gin unloaded in the alley tonight, three of them broken.",
          "A dock receipt: the gin truck idled in the alley right when the lights went out, leaking from a broken crate.",
        ],
        breaks: "The gin delivery never came tonight. The truck was stopped at the Jersey line and is still in the police lot.",
      },
      {
        id: "alley-cat",
        story: "A stray cat knocked over every ash can in the alley, one after another.",
        confirm: [
          "The super's complaint to the landlord: a stray cat knocked over every ash can in the alley tonight.",
          "The garbage man's note: every ash can in the alley tipped over tonight. He blames the cat.",
        ],
        breaks: "The ash cans in the alley were emptied and chained shut at nine. Not one of them could tip over.",
      },
    ],
  },
  {
    key: "fireEscape",
    place: "out",
    at: "out on the fire escape",
    witness: "the lady across the airshaft",
    details: [
      {
        id: "fire-pigeon",
        story: "A pigeon stole a cigarette right out of the pack and flew off with it.",
        confirm: [
          "A note from the lady across the airshaft: a pigeon on the club's fire escape has been stealing cigarettes all night. She thinks it's hilarious.",
          "The super found a pigeon's nest on the fire escape tonight, lined with stolen cigarettes.",
        ],
        breaks: "The exterminator netted every pigeon off this block this morning. There isn't a bird left for a mile.",
        topic: "birds",
      },
      {
        id: "fire-window",
        story: "The window back inside stuck shut, and it took ten minutes to jimmy it open.",
        confirm: [
          "The super's repair list: \"fire-escape window sticks, jimmied open tonight, latch bent.\"",
          "Scratch marks on the fire-escape window frame, fresh tonight. Somebody had to pry it open from outside.",
        ],
        breaks: "The super took the fire-escape window out for repairs this afternoon. There's nothing in that frame but a board.",
      },
    ],
  },
  {
    key: "curb",
    place: "out",
    at: "out at the curb, trying to flag down a cab",
    witness: "a cabbie parked across the street",
    details: [
      {
        id: "curb-cabs",
        story: "Not one cab would stop. Three drove straight past, one with a dog in the back seat.",
        confirm: [
          "The Checker Cab log: a driver passed up a fare outside the club tonight because his dog didn't like the look of them.",
          "A cabbie's complaint: three cabs ignored a fare outside this club tonight. His was the one with the dog.",
        ],
        breaks: "The cabbies were on strike tonight. Not one cab drove down this street all evening.",
        topic: "cabs",
      },
      {
        id: "curb-elks",
        story: "A parade of Elks marched past with a brass band, two hours late.",
        confirm: [
          "The Elks Lodge confirms: their brass band marched down this street tonight, two hours behind schedule.",
          "A noise complaint at the precinct: a brass band of Elks marching past the club right when the lights went out.",
        ],
        breaks: "The Elks called off tonight's parade for the rain date next Tuesday. No band marched anywhere.",
      },
    ],
  },
  {
    key: "roof",
    place: "roof",
    at: "up on the roof",
    witness: "the super",
    details: [
      {
        id: "roof-blimp",
        story: "The Goodyear blimp drifted over, lit up like a Christmas tree.",
        confirm: [
          "Goodyear's flight log: the blimp flew low over this block tonight, every light on.",
          "A clipping from the late edition: \"BLIMP LIGHTS UP MIDTOWN.\" It passed right over the club.",
        ],
        breaks: "Goodyear grounded the blimp tonight for a leak. It never left the hangar.",
      },
      {
        id: "roof-laundry",
        story: "The neighbor's laundry line snapped and dumped a whole wash onto the roof.",
        confirm: [
          "The super's notes: the neighbor's laundry line snapped tonight and dumped her whole wash on the club's roof.",
          "A note pinned to the roof door: \"Whoever has my bloomers, I want them back. — Mrs. Kaplan, next door.\"",
        ],
        breaks: "Mrs. Kaplan next door took her laundry in at six. There wasn't a sock on that line tonight.",
      },
    ],
  },
  {
    key: "cellar",
    place: "cellar",
    at: "down in the cellar",
    witness: "the man who runs the still",
    details: [
      {
        id: "cellar-still",
        story: "The still in the corner hissed and spat until the valve got turned.",
        confirm: [
          "The still man's log: the cellar still boiled over tonight and had to be shut off by hand.",
          "Scorch marks on the cellar still's valve, fresh tonight. Somebody turned it off in a hurry.",
        ],
        breaks: "The cellar still was taken apart last week and sold for scrap. There's nothing down there to hiss.",
      },
      {
        id: "cellar-rat",
        story: "A rat the size of a cat ran across the wine racks.",
        confirm: [
          "The exterminator's bill: one rat \"the size of a cat\" spotted on the cellar wine racks tonight. Still at large.",
          "Tiny footprints in the dust on the cellar wine racks, fresh tonight. Big ones, for a rat.",
        ],
        breaks: "The exterminator gassed the cellar this afternoon. Nothing with legs has been down there since.",
      },
    ],
  },
  {
    key: "backStairs",
    place: "stairs",
    at: "on the back stairs",
    witness: "a busboy",
    details: [
      {
        id: "stairs-oysters",
        story: "A tray of oysters had been left on the landing, and they were not fresh.",
        confirm: [
          "A complaint from the cook: a tray of oysters went missing tonight and turned up on the back-stairs landing, ripe.",
          "The cleaning lady's note: oyster shells all over the back-stairs landing tonight. The smell is still there.",
        ],
        breaks: "The fish market was closed today. There wasn't an oyster in the building tonight.",
      },
      {
        id: "stairs-banister",
        story: "The banister came loose and nearly came off in a hand.",
        confirm: [
          "The handyman's list: \"back-stairs banister came loose tonight, needs new screws.\"",
          "Two screws from the back-stairs banister, found on the landing tonight. It's hanging by one.",
        ],
        breaks: "The handyman bolted a brand-new banister to the back stairs this morning. It doesn't budge.",
      },
    ],
  },
  {
    key: "kitchen",
    place: "kitchen",
    at: "in the kitchen",
    witness: "the cook",
    details: [
      {
        id: "kitchen-ruth",
        story: "The cook's radio had the ball game on, and Babe Ruth hit one out.",
        confirm: [
          "The radio station's log: Babe Ruth homered in the ninth tonight, called live right when the lights went out.",
          "Tomorrow's sports page, early copy: \"RUTH HOMERS LATE.\" The kitchen radio had it live.",
        ],
        breaks: "No ball game on the radio tonight. The Yankees had the day off.",
      },
      {
        id: "kitchen-soup",
        story: "A pot of soup boiled over and put out the stove.",
        confirm: [
          "The cook's notes: the soup boiled over tonight and put the stove out. He's still mad.",
          "A scorched soup pot in the kitchen sink, still sticky. It boiled over tonight.",
        ],
        breaks: "The gas to the kitchen was shut off all day for repairs. Nothing boiled on that stove tonight.",
      },
    ],
  },
  {
    key: "cardTable",
    place: "cards",
    at: "at the empty card table",
    witness: "the dealer on his break",
    details: [
      {
        id: "cards-solitaire",
        story: "A game of solitaire came out on the very first try, which never happens.",
        confirm: [
          "Found on the card table: a game of solitaire laid out and won, the cards still in their rows.",
          "The dealer's note: somebody won a game of solitaire at his table tonight and left it out to brag.",
        ],
        breaks: "The dealer locked up the card table's only deck at nine tonight. There wasn't a card on that table after that.",
      },
      {
        id: "cards-cigar",
        story: "A cigar left burning in an ashtray rolled out and scorched the felt.",
        confirm: [
          "The manager's list of damages: a cigar burned a hole in the card table's felt tonight.",
          "A fresh burn in the card table's green felt, cigar-shaped. It happened tonight.",
        ],
        breaks: "The card table got new felt this afternoon, and there isn't a mark on it. Not one burn.",
      },
    ],
  },
  {
    key: "coatCheck",
    place: "front",
    at: "at the coat check",
    witness: "the coat-check girl",
    details: [
      {
        id: "coat-ferret",
        story: "A fur coat in the back row had a live ferret in the pocket.",
        confirm: [
          "The coat-check girl's book: \"fur coat, row three. Pocket contains one ferret, alive.\"",
          "Ferret hair all over the back row of the coat check tonight, and one very angry fur coat.",
        ],
        breaks: "The coat-check girl's book: no furs checked tonight. Not one.",
      },
      {
        id: "coat-bill",
        story: "A hat in the back had a hundred-dollar bill tucked in the band.",
        confirm: [
          "The coat-check girl's note: a hat in the back had a hundred-dollar bill in the band. Nobody's claimed it.",
          "A hundred-dollar bill in the coat check's lost-and-found box, marked \"from a hatband, tonight.\"",
        ],
        breaks: "The coat-check girl went through every hat at the door tonight. There wasn't a dollar in any of them.",
      },
    ],
  },
  {
    key: "powderRoom",
    place: "bath",
    at: "in the washroom",
    witness: "the attendant",
    details: [
      {
        id: "powder-faucet",
        story: "The faucet stuck on and wouldn't turn off.",
        confirm: [
          "The plumber's bill: the washroom faucet stuck on tonight and ran for twenty minutes.",
          "A puddle under the washroom sink, and a wrench mark on the faucet. It stuck on tonight.",
        ],
        breaks: "The water to the washroom was shut off all day for new pipes. Not a drop came out of that faucet.",
      },
      {
        id: "powder-mirror",
        story: "Someone had written a phone number on the mirror in lipstick.",
        confirm: [
          "The cleaning lady's complaint: a phone number in lipstick on the washroom mirror tonight. Third time this month.",
          "A lipstick phone number on the washroom mirror: Circle 7-4400. Nobody will say whose.",
        ],
        breaks: "The washroom mirror came down this morning to be resilvered. There's no mirror in there tonight.",
      },
    ],
  },
  {
    key: "hallPhone",
    place: "front",
    at: "on the hall telephone",
    witness: "the operator",
    details: [
      {
        id: "phone-nickels",
        story: "The operator kept cutting in to ask for another nickel.",
        confirm: [
          "The phone company's log: a call from the club's hall phone tonight, cut off twice for more nickels.",
          "Eleven nickels in the hall phone's coin box, more than any night this month.",
        ],
        breaks: "The phone company cut off the hall telephone yesterday over an unpaid bill. Nobody made a call on it tonight.",
      },
      {
        id: "phone-liver",
        story: "The line kept crossing with a woman ordering forty pounds of liver.",
        confirm: [
          "The operator's report: crossed lines on the club's hall phone tonight. One woman kept ordering forty pounds of liver.",
          "A butcher in the Bronx confirms: a woman ordered forty pounds of liver tonight on a very bad line.",
        ],
        breaks: "The operator's report: every line on this exchange ran clear tonight. Not one crossed call.",
      },
    ],
  },
  {
    key: "newsstand",
    place: "out",
    at: "across the street at the newsstand",
    witness: "the newsboy",
    details: [
      {
        id: "news-horse",
        story: "The late edition came off the truck still wet. The headline: a racehorse bit its jockey.",
        confirm: [
          "Tonight's late edition, front page: \"HORSE BITES JOCKEY.\" Off the truck right when the lights went out.",
          "The newsboy's tally: forty copies of the late edition sold tonight, all on account of the horse.",
        ],
        breaks: "Tonight's late edition never came out: the press broke down. The newsstand sold yesterday's papers all night.",
      },
      {
        id: "news-variety",
        story: "A man in a bowler hat bought every copy of Variety on the rack.",
        confirm: [
          "The newsboy's note: one customer bought every Variety on the rack tonight and tipped a dime.",
          "The newsstand's rack: the Variety slot is empty tonight. It sold out to one man in a bowler.",
        ],
        breaks: "Variety didn't come out this week. There wasn't a copy on that rack.",
      },
    ],
  },
  {
    key: "garage",
    place: "garage",
    at: "in the garage with the Don's Packard",
    witness: "the Don's chauffeur",
    details: [
      {
        id: "garage-horn",
        story: "The Packard's horn got stuck and blared for a full minute.",
        confirm: [
          "The chauffeur's note: the Packard's horn stuck tonight and blew for a full minute. The neighbors complained.",
          "A noise complaint from next door: a car horn in the club's garage, blaring for a full minute tonight.",
        ],
        breaks: "The Packard's horn was disconnected last week after the neighbors complained. It can't make a peep.",
      },
      {
        id: "garage-gloves",
        story: "There was a pair of ladies' gloves on the Packard's back seat.",
        confirm: [
          "The chauffeur's report: a pair of ladies' gloves on the Packard's back seat tonight. He's not asking.",
          "Ladies' gloves, size six, found in the Don's Packard tonight. Now in the lost-and-found.",
        ],
        breaks: "The chauffeur cleaned out the Packard at nine tonight. Not so much as a glove left in it.",
      },
    ],
  },
  {
    key: "cigarShop",
    place: "out",
    at: "next door at the cigar shop",
    witness: "the tobacconist",
    details: [
      {
        id: "cigar-parrot",
        story: "The tobacconist's parrot kept shouting \"Raid!\" at the customers.",
        confirm: [
          "The tobacconist apologizes: his parrot shouted \"Raid!\" at customers all night again.",
          "A note on the cigar shop door: \"The parrot is a liar. There is no raid.\"",
        ],
        breaks: "The tobacconist's parrot is at the bird doctor this week. The shop was quiet as a church.",
        topic: "birds",
      },
      {
        id: "cigar-havanas",
        story: "A box of Havanas fell off the top shelf and burst open.",
        confirm: [
          "The tobacconist's books: one box of Havanas dropped and dented tonight. Sold at half price.",
          "A burst cigar box behind the cigar shop counter, Havanas everywhere. It fell tonight.",
        ],
        breaks: "The tobacconist sold his last box of Havanas at noon. There wasn't one on any shelf tonight.",
      },
    ],
  },
  {
    key: "phoneBooth",
    place: "out",
    at: "in the phone booth on the corner",
    witness: "the beat cop",
    details: [
      {
        id: "booth-door",
        story: "The booth's door jammed shut, and it took a good kick to get out.",
        confirm: [
          "The phone company's repair ticket: the booth on the corner jammed shut tonight. Somebody kicked the door open.",
          "A shoe-shaped dent in the corner phone booth's door. Fresh tonight.",
        ],
        breaks: "The phone booth on the corner was hauled away for repairs this morning. There's a hole in the sidewalk where it stood.",
      },
      {
        id: "booth-book",
        story: "The phone book in the booth was missing every page with an S.",
        confirm: [
          "The phone company: the corner booth's phone book is missing every S page, torn out tonight.",
          "The S pages from a phone book, stuffed in the ash can by the corner booth. All of them.",
        ],
        breaks: "The corner booth got a brand-new phone book at nine tonight, every page intact.",
      },
    ],
  },
  {
    key: "cab",
    place: "out",
    at: "in a cab, circling the block",
    witness: "the cabbie",
    details: [
      {
        id: "cab-meter",
        story: "The meter ran up to two dollars going around the same block.",
        confirm: [
          "The cab company's trip sheet: one fare circled this block for twenty minutes tonight. Two dollars on the meter.",
          "A cabbie's tip jar: two dollars and a note, \"for going around in circles.\"",
        ],
        breaks: "The cab company's trip sheets: no cab carried a fare anywhere near this club tonight.",
        topic: "cabs",
      },
      {
        id: "cab-radio",
        story: "The cabbie's radio had a dance band on, and he sang along, badly.",
        confirm: [
          "A complaint at the cab company: a driver sang along to his radio tonight, very badly, circling this very block.",
          "The cab company's note to a driver: \"No more singing to the fares.\" Dated tonight.",
        ],
        breaks: "The cab company pulled the radios out of every cab last month. No cab played music tonight.",
        topic: "cabs",
      },
    ],
  },
  {
    key: "frontSteps",
    place: "out",
    at: "out on the front steps",
    witness: "the doorman",
    details: [
      {
        id: "steps-joke",
        story: "The doorman told the same joke about a duck and a lawyer four times.",
        confirm: [
          "The doorman admits it: he told his duck-and-lawyer joke to anyone who'd stand still tonight. Four times, at least.",
          "The manager's note to the doorman: \"Enough with the duck.\" Dated tonight.",
        ],
        breaks: "The doorman lost his voice yesterday. He hasn't said a word all night, joke or otherwise.",
      },
      {
        id: "steps-ice",
        story: "The ice man's wagon lost a wheel and a block of ice slid right down the steps.",
        confirm: [
          "The ice company's report: a wagon lost a wheel outside the club tonight and a block went down the front steps.",
          "A puddle on the front steps and a dent in the railing. The ice man's wagon, tonight.",
        ],
        breaks: "The ice company doesn't deliver at night. Its wagons were all in the stable by six.",
      },
    ],
  },
];

/** Spots a game can use: none that's one of its rooms (by the kind of place, like the alibis). */
export function spotsFor(rooms: Room[], roomOfPlace: (rooms: Room[], p: Place) => string | undefined): Spot[] {
  return SPOTS.filter((s) => !roomOfPlace(rooms, s.place));
}

// ---------- a night's stories ----------

/** One guest's story, as the case file keeps it. */
export type Story = {
  playerId: string;
  spot: string;
  /** Who they were with (both ways), if anyone. */
  withId?: string;
  detail: string;
  /** "When the lights went out, you were…": the phone's words. */
  text: string;
  /** The same, as the guest would tell it ("I was…"), for Ask a bot. */
  told: string;
};

/** Where the guests were: alone, or two together. */
export type Unit = { ids: string[]; spot: Spot; detail: Detail };

/** The phone's words, and how the guest tells it. */
export function storyWords(u: Unit, me: string, names: Map<string, string>): { text: string; told: string } {
  const other = u.ids.find((x) => x !== me);
  const partner = other ? names.get(other) ?? "" : "";
  const where = other ? `${u.spot.at}, with ${partner}` : `${u.spot.at}, alone`;
  return {
    text: `When the lights went out, you were ${where}. ${u.detail.story}`,
    told: `I was ${where}. ${u.detail.story}`,
  };
}

/**
 * Deals spots and details: one spot per unit (never two units at one spot, or they'd have seen each other), and no two
 * details on one topic. Returns null if the spots run out (the builder tries again).
 */
export function dealSpots(rng: Rng, spots: Spot[], groups: string[][]): Unit[] | null {
  const free = shuffle(rng, spots);
  const topics = new Set<string>();
  const units: Unit[] = [];
  for (const ids of groups) {
    let found: Unit | null = null;
    for (let i = 0; i < free.length && !found; i++) {
      const ok = shuffle(rng, free[i].details).filter((d) => !d.topic || !topics.has(d.topic));
      if (ok.length) {
        found = { ids, spot: free[i], detail: ok[0] };
        free.splice(i, 1);
      }
    }
    if (!found) return null;
    if (found.detail.topic) topics.add(found.detail.topic);
    units.push(found);
  }
  return units;
}

/**
 * Who stands with whom. Each group (guests cleared the same way, so a pair is always cleared by one clue) pairs up,
 * except the guests who stay alone: at least `alone` of them across all groups.
 */
export function pairUp(rng: Rng, groups: string[][], alone: number): string[][] {
  const flat = groups.flatMap((g) => g.map((id) => ({ id, g })));
  // Which cleared guests stay alone: picked at random across the groups.
  const lone = new Set(shuffle(rng, flat).slice(0, Math.min(alone, flat.length)).map((x) => x.id));
  const out: string[][] = [];
  for (const g of groups) {
    const rest = shuffle(rng, g.filter((id) => !lone.has(id)));
    while (rest.length >= 2) out.push([rest.pop()!, rest.pop()!]);
    if (rest.length) out.push([rest.pop()!]);
    for (const id of g) if (lone.has(id)) out.push([id]);
  }
  return out;
}

// ---------- the alibis, in the stories' words ----------

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const who = (u: Unit, names: Map<string, string>) => list(u.ids.map((id) => names.get(id) ?? ""));
const was = (u: Unit) => (u.ids.length > 1 ? "were" : "was");

/**
 * An alibi for one or more units, saying where each was, the same as their stories. Classic or Adult (a little
 * ruder). One unit: one spot; two or three: each with its own spot.
 */
export function alibiText(say: (key: string, n: number) => number, tone: "classic" | "adult", units: Unit[], names: Map<string, string>): string {
  const all = units.flatMap((u) => u.ids);
  const many = all.length > 1;
  const tail = (k: string) => {
    const classic = many ? ["Both cleared.", "Both in the clear."] : ["Cleared.", "In the clear."];
    const adult = many ? ["Both cleared, damn it.", "Both cleared. Boring, but cleared."] : ["Cleared, unfortunately.", "Cleared. Boring, but cleared."];
    const pool = tone === "adult" ? adult : classic;
    const t = pool[say(`at-${k}`, pool.length)];
    return all.length > 2 ? t.replace("Both", "All three") : t;
  };
  if (units.length === 1) {
    const u = units[0];
    const w = u.spot.witness;
    const n = who(u, names);
    const forms = u.ids.length > 1
      ? [
          `${n} were ${u.spot.at} together when the lights went out, and ${w} saw them both.`,
          `${cap(w)} watched ${n} ${u.spot.at} the whole stretch.`,
        ]
      : [
          `${cap(w)} swears ${n} was ${u.spot.at} the whole stretch.`,
          `${n} was ${u.spot.at} when the lights went out, and ${w} saw it.`,
          `Ask ${w}: ${n} was ${u.spot.at} the whole time.`,
        ];
    return `${forms[say(u.ids.length > 1 ? "a2" : "a1", forms.length)]} ${tail(u.ids.length > 1 ? "2" : "1")}`;
  }
  const parts = units.map((u) => `${who(u, names)} ${was(u)} ${u.spot.at}`);
  const witnesses = list(units.map((u) => u.spot.witness));
  const forms = [`When the lights went out, ${list(parts)}. ${cap(witnesses)} will swear to it.`, `${cap(list(parts))}, and ${witnesses} saw them there.`];
  return `${forms[say("am", forms.length)]} ${tail("m")}`;
}

// ---------- debts and late tips ----------

export type Debt = { fromId: string; toId: string; amount: number };

/** Two or three debts (Heston's chips): $100 to $300, never two between the same two guests. Always true. */
export function drawDebts(rng: Rng, ids: string[]): Debt[] {
  if (ids.length < 2) return [];
  const want = ids.length >= 6 ? (rng() < 0.5 ? 2 : 3) : 2;
  const out: Debt[] = [];
  const seen = new Set<string>();
  for (let tries = 0; out.length < want && tries < 100; tries++) {
    const [a, b] = shuffle(rng, ids).slice(0, 2);
    const key = [a, b].sort().join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ fromId: a, toId: b, amount: pick(rng, [100, 200, 300]) });
  }
  return out;
}

export type LateTip = { id: string; aboutId: string; text: string };

/**
 * Late tips: rumours about the evening (never where anyone was when the lights went out), true and harmless. The
 * killer's plant (Phase 4) uses the same words, so nothing in the wording tells a plant from a real tip.
 */
export const TIPS: { classic: ((n: string) => string)[]; adult: ((n: string) => string)[] } = {
  classic: [
    (n) => `A waiter says ${n} asked twice tonight what time the Don usually turned in.`,
    (n) => `The cigarette girl says ${n} paid for one pack with a hundred-dollar bill and didn't wait for the change.`,
    (n) => `The doorman says ${n} came in tonight through the kitchen door instead of the front.`,
    (n) => `The bartender says ${n} switched to plain water an hour before the lights went out.`,
    (n) => `Somebody overheard ${n} on a telephone earlier tonight, saying, "It's taken care of."`,
    (n) => `The coat-check girl says ${n} checked a coat tonight, then came back for it twice.`,
    (n) => `A busboy says ${n} was asking earlier which doors in the club lock from the inside.`,
    (n) => `The bandleader says ${n} tipped him five dollars tonight to play the Don's favorite song. Twice.`,
  ],
  adult: [
    (n) => `A waiter says ${n} asked twice tonight what time the Don usually turned in. Creepy as hell.`,
    (n) => `The cigarette girl says ${n} paid for one pack with a hundred-dollar bill and didn't wait for the change. Nobody's that rich. Nobody honest, anyway.`,
    (n) => `The doorman says ${n} came in tonight through the kitchen door instead of the front, like a damn raccoon.`,
    (n) => `The bartender says ${n} switched to plain water an hour before the lights went out. In this joint, that's practically a confession.`,
    (n) => `Somebody overheard ${n} on a telephone earlier tonight, saying, "It's taken care of." Could be the laundry. Could be.`,
    (n) => `The coat-check girl says ${n} checked a coat tonight, then came back for it twice. Shifty as hell.`,
    (n) => `A busboy says ${n} was asking earlier which doors in the club lock from the inside. Normal question. Totally normal.`,
    (n) => `The bandleader says ${n} tipped him five dollars tonight to play the Don's favorite song. Twice. Sentimental, or guilty.`,
  ],
};

/** Two late tips about two different guests, out of those still standing after the Round 2 clue (the killer included). */
export function drawTips(rng: Rng, tone: "classic" | "adult", standing: { id: string; name: string }[]): LateTip[] {
  const who = shuffle(rng, standing).slice(0, 2);
  const words = shuffle(rng, TIPS[tone]);
  return who.map((s, i) => ({ id: `t${i + 1}`, aboutId: s.id, text: words[i](s.name) }));
}

// ---------- the stash ----------

/** The chip-stash card: $200 for the first phone to scan it, and an empty envelope for everyone after. */
export const STASH = {
  found: "Taped under a drawer: the Don's emergency roll. $200 in chips, finders keepers. Take $200 from the bank.",
  empty: "Taped under a drawer: an empty envelope. Somebody already cleaned out the Don's stash.",
};
