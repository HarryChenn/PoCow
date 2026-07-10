import { useEffect } from 'react';
import {
  currentPicker,
  doDeckSwap,
  doPass,
  doPick,
  doRequest,
  doRespond,
  GameState,
} from '../engine/game';
import { aiChooseAction, aiPickFromOpponent, aiRespond } from '../engine/ai';

const AI_DELAY = 600;
const PICK_DELAY = 350;

/**
 * AI 驱动循环：为所有非真人座位自动行动（响应请求 / 选牌 / 出招）。
 * 单机与房主模式使用；客户端不驱动 AI。传 null 关闭。
 */
export function useAiDriver(
  state: GameState | null,
  apply: (fn: (g: GameState) => GameState) => void,
) {
  useEffect(() => {
    if (!state || state.phase !== 'exchange') return;

    if (state.picking) {
      const picker = currentPicker(state);
      if (picker === null || state.players[picker].isHuman) return;
      const t = setTimeout(
        () =>
          apply((g) =>
            g.picking && currentPicker(g) === picker
              ? doPick(g, picker, aiPickFromOpponent(g, picker))
              : g,
          ),
        PICK_DELAY,
      );
      return () => clearTimeout(t);
    }

    if (state.pending) {
      const responder = state.pending.to;
      if (state.players[responder].isHuman) return;
      const t = setTimeout(
        () =>
          apply((g) =>
            g.pending?.to === responder ? doRespond(g, aiRespond(g, responder)) : g,
          ),
        AI_DELAY,
      );
      return () => clearTimeout(t);
    }

    if (state.players[state.turn].isHuman) return;
    const t = setTimeout(() => {
      apply((g) => {
        if (g.phase !== 'exchange' || g.pending || g.picking || g.players[g.turn].isHuman) {
          return g;
        }
        const a = aiChooseAction(g, g.turn);
        if (a.type === 'deckSwap') return doDeckSwap(g, g.turn, a.cardId);
        if (a.type === 'request') return doRequest(g, g.turn, a.to);
        return doPass(g, g.turn);
      });
    }, AI_DELAY);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}
