import { describe, expect, it } from 'vitest';
import {
  createGame,
  doArrange,
  doPass,
  doRequest,
  doRespond,
  GameState,
} from '../../engine/game';
import { applyAction } from '../apply';
import { viewFor, resolvePickIndex } from '../view';

function newGame(): GameState {
  return createGame(['房主', '甲', '乙'], [0, 1, 2]);
}

describe('视图脱敏 viewFor', () => {
  it('自己手牌可见，他人手牌为掩码，牌堆只发张数', () => {
    const s = newGame();
    const v = viewFor(s, 1);
    expect(v.players[1].hand).toEqual(s.players[1].hand);
    v.players[0].hand.forEach((c, i) => {
      expect(c.rank).toBe(0);
      expect(c.suit).toBeNull();
      expect(c.id).toBe(`m0-${i}`);
    });
    expect(v.deckCount).toBe(s.deck.length);
    expect((v as unknown as GameState).deck).toBeUndefined();
    expect(v.result).toBeNull();
  });

  it('摊牌阶段全部揭示并附结算结果', () => {
    let s = newGame();
    // 全员结束换牌 → 拆分 → 摊牌
    while (s.phase === 'exchange') s = doPass(s, s.turn);
    while (s.phase === 'arrange') {
      const p = s.players.find((x) => !x.arrangedDone)!;
      s = doArrange(
        s,
        p.id,
        p.hand.slice(0, 3).map((c) => c.id),
      );
    }
    expect(s.phase).toBe('showdown');
    const v = viewFor(s, 2);
    expect(v.players[0].hand).toEqual(s.players[0].hand);
    expect(v.result).not.toBeNull();
  });

  it('他人的拆分选择在摊牌前不可见', () => {
    let s: GameState = { ...newGame(), phase: 'arrange' };
    s = doArrange(
      s,
      0,
      s.players[0].hand.slice(0, 3).map((c) => c.id),
    );
    expect(s.phase).toBe('arrange'); // 其他人未提交
    expect(viewFor(s, 1).players[0].chosenBottom).toBeNull();
    expect(viewFor(s, 0).players[0].chosenBottom).toHaveLength(3);
  });

  it('picking 中指向暗牌的 pick 翻译为掩码 id，指向自己牌的保持真实 id', () => {
    let s = newGame();
    const from = s.turn;
    const to = (from + 1) % 3;
    s = doRequest(s, from, to);
    s = doRespond(s, true);
    // from 选中 to 的第 2 张
    const picked = s.players[to].hand[2].id;
    s = { ...s, picking: { ...s.picking!, fromPick: picked } };

    const vFrom = viewFor(s, from); // from 看：这张牌在 to 手里，是暗牌 → 掩码
    expect(vFrom.picking!.fromPick).toBe(`m${to}-2`);
    const vTo = viewFor(s, to); // to 看：自己的牌 → 真实 id
    expect(vTo.picking!.fromPick).toBe(picked);
  });
});

describe('动作应用 applyAction', () => {
  it('pick 按索引解析为对方真实手牌', () => {
    let s = newGame();
    const from = s.turn;
    const to = (from + 1) % 3;
    s = doRequest(s, from, to);
    s = doRespond(s, true);
    const target = s.players[to].hand[3].id;
    expect(resolvePickIndex(s, to, 3)).toBe(target);
    s = applyAction(s, from, { k: 'pick', index: 3 });
    expect(s.picking!.fromPick).toBe(target);
  });

  it('拒绝乱序/越权动作：不轮到你、替别人响应、越界索引均无效', () => {
    let s = newGame();
    const notTurn = (s.turn + 1) % 3;
    expect(applyAction(s, notTurn, { k: 'pass' }).players[notTurn].passed).toBe(false);
    expect(applyAction(s, notTurn, { k: 'request', to: s.turn }).pending).toBeNull();

    const from = s.turn;
    const to = (from + 1) % 3;
    s = doRequest(s, from, to);
    // 非被请求者不能响应
    expect(applyAction(s, from, { k: 'respond', accept: true }).picking).toBeNull();
    s = doRespond(s, true);
    // 越界索引无效
    expect(applyAction(s, from, { k: 'pick', index: 99 }).picking!.fromPick).toBeNull();
    // 没轮到 to 选
    expect(applyAction(s, to, { k: 'pick', index: 0 }).picking!.toPick).toBeNull();
  });

  it('nextRound 仅在摊牌阶段有效', () => {
    let s = newGame();
    expect(applyAction(s, 0, { k: 'nextRound' }).round).toBe(1);
    while (s.phase === 'exchange') s = doPass(s, s.turn);
    while (s.phase === 'arrange') {
      const p = s.players.find((x) => !x.arrangedDone)!;
      s = applyAction(s, p.id, {
        k: 'arrange',
        bottomIds: p.hand.slice(0, 3).map((c) => c.id),
      });
    }
    expect(s.phase).toBe('showdown');
    s = applyAction(s, 0, { k: 'nextRound' });
    expect(s.round).toBe(2);
    expect(s.phase).toBe('exchange');
  });
});
