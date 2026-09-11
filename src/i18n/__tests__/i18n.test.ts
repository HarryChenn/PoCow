import { describe, expect, it } from 'vitest';
import { en, zh } from '../dict';
import { translate } from '../index';
import { detailText, labelText, logText } from '../format';
import { LogEntry } from '../../engine/game';
import { evaluateHand } from '../../engine/scoring';
import { Card, JOKER_RANK, Suit } from '../../engine/cards';

let seq = 0;
const c = (rank: number, suit: Suit | null = 'S'): Card => ({ id: `t${seq++}`, rank, suit });
const joker = (): Card => ({ id: `t${seq++}`, rank: JOKER_RANK, suit: null });

describe('文案字典', () => {
  it('中英文键完全一致，且无空串', () => {
    const ek = Object.keys(en).sort();
    const zk = Object.keys(zh).sort();
    expect(zk).toEqual(ek);
    for (const k of ek) {
      expect(en[k as keyof typeof en].length, `en 缺 ${k}`).toBeGreaterThan(0);
      expect(zh[k as keyof typeof zh].length, `zh 缺 ${k}`).toBeGreaterThan(0);
    }
  });

  it('同一条文案两种语言的占位符集合一致', () => {
    const slots = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(slots(zh[k]), `占位符不匹配：${k}`).toEqual(slots(en[k]));
    }
  });

  it('英文文案里不残留中文字符（lang.* 是语言自称，按设计保留）', () => {
    for (const [k, v] of Object.entries(en)) {
      if (k.startsWith('lang.')) continue;
      expect(/[一-鿿]/.test(v), `en.${k} 含中文：${v}`).toBe(false);
    }
  });

  it('插值替换生效，未提供的占位符保持原样', () => {
    expect(translate('en', 'table.round', { n: 3 })).toBe('Round 3');
    expect(translate('zh', 'table.round', { n: 3 })).toBe('第 3 局');
    expect(translate('en', 'table.round')).toBe('Round {n}');
  });
});

describe('结构化数据按语言渲染', () => {
  const t = (lang: 'en' | 'zh') => (k: Parameters<typeof translate>[1], p?: Record<string, string | number>) =>
    translate(lang, k, p);

  it('牌型标签与明细双语渲染', () => {
    // 三条 8 做底 ×3，踢脚 4+6 牛牛
    const ev = evaluateHand([c(8, 'S'), c(8, 'H'), c(8, 'D'), c(4, 'C'), c(6, 'H')]);
    expect(labelText(t('zh'), ev.label)).toBe('牛牛');
    expect(labelText(t('en'), ev.label)).toBe('Niu Niu');
    expect(detailText(t('zh'), ev.detail)).toBe('牌力 5 × 倍率 3（三条）= 15 分');
    expect(detailText(t('en'), ev.detail)).toBe('Power 5 × Mult 3 (Trips) = 15 pts');
    // 单数用 pt
    const one = evaluateHand([c(1, 'S'), c(3, 'H'), c(5, 'D'), c(7, 'C'), c(9, 'H')]);
    expect(detailText(t('en'), one.detail)).toBe('Power 0 (wins pay 1 pt)');
  });

  it('多个特殊胜利：牌力相加显示为 (8+9)', () => {
    const ev = evaluateHand([c(5, 'H'), c(6, 'H'), c(7, 'H'), c(8, 'H'), c(9, 'H')]);
    expect(labelText(t('zh'), ev.label)).toBe('五张顺子+五张同花');
    expect(labelText(t('en'), ev.label)).toBe('Five-Card Straight + Five-Card Flush');
    expect(detailText(t('en'), ev.detail)).toBe('Power (8+9) × Mult 4 (Flush · Straight) = 68 pts');
  });

  it('无牛用固定文案', () => {
    const ev = evaluateHand([c(1, 'S'), c(3, 'H'), c(5, 'D'), c(7, 'C'), c(9, 'H')]);
    expect(detailText(t('zh'), ev.detail)).toBe('牌力 0（若胜按 1 分结算）');
    expect(detailText(t('en'), ev.detail)).toBe('Power 0 (wins pay 1 pt)');
  });

  it('无牛 + 王炸：文案要说明 1 × 3 = 3', () => {
    const ev = evaluateHand([joker(), joker(), c(2, 'S'), c(5, 'H'), c(7, 'D')]);
    expect(ev.payout).toBe(3);
    expect(detailText(t('zh'), ev.detail)).toBe('牌力 0 · 若胜按 1 × 倍率 3（王炸）= 3 分结算');
    expect(detailText(t('en'), ev.detail)).toBe('Power 0 · wins pay 1 × Mult 3 (Joker Bomb) = 3 pts');
  });

  it('王炸叠底牌倍率：同花 ×2 × 王炸 ×3 = ×6', () => {
    const ev = evaluateHand([c(2, 'S'), c(3, 'S'), c(5, 'S'), joker(), joker()]);
    expect(detailText(t('zh'), ev.detail)).toBe('牌力 7 × 倍率 6（同花·王炸）= 42 分');
    expect(detailText(t('en'), ev.detail)).toBe('Power 7 × Mult 6 (Flush · Joker Bomb) = 42 pts');
  });

  it('战报按座位解析昵称，两种语言各自渲染', () => {
    const names = ['Ann', 'Bob'];
    const nameOf = (i: number) => names[i];
    const swap: LogEntry = { id: 1, kind: 'swap', seat: 0, seat2: 1, num: 2 };
    expect(logText(t('en'), swap, nameOf)).toBe('Ann and Bob swapped a card (2/2 between them).');
    expect(logText(t('zh'), swap, nameOf)).toBe('Ann 与 Bob 互换了一张牌（双方已互换 2/2 次）');

    const win: LogEntry = { id: 2, kind: 'win', seat: 0, seats: [0, 1], num: 15, label: { k: 'niuniu' } };
    expect(logText(t('en'), win, nameOf)).toBe('Ann, Bob won the round (Niu Niu); each loser pays 15 pts.');
    const one: LogEntry = { ...win, num: 1 };
    expect(logText(t('en'), one, nameOf)).toBe('Ann, Bob won the round (Niu Niu); each loser pays 1 pt.');
    expect(logText(t('zh'), win, nameOf)).toBe('本局 Ann、Bob 获胜（牛牛），每位输家赔 15 分');
  });

  it('每种日志事件都有对应文案，不会渲染出键名', () => {
    const kinds: LogEntry['kind'][] = [
      'round', 'deckSwap', 'request', 'accept', 'refuse',
      'swap', 'pass', 'arrange', 'arranged', 'win', 'takeover',
    ];
    for (const lang of ['en', 'zh'] as const) {
      for (const kind of kinds) {
        const line = logText(t(lang), { id: 0, kind, seat: 0, seat2: 1, seats: [0], num: 1, label: { k: 'none' } }, () => 'P');
        expect(line, `${lang}/${kind}`).not.toMatch(/^log\./);
        expect(line.length).toBeGreaterThan(0);
      }
    }
  });
});
