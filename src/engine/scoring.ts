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

/**
 * 底牌成牛：点数和为 10 的倍数，或本身是三条。
 * 三条单独成牛——否则 3×点数 只有点数为 10 时才是 10 的倍数，
 * A~9 的三条永远无牛，规则表里的三条 ×3 对它们形同虚设。
 */
export function isNiuBottom(cards: Card[]): boolean {
  return cards.length === 3 && (totalPoints(cards) % 10 === 0 || isTrips(cards));
}

export function hasBothJokers(cards: Card[]): boolean {
  return cards.filter(isJoker).length === 2;
}

/** 底牌加成的种类（UI 按当前语言渲染，引擎不产出文案） */
export type BonusTag = 'trips' | 'jokerBomb' | 'flush' | 'straight';

export interface BonusEval {
  mult: number;
  tags: BonusTag[];
}

/**
 * 3 张牌的底牌加成：同花 2×、顺子 2×、三条 3×。
 * 同一组 3 张同时满足多个加成时相乘（如 3 张同花顺 = 4×）。
 * 王炸不在此列——它是手牌级加成，见 handBonus()。
 */
export function bonusOf3(cards: Card[]): BonusEval {
  let mult = 1;
  const tags: BonusTag[] = [];
  if (isTrips(cards)) {
    mult *= 3;
    tags.push('trips');
  }
  if (isFlush(cards)) {
    mult *= 2;
    tags.push('flush');
  }
  if (isStraight(cards)) {
    mult *= 2;
    tags.push('straight');
  }
  return { mult, tags };
}

/** 无牛获胜的基础赔分 */
const NO_NIU_PAYOUT = 1;

/**
 * 手牌级加成：5 张里有双王即 ×3，不论两张王在底牌还是踢脚。
 * 与底牌倍率相乘叠加，无牛时同样作用在基础赔分上。
 * （王炸只有 2 张，本身不成底牌，也不赋予成牛资格——底牌仍需第三张凑成牛。）
 */
export function handBonus(cards: Card[]): BonusEval {
  return hasBothJokers(cards) ? { mult: 3, tags: ['jokerBomb'] } : { mult: 1, tags: [] };
}

/** 特殊胜利的种类 */
export type SpecialName = 'straight5' | 'flush5' | 'allFace' | 'tenSmall' | 'bomb';

/** 牌型标签：结构化，交给 UI 按语言渲染 */
export type HandLabel =
  | { k: 'none' }
  | { k: 'pair' }
  | { k: 'doubleJoker' }
  | { k: 'niuniu' }
  | { k: 'kicker'; unit: number }
  | { k: 'special'; names: SpecialName[] };

export interface KickerEval {
  base: number;
  label: HandLabel;
}

/** 2 张踢脚：对子/双 Joker 7×；否则按点数和的个位：0→5、7→2、8→3、9→4、其余→1 */
export function evalKicker(cards: Card[]): KickerEval {
  const [a, b] = cards;
  if (a.rank === b.rank) {
    return { base: 7, label: { k: isJoker(a) ? 'doubleJoker' : 'pair' } };
  }
  const unit = (points(a) + points(b)) % 10;
  if (unit === 0) return { base: 5, label: { k: 'niuniu' } };
  if (unit === 7) return { base: 2, label: { k: 'kicker', unit } };
  if (unit === 8) return { base: 3, label: { k: 'kicker', unit } };
  if (unit === 9) return { base: 4, label: { k: 'kicker', unit } };
  return { base: 1, label: { k: 'kicker', unit } };
}

export interface SpecialWin {
  name: SpecialName;
  base: number;
}

/** 特殊胜利（整手 5 张，无需凑牛） */
export function evalSpecials(cards: Card[]): SpecialWin[] {
  const specials: SpecialWin[] = [];
  if (isStraight(cards)) specials.push({ name: 'straight5', base: 8 });
  if (isFlush(cards)) specials.push({ name: 'flush5', base: 9 });
  if (cards.every((c) => c.rank >= 11)) specials.push({ name: 'allFace', base: 10 });
  if (totalPoints(cards) <= 10) specials.push({ name: 'tenSmall', base: 11 });
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  if ([...counts.values()].some((n) => n === 4)) specials.push({ name: 'bomb', base: 12 });
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

/** 牌力明细的结构化数据（UI 渲染成「牌力 A × 倍率 B（…）= C 分」） */
export interface EvalDetail {
  /** 牌力基数；特殊胜利为各基数之和；无牛为 0 */
  base: number;
  /** 同时满足多个特殊胜利时的各项基数，用于显示 (8+9) */
  parts?: number[];
  /** 最终倍率 = 底牌倍率 × 手牌倍率 */
  mult: number;
  tags: BonusTag[];
  payout: number;
  /** 无牛：牌力为 0，赔分自基础 1 起算，文案另行渲染 */
  noNiu?: boolean;
}

export interface HandEval {
  kind: 'special' | 'niu' | 'none';
  /** 牌力：特殊胜利 100+最高基数；普通牛 = 踢脚基数；无牛 = 0。平局再按德州扑克比 5 张 */
  power: number;
  /** 结算赔率（无牛获胜按 1×） */
  payout: number;
  label: HandLabel;
  detail: EvalDetail;
  split: Split | null;
  specials: SpecialWin[];
}

/** 无牛：牌力 0，赔分 = 基础 1 × 手牌倍率（有王炸则 3 分） */
function noneEval(hand: Card[], split: Split | null): HandEval {
  const hb = handBonus(hand);
  const payout = NO_NIU_PAYOUT * hb.mult;
  return {
    kind: 'none',
    power: 0,
    payout,
    label: { k: 'none' },
    detail: { base: 0, mult: hb.mult, tags: hb.tags, payout, noNiu: true },
    split,
    specials: [],
  };
}

/**
 * 按玩家自选的 3 张底牌评牌（拆分阶段的结果）：
 * - 特殊胜利仍自动生效（整手 5 张性质，与拆分无关）
 * - 所选底牌凑不成牛就是无牛——即使存在能成牛的其他拆法（手动拆分的博弈点）
 */
export function evaluateChosen(cards: Card[], chosenBottom: string[] | null): HandEval {
  if (evalSpecials(cards).length > 0 || !chosenBottom) return evaluateHand(cards);
  const bottom = cards.filter((c) => chosenBottom.includes(c.id));
  const kicker = cards.filter((c) => !chosenBottom.includes(c.id));
  if (bottom.length !== 3) return evaluateHand(cards);

  if (!isNiuBottom(bottom)) {
    return noneEval(cards, { bottom, kicker });
  }
  const k = evalKicker(kicker);
  const bonus = bonusOf3(bottom);
  const hb = handBonus(cards);
  const mult = bonus.mult * hb.mult;
  const payout = k.base * mult;
  return {
    kind: 'niu',
    power: k.base,
    payout,
    label: k.label,
    detail: { base: k.base, mult, tags: [...bonus.tags, ...hb.tags], payout },
    split: { bottom, kicker },
    specials: [],
  };
}

export function evaluateHand(cards: Card[]): HandEval {
  const specials = evalSpecials(cards);
  if (specials.length > 0) {
    const baseSum = specials.reduce((s, x) => s + x.base, 0);
    const maxBase = Math.max(...specials.map((x) => x.base));
    const bonus = bestBonusSubset(cards);
    const hb = handBonus(cards);
    const mult = bonus.mult * hb.mult;
    const payout = baseSum * mult;
    return {
      kind: 'special',
      power: 100 + maxBase,
      payout,
      label: { k: 'special', names: specials.map((s) => s.name) },
      detail: {
        base: baseSum,
        parts: specials.length > 1 ? specials.map((s) => s.base) : undefined,
        mult,
        tags: [...bonus.tags, ...hb.tags],
        payout,
      },
      split: null,
      specials,
    };
  }

  let best: { split: Split; kicker: KickerEval; bonus: BonusEval; payout: number } | null = null;
  for (const bottom of combinations(cards, 3)) {
    if (!isNiuBottom(bottom)) continue;
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
    const hb = handBonus(cards);
    const mult = best.bonus.mult * hb.mult;
    const payout = best.kicker.base * mult;
    return {
      kind: 'niu',
      power: best.kicker.base,
      payout,
      label: best.kicker.label,
      detail: {
        base: best.kicker.base,
        mult,
        tags: [...best.bonus.tags, ...hb.tags],
        payout,
      },
      split: best.split,
      specials: [],
    };
  }

  return noneEval(cards, null);
}
