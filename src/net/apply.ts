import {
  currentPicker,
  doDeckSwap,
  doPass,
  doPick,
  doRequest,
  doRespond,
  GameState,
  startRound,
} from '../engine/game';
import { PlayerAction } from './protocol';
import { resolvePickIndex } from './view';

/**
 * 把玩家动作安全地应用到状态上（单机、房主本人、远端客户端共用）。
 * 所有前置条件在这里校验，非法动作原样返回（防作弊/防乱序）。
 */
export function applyAction(g: GameState, seat: number, a: PlayerAction): GameState {
  const myTurn =
    g.phase === 'exchange' && !g.pending && !g.picking && g.turn === seat;
  switch (a.k) {
    case 'pass':
      return myTurn ? doPass(g, seat) : g;
    case 'deckSwap':
      return myTurn ? doDeckSwap(g, seat, a.cardId) : g;
    case 'request':
      return myTurn ? doRequest(g, seat, a.to) : g;
    case 'respond':
      return g.pending?.to === seat ? doRespond(g, a.accept) : g;
    case 'pick': {
      const pk = g.picking;
      if (!pk || currentPicker(g) !== seat) return g;
      const holder = seat === pk.from ? pk.to : pk.from;
      const cardId = resolvePickIndex(g, holder, a.index);
      return cardId ? doPick(g, seat, cardId) : g;
    }
    case 'nextRound':
      return g.phase === 'showdown' ? startRound(g) : g;
  }
}
