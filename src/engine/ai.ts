import { Card, points } from './cards';
import { evaluateHand } from './scoring';
import { canDeckSwap, eligibleTargets, GameState } from './game';

export type AiAction =
  | { type: 'deckSwap'; cardId: string }
  | { type: 'request'; to: number }
  | { type: 'pass' };

/** 弃牌启发式：保留对子和 10 点牌（凑牛主力），弃掉最“孤立”的小牌 */
function pickDiscard(hand: Card[]): string {
  const scored = hand.map((c) => {
    let keep = 0;
    if (hand.some((o) => o.id !== c.id && o.rank === c.rank)) keep += 2;
    if (points(c) === 10) keep += 1;
    return { card: c, keep };
  });
  scored.sort((a, b) => a.keep - b.keep);
  const worst = scored.filter((x) => x.keep === scored[0].keep);
  return worst[Math.floor(Math.random() * worst.length)].card.id;
}

export function aiChooseAction(s: GameState, pid: number): AiAction {
  const p = s.players[pid];
  const ev = evaluateHand(p.hand);

  // 牌力已强（特殊胜利或踢脚基数 >= 5）：不再折腾
  if (ev.power >= 5) return { type: 'pass' };

  // 无牛且尚未行动：倾向与牌堆换一张
  if (ev.kind === 'none' && canDeckSwap(s, pid) && Math.random() < 0.6) {
    return { type: 'deckSwap', cardId: pickDiscard(p.hand) };
  }

  // 牌力弱：找对手随机换
  const targets = eligibleTargets(s, pid);
  if (targets.length > 0 && ev.power <= 2 && Math.random() < 0.8) {
    return { type: 'request', to: targets[Math.floor(Math.random() * targets.length)] };
  }

  return { type: 'pass' };
}

/** AI 选牌阶段：从对方手牌中随机暗选一张（AI 看不到牌面，等价随机） */
export function aiPickFromOpponent(s: GameState, pickerId: number): string {
  const pk = s.picking!;
  const other = s.players[pickerId === pk.from ? pk.to : pk.from];
  return other.hand[Math.floor(Math.random() * other.hand.length)].id;
}

/** 是否接受别人发来的交换请求：手牌越差越愿意换 */
export function aiRespond(s: GameState, pid: number): boolean {
  const ev = evaluateHand(s.players[pid].hand);
  if (ev.kind === 'special' || ev.power >= 3) return false;
  return Math.random() < (ev.kind === 'none' ? 0.9 : 0.5);
}
