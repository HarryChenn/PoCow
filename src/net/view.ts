import { Card } from '../engine/cards';
import { GameState } from '../engine/game';
import { GameView } from './protocol';

/** 掩码牌：只保留位置信息，不泄露牌面 */
export function maskCard(seat: number, index: number): Card {
  return { id: `m${seat}-${index}`, rank: 0, suit: null };
}

/**
 * 为某个座位生成脱敏视图：
 * - 自己的手牌可见，他人手牌替换为掩码牌（摊牌阶段全部揭示）
 * - 牌堆只发张数
 * - picking 中指向暗牌的 cardId 翻译为对应掩码 id，保证与该座位渲染出的 DOM 一致
 */
export function viewFor(s: GameState, seat: number): GameView {
  const reveal = s.phase === 'showdown';

  const mapPick = (pick: string | null, holder: number): string | null => {
    if (pick === null || holder === seat || reveal) return pick;
    const idx = s.players[holder].hand.findIndex((c) => c.id === pick);
    return idx >= 0 ? maskCard(holder, idx).id : null;
  };

  return {
    players: s.players.map((p) => ({
      ...p,
      hand:
        p.id === seat || reveal ? p.hand : p.hand.map((_, i) => maskCard(p.id, i)),
      // 他人的拆分选择在摊牌前不可见（含真实牌面 id，也防泄露）
      chosenBottom: p.id === seat || reveal ? p.chosenBottom : null,
    })),
    deckCount: s.deck.length,
    logSeq: s.logSeq,
    round: s.round,
    phase: s.phase,
    turn: s.turn,
    pending: s.pending,
    picking: s.picking
      ? {
          ...s.picking,
          // fromPick 是 from 选中的、在 to 手里的牌；toPick 在 from 手里
          fromPick: mapPick(s.picking.fromPick, s.picking.to),
          toPick: mapPick(s.picking.toPick, s.picking.from),
        }
      : null,
    log: s.log.slice(-30),
    result: reveal ? s.result : null,
  };
}

/** 把「对方手牌第 index 张」解析为真实 cardId（房主侧执行） */
export function resolvePickIndex(s: GameState, holderSeat: number, index: number): string | null {
  return s.players[holderSeat]?.hand[index]?.id ?? null;
}
