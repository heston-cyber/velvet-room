// Pure game-engine types. Nothing in convex/engine touches the database,
// so the whole engine can be tested offline against thousands of fake games.

export type Rng = () => number; // uniform in [0, 1)

export type Suspect = {
  id: string;
  name: string;
  signature: string;
  who: string;
  killerOk: boolean;
};

export type Exhibit = {
  id: string;
  letter: string;
  name: string;
  description: string;
  ownerId: string;
};

export type Room = { key: string; label: string };

export type Marker = { number: number; roomKey: string };

export type CaseInput = {
  suspects: Suspect[]; // guests who checked in
  exhibits: Exhibit[]; // weapons handed in
  rooms: Room[];
  bodyRoomKey: string;
  markers: Marker[];
  /** Which script writes the words: Classic or Adult (explicit). */
  tone?: "classic" | "adult";
  /** Motives and secrets players wrote themselves, by suspect id. Blanks get written by the game. */
  playerMotives?: Record<string, { motive?: string; secret?: string }>;
};

export type Elim = { suspects: string[]; exhibits: string[]; rooms: string[] };

export type ClueKind =
  | "suspect"
  | "suspectPair"
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

export type Solution = { killerId: string; exhibitId: string; roomKey: string };

export type Briefing = {
  playerId: string;
  role: "killer" | "innocent";
  motive: string;
  secret: string;
  lines: string[];
};

export type CaseFile = {
  solution: Solution;
  clues: PlacedClue[];
  tips: Tip[];
  briefings: Briefing[];
  attempts: number;
};
