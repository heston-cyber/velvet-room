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
  ownerId: string;
  kind?: WeaponKind;
};

export type Room = { key: string; label: string };

export type Marker = { number: number; roomKey: string };

/** All rooms open from Round 1, or rooms open a few at a time ("waves"). */
export type SearchMode = "all" | "waves";

export type CaseInput = {
  suspects: Suspect[]; // guests who checked in
  exhibits: Exhibit[]; // weapons handed in
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
  /** Motives and secrets players wrote themselves, by suspect id. Blanks get written by the game. */
  playerMotives?: Record<string, { motive?: string; secret?: string }>;
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
  | "flavor";

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
  secret: string;
  lines: string[];
};

export type CaseFile = {
  solution: Solution;
  /** Public from the moment the game starts: where the body was found, and the order rooms open in. */
  bodyRoomKey: string;
  roomOrder: string[];
  clues: PlacedClue[];
  tips: Tip[];
  briefings: Briefing[];
  attempts: number;
};
