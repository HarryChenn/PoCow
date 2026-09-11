import { describe, expect, it } from 'vitest';
import { Card, JOKER_RANK, Suit } from '../cards';
import {
  bonusOf3,
  evalKicker,
  evalSpecials,
  evaluateChosen,
  evaluateHand,
  handBonus,
} from '../scoring';

let seq = 0;
function c(rank: number, suit: Suit | null = 'S'): Card {
  return { id: `t${seq++}`, rank, suit };
}
function joker(): Card {
  return { id: `t${seq++}`, rank: JOKER_RANK, suit: null };
}

describe('底牌加成 bonusOf3', () => {
  it('Q + K + Joker 视为顺子 ×2（含 Joker 不算同花）', () => {
    const b = bonusOf3([c(12, 'S'), c(13, 'S'), joker()]);
    expect(b.mult).toBe(2);
    expect(b.tags).toEqual(['straight']);
  });

  it('王炸不是底牌加成（改为手牌级，见下方 handBonus）', () => {
    expect(bonusOf3([joker(), joker(), c(13)]).mult).toBe(1);
    expect(bonusOf3([joker(), joker(), c(13)]).tags).toEqual([]);
  });

  it('三条 ×3', () => {
    expect(bonusOf3([c(5, 'S'), c(5, 'H'), c(5, 'D')]).mult).toBe(3);
  });

  it('3 张同花顺 = 2×2 = 4', () => {
    expect(bonusOf3([c(3, 'S'), c(4, 'S'), c(5, 'S')]).mult).toBe(4);
  });

  it('普通同花 ×2，普通顺子（不同花）×2', () => {
    expect(bonusOf3([c(2, 'H'), c(6, 'H'), c(9, 'H')]).mult).toBe(2);
    expect(bonusOf3([c(7, 'S'), c(8, 'H'), c(9, 'D')]).mult).toBe(2);
  });
});

describe('踢脚 evalKicker', () => {
  it('对子 / 双 Joker → 7×', () => {
    expect(evalKicker([c(5, 'S'), c(5, 'H')]).base).toBe(7);
    expect(evalKicker([joker(), joker()]).base).toBe(7);
  });

  it('个位 0（牛牛）→ 5×，含两张 10 点牌', () => {
    expect(evalKicker([c(4, 'S'), c(6, 'H')]).base).toBe(5);
    expect(evalKicker([c(13, 'S'), c(12, 'H')]).base).toBe(5);
  });

  it('个位 7/8/9 → 2/3/4×，1~6 → 1×', () => {
    expect(evalKicker([c(3, 'S'), c(4, 'H')]).base).toBe(2);
    expect(evalKicker([c(3, 'S'), c(5, 'H')]).base).toBe(3);
    expect(evalKicker([c(4, 'S'), c(5, 'H')]).base).toBe(4);
    expect(evalKicker([c(2, 'S'), c(4, 'H')]).base).toBe(1);
  });
});

describe('特殊胜利', () => {
  it('五张顺子 8×，自带 3 张顺 → 16×', () => {
    // 用户例子：1-2-3-4-5 且 1、3、5 同花：没有子集同时满足顺+花，只能 ×2
    const hand = [c(1, 'S'), c(2, 'H'), c(3, 'S'), c(4, 'H'), c(5, 'S')];
    const ev = evaluateHand(hand);
    expect(ev.kind).toBe('special');
    expect(ev.specials).toEqual([{ name: 'straight5', base: 8 }]);
    expect(ev.payout).toBe(16);
    expect(ev.power).toBe(108);
  });

  it('同花顺 = (8+9) × 2 × 2 = 68×', () => {
    const ev = evaluateHand([c(5, 'H'), c(6, 'H'), c(7, 'H'), c(8, 'H'), c(9, 'H')]);
    expect(ev.specials.map((s) => s.name)).toEqual(['straight5', 'flush5']);
    expect(ev.payout).toBe(68);
    expect(ev.power).toBe(109);
  });

  it('炸弹 12×，自带三条 → 36×', () => {
    const ev = evaluateHand([c(9, 'S'), c(9, 'H'), c(9, 'D'), c(9, 'C'), c(2, 'S')]);
    expect(ev.specials).toEqual([{ name: 'bomb', base: 12 }]);
    expect(ev.payout).toBe(36);
    expect(ev.power).toBe(112);
  });

  it('五花 10×，JQK 自带顺 ×2、手牌王炸 ×3 → 60×', () => {
    const ev = evaluateHand([c(11, 'S'), c(12, 'S'), c(13, 'H'), joker(), joker()]);
    expect(ev.specials).toEqual([{ name: 'allFace', base: 10 }]);
    expect(ev.detail.mult).toBe(6);
    expect(ev.detail.tags).toEqual(['straight', 'jokerBomb']);
    expect(ev.payout).toBe(60);
  });

  it('十小 11×，自带 A-2-3 顺 → 22×', () => {
    const ev = evaluateHand([c(1, 'S'), c(1, 'H'), c(2, 'S'), c(3, 'H'), c(3, 'D')]);
    expect(ev.specials).toEqual([{ name: 'tenSmall', base: 11 }]);
    expect(ev.payout).toBe(22);
    expect(ev.power).toBe(111);
  });

  it('五张同花（无顺）9×，自带 3 张同花 → 18×', () => {
    const ev = evaluateHand([c(2, 'D'), c(5, 'D'), c(8, 'D'), c(11, 'D'), c(13, 'D')]);
    expect(ev.specials).toEqual([{ name: 'flush5', base: 9 }]);
    expect(ev.payout).toBe(18);
  });

  it('五花不可能同花（Joker 不算花）', () => {
    const specials = evalSpecials([c(11, 'S'), c(12, 'S'), c(13, 'S'), joker(), joker()]);
    expect(specials.map((s) => s.name)).toEqual(['allFace']);
  });
});

describe('普通 3+2 牛牌', () => {
  it('K+10+J 成牛，踢脚 4+6 牛牛 → 5×', () => {
    const ev = evaluateHand([c(13, 'S'), c(10, 'H'), c(11, 'D'), c(4, 'S'), c(6, 'H')]);
    expect(ev.kind).toBe('niu');
    expect(ev.power).toBe(5);
    expect(ev.payout).toBe(5);
  });

  it('自动选最优拆分：三条 10 做底 ×3，踢脚对 5 → 7×3=21', () => {
    const ev = evaluateHand([c(10, 'S'), c(10, 'H'), c(10, 'D'), c(5, 'S'), c(5, 'H')]);
    expect(ev.kind).toBe('niu');
    expect(ev.power).toBe(7);
    expect(ev.payout).toBe(21);
  });

  it('优先牌力（踢脚基数），其次赔率', () => {
    // 底 {2,3,5}=10 牛、踢 {7,7} 对子 7×；或底 {7,7,...} 无法成牛更优拆分
    const ev = evaluateHand([c(2, 'S'), c(3, 'H'), c(5, 'D'), c(7, 'S'), c(7, 'H')]);
    expect(ev.power).toBe(7);
    expect(ev.payout).toBe(7);
  });

  it('三条直接成牛（点数和非 10 的倍数）：5,5,5 底 ×3，踢脚 3+4 → 2×3=6', () => {
    const ev = evaluateHand([c(5, 'S'), c(5, 'H'), c(5, 'D'), c(3, 'C'), c(4, 'H')]);
    expect(ev.kind).toBe('niu');
    expect(ev.power).toBe(2);
    expect(ev.payout).toBe(6);
    expect(ev.split!.bottom.map((x) => x.rank)).toEqual([5, 5, 5]);
  });

  it('三条 A（和 3）也成牛，踢脚 4+6 牛牛 → 5×3=15', () => {
    const ev = evaluateHand([c(1, 'S'), c(1, 'H'), c(1, 'D'), c(4, 'C'), c(6, 'H')]);
    expect(ev.kind).toBe('niu');
    expect(ev.power).toBe(5);
    expect(ev.payout).toBe(15);
  });

  it('王炸手牌级 ×3：踢脚双王也算，与底牌倍率相乘', () => {
    // 底 2♠3♠5♠ = 10 成牛且同花 ×2，踢脚双王 → 牌力 7，倍率 2×3=6
    const ev = evaluateHand([c(2, 'S'), c(3, 'S'), c(5, 'S'), joker(), joker()]);
    expect(ev.kind).toBe('niu');
    expect(ev.power).toBe(7);
    expect(ev.detail.mult).toBe(6);
    expect(ev.detail.tags).toEqual(['flush', 'jokerBomb']);
    expect(ev.payout).toBe(42);
  });

  it('王炸在底牌：仍需第三张凑成牛，成牛后同样吃 ×3', () => {
    expect(handBonus([joker(), joker(), c(13), c(2), c(3)]).mult).toBe(3);
    // 手选双王+K 作底 = 30 成牛，踢脚 4+6 牛牛 → 5 × 3 = 15
    const hand = [joker(), joker(), c(13, 'S'), c(4, 'C'), c(6, 'H')];
    const ok = evaluateChosen(hand, [hand[0].id, hand[1].id, hand[2].id]);
    expect(ok.kind).toBe('niu');
    expect(ok.payout).toBe(15);
    // 第三张换成 2：双王+2 = 22 不成牛，王炸不赋予成牛资格
    const bad = [joker(), joker(), c(2, 'S'), c(4, 'C'), c(6, 'H')];
    const no = evaluateChosen(bad, [bad[0].id, bad[1].id, bad[2].id]);
    expect(no.kind).toBe('none');
    expect(no.payout).toBe(3); // 无牛，但王炸 ×3 仍作用于基础赔分
  });

  it('自动拆分会为牌力把双王留在踢脚（对子 7 > 牛牛 5）', () => {
    // 双王+K=30 成牛走牛牛(5)，K+4+6=20 成牛走双王对子(7)：引擎取后者
    const ev = evaluateHand([joker(), joker(), c(13, 'S'), c(4, 'C'), c(6, 'H')]);
    expect(ev.power).toBe(7);
    expect(ev.split!.bottom.some((x) => x.suit === null)).toBe(false);
    expect(ev.payout).toBe(21); // 7 × 底牌 1 × 王炸 3
  });

  it('无牛但有王炸：赔分 1 × 3 = 3', () => {
    const ev = evaluateHand([joker(), joker(), c(2, 'S'), c(5, 'H'), c(7, 'D')]);
    expect(ev.kind).toBe('none');
    expect(ev.power).toBe(0);
    expect(ev.payout).toBe(3);
    expect(ev.detail.noNiu).toBe(true);
    expect(ev.detail.tags).toEqual(['jokerBomb']);
  });

  it('无牛：power 0、payout 1', () => {
    const ev = evaluateHand([c(1, 'S'), c(3, 'H'), c(5, 'D'), c(7, 'C'), c(9, 'H')]);
    expect(ev.kind).toBe('none');
    expect(ev.power).toBe(0);
    expect(ev.payout).toBe(1);
  });
});

describe('手动拆分 evaluateChosen', () => {
  it('按所选拆分评牌：拆错则无牛，即使存在能成牛的拆法', () => {
    const hand = [c(13, 'S'), c(10, 'H'), c(11, 'D'), c(4, 'S'), c(6, 'H')];
    const good = evaluateChosen(hand, [hand[0].id, hand[1].id, hand[2].id]);
    expect(good.kind).toBe('niu');
    expect(good.power).toBe(5); // K+10+J 成牛，踢脚 4+6 牛牛

    const bad = evaluateChosen(hand, [hand[0].id, hand[1].id, hand[3].id]); // K+10+4=24 无牛
    expect(bad.kind).toBe('none');
    expect(bad.power).toBe(0);
    expect(bad.payout).toBe(1);
    expect(bad.split!.bottom.map((x) => x.id)).toEqual([hand[0].id, hand[1].id, hand[3].id]);
  });

  it('手选三条作底：直接成牛并吃 ×3', () => {
    const hand = [c(8, 'S'), c(8, 'H'), c(8, 'D'), c(4, 'C'), c(6, 'H')];
    const ev = evaluateChosen(hand, [hand[0].id, hand[1].id, hand[2].id]);
    expect(ev.kind).toBe('niu');
    expect(ev.power).toBe(5); // 踢脚 4+6 牛牛
    expect(ev.payout).toBe(15);
    expect(ev.detail.tags).toContain('trips');
  });

  it('特殊胜利无视拆分选择', () => {
    const hand = [c(9, 'S'), c(9, 'H'), c(9, 'D'), c(9, 'C'), c(2, 'S')];
    const ev = evaluateChosen(hand, [hand[0].id, hand[1].id, hand[4].id]);
    expect(ev.kind).toBe('special');
    expect(ev.payout).toBe(36);
  });
});
