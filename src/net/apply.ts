import {
  doArrange,
  doDeckSwap,
  doPass,
  doPick,
  doRequest,
  doRespond,
  GameState,
  sessionOf,
  startRound,
} from '../engine/game';
import { PlayerAction } from './protocol';
import { resolvePickIndex } from './view';

/**
 * 把玩家动作安全地应用到状态上（单机、房主本人、远端客户端共用）。
 * 引擎函数自身校验前置条件，非法动作原样返回（防作弊/防乱序）。
 */
export function applyAction(g: GameState, seat: number, a: PlayerAction): GameState {
  switch (a.k) {
    case 'pass':
      return doPass(g, seat);
    case 'deckSwap':
      return doDeckSwap(g, seat, a.cardId);
    case 'request':
      return doRequest(g, seat, a.to);
    case 'respond':
      return doRespond(g, seat, a.accept);
    case 'pick': {
      const ses = sessionOf(g, seat);
      if (!ses || ses.stage !== 'picking') return g;
      const holder = seat === ses.from ? ses.to : ses.from;
      const cardId = resolvePickIndex(g, holder, a.index);
      return cardId ? doPick(g, seat, cardId) : g;
    }
    case 'arrange':
      return doArrange(g, seat, a.bottomIds);
    case 'nextRound':
      return g.phase === 'showdown' ? startRound(g) : g;
  }
}
