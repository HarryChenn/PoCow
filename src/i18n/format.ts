import { LogEntry } from '../engine/game';
import { EvalDetail, HandLabel } from '../engine/scoring';
import { Key } from './dict';
import { Params } from './index';

export type TFn = (key: Key, params?: Params) => string;

/** 分数单位：英文按单复数，中文两者同形 */
function unit(t: TFn, n: number): string {
  return t(n === 1 ? 'unit.pt' : 'unit.pts');
}

/** 牌型标签 → 当前语言的文案 */
export function labelText(t: TFn, label: HandLabel): string {
  switch (label.k) {
    case 'none':
      return t('eval.none');
    case 'pair':
      return t('eval.pair');
    case 'doubleJoker':
      return t('eval.doubleJoker');
    case 'niuniu':
      return t('eval.niuniu');
    case 'kicker':
      return t('eval.kicker', { n: label.unit });
    case 'special':
      return label.names.map((n) => t(`special.${n}` as Key)).join(t('join.special'));
  }
}

/** 牌力明细 → 「牌力 A × 倍率 B（…）= C 分」 */
export function detailText(t: TFn, detail: EvalDetail | null): string {
  if (!detail) return t('detail.none');
  const base = detail.parts ? `(${detail.parts.join('+')})` : String(detail.base);
  const u = unit(t, detail.payout);
  if (detail.mult <= 1) return t('detail.plain', { base, payout: detail.payout, unit: u });
  return t('detail.withMult', {
    base,
    mult: detail.mult,
    tags: detail.tags.map((x) => t(`bonus.${x}` as Key)).join(t('join.tags')),
    payout: detail.payout,
    unit: u,
  });
}

/** 结构化日志 → 一行战报（座位号经 nameOf 解析为昵称） */
export function logText(t: TFn, e: LogEntry, nameOf: (seat: number) => string): string {
  const name = e.seat !== undefined ? nameOf(e.seat) : '';
  const name2 = e.seat2 !== undefined ? nameOf(e.seat2) : '';
  switch (e.kind) {
    case 'round':
      return t('log.round', { n: e.num ?? 0 });
    case 'arrange':
      return t('log.arrange');
    case 'win':
      return t('log.win', {
        names: (e.seats ?? []).map(nameOf).join(t('join.names')),
        label: e.label ? labelText(t, e.label) : '',
        payout: e.num ?? 0,
        unit: unit(t, e.num ?? 0),
      });
    case 'swap':
      return t('log.swap', { name, name2, n: e.num ?? 0 });
    case 'request':
    case 'refuse':
      return t(`log.${e.kind}`, { name, name2 });
    default:
      return t(`log.${e.kind}` as Key, { name });
  }
}
