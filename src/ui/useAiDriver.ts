import { useEffect } from 'react';
import {
  bestBottomIds,
  doArrange,
  doDeckSwap,
  doPass,
  doPick,
  doPickCommit,
  doRequest,
  doRespond,
  GameState,
  isBusy,
} from '../engine/game';
import { aiChooseAction, aiPickFromOpponent, aiRespond } from '../engine/ai';

const AI_DELAY = 550;
const PICK_DELAY = 400;
/** 双方选定后的亮牌窗口：高亮 + 飞牌动画播完再互换 */
const REVEAL_DELAY = 1400;

function jitter(base: number): number {
  return base + Math.random() * 350;
}

/**
 * AI 驱动循环（自由换牌：并行会话）：每次状态变化处理一件最紧急的 AI 事务。
 * 单机与房主模式使用；客户端不驱动。传 null 关闭。
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
          apply((g) =>
            g.phase === 'arrange' && !g.players[pid].arrangedDone
              ? doArrange(g, pid, bestBottomIds(g.players[pid].hand))
              : g,
          ),
        jitter(AI_DELAY),
      );
      return () => clearTimeout(t);
    }

    if (state.phase !== 'exchange') return;

    // 1) 双方已选定的会话 → 亮牌片刻后执行互换（对真人会话同样由驱动方计时）
    const ready = state.sessions.find((x) => x.fromPick !== null && x.toPick !== null);
    if (ready) {
      const from = ready.from;
      const t = setTimeout(() => apply((g) => doPickCommit(g, from)), REVEAL_DELAY);
      return () => clearTimeout(t);
    }

    // 2) 等待 AI 响应的请求
    const toRespond = state.sessions.find(
      (x) => x.stage === 'pending' && !state.players[x.to].isHuman,
    );
    if (toRespond) {
      const pid = toRespond.to;
      const t = setTimeout(
        () => apply((g) => doRespond(g, pid, aiRespond(g, pid))),
        jitter(AI_DELAY),
      );
      return () => clearTimeout(t);
    }

    // 3) 等待 AI 暗选的会话
    const toPick = state.sessions.find(
      (x) =>
        x.stage === 'picking' &&
        ((x.fromPick === null && !state.players[x.from].isHuman) ||
          (x.toPick === null && !state.players[x.to].isHuman)),
    );
    if (toPick) {
      const pid =
        toPick.fromPick === null && !state.players[toPick.from].isHuman
          ? toPick.from
          : toPick.to;
      const t = setTimeout(
        () =>
          apply((g) =>
            isBusy(g, pid) ? doPick(g, pid, aiPickFromOpponent(g, pid)) : g,
          ),
        jitter(PICK_DELAY),
      );
      return () => clearTimeout(t);
    }

    // 4) 空闲 AI 出招
    const idleAis = state.players.filter(
      (p) => !p.isHuman && !p.passed && !isBusy(state, p.id),
    );
    if (idleAis.length === 0) return;
    const pid = idleAis[Math.floor(Math.random() * idleAis.length)].id;
    const t = setTimeout(() => {
      apply((g) => {
        if (g.phase !== 'exchange' || g.players[pid].passed || isBusy(g, pid)) return g;
        const a = aiChooseAction(g, pid);
        if (a.type === 'deckSwap') return doDeckSwap(g, pid, a.cardId);
        if (a.type === 'request') return doRequest(g, pid, a.to);
        if (a.type === 'pass') return doPass(g, pid);
        return g; // wait：等下次状态变化
      });
    }, jitter(AI_DELAY));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
}
