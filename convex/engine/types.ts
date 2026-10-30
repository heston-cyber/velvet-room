import type { Debt, LateTip, Story } from "./stories";

// Pure game-engine types. Nothing in convex/engine touches the database,
// so the whole engine can be tested offline against thousands of fake games.

export type Rng = () => number; // uniform in [0, 1)

export type Suspect = {
  id: string;
  name: string;
  signature: string;
  who: string;
  killerOk: boolean;
  /** From the guest's drawing (v3 evidence: a witness can say whether the killer is a man or a woman). */
  sex?: "m" | "f";
};

/** What a weapon does to a body (v3 evidence: the coroner's report rules out whole kinds of weapon). */
export type WeaponKind = "blunt" | "blade" | "gun" | "cord" | "other";

export type Exhibit = {
  id: string;
  letter: string;
  name: string;
  description: string;
  /** Older games: the guest who picked it at sign-up. Since Oct 16 the game draws the weapons, so nobody owns one. */
  ownerId?: string;
  kind?: WeaponKind;
};

export type Room = { key: string; label: string };

/**
 * Oct 18: a place a clue says someone (or a watched weapon) was while the Don was killed. Each matches a room of the
 * house by its name ("The Bar" is the bar); "out" (the alley, the street, out back) is never a room.
 */
export type Place = "bar" | "office" | "lounge" | "cards" | "front" | "kitchen" | "bath" | "out" | "cellar" | "stairs" | "roof" | "garage" | "laundry" | "bedroom";

/** What a placed clue claims about the night (Oct 18), checked against everything else before a game starts. */
export type ClueFacts = {
  at?: Place[];
  seal?: boolean;
  crowd?: boolean;
  /** Phase 3: an alibi in the stories' words, where it says each guest was (guest id to spot key). */
  spots?: Record<string, string>;
  /** Phase 3: a story card, the detail it backs up, or (the deciding card) breaks. */
  detail?: string;
  breaks?: boolean;
};

export type Marker = { number: number; roomKey: string };

/** All rooms open from Round 1, or rooms open a few at a time ("waves"). */
export type SearchMode = "all" | "waves";

export type CaseInput = {
  suspects: Suspect[]; // guests who checked in
  exhibits: Exhibit[]; // the night's weapons
  rooms: Room[];
  /** Where the body is found. Drawn at Start unless given (tests). Public once the game starts. */
  bodyRoomKey?: string;
  markers: Marker[];
  /** Searching: every room open from Round 1, or rooms opening in waves. */
  search?: SearchMode;
  /** The order rooms open in when searching in waves. Drawn at Start unless given. */
  roomOrder?: string[];
  /** Which script writes the words: Classic or Adult (explicit). */
  tone?: "classic" | "adult";
  /** Older games: motives players wrote themselves, by suspect id. Blanks get written by the game. */
  playerMotives?: Record<string, { motive?: string }>;
  /**
   * v2: a killer and an accomplice (7+ guests). Both are drawn from everyone (the opt-in is ignored). The accomplice
   * didn't do it: the evidence treats them like any innocent, and may clear them.
   */
  accomplice?: boolean;
};

export type Elim = { suspects: string[]; exhibits: string[]; rooms: string[] };

export type ClueKind =
  | "suspect"
  | "suspectPair"
  | "suspectTrio"
  /** v3: a witness saw whether the killer is a man or a woman; clears everyone of the other sex. */
  | "witness"
  /** v3: the coroner's report rules out a whole kind of weapon (or everything but one kind). */
  | "coroner"
  | "exhibit"
  | "exhibitPair"
  | "room"
  | "twist"
  | "herring"
  | "flavor"
  /** Phase 3: a card that backs up a story's detail, or (the deciding card) breaks the killer's. They read alike. */
  | "story"
  /** Phase 3: the Don's stash, $200 in chips for the first phone to scan it. */
  | "stash";

export type Round = 1 | 2 | 3;

export type PlacedClue = {
  id: string;
  kind: ClueKind;
  text: string;
  elim: Elim;
  round: Round;
  channel: "marker" | "tv";
  markerNumber?: number;
  /** For herrings: the innocent the clue seems to point at. */
  pointsAt?: string;
  /** Oct 18: where it says people or things were, or what it says about a room. */
  facts?: ClueFacts;
};

export type Tip = { playerId: string; clueId: string; text: string; elim: Elim };

export type Solution = {
  killerId: string;
  exhibitId: string;
  roomKey: string;
  /** Killer + accomplice games: who helps the killer. Not part of what the clues prove. */
  accompliceId?: string;
};

export type Briefing = {
  playerId: string;
  role: "killer" | "accomplice" | "innocent";
  motive: string;
  /** Oct 18: the same motive, as the roll call reads it out ("The Don owed them…"). */
  motiveThey?: string;
  /** Older games only (Oct 18: "players dont need secrets"). */
  secret?: string;
  lines: string[];
};

export type CaseFile = {
  solution: Solution;
  /** Public from the moment the game starts: where the body was found, and the order rooms open in. */
  bodyRoomKey: string;
  roomOrder: string[];
  clues: PlacedClue[];
  /** Older games only (Oct 18: "players dont get a tip"). New case files have none. */
  tips: Tip[];
  briefings: Briefing[];
  attempts: number;
  /**
   * v4 (Oct 16): how many suspects, weapons and rooms the public evidence leaves open at the end of Round 3 (the
   * answer is always among them). Older case files narrowed to exactly one of each.
   */
  open?: Open;
  /** Phase 3 (Oct 20): where everyone was when the lights went out. Older case files have none. */
  stories?: Story[];
  /** Phase 3: who owes whom, always true. */
  debts?: Debt[];
  /** Phase 3: two real late tips for the jail vote (the killer's plant may replace one). */
  lateTips?: LateTip[];
};

/** What the evidence leaves standing at the end (v4): a few suspects, usually one weapon and one room. */
export type Open = { suspects: number; exhibits: number; rooms: number };
