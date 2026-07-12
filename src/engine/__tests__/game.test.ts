import { describe, expect, it } from 'vitest';
import {
  createGame,
  doArrange,
  doDeckSwap,
  doPass,
  doPick,
  doPickCommit,
  doRequest,
  doRespond,
  eligibleTargets,
  availableTargets,
  bestBottomIds,
  GameState,
  isBusy,
  startRound,
} from '../game';
import { aiChooseAction, aiPickFromOpponent, aiRespond } from '../ai';

/** 全 AI 自动打完一局（用 AI 策略驱动所有人，包括“人类”位） */
function playRound(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.phase !== 'showdown') {
    if (++guard > 1000) throw new Error('对局未收敛');
    if (s.phase === 'arrange') {
      const p = s.players.find((x) => !x.arrangedDone)!;
      s = doArrange(s, p.id, bestBottomIds(p.hand));
      continue;
    }
    // 会话优先：提交已双选的、响应请求、补选牌
    const ready = s.sessions.find((x) => x.fromPick !== null && x.toPick !== null);
    if (ready) {
      s = doPickCommit(s, ready.from);
      continue;
    }
    const pending = s.sessions.find((x) => x.stage === 'pending');
    if (pending) {
      s = doRespond(s, pending.to, aiRespond(s, pending.to));
      continue;
    }
    const picking = s.sessions.find((x) => x.stage === 'picking');
    if (picking) {
      const who = picking.fromPick === null ? picking.from : picking.to;
      s = doPick(s, who, aiPickFromOpponent(s, who));
      continue;
    }
    const actor = s.players.find((p) => !p.passed && !isBusy(s, p.id));
    if (!actor) throw new Error('无人可行动但未进入拆分');
    const a = aiChooseAction(s, actor.id);
    if (a.type === 'deckSwap') s = doDeckSwap(s, actor.id, a.cardId);
    else if (a.type === 'request') s = doRequest(s, actor.id, a.to);
    else s = doPass(s, actor.id); // wait 在无会话时不可能出现（无忙碌目标）
  }
  return s;
}

describe('整局流程（自由换牌）', () => {
  it('多人多局：手牌数守恒、结算零和、分数正确累计', () => {
    let s = createGame(['你', 'A', 'B', 'C', 'D'], [0]);
    for (let round = 0; round < 20; round++) {
      s = playRound(s);
      expect(s.phase).toBe('showdown');
      for (const p of s.players) expect(p.hand).toHaveLength(5);

      const result = s.result!;
      const sumDelta = result.deltas.reduce((a, b) => a + b, 0);
      expect(Math.abs(sumDelta)).toBeLessThan(1e-9);
      expect(result.winners.length).toBeGreaterThan(0);
      s.players.forEach((p) => {
        if (!result.winners.includes(p.id)) expect(result.deltas[p.id]).toBe(-result.payout);
      });
      s = startRound(s);
    }
  });

  it('并行会话：两对玩家可同时交换，交换中的人不可被第三方指定', () => {
    let s = createGame(['甲', '乙', '丙', '丁'], [0, 1, 2, 3]);
    s = doRequest(s, 0, 1);
    s = doRequest(s, 2, 3);
    expect(s.sessions).toHaveLength(2);
    // 交换中的人不能再被发起/发起新的
    expect(availableTargets(s, 0)).toEqual([]);
    expect(doRequest(s, 0, 2).sessions).toHaveLength(2);
    // 双组并行推进
    s = doRespond(s, 1, true);
    s = doRespond(s, 3, true);
    s = doPick(s, 0, s.players[1].hand[0].id);
    s = doPick(s, 3, s.players[2].hand[0].id);
    s = doPick(s, 1, s.players[0].hand[0].id);
    s = doPick(s, 2, s.players[3].hand[0].id);
    s = doPickCommit(s, 0);
    s = doPickCommit(s, 2);
    expect(s.sessions).toHaveLength(0);
    expect(s.players[0].swapsWith[1]).toBe(1);
    expect(s.players[2].swapsWith[3]).toBe(1);
  });

  it('牌堆换牌后：自己不能再发起，别人也不能再找他换', () => {
    let s = createGame(['你', 'A', 'B'], [0]);
    s = doDeckSwap(s, 0, s.players[0].hand[0].id);
    expect(s.players[0].usedDeckSwap).toBe(true);
    expect(s.players[0].passed).toBe(true); // 无可用操作，自动结束
    expect(doRequest(s, 0, 1).sessions).toHaveLength(0);
    expect(eligibleTargets(s, 1)).not.toContain(0);
    expect(doRequest(s, 1, 0).sessions).toHaveLength(0);
  });

  it('接受交换后双方各暗选（可同时选），指定的两张牌互换', () => {
    let s = createGame(['你', 'A', 'B'], [0]);
    s = doRequest(s, 0, 1);
    s = doRespond(s, 1, true);
    expect(s.sessions[0]).toEqual({ from: 0, to: 1, stage: 'picking', fromPick: null, toPick: null });

    const wantFromTo = s.players[1].hand[2].id;
    const wantFromFrom = s.players[0].hand[4].id;

    // 选了不属于对方的牌应被忽略
    expect(doPick(s, 0, s.players[0].hand[0].id).sessions[0].fromPick).toBeNull();

    // to 先选也可以（并行暗选）
    s = doPick(s, 1, wantFromFrom);
    expect(s.sessions[0].toPick).toBe(wantFromFrom);
    s = doPick(s, 0, wantFromTo);

    // 双方选定后进入亮牌窗口：尚未互换
    expect(s.sessions[0].fromPick).toBe(wantFromTo);
    expect(s.players[1].hand.map((c) => c.id)).toContain(wantFromTo);

    s = doPickCommit(s, 0);
    expect(s.sessions).toHaveLength(0);
    expect(s.players[0].hand.map((c) => c.id)).toContain(wantFromTo);
    expect(s.players[1].hand.map((c) => c.id)).toContain(wantFromFrom);
    expect(s.players[0].hand).toHaveLength(5);
    expect(s.players[1].hand).toHaveLength(5);
    expect(s.players[0].swapsWith[1]).toBe(1);
    expect(s.players[1].swapsWith[0]).toBe(1);
  });

  it('同一对玩家之间最多互换 2 次（不论谁发起），与第三人不受影响', () => {
    let s = createGame(['你', 'A', 'B'], [0]);
    const doSwap = (from: number, to: number) => {
      s = doRequest(s, from, to);
      s = doRespond(s, to, true);
      s = doPick(s, from, s.players[to].hand[0].id);
      s = doPick(s, to, s.players[from].hand[0].id);
      s = doPickCommit(s, from);
    };
    doSwap(0, 1);
    expect(s.players[0].swapsWith[1]).toBe(1);
    doSwap(1, 0); // 反方向发起也计入同一对
    expect(eligibleTargets(s, 0)).not.toContain(1);
    expect(eligibleTargets(s, 1)).not.toContain(0);
    expect(eligibleTargets(s, 0)).toContain(2);
  });

  it('被拒绝不消耗互换次数，但不能再找同一人；交换中不可结束换牌', () => {
    let s = createGame(['你', 'A', 'B'], [0]);
    s = doRequest(s, 0, 1);
    // 交换中不可 pass
    expect(doPass(s, 0).players[0].passed).toBe(false);
    s = doRespond(s, 1, false);
    expect(s.players[0].swapsWith[1] ?? 0).toBe(0);
    expect(doRequest(s, 0, 1).sessions).toHaveLength(0);
  });
});
