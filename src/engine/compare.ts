import { Card, JOKER_RANK } from './cards';
import { HandEval } from './scoring';

/** 德州比较用点序：2..10、J=11、Q=12、K=13、A=14、Joker=15（最大单牌） */
function texasRank(card: Card): number {
  if (card.rank === 1) return 14;
  if (card.rank === JOKER_RANK) return 15;
  return card.rank;
}

/**
 * 5 张牌的德州扑克牌力向量（字典序可比）：
 * [类别, 决胜点数...]，类别：8 同花顺 7 四条 6 葫芦 5 同花 4 顺子 3 三条 2 两对 1 对子 0 高牌
 */
export function texasValue(cards: Card[]): number[] {
  const ranks = cards.map(texasRank).sort((a, b) => b - a);

  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  // 先按张数、再按点数排序的分组，如 [[9,3],[5,2]] 表示三张9带一对5
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  const flush = cards.every((c) => c.suit !== null && c.suit === cards[0].suit);

  let straightHigh = 0;
  const distinct = [...new Set(ranks)];
  if (distinct.length === 5) {
    if (distinct[0] - distinct[4] === 4) straightHigh = distinct[0];
    // A-2-3-4-5 特例（wheel）
    if (distinct[0] === 14 && distinct[1] === 5 && distinct[1] - distinct[4] === 3) straightHigh = 5;
  }

  if (straightHigh && flush) return [8, straightHigh];
  if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
  if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
  if (flush) return [5, ...ranks];
  if (straightHigh) return [4, straightHigh];
  if (groups[0][1] === 3) return [3, groups[0][0], groups[1][0], groups[2][0]];
  if (groups[0][1] === 2 && groups[1][1] === 2) return [2, groups[0][0], groups[1][0], groups[2][0]];
  if (groups[0][1] === 2) return [1, groups[0][0], groups[1][0], groups[2][0], groups[3][0]];
  return [0, ...ranks];
}

function compareArrays(a: number[], b: number[]): number {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function compareTexas(a: Card[], b: Card[]): number {
  return compareArrays(texasValue(a), texasValue(b));
}

/** Showhand 比牌：先比牌力（特殊基数/踢脚基数，无牛为 0），相同则按德州扑克比 5 张 */
export function compareHands(
  a: { eval: HandEval; cards: Card[] },
  b: { eval: HandEval; cards: Card[] },
): number {
  if (a.eval.power !== b.eval.power) return a.eval.power - b.eval.power;
  return compareTexas(a.cards, b.cards);
}
