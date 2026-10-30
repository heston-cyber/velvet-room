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
  /** Details that can't share a night (the apps down, and an Uber ride). */
  topic?: string;
};

export type Spot = {
  key: string;
  /** Which kind of place it is: a spot is only used when no room in play is that kind of place. */
  place: Place;
  /** "out on the fire escape": reads after "you were" and "was". */
  at: string;
  /** Who saw them there, for the alibis ("the neighbor across the street"). */
  witness: string;
  details: Detail[];
};

export const SPOTS: Spot[] = [
  {
    key: "alley",
    place: "out",
    at: "out in the alley behind the club",
    witness: "the security camera over the back door",
    details: [
      {
        id: "alley-kegs",
        story: "A beer truck was unloading kegs, and the driver dropped one. It rolled halfway down the block.",
        confirm: [
          "The beer distributor's delivery slip: twelve kegs dropped off in the alley tonight, one of them dented.",
          "The beer truck's GPS log: parked in the alley behind the club right when the lights went out.",
        ],
        breaks: "The beer delivery never came tonight. The truck broke down on the BQE and got towed.",
      },
      {
        id: "alley-rat",
        story: "A rat dragged a whole slice of pizza across the alley, like the famous video.",
        confirm: [
          "A video posted tonight: a rat dragging a whole slice of pizza across the alley behind the club. Forty thousand views and counting.",
          "Half a slice of pizza at the far end of the alley, with tiny teeth marks. The line cook says the rat's back.",
        ],
        breaks: "The city sealed and baited this alley yesterday. There hasn't been a rat back there since.",
      },
    ],
  },
  {
    key: "fireEscape",
    place: "out",
    at: "out on the fire escape",
    witness: "the neighbor across the street",
    details: [
      {
        id: "fire-pigeon",
        story: "A pigeon grabbed an AirPod off the railing and flew off with it.",
        confirm: [
          "A Find My alert from tonight: one AirPod, pinging from a pigeon's nest on the club's fire escape.",
          "The super found a pigeon's nest on the fire escape tonight, with an AirPod in it. Still charged.",
        ],
        breaks: "Pest control put spikes and netting all over this fire escape this morning. Not one pigeon can land on it.",
      },
      {
        id: "fire-window",
        story: "The window back inside stuck shut, and it took ten minutes to get it open.",
        confirm: [
          "The super's repair request in the building app: \"Fire-escape window stuck, pried open tonight, latch bent.\"",
          "Scratch marks on the fire-escape window frame, fresh tonight. Somebody had to pry it open from outside.",
        ],
        breaks: "The super took the fire-escape window out for repairs this afternoon. There's nothing in that frame but plywood.",
      },
    ],
  },
  {
    key: "curb",
    place: "out",
    at: "out at the curb, waiting on an Uber",
    witness: "a delivery guy on an e-bike",
    details: [
      {
        id: "curb-uber",
        story: "Three drivers canceled in a row, and the app said \"finding your driver\" for twenty minutes.",
        confirm: [
          "Uber's records: a pickup outside this club tonight, canceled by three drivers in a row.",
          "A screenshot from tonight: \"Finding your driver…\" at this address, twenty minutes and counting, right when the lights went out.",
        ],
        breaks: "Uber and Lyft were both down all over Manhattan tonight. Nobody could even open the apps.",
        topic: "rides",
      },
      {
        id: "curb-shreks",
        story: "A Halloween bar crawl of about thirty Shreks went by, singing.",
        confirm: [
          "A post from tonight: thirty Shreks on a bar crawl, passing right by the club when the lights went out.",
          "A noise complaint to 311: a bar crawl of singing Shreks outside the club tonight.",
        ],
        breaks: "The Shrek bar crawl got shut down by the cops at nine, three neighborhoods away. Not one Shrek came down this street.",
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
        id: "roof-drones",
        story: "A drone show over the river made a giant jack-o'-lantern in the sky.",
        confirm: [
          "The city's event permit: a Halloween drone show over the river tonight, a giant jack-o'-lantern, right when the lights went out.",
          "A video posted tonight: the drone pumpkin over the river, with the club's roof in the corner of the shot.",
        ],
        breaks: "Tonight's drone show got canceled for high winds. Not one drone went up.",
      },
      {
        id: "roof-yoga",
        story: "Somebody on the next roof over was doing yoga in a full skeleton costume.",
        confirm: [
          "A flyer taped to the roof door: \"Skeleton Yoga, next roof over, Halloween night. Bring a mat.\"",
          "The building next door's group chat: \"Whoever's doing yoga on the roof in a skeleton suit, it's 11 p.m.\"",
        ],
        breaks: "The roof next door has been locked for repairs all month. Nobody's been up there, skeleton or not.",
      },
    ],
  },
  {
    key: "cellar",
    place: "cellar",
    at: "down in the basement",
    witness: "the handyman",
    details: [
      {
        id: "cellar-boiler",
        story: "The boiler kept clanking and hissing until somebody kicked it.",
        confirm: [
          "The handyman's work order: the basement boiler acted up tonight, clanking and hissing, and got kicked back to life.",
          "A fresh boot scuff on the basement boiler, and a sticky note: \"Kicked it. Works now.\" Dated tonight.",
        ],
        breaks: "The boiler was shut down for an inspection all week. It's stone cold and silent.",
      },
      {
        id: "cellar-roomba",
        story: "A Roomba was stuck in the corner, bumping into the same wall over and over.",
        confirm: [
          "The club's Roomba app: stuck in the basement corner tonight. \"Bumped wall\" 214 times.",
          "The handyman found the Roomba wedged in the basement corner tonight, battery dead, still facing the wall.",
        ],
        breaks: "The club's Roomba has been at the repair shop since Monday. There's no robot in that basement.",
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
        id: "stairs-sushi",
        story: "A sushi platter had been left on the landing, and it was not fresh.",
        confirm: [
          "A complaint from the cook: a sushi platter went missing tonight and turned up on the back-stairs landing, warm.",
          "The cleaning crew's note: rice and fish all over the back-stairs landing tonight. The smell is still there.",
        ],
        breaks: "The sushi order never came tonight. The delivery app shows it canceled at seven.",
      },
      {
        id: "stairs-banister",
        story: "The banister came loose and nearly came off in a hand.",
        confirm: [
          "The handyman's list: \"Back-stairs banister came loose tonight, needs new screws.\"",
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
        id: "kitchen-knicks",
        story: "The cook had the Knicks game on his phone, and they won at the buzzer.",
        confirm: [
          "Tonight's box score: the Knicks won at the buzzer, right when the lights went out.",
          "A text from the cook to his brother: \"KNICKS AT THE BUZZER!!!\" Sent right when the lights went out.",
        ],
        breaks: "The Knicks didn't play tonight. They had the night off.",
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
    at: "at the empty poker table",
    witness: "the dealer on his break",
    details: [
      {
        id: "cards-solitaire",
        story: "A game of solitaire came out on the very first try, which never happens.",
        confirm: [
          "Found on the poker table: a game of solitaire laid out and won, the cards still in their rows.",
          "The dealer's note: somebody won a game of solitaire at his table tonight and left it out to brag.",
        ],
        breaks: "The dealer locked up the poker table's only deck at nine tonight. There wasn't a card on that table after that.",
      },
      {
        id: "cards-cigar",
        story: "A cigar left burning in an ashtray rolled out and scorched the felt.",
        confirm: [
          "The manager's list of damages: a cigar burned a hole in the poker table's felt tonight.",
          "A fresh burn in the poker table's green felt, cigar-shaped. It happened tonight.",
        ],
        breaks: "The poker table got new felt this afternoon, and there isn't a mark on it. Not one burn.",
      },
    ],
  },
  {
    key: "coatCheck",
    place: "front",
    at: "at the coat check",
    witness: "the coat-check attendant",
    details: [
      {
        id: "coat-ferret",
        story: "A puffer jacket in the back row had a live ferret in the pocket.",
        confirm: [
          "The coat-check attendant's notes: \"Puffer jacket, row three. Pocket contains one ferret, alive.\"",
          "Ferret hair all over the back row of the coat check tonight, and one very chewed-up puffer jacket.",
        ],
        breaks: "The coat check's tags: not one puffer jacket checked tonight. Not one.",
      },
      {
        id: "coat-goat",
        story: "A phone in a jacket in the back kept ringing, and the ringtone was a goat screaming.",
        confirm: [
          "The coat-check attendant's note: a phone in a jacket in the back rang all night. The ringtone is a screaming goat.",
          "A complaint from the coat check: a phone in the back row rang eleven times tonight, a screaming goat every time.",
        ],
        breaks: "The coat-check attendant pats down every pocket at the door. There wasn't a phone in a single coat tonight.",
      },
    ],
  },
  {
    key: "restroom",
    place: "bath",
    at: "in the restroom",
    witness: "the restroom attendant",
    details: [
      {
        id: "restroom-faucet",
        story: "The automatic faucet turned on and wouldn't turn off.",
        confirm: [
          "The plumber's invoice: the restroom's automatic faucet stuck on tonight and ran for twenty minutes.",
          "A puddle under the restroom sink, and the sensor on the faucet taped over. It stuck on tonight.",
        ],
        breaks: "The water to the restroom was shut off all day for new pipes. Not a drop came out of that faucet.",
      },
      {
        id: "restroom-mirror",
        story: "Somebody had written an Instagram handle on the mirror in lipstick.",
        confirm: [
          "The cleaning crew's complaint: an Instagram handle in lipstick on the restroom mirror tonight. Third time this month.",
          "A lipstick @ on the restroom mirror: @velvetvixen_nyc. Nobody will say whose.",
        ],
        breaks: "The restroom mirror came down this morning to be replaced. There's no mirror in there tonight.",
      },
    ],
  },
  {
    key: "hallway",
    place: "front",
    at: "in the hallway, charging a phone",
    witness: "the security guard",
    details: [
      {
        id: "hall-outlet",
        story: "The only outlet in the hallway was loose, and the charger kept falling out.",
        confirm: [
          "The handyman's list: \"Hallway outlet loose, chargers keep falling out. Fix it tonight.\"",
          "A phone charger still dangling from the hallway outlet, taped in place. Somebody got desperate tonight.",
        ],
        breaks: "The hallway outlets were taped over this afternoon for the electrician. Nothing has been plugged in out there tonight.",
      },
      {
        id: "hall-wings",
        story: "A man down the hall was on speakerphone, ordering forty pounds of chicken wings.",
        confirm: [
          "A wing spot in the Bronx confirms it: forty pounds of wings ordered tonight, by a man on speakerphone at this address.",
          "The security guard's notes: a man on speakerphone in the hallway tonight, ordering forty pounds of wings. Very loud.",
        ],
        breaks: "The wing spot's records: nobody ordered forty pounds of anything tonight. The biggest order all night was a dozen.",
      },
    ],
  },
  {
    key: "bodega",
    place: "out",
    at: "across the street at the bodega",
    witness: "the bodega guy",
    details: [
      {
        id: "bodega-cat",
        story: "The bodega cat was asleep on the bread, and nobody dared to move it.",
        confirm: [
          "The bodega's post from tonight: \"Cat's on the bread again. No bread tonight, sorry.\" Posted right when the lights went out.",
          "Cat hair all over the bodega's bread shelf tonight, and one loaf with a cat-shaped dent in it.",
        ],
        breaks: "The bodega cat is at the vet all week. There's no cat in that store.",
      },
      {
        id: "bodega-scratchers",
        story: "A guy in a full Spider-Man suit bought every scratch-off ticket they had.",
        confirm: [
          "The bodega's lottery report: every scratch-off in the store sold to one customer tonight. He won four dollars.",
          "A sign taped to the bodega register: \"Spider-Man bought all the scratch-offs. Out until Monday.\"",
        ],
        breaks: "The bodega's lottery machine has been broken all week. Not one scratch-off sold tonight.",
      },
    ],
  },
  {
    key: "garage",
    place: "garage",
    at: "in the garage with the Don's Escalade",
    witness: "the Don's driver",
    details: [
      {
        id: "garage-alarm",
        story: "The Escalade's alarm went off and blared for a full minute.",
        confirm: [
          "The driver's note: the Escalade's alarm went off tonight and blared for a full minute. The neighbors complained.",
          "A noise complaint to 311: a car alarm in the club's garage, blaring for a full minute tonight.",
        ],
        breaks: "The Escalade's alarm was disconnected last week after the neighbors complained. It can't make a peep.",
      },
      {
        id: "garage-heel",
        story: "There was one red-bottom high heel on the Escalade's back seat.",
        confirm: [
          "The driver's report: one red-bottom heel on the Escalade's back seat tonight. He's not asking.",
          "One red-bottom heel, size seven, found in the Don's Escalade tonight. Now in the lost-and-found.",
        ],
        breaks: "The driver had the Escalade detailed at nine tonight. Not so much as a hair tie left in it.",
      },
    ],
  },
  {
    key: "cigarShop",
    place: "out",
    at: "next door at the cigar shop",
    witness: "the cigar shop owner",
    details: [
      {
        id: "cigar-parrot",
        story: "The cigar shop's parrot kept yelling \"Cops!\" at the customers.",
        confirm: [
          "The cigar shop owner apologizes: his parrot yelled \"Cops!\" at customers all night again.",
          "A note on the cigar shop door: \"The parrot is lying. There are no cops.\"",
        ],
        breaks: "The cigar shop's parrot is at the bird vet this week. The shop was quiet as a church.",
      },
      {
        id: "cigar-cubans",
        story: "A box of cigars labeled \"definitely not Cuban\" fell off the top shelf and burst open.",
        confirm: [
          "The cigar shop's inventory: one box of \"definitely not Cuban\" cigars dropped and dented tonight. Now half price.",
          "A burst cigar box behind the cigar shop counter, \"definitely not Cuban\" on the lid, cigars everywhere. It fell tonight.",
        ],
        breaks: "The cigar shop sold its last box of \"definitely not Cubans\" at noon. There wasn't one on any shelf tonight.",
      },
    ],
  },
  {
    key: "halalCart",
    place: "out",
    at: "at the halal cart on the corner",
    witness: "the halal cart guy",
    details: [
      {
        id: "cart-sauce",
        story: "The cart guy was giving free extra white sauce to anybody in a costume.",
        confirm: [
          "The halal cart's sign tonight: \"Costume = free extra white sauce.\" He ran out right when the lights went out.",
          "A pile of empty white-sauce bottles by the halal cart, and a sign: \"Halloween special. All gone.\"",
        ],
        breaks: "The halal cart has been out of white sauce since Tuesday. Not a drop tonight, costume or not.",
      },
      {
        id: "cart-zombies",
        story: "The line was twenty people deep, and half of them were dressed as zombies.",
        confirm: [
          "The halal cart's card reader: forty-two sales tonight, the busiest stretch right when the lights went out.",
          "A post from tonight: \"the halal cart line is all zombies lol,\" with the corner by the club in the background.",
        ],
        breaks: "The halal cart closed at nine tonight because the guy went home sick. Nobody lined up for anything.",
      },
    ],
  },
  {
    key: "rideshare",
    place: "out",
    at: "in an Uber, circling the block",
    witness: "the Uber driver",
    details: [
      {
        id: "ride-fare",
        story: "The fare hit forty dollars going around the same block.",
        confirm: [
          "An Uber receipt from tonight: one ride, twenty minutes circling this block. Forty dollars.",
          "An Uber driver's note on a rider tonight: \"Made me drive around the same block for twenty minutes.\"",
        ],
        breaks: "Uber's records: no ride picked anybody up or dropped anybody off near this club tonight.",
        topic: "rides",
      },
      {
        id: "ride-singing",
        story: "The driver had a karaoke playlist on and sang every word, badly.",
        confirm: [
          "A complaint to Uber: a driver sang along to his music tonight, very badly, circling this very block.",
          "Uber's message to a driver: \"Please stop singing to your riders.\" Dated tonight.",
        ],
        breaks: "The only Uber near this club tonight had a broken stereo. Not a note of music in that car.",
        topic: "rides",
      },
    ],
  },
  {
    key: "frontSteps",
    place: "out",
    at: "out on the front steps",
    witness: "the bouncer",
    details: [
      {
        id: "steps-joke",
        story: "The bouncer told the same joke about a duck and a lawyer four times.",
        confirm: [
          "The bouncer admits it: he told his duck-and-lawyer joke to anyone who'd stand still tonight. Four times, at least.",
          "The manager's text to the bouncer: \"Enough with the duck.\" Sent tonight.",
        ],
        breaks: "The bouncer lost his voice yesterday. He hasn't said a word all night, joke or otherwise.",
      },
      {
        id: "steps-citibike",
        story: "A guy on a Citi Bike crashed into the trash cans at the bottom of the steps and rode off yelling \"I'm okay!\"",
        confirm: [
          "Citi Bike's damage report: a bike banged up outside the club tonight. The rider \"said he was okay.\"",
          "A dented trash can at the bottom of the front steps and a Citi Bike reflector in the gutter. Tonight.",
        ],
        breaks: "The trash cans at the bottom of the front steps were taken in at nine. There was nothing down there to crash into.",
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
    const adult = many ? ["Both cleared, damn it.", "Both cleared. Boring, but legit."] : ["Cleared, unfortunately.", "Cleared. Boring, but legit."];
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
    (n) => `A waiter says ${n} asked twice tonight what time the Don usually heads home.`,
    (n) => `The cocktail waitress says ${n} paid for one drink with a hundred-dollar bill and didn't wait for the change.`,
    (n) => `A line cook says ${n} came in tonight through the kitchen door instead of the front.`,
    (n) => `The bartender says ${n} switched to plain water an hour before the lights went out.`,
    (n) => `Somebody saw ${n} send a text earlier tonight that said "It's handled," then delete the whole conversation.`,
    (n) => `The coat-check attendant says ${n} checked a jacket tonight, then came back for it twice. Kind of sketchy.`,
    (n) => `A busboy says ${n} was asking earlier which doors in the club lock from the inside.`,
    (n) => `The DJ says ${n} tipped him fifty bucks tonight to play the Don's favorite song. Twice.`,
  ],
  adult: [
    (n) => `A waiter says ${n} asked twice tonight what time the Don usually heads home. Creepy as hell, no cap.`,
    (n) => `The cocktail waitress says ${n} paid for one drink with a hundred-dollar bill and didn't wait for the change. Nobody's that rich. Nobody honest, anyway.`,
    (n) => `A line cook says ${n} came in tonight through the kitchen door instead of the front, like a damn raccoon. Sus.`,
    (n) => `The bartender says ${n} switched to plain water an hour before the lights went out. In this place, that's basically a confession.`,
    (n) => `Somebody saw ${n} text "It's handled" earlier tonight, then delete the whole thread. Could be about laundry. Could be.`,
    (n) => `The coat-check attendant says ${n} checked a jacket tonight, then came back for it twice. It's giving guilty.`,
    (n) => `A busboy says ${n} was asking earlier which doors in the club lock from the inside. Normal question. Totally normal. Not sus at all.`,
    (n) => `The DJ says ${n} tipped him fifty bucks tonight to play the Don's favorite song. Twice. Sentimental, or guilty. Lowkey both.`,
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
  found: "Taped under a drawer: the Don's emergency stash. $200 in chips, finders keepers. Take $200 from the bank.",
  empty: "Taped under a drawer: an empty envelope. Somebody already cleaned out the Don's stash.",
};
