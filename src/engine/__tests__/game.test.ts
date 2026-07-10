import { describe, expect, it } from 'vitest';
import {
  createGame,
  currentPicker,
  doDeckSwap,
  doPass,
  doPick,
  doPickCommit,
  doRequest,
  doRespond,
  eligibleTargets,
  GameState,
  startRound,
} from '../game';
import { aiChooseAction, aiPickFromOpponent, aiRespond } from '../ai';

/** 全 AI 自动打完一局（用 AI 策略驱动所有人，包括“人类”位） */
function playRound(state: GameState): GameState {
  let s = state;
  let guard = 0;
  while (s.phase === 'exchange') {
    if (++guard > 500) throw new Error('换牌阶段未收敛');
    if (s.picking) {
      const picker = currentPicker(s);
      if (picker === null) {
        s = doPickCommit(s);
        continue;
      }
      s = doPick(s, picker, aiPickFromOpponent(s, picker));
      continue;
    }
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
    let s = createGame(['你', 'A', 'B', 'C', 'D'], [0]);
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

  it('牌堆换牌后：自己不能再发起，别人也不能再找他换', () => {
    let s = createGame(['你', 'A', 'B'], [0]);
    const cardId = s.players[s.turn].hand[0].id;
    const actor = s.turn;
    const other = (actor + 1) % 3;
    s = doDeckSwap(s, actor, cardId);
    expect(s.players[actor].usedDeckSwap).toBe(true);
    expect(s.players[actor].passed).toBe(true); // 无可用操作，自动结束
    // 自己强行发起应被拒绝（状态不变）
    expect(doRequest(s, actor, other).pending).toBeNull();
    // 别人也不能指定他为交换对象
    expect(eligibleTargets(s, other)).not.toContain(actor);
    expect(doRequest(s, other, actor).pending).toBeNull();
  });

  it('接受交换后双方各暗选对方一张，指定的两张牌互换', () => {
    let s = createGame(['你', 'A', 'B'], [0]);
    const from = s.turn;
    const to = (from + 1) % 3;
    s = doRequest(s, from, to);
    s = doRespond(s, true);
    expect(s.picking).toEqual({ from, to, fromPick: null, toPick: null });
    expect(currentPicker(s)).toBe(from);

    const wantFromTo = s.players[to].hand[2].id; // from 选中 to 的第 3 张
    const wantFromFrom = s.players[from].hand[4].id; // to 选中 from 的第 5 张

    // 未轮到 to 选牌、或选了不属于对方的牌，都应被忽略
    expect(doPick(s, to, wantFromFrom).picking).toEqual(s.picking);
    expect(doPick(s, from, s.players[from].hand[0].id).picking).toEqual(s.picking);

    s = doPick(s, from, wantFromTo);
    expect(currentPicker(s)).toBe(to);
    s = doPick(s, to, wantFromFrom);

    // 双方选定后进入亮牌窗口：尚未互换，双选可见
    expect(s.picking).toEqual({ from, to, fromPick: wantFromTo, toPick: wantFromFrom });
    expect(s.players[to].hand.map((c) => c.id)).toContain(wantFromTo);

    s = doPickCommit(s);
    expect(s.picking).toBeNull();
    expect(s.players[from].hand.map((c) => c.id)).toContain(wantFromTo);
    expect(s.players[to].hand.map((c) => c.id)).toContain(wantFromFrom);
    expect(s.players[from].hand).toHaveLength(5);
    expect(s.players[to].hand).toHaveLength(5);
    expect(s.players[from].swapsWith[to]).toBe(1);
    expect(s.players[to].swapsWith[from]).toBe(1);
  });

  it('同一对玩家之间最多互换 2 次（不论谁发起），与第三人不受影响', () => {
    let s = createGame(['你', 'A', 'B'], [0]);
    const a = s.turn;
    const b = (a + 1) % 3;
    const c = (a + 2) % 3;
    const doSwap = (from: number, to: number) => {
      s = doRequest(s, from, to);
      s = doRespond(s, true);
      s = doPick(s, from, s.players[to].hand[0].id);
      s = doPick(s, to, s.players[from].hand[0].id);
      s = doPickCommit(s);
    };
    doSwap(a, b);
    expect(s.players[a].swapsWith[b]).toBe(1);
    expect(s.players[b].swapsWith[a]).toBe(1);
    // 反方向发起也计入同一对的次数
    doSwap(b, a);
    expect(eligibleTargets(s, a)).not.toContain(b);
    expect(eligibleTargets(s, b)).not.toContain(a);
    // 与第三人仍可交换
    expect(eligibleTargets(s, a)).toContain(c);
  });

  it('被拒绝不消耗互换次数，但不能再找同一人', () => {
    let s = createGame(['你', 'A', 'B'], [0]);
    const actor = s.turn;
    const target = (actor + 1) % 3;
    s = doRequest(s, actor, target);
    expect(s.pending).toEqual({ from: actor, to: target });
    s = doRespond(s, false);
    expect(s.players[actor].swapsWith[target] ?? 0).toBe(0);
    // 不能再向拒绝过自己的人发起
    const blocked = doRequest(s, actor, target);
    expect(blocked.pending).toBeNull();
  });
});
