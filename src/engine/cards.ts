export type Suit = 'S' | 'H' | 'D' | 'C';

/** rank: 1=A, 2..10, 11=J, 12=Q, 13=K, 14=Joker（Joker 无花色，顺子中视为 K 的下一张） */
export const JOKER_RANK = 14;

export interface Card {
  id: string;
  rank: number;
  suit: Suit | null; // 仅 Joker 为 null
}

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };

export function isJoker(card: Card): boolean {
  return card.rank === JOKER_RANK;
}

/** J/Q/K/Joker 均算 10 点，A 算 1 点 */
export function points(card: Card): number {
  return card.rank >= 10 ? 10 : card.rank;
}

export function totalPoints(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + points(c), 0);
}

export function rankLabel(rank: number): string {
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  if (rank === JOKER_RANK) return 'JOKER';
  return String(rank);
}

export function makeDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({ id: `${suit}${rank}`, rank, suit });
    }
  }
  deck.push({ id: 'JOKER-1', rank: JOKER_RANK, suit: null });
  deck.push({ id: 'JOKER-2', rank: JOKER_RANK, suit: null });
  return deck;
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function combinations<T>(arr: T[], k: number): T[][] {
  const result: T[][] = [];
  const combo: T[] = [];
  const walk = (start: number) => {
    if (combo.length === k) {
      result.push(combo.slice());
      return;
    }
    for (let i = start; i <= arr.length - (k - combo.length); i++) {
      combo.push(arr[i]);
      walk(i + 1);
      combo.pop();
    }
  };
  walk(0);
  return result;
}
