import { Card, combinations, isJoker, points, totalPoints } from './cards';

/** 同花：Joker 无花色，含 Joker 一律不算同花 */
export function isFlush(cards: Card[]): boolean {
  if (cards.some((c) => c.suit === null)) return false;
  return cards.every((c) => c.suit === cards[0].suit);
}

/** 顺子：点序连续（A=1 … K=13，Joker=14，故 Q+K+Joker 成顺） */
export function isStraight(cards: Card[]): boolean {
  const ranks = cards.map((c) => c.rank).sort((a, b) => a - b);
  return ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1);
}

export function isTrips(cards: Card[]): boolean {
  return cards.length === 3 && cards.every((c) => c.rank === cards[0].rank);
}

export function hasBothJokers(cards: Card[]): boolean {
  return cards.filter(isJoker).length === 2;
}

export interface BonusEval {
  mult: number;
  tags: string[];
}

/**
 * 3 张牌的底牌加成：同花 2×、顺子 2×、三条 3×、王炸 3×。
 * 同一组 3 张同时满足多个加成时相乘（如 3 张同花顺 = 4×）。
 */
export function bonusOf3(cards: Card[]): BonusEval {
  let mult = 1;
  const tags: string[] = [];
  if (isTrips(cards)) {
    mult *= 3;
    tags.push('三条');
  }
  if (hasBothJokers(cards)) {
    mult *= 3;
    tags.push('王炸');
  }
  if (isFlush(cards)) {
    mult *= 2;
    tags.push('同花');
  }
  if (isStraight(cards)) {
    mult *= 2;
    tags.push('顺子');
  }
  return { mult, tags };
}

export interface KickerEval {
  base: number;
  tag: string;
}

/** 2 张踢脚：对子/双 Joker 7×；否则按点数和的个位：0→5、7→2、8→3、9→4、其余→1 */
export function evalKicker(cards: Card[]): KickerEval {
  const [a, b] = cards;
  if (a.rank === b.rank) {
    return { base: 7, tag: isJoker(a) ? '双王' : '对子' };
  }
  const unit = (points(a) + points(b)) % 10;
  if (unit === 0) return { base: 5, tag: '牛牛' };
  if (unit === 7) return { base: 2, tag: '踢脚7' };
  if (unit === 8) return { base: 3, tag: '踢脚8' };
  if (unit === 9) return { base: 4, tag: '踢脚9' };
  return { base: 1, tag: `踢脚${unit}` };
}

export interface SpecialWin {
  name: string;
  base: number;
}

/** 特殊胜利（整手 5 张，无需凑牛） */
export function evalSpecials(cards: Card[]): SpecialWin[] {
  const specials: SpecialWin[] = [];
  if (isStraight(cards)) specials.push({ name: '五张顺子', base: 8 });
  if (isFlush(cards)) specials.push({ name: '五张同花', base: 9 });
  if (cards.every((c) => c.rank >= 11)) specials.push({ name: '五花', base: 10 });
  if (totalPoints(cards) <= 10) specials.push({ name: '十小', base: 11 });
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  if ([...counts.values()].some((n) => n === 4)) specials.push({ name: '炸弹', base: 12 });
  return specials;
}

/**
 * 特殊胜利的底牌加成：枚举 C(5,3) 个子集，取加成乘积最大的某一个子集。
 * 加成只在同一个子集自身同时满足时才相乘，不能跨子集拼凑。
 */
export function bestBonusSubset(cards: Card[]): BonusEval {
  let best: BonusEval = { mult: 1, tags: [] };
  for (const combo of combinations(cards, 3)) {
    const b = bonusOf3(combo);
    if (b.mult > best.mult) best = b;
  }
  return best;
}

export interface Split {
  bottom: Card[];
  kicker: Card[];
}

export interface HandEval {
  kind: 'special' | 'niu' | 'none';
  /** 牌力：特殊胜利 100+最高基数；普通牛 = 踢脚基数；无牛 = 0。平局再按德州扑克比 5 张 */
  power: number;
  /** 结算赔率（无牛获胜按 1×） */
  payout: number;
  label: string;
  detail: string;
  split: Split | null;
  specials: SpecialWin[];
}

export function evaluateHand(cards: Card[]): HandEval {
  const specials = evalSpecials(cards);
  if (specials.length > 0) {
    const baseSum = specials.reduce((s, x) => s + x.base, 0);
    const maxBase = Math.max(...specials.map((x) => x.base));
    const bonus = bestBonusSubset(cards);
    const payout = baseSum * bonus.mult;
    const baseText = specials.length > 1 ? `(${specials.map((s) => s.base).join('+')})` : `${baseSum}`;
    const detail =
      bonus.mult > 1
        ? `${baseText} × ${bonus.mult}（${bonus.tags.join('·')}）= ${payout}×`
        : `${baseText}× = ${payout}×`;
    return {
      kind: 'special',
      power: 100 + maxBase,
      payout,
      label: specials.map((s) => s.name).join('+'),
      detail,
      split: null,
      specials,
    };
  }

  let best: { split: Split; kicker: KickerEval; bonus: BonusEval; payout: number } | null = null;
  for (const bottom of combinations(cards, 3)) {
    if (totalPoints(bottom) % 10 !== 0) continue;
    const kickerCards = cards.filter((c) => !bottom.includes(c));
    const kicker = evalKicker(kickerCards);
    const bonus = bonusOf3(bottom);
    const payout = kicker.base * bonus.mult;
    if (
      !best ||
      kicker.base > best.kicker.base ||
      (kicker.base === best.kicker.base && payout > best.payout)
    ) {
      best = { split: { bottom, kicker: kickerCards }, kicker, bonus, payout };
    }
  }

  if (best) {
    const multText =
      best.bonus.mult > 1 ? ` × ${best.bonus.mult}（${best.bonus.tags.join('·')}）` : '';
    return {
      kind: 'niu',
      power: best.kicker.base,
      payout: best.payout,
      label: best.kicker.tag,
      detail: `${best.kicker.base}${multText} = ${best.payout}×`,
      split: best.split,
      specials: [],
    };
  }

  return {
    kind: 'none',
    power: 0,
    payout: 1,
    label: '无牛',
    detail: '1×',
    split: null,
    specials: [],
  };
}
