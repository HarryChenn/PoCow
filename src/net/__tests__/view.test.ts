import { describe, expect, it } from 'vitest';
import {
  createGame,
  doArrange,
  doPass,
  doPick,
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
    while (s.phase === 'exchange') s = doPass(s, s.players.find((p) => !p.passed)!.id);
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

  it('会话中指向暗牌的 pick 翻译为掩码 id，指向自己牌的保持真实 id', () => {
    let s = newGame();
    s = doRequest(s, 0, 1);
    s = doRespond(s, 1, true);
    const picked = s.players[1].hand[2].id; // 0 选中 1 的第 3 张
    s = doPick(s, 0, picked);

    const vFrom = viewFor(s, 0); // 发起方看：这张牌在对方手里，是暗牌 → 掩码
    expect(vFrom.sessions[0].fromPick).toBe('m1-2');
    const vTo = viewFor(s, 1); // 被选方看：自己的牌 → 真实 id
    expect(vTo.sessions[0].fromPick).toBe(picked);
    const vThird = viewFor(s, 2); // 第三方也只见掩码
    expect(vThird.sessions[0].fromPick).toBe('m1-2');
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
});

describe('动作应用 applyAction', () => {
  it('pick 按索引解析为对方真实手牌', () => {
    let s = newGame();
    s = doRequest(s, 0, 1);
    s = doRespond(s, 1, true);
    const target = s.players[1].hand[3].id;
    expect(resolvePickIndex(s, 1, 3)).toBe(target);
    s = applyAction(s, 0, { k: 'pick', index: 3 });
    expect(s.sessions[0].fromPick).toBe(target);
  });

  it('拒绝越权动作：替别人响应、局外选牌、越界索引均无效', () => {
    let s = newGame();
    s = doRequest(s, 0, 1);
    // 非被请求者不能响应
    expect(applyAction(s, 0, { k: 'respond', accept: true }).sessions[0].stage).toBe('pending');
    expect(applyAction(s, 2, { k: 'respond', accept: true }).sessions[0].stage).toBe('pending');
    s = doRespond(s, 1, true);
    // 越界索引无效
    expect(applyAction(s, 0, { k: 'pick', index: 99 }).sessions[0].fromPick).toBeNull();
    // 局外人不能选牌
    const after = applyAction(s, 2, { k: 'pick', index: 0 });
    expect(after.sessions[0].fromPick).toBeNull();
    expect(after.sessions[0].toPick).toBeNull();
  });

  it('nextRound 仅在摊牌阶段有效', () => {
    let s = newGame();
    expect(applyAction(s, 0, { k: 'nextRound' }).round).toBe(1);
    while (s.phase === 'exchange') s = doPass(s, s.players.find((p) => !p.passed)!.id);
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
