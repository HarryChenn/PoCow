import { Card, makeDeck, shuffle } from './cards';
import { evalSpecials, evaluateChosen, evaluateHand, HandEval } from './scoring';
import { compareHands } from './compare';

export interface PlayerState {
  id: number;
  name: string;
  /** 是否由真人控制（掉线转 AI 时置 false） */
  isHuman: boolean;
  hand: Card[];
  score: number;
  /** 本局与每个对手已完成的互换次数（每对玩家之间上限 2，双方对称计数） */
  swapsWith: Record<number, number>;
  /** 本局是否已与牌堆换牌（换后本局退出与对手的换牌，双向） */
  usedDeckSwap: boolean;
  /** 本局是否已做过任何主动动作（牌堆换牌仅限尚未行动时） */
  hasActed: boolean;
  passed: boolean;
  /** 本局拒绝过我的对手（不能再次向其发起） */
  refusedMe: number[];
  /** 拆分阶段自选的 3 张底牌 id（特殊胜利/未提交为 null） */
  chosenBottom: string[] | null;
  /** 是否已完成拆分（特殊胜利自动视为完成） */
  arrangedDone: boolean;
}

/**
 * 一组正在进行的交换（自由换牌：多组可并行，一名玩家同时只能在一组中）。
 * pending：等待 to 接受/拒绝；picking：双方各自从对方手牌暗选一张（可同时选）。
 */
export interface ExchangeSession {
  from: number;
  to: number;
  stage: 'pending' | 'picking';
  /** from 选中的 to 的牌 */
  fromPick: string | null;
  /** to 选中的 from 的牌 */
  toPick: string | null;
}

export type LogKind =
  | 'round'
  | 'deckSwap'
  | 'request'
  | 'accept'
  | 'refuse'
  | 'swap'
  | 'pass'
  | 'arrange'
  | 'arranged'
  | 'win'
  | 'takeover';

/** 结构化日志：kind/seat 供 UI 触发飘字、飞牌等动效；id 自增，视图裁剪后仍可检测新事件 */
export interface LogEntry {
  id: number;
  text: string;
  kind?: LogKind;
  seat?: number;
  seat2?: number;
}

function pushLog(s: GameState, entry: Omit<LogEntry, 'id'>): void {
  s.log.push({ id: s.logSeq++, ...entry });
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
  phase: 'exchange' | 'arrange' | 'showdown';
  sessions: ExchangeSession[];
  log: LogEntry[];
  logSeq: number;
  result: RoundResult | null;
}

/** GameState 与客户端脱敏视图（deck → deckCount）的公共形状，判定函数两者通用 */
export type GameStateLike = Omit<GameState, 'deck'> & { deck?: Card[]; deckCount?: number };

export function deckSize(s: GameStateLike): number {
  return s.deck ? s.deck.length : (s.deckCount ?? 0);
}

/** pid 所在的进行中交换（同时最多一组） */
export function sessionOf(s: GameStateLike, pid: number): ExchangeSession | null {
  return s.sessions.find((x) => x.from === pid || x.to === pid) ?? null;
}

export function isBusy(s: GameStateLike, pid: number): boolean {
  return sessionOf(s, pid) !== null;
}

export function createGame(names: string[], humanSeats: number[]): GameState {
  const players: PlayerState[] = names.map((name, i) => ({
    id: i,
    name,
    isHuman: humanSeats.includes(i),
    hand: [],
    score: 0,
    swapsWith: {},
    usedDeckSwap: false,
    hasActed: false,
    passed: false,
    refusedMe: [],
    chosenBottom: null,
    arrangedDone: false,
  }));
  const state: GameState = {
    players,
    deck: [],
    round: 0,
    phase: 'exchange',
    sessions: [],
    log: [],
    logSeq: 0,
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
    p.swapsWith = {};
    p.usedDeckSwap = false;
    p.hasActed = false;
    p.passed = false;
    p.refusedMe = [];
    p.chosenBottom = null;
    p.arrangedDone = false;
  }
  s.phase = 'exchange';
  s.sessions = [];
  s.result = null;
  pushLog(s, { text: `—— 第 ${s.round} 局开始，自由换牌 ——`, kind: 'round' });
  return s;
}

/** 立即可与牌堆换牌（含「不在交换中」的即时约束） */
export function canDeckSwap(s: GameStateLike, pid: number): boolean {
  const p = s.players[pid];
  return !p.passed && !p.hasActed && deckSize(s) > 0 && !isBusy(s, pid);
}

/** 永久性可交换对象（不含「对方正忙」这种临时状态） */
export function eligibleTargets(s: GameStateLike, pid: number): number[] {
  const p = s.players[pid];
  if (p.usedDeckSwap) return [];
  return s.players
    .filter(
      (o) =>
        o.id !== pid &&
        !o.usedDeckSwap &&
        (p.swapsWith[o.id] ?? 0) < 2 &&
        !p.refusedMe.includes(o.id),
    )
    .map((o) => o.id);
}

/** 此刻真正可发起交换的对象（排除正在交换中的双方） */
export function availableTargets(s: GameStateLike, pid: number): number[] {
  if (s.players[pid].passed || isBusy(s, pid)) return [];
  return eligibleTargets(s, pid).filter((o) => !isBusy(s, o));
}

/** 是否还有潜在动作（用于自动结束判定；「对方在忙」是暂时的，不算没动作） */
function hasPotentialMoves(s: GameState, pid: number): boolean {
  const p = s.players[pid];
  return (!p.hasActed && s.deck.length > 0) || eligibleTargets(s, pid).length > 0;
}

/** 每次动作后的清扫：无事可做的玩家自动结束；全员结束且无进行中交换 → 拆分阶段 */
function sweep(s: GameState): GameState {
  for (const p of s.players) {
    if (!p.passed && !isBusy(s, p.id) && !hasPotentialMoves(s, p.id)) {
      p.passed = true;
    }
  }
  if (s.players.every((p) => p.passed) && s.sessions.length === 0) {
    return enterArrange(s);
  }
  return s;
}

/** 与牌堆换牌：弃指定一张，从牌堆摸一张。仅限尚未行动时；换后本局退出与对手的换牌 */
export function doDeckSwap(prev: GameState, pid: number, cardId: string): GameState {
  const s = structuredClone(prev);
  const p = s.players[pid];
  if (s.phase !== 'exchange' || !canDeckSwap(s, pid)) return s;
  const idx = p.hand.findIndex((c) => c.id === cardId);
  if (idx < 0) return s;
  // 摸来的牌放在被弃牌的原位置，保持手牌顺序
  p.hand[idx] = s.deck.shift() as Card;
  p.usedDeckSwap = true;
  p.hasActed = true;
  pushLog(s, {
    text: `${p.name} 与牌堆换了一张牌（本局退出与对手的换牌）`,
    kind: 'deckSwap',
    seat: pid,
  });
  return sweep(s);
}

/** 发起对手交换：双方都必须空闲；对方可拒绝 */
export function doRequest(prev: GameState, from: number, to: number): GameState {
  const s = structuredClone(prev);
  if (s.phase !== 'exchange' || !availableTargets(s, from).includes(to)) return s;
  s.sessions.push({ from, to, stage: 'pending', fromPick: null, toPick: null });
  pushLog(s, {
    text: `${s.players[from].name} 请求与 ${s.players[to].name} 交换手牌`,
    kind: 'request',
    seat: from,
    seat2: to,
  });
  return s;
}

/** 响应交换：接受则双方进入暗选（可同时选）；拒绝则解散该组 */
export function doRespond(prev: GameState, responder: number, accept: boolean): GameState {
  const s = structuredClone(prev);
  const idx = s.sessions.findIndex((x) => x.stage === 'pending' && x.to === responder);
  if (s.phase !== 'exchange' || idx < 0) return s;
  const ses = s.sessions[idx];
  const pf = s.players[ses.from];
  const pt = s.players[ses.to];
  if (accept) {
    ses.stage = 'picking';
    pushLog(s, {
      text: `${pt.name} 接受了交换，双方各从对方手牌中暗选一张`,
      kind: 'accept',
      seat: ses.to,
    });
    return s;
  }
  s.sessions.splice(idx, 1);
  pf.refusedMe.push(ses.to);
  pushLog(s, {
    text: `${pt.name} 拒绝了 ${pf.name} 的交换请求`,
    kind: 'refuse',
    seat: ses.to,
  });
  return sweep(s);
}

/** picker 从对方手牌中暗选一张（双方可同时选）。双方都选定后进入亮牌窗口 */
export function doPick(prev: GameState, picker: number, cardId: string): GameState {
  const s = structuredClone(prev);
  const ses = sessionOf(s, picker);
  if (s.phase !== 'exchange' || !ses || ses.stage !== 'picking') return s;
  const isFrom = picker === ses.from;
  if ((isFrom ? ses.fromPick : ses.toPick) !== null) return s;
  const other = s.players[isFrom ? ses.to : ses.from];
  if (!other.hand.some((c) => c.id === cardId)) return s;
  if (isFrom) ses.fromPick = cardId;
  else ses.toPick = cardId;
  return s;
}

/** 亮牌窗口结束后执行互换（房主/单机驱动按会话调用，客户端只等广播） */
export function doPickCommit(prev: GameState, from: number): GameState {
  const s = structuredClone(prev);
  const idx = s.sessions.findIndex(
    (x) => x.from === from && x.stage === 'picking' && x.fromPick !== null && x.toPick !== null,
  );
  if (idx < 0) return s;
  const ses = s.sessions[idx];
  const pf = s.players[ses.from];
  const pt = s.players[ses.to];
  // 换来的牌放在被换走那张的原位置，保持双方手牌顺序
  const idxInTo = pt.hand.findIndex((c) => c.id === ses.fromPick);
  const idxInFrom = pf.hand.findIndex((c) => c.id === ses.toPick);
  const cardFromTo = pt.hand[idxInTo];
  const cardFromFrom = pf.hand[idxInFrom];
  pf.hand[idxInFrom] = cardFromTo;
  pt.hand[idxInTo] = cardFromFrom;
  const count = (pf.swapsWith[ses.to] ?? 0) + 1;
  pf.swapsWith[ses.to] = count;
  pt.swapsWith[ses.from] = count;
  pf.hasActed = true;
  s.sessions.splice(idx, 1);
  pushLog(s, {
    text: `${pf.name} 与 ${pt.name} 互换了一张牌（双方已互换 ${count}/2 次）`,
    kind: 'swap',
    seat: ses.from,
    seat2: ses.to,
  });
  return sweep(s);
}

/** 主动结束换牌（交换中不可结束，需先完成当前交换） */
export function doPass(prev: GameState, pid: number): GameState {
  const s = structuredClone(prev);
  const p = s.players[pid];
  if (s.phase !== 'exchange' || p.passed || isBusy(s, pid)) return s;
  p.passed = true;
  pushLog(s, { text: `${p.name} 结束换牌`, kind: 'pass', seat: pid });
  return sweep(s);
}

/** 掉线：座位转为 AI 控制，牌局继续 */
export function markSeatAi(prev: GameState, pid: number): GameState {
  const s = structuredClone(prev);
  const p = s.players[pid];
  if (!p.isHuman) return s;
  p.isHuman = false;
  pushLog(s, { text: `${p.name} 掉线，由 AI 接管`, kind: 'takeover', seat: pid });
  return s;
}

/** 换牌结束 → 拆分阶段。特殊胜利的手牌无需拆分，自动视为已完成 */
function enterArrange(s: GameState): GameState {
  s.phase = 'arrange';
  for (const p of s.players) {
    if (evalSpecials(p.hand).length > 0) p.arrangedDone = true;
  }
  pushLog(s, { text: '换牌结束，请各自拆分 3+2（选 3 张做底牌）', kind: 'arrange' });
  if (s.players.every((p) => p.arrangedDone)) return showdown(s);
  return s;
}

/** 拆分阶段：提交自选的 3 张底牌；全员完成后摊牌 */
export function doArrange(prev: GameState, pid: number, bottomIds: string[]): GameState {
  const s = structuredClone(prev);
  const p = s.players[pid];
  if (s.phase !== 'arrange' || p.arrangedDone) return s;
  const unique = [...new Set(bottomIds)];
  if (unique.length !== 3 || !unique.every((id) => p.hand.some((c) => c.id === id))) return s;
  p.chosenBottom = unique;
  p.arrangedDone = true;
  pushLog(s, { text: `${p.name} 完成拆分`, kind: 'arranged', seat: pid });
  if (s.players.every((x) => x.arrangedDone)) return showdown(s);
  return s;
}

/** AI 拆分：按最优拆提交 */
export function bestBottomIds(hand: Card[]): string[] {
  const ev = evaluateHand(hand);
  const bottom = ev.split ? ev.split.bottom : hand.slice(0, 3);
  return bottom.map((c) => c.id);
}

function showdown(s: GameState): GameState {
  const entries = s.players.map((p) => ({
    id: p.id,
    eval: evaluateChosen(p.hand, p.chosenBottom),
    cards: p.hand,
  }));
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
  pushLog(s, {
    text: `本局 ${winnerNames} 获胜（${label}），每位输家赔 ${payout} 分`,
    kind: 'win',
    seat: winners[0],
  });
  return s;
}
