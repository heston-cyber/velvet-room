// The book (Oct 21). Heston, Oct 20: "I like the betting thing. It adds interest without significantly altering any
// gameplay"; "the earlier round you make a bet you get higher ods"; "One bet per game. the bet is seperate than lock in
// vote. you hand the chips over (set on the TV stand) same bet button no betting after the accusations begin. Betting is
// completly optional and doesnt need an explaination in the rules intro"; "pot stays on the 'betting' tab. Little rules
// section (?) in the betting tab"; "jail bird can not bet"; "No bettting payouts at the end. it all happens right in the
// betting tab"; "Max bet of $500 total each game"; and the plan's settled details: Round 1 pays 4 to 1, Round 2 (the
// jail vote included) 3 to 1, Round 3 2 to 1; wrong bets go to the killer; the killer's own bet doesn't count.
// Pure: the server (convex/game.ts) keeps the bets.

export const BET_AMOUNTS = [100, 200, 300, 400, 500] as const;
export const MAX_BET = 500;

/** What a bet placed in this round pays, to 1. Round 4 on (the lock-in): the book is closed. */
export function oddsFor(round: number): number | null {
  return round === 1 ? 4 : round === 2 ? 3 : round === 3 ? 2 : null;
}

export type Bet = { playerId: string; suspectId: string; amount: number; odds: number };

/** What a bet comes to once the answer is public. */
export type BetResult =
  | { kind: "won"; amount: number; odds: number; winnings: number; take: number }
  | { kind: "lost"; amount: number }
  | { kind: "void"; amount: number };

export function settleBet(bet: Bet, killerId: string): BetResult {
  // The killer's bet was cover: it doesn't count, and they take their chips back.
  if (bet.playerId === killerId) return { kind: "void", amount: bet.amount };
  if (bet.suspectId === killerId) return { kind: "won", amount: bet.amount, odds: bet.odds, winnings: bet.amount * bet.odds, take: bet.amount + bet.amount * bet.odds };
  return { kind: "lost", amount: bet.amount };
}

/** Everything wrong on the stand goes to the killer. */
export const killerTake = (bets: Bet[], killerId: string) =>
  bets.filter((b) => b.playerId !== killerId && b.suspectId !== killerId).reduce((n, b) => n + b.amount, 0);

/** The chips on the TV stand. */
export const pot = (bets: { amount: number }[]) => bets.reduce((n, b) => n + b.amount, 0);
