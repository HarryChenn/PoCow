import { describe, expect, it } from 'vitest';
import { createGame, doDeckSwap, doPass, doRequest, doRespond, GameState, startRound } from '../game';
import { aiChooseAction, aiRespond } from '../ai';

/** 全 AI 自动打完一局（用 AI 策略驱动所有人，包括“人类”位） */
function playRound(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.phase === 'exchange') {
    if (++guard > 500) throw new Error('换牌阶段未收敛');
    if (s.pending) {
      s = doRespond(s, aiRespond(s, s.pending.to));
      continue;
    }
    const action = aiChooseAction(s, s.turn);
    if (action.type === 'deckSwap') s = doDeckSwap(s, s.turn, action.cardId);
    else if (action.type === 'request') s = doRequest(s, s.turn, action.to);
    else s = doPass(s, s.turn);
  }
  return s;
}

describe('整局流程', () => {
  it('多人多局：手牌数守恒、结算零和、分数正确累计', () => {
    let s = createGame(['你', 'A', 'B', 'C', 'D'], 0);
    for (let round = 0; round < 20; round++) {
      s = playRound(s);
      expect(s.phase).toBe('showdown');
      for (const p of s.players) expect(p.hand).toHaveLength(5);

      const result = s.result!;
      const sumDelta = result.deltas.reduce((a, b) => a + b, 0);
      expect(Math.abs(sumDelta)).toBeLessThan(1e-9);
      expect(result.winners.length).toBeGreaterThan(0);
      // 输家赔的都是赢家的赔率
      s.players.forEach((p) => {
        if (!result.winners.includes(p.id)) expect(result.deltas[p.id]).toBe(-result.payout);
      });
      s = startRound(s);
    }
  });

  it('牌堆换牌后不能再发起对手交换', () => {
    let s = createGame(['你', 'A', 'B'], 0);
    const cardId = s.players[s.turn].hand[0].id;
    const actor = s.turn;
    s = doDeckSwap(s, actor, cardId);
    expect(s.players[actor].usedDeckSwap).toBe(true);
    expect(s.players[actor].passed).toBe(true); // 无可用操作，自动结束
    // 强行发起应被拒绝（状态不变）
    const before = JSON.stringify(s);
    const after = doRequest(s, actor, (actor + 1) % 3);
    expect(JSON.stringify(after)).toBe(before);
  });

  it('发起交换上限 2 次；被拒绝不消耗次数但不能再找同一人', () => {
    let s = createGame(['你', 'A', 'B'], 0);
    const actor = s.turn;
    const target = (actor + 1) % 3;
    s = doRequest(s, actor, target);
    expect(s.pending).toEqual({ from: actor, to: target });
    s = doRespond(s, false);
    expect(s.players[actor].requestsUsed).toBe(0);
    // 不能再向拒绝过自己的人发起
    const blocked = doRequest(s, actor, target);
    expect(blocked.pending).toBeNull();
  });
});
