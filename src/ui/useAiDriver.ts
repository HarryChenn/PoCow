import { useEffect } from 'react';
import {
  currentPicker,
  doArrange,
  doDeckSwap,
  doPass,
  doPick,
  doPickCommit,
  doRequest,
  doRespond,
  GameState,
} from '../engine/game';
import { aiChooseAction, aiPickFromOpponent, aiRespond } from '../engine/ai';
import { evaluateHand } from '../engine/scoring';

const AI_DELAY = 600;
const PICK_DELAY = 350;
/** 双方选定后的亮牌窗口：高亮 + 飞牌动画播完再互换 */
const REVEAL_DELAY = 1000;

/**
 * AI 驱动循环：为所有非真人座位自动行动（响应请求 / 选牌 / 出招）。
 * 单机与房主模式使用；客户端不驱动 AI。传 null 关闭。
 */
export function useAiDriver(
  state: GameState | null,
  apply: (fn: (g: GameState) => GameState) => void,
) {
  useEffect(() => {
    if (!state) return;

    if (state.phase === 'arrange') {
      const next = state.players.find((p) => !p.isHuman && !p.arrangedDone);
      if (!next) return;
      const pid = next.id;
      const t = setTimeout(
        () =>
          apply((g) => {
            const p = g.players[pid];
            if (g.phase !== 'arrange' || p.arrangedDone) return g;
            const ev = evaluateHand(p.hand);
            const bottom = ev.split ? ev.split.bottom : p.hand.slice(0, 3);
            return doArrange(g, pid, bottom.map((c) => c.id));
          }),
        AI_DELAY,
      );
      return () => clearTimeout(t);
    }

    if (state.phase !== 'exchange') return;

    if (state.picking) {
      const picker = currentPicker(state);
      if (picker === null) {
        // 双方都已选定：亮牌片刻后执行互换
        const t = setTimeout(() => apply(doPickCommit), REVEAL_DELAY);
        return () => clearTimeout(t);
      }
      if (state.players[picker].isHuman) return;
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
