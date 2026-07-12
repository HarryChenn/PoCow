import { Card, makeDeck, shuffle } from './cards';
import { evalSpecials, evaluateChosen, HandEval } from './scoring';
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
  /** 本局是否已做过任何主动动作（牌堆换牌仅限局开始、未行动时） */
  hasActed: boolean;
  passed: boolean;
  /** 本局拒绝过我的对手（不能再次向其发起） */
  refusedMe: number[];
  /** 拆分阶段自选的 3 张底牌 id（特殊胜利/未提交为 null） */
  chosenBottom: string[] | null;
  /** 是否已完成拆分（特殊胜利自动视为完成） */
  arrangedDone: boolean;
}

export interface PendingRequest {
  from: number;
  to: number;
}

/** 交换被接受后，双方各从对方手牌中暗选一张（fromPick 是 from 选中的 to 的牌） */
export interface PickingState {
  from: number;
  to: number;
  fromPick: string | null;
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
  turn: number;
  pending: PendingRequest | null;
  picking: PickingState | null;
  log: LogEntry[];
  logSeq: number;
  result: RoundResult | null;
}

/** GameState 与客户端脱敏视图（deck → deckCount）的公共形状，判定函数两者通用 */
export type GameStateLike = Omit<GameState, 'deck'> & { deck?: Card[]; deckCount?: number };

export function deckSize(s: GameStateLike): number {
  return s.deck ? s.deck.length : (s.deckCount ?? 0);
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
    turn: 0,
    pending: null,
    picking: null,
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
  s.pending = null;
  s.picking = null;
  s.result = null;
  s.turn = (s.round - 1) % s.players.length;
  pushLog(s, {
    text: `—— 第 ${s.round} 局开始，${s.players[s.turn].name} 先行动 ——`,
    kind: 'round',
  });
  return s;
}

export function canDeckSwap(s: GameStateLike, pid: number): boolean {
  const p = s.players[pid];
  return !p.passed && !p.hasActed && deckSize(s) > 0;
}

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

export function canRequest(s: GameStateLike, pid: number): boolean {
  return !s.players[pid].passed && eligibleTargets(s, pid).length > 0;
}

export function hasMoves(s: GameStateLike, pid: number): boolean {
  return canDeckSwap(s, pid) || canRequest(s, pid);
}

/** 选牌阶段中当前应选牌的玩家（先 from 后 to），选完为 null */
export function currentPicker(s: GameStateLike): number | null {
  if (!s.picking) return null;
  if (s.picking.fromPick === null) return s.picking.from;
  if (s.picking.toPick === null) return s.picking.to;
  return null;
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
  return enterArrange(s);
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

function afterAction(s: GameState, pid: number): GameState {
  if (!hasMoves(s, pid)) {
    s.players[pid].passed = true;
    return advanceTurn(s, pid);
  }
  s.turn = pid;
  return s;
}

/** 与牌堆换牌：弃指定一张，从牌堆摸一张。仅限本局尚未行动时；换后本局退出与对手的换牌 */
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
  pushLog(s, {
    text: `${p.name} 与牌堆换了一张牌（本局退出与对手的换牌）`,
    kind: 'deckSwap',
    seat: pid,
  });
  return afterAction(s, pid);
}

/** 发起对手交换：对方可拒绝；拒绝不消耗次数，但不能再向同一人发起 */
export function doRequest(prev: GameState, from: number, to: number): GameState {
  const s = structuredClone(prev);
  if (s.pending || s.picking || !eligibleTargets(s, from).includes(to)) return s;
  s.pending = { from, to };
  pushLog(s, {
    text: `${s.players[from].name} 请求与 ${s.players[to].name} 交换手牌`,
    kind: 'request',
    seat: from,
    seat2: to,
  });
  return s;
}

/** 响应交换：接受则进入选牌阶段，双方各从对方手牌中暗选一张 */
export function doRespond(prev: GameState, accept: boolean): GameState {
  const s = structuredClone(prev);
  if (!s.pending) return s;
  const { from, to } = s.pending;
  const pf = s.players[from];
  const pt = s.players[to];
  s.pending = null;
  if (accept) {
    s.picking = { from, to, fromPick: null, toPick: null };
    pushLog(s, {
      text: `${pt.name} 接受了交换，双方各从对方手牌中暗选一张`,
      kind: 'accept',
      seat: to,
    });
    return s;
  }
  pf.refusedMe.push(to);
  pushLog(s, {
    text: `${pt.name} 拒绝了 ${pf.name} 的交换请求`,
    kind: 'refuse',
    seat: to,
  });
  return afterAction(s, from);
}

/**
 * picker 从对方手牌中暗选一张。双方都选定后进入「亮牌」窗口（picking 保留、
 * 两张被选中的牌对双方可见），由驱动方稍后调用 doPickCommit 真正互换。
 */
export function doPick(prev: GameState, picker: number, cardId: string): GameState {
  const s = structuredClone(prev);
  const pk = s.picking;
  if (!pk || currentPicker(s) !== picker) return s;
  const other = s.players[picker === pk.from ? pk.to : pk.from];
  if (!other.hand.some((c) => c.id === cardId)) return s;
  if (picker === pk.from) pk.fromPick = cardId;
  else pk.toPick = cardId;
  return s;
}

/** 亮牌窗口结束后执行互换（房主/单机驱动调用，客户端只等广播） */
export function doPickCommit(prev: GameState): GameState {
  const s = structuredClone(prev);
  const pk = s.picking;
  if (!pk || pk.fromPick === null || pk.toPick === null) return s;

  const pf = s.players[pk.from];
  const pt = s.players[pk.to];
  const cardFromTo = pt.hand.splice(pt.hand.findIndex((c) => c.id === pk.fromPick), 1)[0];
  const cardFromFrom = pf.hand.splice(pf.hand.findIndex((c) => c.id === pk.toPick), 1)[0];
  pf.hand.push(cardFromTo);
  pt.hand.push(cardFromFrom);
  const count = (pf.swapsWith[pk.to] ?? 0) + 1;
  pf.swapsWith[pk.to] = count;
  pt.swapsWith[pk.from] = count;
  pf.hasActed = true;
  s.picking = null;
  pushLog(s, {
    text: `${pf.name} 与 ${pt.name} 互换了一张牌（双方已互换 ${count}/2 次）`,
    kind: 'swap',
    seat: pk.from,
    seat2: pk.to,
  });
  return afterAction(s, pk.from);
}

export function doPass(prev: GameState, pid: number): GameState {
  const s = structuredClone(prev);
  s.players[pid].passed = true;
  pushLog(s, { text: `${s.players[pid].name} 结束换牌`, kind: 'pass', seat: pid });
  return advanceTurn(s, pid);
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
