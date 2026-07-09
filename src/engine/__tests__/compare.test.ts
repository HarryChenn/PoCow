import { describe, expect, it } from 'vitest';
import { Card, JOKER_RANK, Suit } from '../cards';
import { compareHands, compareTexas, texasValue } from '../compare';
import { evaluateHand } from '../scoring';

let seq = 0;
function c(rank: number, suit: Suit | null = 'S'): Card {
  return { id: `t${seq++}`, rank, suit };
}
function joker(): Card {
  return { id: `t${seq++}`, rank: JOKER_RANK, suit: null };
}

function hand(cards: Card[]) {
  return { eval: evaluateHand(cards), cards };
}

describe('德州扑克平局判定 compareTexas', () => {
  it('对子 > 高牌', () => {
    const pair = [c(2, 'S'), c(2, 'H'), c(5, 'D'), c(7, 'C'), c(9, 'S')];
    const high = [c(1, 'S'), c(13, 'H'), c(12, 'D'), c(7, 'C'), c(9, 'S')];
    expect(compareTexas(pair, high)).toBeGreaterThan(0);
  });

  it('双 Joker 对子 > 对 A', () => {
    const jokers = [joker(), joker(), c(5, 'D'), c(7, 'C'), c(9, 'S')];
    const aces = [c(1, 'S'), c(1, 'H'), c(5, 'D'), c(7, 'C'), c(9, 'S')];
    expect(compareTexas(jokers, aces)).toBeGreaterThan(0);
  });

  it('A-2-3-4-5 为最小顺子（wheel）', () => {
    const wheel = [c(1, 'S'), c(2, 'H'), c(3, 'D'), c(4, 'C'), c(5, 'S')];
    const sixHigh = [c(2, 'S'), c(3, 'H'), c(4, 'D'), c(5, 'C'), c(6, 'S')];
    expect(texasValue(wheel)[0]).toBe(4);
    expect(compareTexas(sixHigh, wheel)).toBeGreaterThan(0);
  });

  it('完全相同点数（不同花色）为平局', () => {
    const a = [c(2, 'S'), c(5, 'H'), c(7, 'D'), c(9, 'C'), c(13, 'S')];
    const b = [c(2, 'H'), c(5, 'S'), c(7, 'C'), c(9, 'D'), c(13, 'H')];
    expect(compareTexas(a, b)).toBe(0);
  });
});

describe('Showhand 比牌 compareHands', () => {
  it('特殊胜利 > 任何普通牛（十小 vs 牛牛+对子）', () => {
    const tenSmall = hand([c(1, 'S'), c(1, 'H'), c(2, 'S'), c(3, 'H'), c(3, 'D')]);
    const niuPair = hand([c(10, 'S'), c(10, 'H'), c(10, 'D'), c(5, 'S'), c(5, 'H')]);
    expect(compareHands(tenSmall, niuPair)).toBeGreaterThan(0);
  });

  it('特殊胜利之间按最高基数比：炸弹 > 五张顺子', () => {
    const bomb = hand([c(9, 'S'), c(9, 'H'), c(9, 'D'), c(9, 'C'), c(2, 'S')]);
    const straight = hand([c(5, 'H'), c(6, 'H'), c(7, 'S'), c(8, 'H'), c(9, 'H')]);
    expect(compareHands(bomb, straight)).toBeGreaterThan(0);
  });

  it('有牛 > 无牛；踢脚基数大者胜', () => {
    const niu1 = hand([c(2, 'S'), c(3, 'H'), c(5, 'D'), c(2, 'C'), c(4, 'H')]); // 底 10，踢 2+4=6 → 1×
    const none = hand([c(1, 'S'), c(3, 'H'), c(5, 'D'), c(7, 'C'), c(9, 'H')]);
    const niuniu = hand([c(13, 'S'), c(10, 'H'), c(11, 'D'), c(4, 'S'), c(6, 'H')]); // 牛牛 5×
    expect(compareHands(niu1, none)).toBeGreaterThan(0);
    expect(compareHands(niuniu, niu1)).toBeGreaterThan(0);
  });

  it('同为牛牛时按德州高牌决胜', () => {
    const a = hand([c(13, 'S'), c(10, 'H'), c(11, 'D'), c(3, 'S'), c(7, 'H')]); // K J 10 7 3
    const b = hand([c(13, 'H'), c(10, 'S'), c(11, 'H'), c(2, 'D'), c(8, 'C')]); // K J 10 8 2
    expect(evaluateHand(a.cards).power).toBe(5);
    expect(evaluateHand(b.cards).power).toBe(5);
    expect(compareHands(b, a)).toBeGreaterThan(0);
  });
});
