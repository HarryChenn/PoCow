import { GameState } from '../engine/game';

/** 玩家动作（客户端 → 房主；本地模式也用同一套） */
export type PlayerAction =
  | { k: 'pass' }
  | { k: 'deckSwap'; cardId: string }
  | { k: 'request'; to: number }
  | { k: 'respond'; accept: boolean }
  /** 选对方的牌按位置索引（对方手牌是暗的，避免泄露真实牌面 id） */
  | { k: 'pick'; index: number }
  /** 拆分阶段：提交自选的 3 张底牌（自己的牌，真实 id） */
  | { k: 'arrange'; bottomIds: string[] }
  | { k: 'nextRound' };

export interface LobbyPlayer {
  name: string;
  kind: 'host' | 'remote' | 'ai';
  connected: boolean;
}

export interface LobbyView {
  code: string;
  players: LobbyPlayer[];
  canStart: boolean;
  maxPlayers: number;
}

/** 客户端收到的脱敏视图：与 GameState 同构，deck 换成 deckCount，他人手牌为掩码牌 */
export type GameView = Omit<GameState, 'deck'> & { deckCount: number };

export type ClientMsg =
  | { t: 'hello'; name: string }
  | { t: 'action'; a: PlayerAction };

export type HostMsg =
  | { t: 'welcome'; seat: number }
  | { t: 'lobby'; lobby: LobbyView }
  | { t: 'state'; seat: number; view: GameView }
  | { t: 'error'; msg: string }
  | { t: 'roomClosed'; msg: string };
