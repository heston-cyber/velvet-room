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
//   Oct 29: the spots are places in the house (Heston's list), see SPOTS.
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

// Oct 29 (Heston, after his test night: "where people were ... are located in the game world. example: Chrissie was
// alone in the restroom, a owl landed on the window seal. brendan was with josh at the bar, sam was on the front
// porch ... This keeps the game world centered in the real place and house"): every story happens somewhere in his
// house or right outside it, from his list (restroom, master bathroom, front porch, back porch, kitchen, garage,
// laundry room, driveway, curb, a walk around the neighborhood, a car on the street, master bedroom). Never one of the
// five search rooms (Heston, Oct 29: "not doing this: letting stories put people in the search rooms"). The New York
// spots are gone (the halal cart, the bodega, the rideshare, the alley...).
export const SPOTS: Spot[] = [
  {
    key: "restroom",
    place: "bath",
    at: "in the restroom",
    witness: "the line of people waiting outside the door",
    details: [
      {
        id: "rest-owl",
        story: "An owl landed on the window sill and just stared in, completely unbothered.",
        confirm: [
          "A post on the neighborhood app tonight: \"Huge owl sitting on window sills up and down the street. Just staring. Is this a sign?\"",
          "Owl feathers and fresh claw scratches on the restroom window sill, from tonight.",
        ],
        breaks: "The restroom window sill has been covered in bird spikes since spring. Nothing with feathers could land on it.",
      },
      {
        id: "rest-toilet",
        story: "The toilet wouldn't stop running until the tank lid came off and the chain got jiggled.",
        confirm: [
          "A note taped inside the restroom toilet tank, written tonight: \"JIGGLE THE CHAIN.\"",
          "The water company's app: a spike tonight, the restroom toilet running nonstop right when the lights went out.",
        ],
        breaks: "The restroom's water was shut off this afternoon for a plumbing repair. Nothing in there has run all night.",
      },
    ],
  },
  {
    key: "masterBath",
    place: "bath",
    at: "in the master bathroom",
    witness: "the smart speaker by the sink",
    details: [
      {
        id: "mbath-boo",
        story: "The mirror was fogged up from an earlier shower, and somebody had written BOO in it.",
        confirm: [
          "Finger-written letters on the master bathroom mirror that show up every time it steams: B, O, O. Written tonight.",
          "The master bathroom fan's app: switched on tonight to clear the steam, right when the lights went out.",
        ],
        breaks: "The master bathroom shower has been broken since Sunday. Nobody's showered in there all week, so there was no steam to write in.",
      },
      {
        id: "mbath-spider",
        story: "A huge spider came up out of the tub drain and took its sweet time leaving.",
        confirm: [
          "A huge spider trapped under a cup on the master bathroom counter, with a sticky note: \"Caught it tonight. Do NOT lift.\"",
          "The hosts' group chat tonight: \"There is a spider the size of a hand in our tub. Not joking.\"",
        ],
        breaks: "Pest control sprayed the master bathroom this morning, and the stopper has been in the tub drain all day. Nothing came up that drain.",
      },
    ],
  },
  {
    key: "frontPorch",
    place: "front",
    at: "out on the front porch",
    witness: "a pack of trick-or-treaters",
    details: [
      {
        id: "porch-candy",
        story: "A little kid took the whole candy bowl instead of one piece and sprinted off with it.",
        confirm: [
          "The doorbell camera tonight: a kid in a dinosaur costume grabbing the entire candy bowl off the front porch and running.",
          "The candy bowl turned up in a neighbor's yard tonight, empty, with a note taped to it: \"Sorry. He's five.\"",
        ],
        breaks: "The hosts never put candy out tonight. The candy bowl spent the whole night in the hall closet, with a \"Sorry, no candy\" sign on the front door.",
      },
      {
        id: "porch-ghost",
        story: "The neighbor's giant inflatable ghost came loose and blew right up onto the porch.",
        confirm: [
          "A neighbor's post tonight: \"Has anyone seen our 12-foot ghost? It blew off right around when the power flickered.\"",
          "A deflated inflatable ghost on the front porch tonight, still tied to a snapped yard stake.",
        ],
        breaks: "The neighbor's inflatable ghost has a hole in it and never got blown up this year. It's still in a box in their basement.",
      },
    ],
  },
  {
    key: "backPorch",
    place: "out",
    at: "out on the back porch",
    witness: "the neighbor over the back fence",
    details: [
      {
        id: "back-raccoon",
        story: "A raccoon came up the steps, looked right at them, and walked off with a cookie.",
        confirm: [
          "Raccoon tracks across the back porch tonight, leading to an empty cookie wrapper by the steps.",
          "The neighbor's trail camera, tonight: a raccoon on the back porch steps, holding a cookie like it paid for it.",
        ],
        breaks: "Animal control trapped the raccoon that lives under the back porch on Monday and drove it out of town. Nothing's come up those steps since.",
      },
      {
        id: "back-firepit",
        story: "The neighbors' fire pit smoke kept blowing over the fence, straight onto the porch.",
        confirm: [
          "The neighbor over the back fence, on the neighborhood app tonight: \"Sorry about the fire pit smoke. The wind kept switching.\"",
          "Ash on the back porch chairs tonight, and the cushions still smell like smoke.",
        ],
        breaks: "There was a burn ban on tonight. The neighbors' fire pit has a cover on it and hasn't been lit all week.",
      },
    ],
  },
  {
    key: "kitchen",
    place: "kitchen",
    at: "in the kitchen",
    witness: "the camera over the kitchen door",
    details: [
      {
        id: "kitchen-popcorn",
        story: "Somebody's popcorn burned in the microwave and set off the smoke alarm.",
        confirm: [
          "A blackened bag of popcorn in the kitchen trash tonight. The microwave still smells like it.",
          "The smoke detector's app: the kitchen alarm went off tonight, right when the lights went out.",
        ],
        breaks: "The kitchen microwave has been broken since last week. A note on it says \"DO NOT USE,\" and it isn't even plugged in.",
      },
      {
        id: "kitchen-ice",
        story: "The ice maker dumped a whole load of ice onto the floor.",
        confirm: [
          "A pile of half-melted ice in front of the fridge tonight, with a towel thrown over it.",
          "The fridge's app: \"Ice bin overflow\" tonight, right when the lights went out.",
        ],
        breaks: "The fridge's ice maker has been switched off all month to fix a leak. There isn't one cube in it.",
      },
    ],
  },
  {
    key: "garage",
    place: "garage",
    at: "out in the garage",
    witness: "the garage door camera",
    details: [
      {
        id: "garage-door",
        story: "The garage door opened by itself, then closed again.",
        confirm: [
          "The garage door's app tonight: opened and closed on its own right when the lights went out. \"Unknown remote.\"",
          "A neighbor's post tonight: \"Anyone else's garage door opening by itself? Ours just did. Happy Halloween, I guess.\"",
        ],
        breaks: "The garage door's spring snapped on Monday, and the opener has been unplugged ever since. That door can't open by itself, or at all.",
      },
      {
        id: "garage-skeleton",
        story: "A decoration skeleton fell off a shelf and landed in a heap, scaring them half to death.",
        confirm: [
          "A plastic skeleton in pieces on the garage floor tonight, under a shelf with one empty hook.",
          "The Halloween bin in the garage, open tonight, with a skeleton's arm hanging out and a sticky note: \"It fell.\"",
        ],
        breaks: "Every Halloween decoration came out of the garage last weekend and went up in the yard. Those shelves are bare; there's no skeleton in there.",
      },
    ],
  },
  {
    key: "laundry",
    place: "laundry",
    at: "in the laundry room",
    witness: "the dryer's door log",
    details: [
      {
        id: "laundry-buzz",
        story: "The dryer buzzer went off and wouldn't quit until someone opened the door.",
        confirm: [
          "The dryer's app: cycle done tonight, door opened right when the lights went out.",
          "A warm load of towels on top of the dryer tonight, half folded.",
        ],
        breaks: "The dryer has been broken since Saturday, with the repair company's tag still on it. It hasn't run all week.",
      },
      {
        id: "laundry-sock",
        story: "A sock was stuck in the washer door, and water was dripping onto the floor.",
        confirm: [
          "A wet sock wedged in the washer's door seal tonight, and a puddle under the machine.",
          "The washer's app tonight: \"Leak detected at door seal,\" right when the lights went out.",
        ],
        breaks: "The washer's water was shut off this morning for a new hose. It couldn't drip a drop tonight.",
      },
    ],
  },
  {
    key: "driveway",
    place: "out",
    at: "out in the driveway",
    witness: "the neighbor across the street",
    details: [
      {
        id: "drive-floodlight",
        story: "The motion floodlight kept clicking on and off with nobody near it.",
        confirm: [
          "The floodlight camera tonight: clicking on and off over the driveway, and nothing in the shot.",
          "The floodlight's app: forty-one motion alerts in the driveway tonight, most of them right when the lights went out.",
        ],
        breaks: "The driveway floodlight's bulb burned out on Sunday and hasn't been replaced. It hasn't come on all week.",
      },
      {
        id: "drive-delivery",
        story: "A delivery driver pulled in, realized it was the wrong house, and backed out across the lawn.",
        confirm: [
          "Fresh tire tracks across the front lawn tonight, from the driveway to the street.",
          "A delivery app message tonight: \"Sorry, wrong address. Your package will come back tomorrow.\"",
        ],
        breaks: "The delivery company's records: no drivers on this route tonight. The depot closed at six for Halloween.",
      },
    ],
  },
  {
    key: "curb",
    place: "out",
    at: "out at the curb",
    witness: "a neighbor dragging their trash cans out",
    details: [
      {
        id: "curb-scooter",
        story: "A kid in a glowing skeleton costume zoomed past on an electric scooter, way too fast.",
        confirm: [
          "The neighbor's doorbell camera tonight: a glowing skeleton on an electric scooter flying down the street.",
          "A post on the neighborhood app tonight: \"PSA: glowing skeleton kid on a scooter doing 25 down our street.\"",
        ],
        breaks: "The glowing-skeleton kid's parents took his scooter away this afternoon. It's been locked in their shed all night.",
      },
      {
        id: "curb-pizza",
        story: "A gust knocked the trash cans over and sent a pizza box cartwheeling down the street.",
        confirm: [
          "Both trash cans tipped over at the curb tonight, and a pizza box jammed in the storm drain down the street.",
          "A neighbor's post tonight: \"Whose pizza box just blew into my yard? It's pepperoni, if that helps.\"",
        ],
        breaks: "Trash day was this morning, and both cans went back up by the house right after. There wasn't a can at the curb all night.",
      },
    ],
  },
  {
    key: "walk",
    place: "out",
    at: "out walking around the neighborhood",
    witness: "a neighbor walking their dog",
    details: [
      {
        id: "walk-fog",
        story: "A house down the street had a fog machine going so hard the whole block disappeared for a minute.",
        confirm: [
          "A post on the neighborhood app tonight: \"Sorry about the fog. We bought the big machine.\"",
          "A video posted tonight: fog rolling across the whole street from one yard, right when the lights went out.",
        ],
        breaks: "The fog machine house got shut down by the fire department at eight. Nothing's been fogging on that street since.",
      },
      {
        id: "walk-hotdog",
        story: "A wiener dog dressed as a hot dog got loose and ran laps around them.",
        confirm: [
          "A lost-dog post tonight: \"Our wiener dog slipped his leash in his hot dog costume. FOUND HIM.\"",
          "A tiny hot dog costume, mustard and all, left on the sidewalk down the street tonight.",
        ],
        breaks: "The only wiener dog on the street spent tonight at the emergency vet. He never left the clinic, costume or not.",
      },
    ],
  },
  {
    key: "car",
    place: "out",
    at: "sitting in a car parked on the street",
    witness: "the doorbell camera across the street",
    details: [
      {
        id: "car-alarm",
        story: "Another car's alarm went off and wouldn't quit for five straight minutes.",
        confirm: [
          "A post on the neighborhood app tonight: \"Whoever's car alarm that was: five minutes. Really?\"",
          "The doorbell camera across the street tonight: a car's lights flashing and its alarm going, right when the lights went out.",
        ],
        breaks: "The street had no-parking signs up all night for street sweeping, and the city towed anything left. There wasn't a single car parked out there.",
      },
      {
        id: "car-radio",
        story: "The radio was on a station playing nothing but the Monster Mash, on repeat.",
        confirm: [
          "A local station's playlist tonight: the Monster Mash eleven times in a row, a Halloween stunt, right when the lights went out.",
          "A post tonight: \"Is the oldies station really just playing Monster Mash on a loop?\"",
        ],
        breaks: "The oldies station pulled its Monster Mash stunt after the first hour. Its playlist shows normal songs the rest of the night.",
      },
    ],
  },
  {
    key: "masterBedroom",
    place: "bedroom",
    at: "in the master bedroom",
    witness: "the smart speaker on the nightstand",
    details: [
      {
        id: "bed-alarm",
        story: "An alarm clock went off at full volume and took forever to find.",
        confirm: [
          "The alarm clock from the master bedroom, found under the bed tonight, set for the exact minute the lights went out.",
          "The smart speaker's history tonight: \"Stop the alarm,\" said twice, right when the lights went out.",
        ],
        breaks: "The master bedroom alarm clock hasn't had batteries since daylight saving. It couldn't make a sound tonight.",
      },
      {
        id: "bed-phone",
        story: "A phone on the dresser kept buzzing, the same unknown number calling over and over.",
        confirm: [
          "A missed-call log from tonight: the same unknown number, nine times in a row, right when the lights went out.",
          "A spam-call warning on the neighborhood app tonight: \"Unknown number calling everybody on the street, over and over.\"",
        ],
        breaks: "The only phone left in the master bedroom tonight has been dead since this afternoon. Its charger is at work.",
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
  // Oct 29: about the party in the house (no club staff any more), never where anyone was when the lights went out.
  classic: [
    (n) => `A neighbor says ${n} asked twice tonight what time the Don usually heads home.`,
    (n) => `The pizza delivery guy says ${n} paid for the whole order with a hundred-dollar bill and didn't wait for the change.`,
    (n) => `The neighbor across the street says ${n} came in tonight through the back door instead of the front.`,
    (n) => `Somebody noticed ${n} switched to plain water an hour before the lights went out.`,
    (n) => `Somebody saw ${n} send a text earlier tonight that said "It's handled," then delete the whole conversation.`,
    (n) => `Somebody saw ${n} hang a jacket by the door tonight, then go back to check its pockets twice. Kind of sketchy.`,
    (n) => `Somebody overheard ${n} asking earlier which doors in the house lock from the inside.`,
    (n) => `The speaker's history shows ${n} queued up the Don's favorite song tonight. Twice.`,
  ],
  adult: [
    (n) => `A neighbor says ${n} asked twice tonight what time the Don usually heads home. Creepy as hell, no cap.`,
    (n) => `The pizza guy says ${n} paid for the whole order with a hundred-dollar bill and didn't wait for the change. Nobody's that rich. Nobody honest, anyway.`,
    (n) => `The neighbor across the street says ${n} came in tonight through the back door instead of the front, like a damn raccoon. Sus.`,
    (n) => `Somebody noticed ${n} switched to plain water an hour before the lights went out. At this party, that's basically a confession.`,
    (n) => `Somebody saw ${n} text "It's handled" earlier tonight, then delete the whole thread. Could be about laundry. Could be.`,
    (n) => `Somebody saw ${n} hang a jacket by the door tonight, then go back to check the pockets twice. It's giving guilty.`,
    (n) => `Somebody overheard ${n} asking which doors in the house lock from the inside. Normal question. Totally normal. Not sus at all.`,
    (n) => `The speaker's history shows ${n} queued up the Don's favorite song tonight. Twice. Sentimental, or guilty. Lowkey both.`,
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
