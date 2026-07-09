import { Card, makeDeck, shuffle } from './cards';
import { evaluateHand, HandEval } from './scoring';
import { compareHands } from './compare';

export interface PlayerState {
  id: number;
  name: string;
  isHuman: boolean;
  hand: Card[];
  score: number;
  /** 本局已发起对手交换的次数（上限 2） */
  requestsUsed: number;
  /** 本局是否已与牌堆换牌（换后不能再与对手换） */
  usedDeckSwap: boolean;
  /** 本局是否已做过任何主动动作（牌堆换牌仅限局开始、未行动时） */
  hasActed: boolean;
  passed: boolean;
  /** 本局拒绝过我的对手（不能再次向其发起） */
  refusedMe: number[];
}

export interface PendingRequest {
  from: number;
  to: number;
}

export interface RoundResult {
  evals: HandEval[];
  winners: number[];
  deltas: number[];
  payout: number;
}

export interface GameState {
  players: PlayerState[];
  deck: Card[];
  round: number;
  phase: 'exchange' | 'showdown';
  turn: number;
  pending: PendingRequest | null;
  log: string[];
  result: RoundResult | null;
}

export function createGame(names: string[], humanIndex: number): GameState {
  const players: PlayerState[] = names.map((name, i) => ({
    id: i,
    name,
    isHuman: i === humanIndex,
    hand: [],
    score: 0,
    requestsUsed: 0,
    usedDeckSwap: false,
    hasActed: false,
    passed: false,
    refusedMe: [],
  }));
  const state: GameState = {
    players,
    deck: [],
    round: 0,
    phase: 'exchange',
    turn: 0,
    pending: null,
    log: [],
    result: null,
  };
  return startRound(state);
}

export function startRound(prev: GameState): GameState {
  const s = structuredClone(prev);
  s.round += 1;
  s.deck = shuffle(makeDeck());
  for (const p of s.players) {
    p.hand = s.deck.splice(0, 5);
    p.requestsUsed = 0;
    p.usedDeckSwap = false;
    p.hasActed = false;
    p.passed = false;
    p.refusedMe = [];
  }
  s.phase = 'exchange';
  s.pending = null;
  s.result = null;
  s.turn = (s.round - 1) % s.players.length;
  s.log.push(`—— 第 ${s.round} 局开始，${s.players[s.turn].name} 先行动 ——`);
  return s;
}

export function canDeckSwap(s: GameState, pid: number): boolean {
  const p = s.players[pid];
  return !p.passed && !p.hasActed && s.deck.length > 0;
}

export function eligibleTargets(s: GameState, pid: number): number[] {
  const p = s.players[pid];
  if (p.usedDeckSwap || p.requestsUsed >= 2) return [];
  return s.players
    .filter((o) => o.id !== pid && !p.refusedMe.includes(o.id))
    .map((o) => o.id);
}

export function canRequest(s: GameState, pid: number): boolean {
  return !s.players[pid].passed && eligibleTargets(s, pid).length > 0;
}

export function hasMoves(s: GameState, pid: number): boolean {
  return canDeckSwap(s, pid) || canRequest(s, pid);
}

function randomIndex(n: number): number {
  return Math.floor(Math.random() * n);
}

function advanceTurn(s: GameState, from: number): GameState {
  let i = from;
  for (let step = 0; step < s.players.length; step++) {
    i = (i + 1) % s.players.length;
    const p = s.players[i];
    if (p.passed) continue;
    if (!hasMoves(s, p.id)) {
      p.passed = true;
      continue;
    }
    s.turn = i;
    return s;
  }
  return showdown(s);
}

function afterAction(s: GameState, pid: number): GameState {
  if (!hasMoves(s, pid)) {
    s.players[pid].passed = true;
    return advanceTurn(s, pid);
  }
  s.turn = pid;
  return s;
}

/** 与牌堆换牌：弃指定一张，从牌堆摸一张。仅限本局尚未行动时；换后本局不能再与对手换 */
export function doDeckSwap(prev: GameState, pid: number, cardId: string): GameState {
  const s = structuredClone(prev);
  const p = s.players[pid];
  if (!canDeckSwap(s, pid)) return s;
  const idx = p.hand.findIndex((c) => c.id === cardId);
  if (idx < 0) return s;
  p.hand.splice(idx, 1);
  p.hand.push(s.deck.shift() as Card);
  p.usedDeckSwap = true;
  p.hasActed = true;
  s.log.push(`${p.name} 与牌堆换了一张牌（本局不能再与对手换牌）`);
  return afterAction(s, pid);
}

/** 发起对手交换：对方可拒绝；拒绝不消耗次数，但不能再向同一人发起 */
export function doRequest(prev: GameState, from: number, to: number): GameState {
  const s = structuredClone(prev);
  if (s.pending || !eligibleTargets(s, from).includes(to)) return s;
  s.pending = { from, to };
  s.log.push(`${s.players[from].name} 请求与 ${s.players[to].name} 交换手牌`);
  return s;
}

/** 响应交换：接受则双方各随机抽走对方一张 */
export function doRespond(prev: GameState, accept: boolean): GameState {
  const s = structuredClone(prev);
  if (!s.pending) return s;
  const { from, to } = s.pending;
  const pf = s.players[from];
  const pt = s.players[to];
  s.pending = null;
  if (accept) {
    const fromCard = pf.hand.splice(randomIndex(pf.hand.length), 1)[0];
    const toCard = pt.hand.splice(randomIndex(pt.hand.length), 1)[0];
    pf.hand.push(toCard);
    pt.hand.push(fromCard);
    pf.requestsUsed += 1;
    pf.hasActed = true;
    s.log.push(`${pt.name} 接受了交换，双方各随机抽走对方一张牌（${pf.name} 已发起 ${pf.requestsUsed}/2 次）`);
  } else {
    pf.refusedMe.push(to);
    s.log.push(`${pt.name} 拒绝了 ${pf.name} 的交换请求`);
  }
  return afterAction(s, from);
}

export function doPass(prev: GameState, pid: number): GameState {
  const s = structuredClone(prev);
  s.players[pid].passed = true;
  s.log.push(`${s.players[pid].name} 结束换牌`);
  return advanceTurn(s, pid);
}

function showdown(s: GameState): GameState {
  const entries = s.players.map((p) => ({ id: p.id, eval: evaluateHand(p.hand), cards: p.hand }));
  let bestEntry = entries[0];
  for (const e of entries.slice(1)) {
    if (compareHands(e, bestEntry) > 0) bestEntry = e;
  }
  const winners = entries.filter((e) => compareHands(e, bestEntry) === 0).map((e) => e.id);
  const payout = Math.max(...winners.map((w) => entries[w].eval.payout));
  const loserCount = s.players.length - winners.length;
  const winnerGain = (payout * loserCount) / winners.length;

  const deltas = s.players.map((p) => (winners.includes(p.id) ? winnerGain : -payout));
  s.players.forEach((p, i) => {
    p.score += deltas[i];
  });

  s.result = { evals: entries.map((e) => e.eval), winners, deltas, payout };
  s.phase = 'showdown';
  const winnerNames = winners.map((w) => s.players[w].name).join('、');
  const label = entries[winners[0]].eval.label;
  s.log.push(`本局 ${winnerNames} 获胜（${label}），赔率 ${payout}×，每位输家赔 ${payout} 分`);
  return s;
}
