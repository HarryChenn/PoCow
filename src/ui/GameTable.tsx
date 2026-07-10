import { CSSProperties, useEffect, useRef, useState } from 'react';
import {
  canDeckSwap,
  canRequest,
  currentPicker,
  deckSize,
  eligibleTargets,
  GameStateLike,
} from '../engine/game';
import { evaluateHand } from '../engine/scoring';
import { PlayerAction } from '../net/protocol';
import { CardView } from './CardView';
import { ShowdownPanel } from './ShowdownPanel';
import { RulesModal } from './RulesModal';

const FLIGHT_MS = 600;
const CARD_W = 44;
const CARD_H = 62;

interface Flight {
  key: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface FloatItem {
  key: string;
  x: number;
  y: number;
  text: string;
}

interface Point {
  left: number;
  top: number;
}

interface Props {
  state: GameStateLike;
  myId: number;
  /** 本人所有交互统一出口（单机直接应用引擎，联机发给房主） */
  onAction: (a: PlayerAction) => void;
  /** 是否能开下一局（客户端为 false，显示等待房主） */
  canNextRound: boolean;
  exitLabel: string;
  onExit: () => void;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function cardRect(cardId: string): DOMRect | null {
  return document.querySelector(`[data-card-id="${cardId}"]`)?.getBoundingClientRect() ?? null;
}

function deckPoint(): Point | null {
  const r = document.querySelector('[data-deck]')?.getBoundingClientRect();
  return r ? { left: r.left + r.width / 2 - CARD_W / 2, top: r.top + r.height / 2 - CARD_H / 2 } : null;
}

function seatPoint(seat: number): Point | null {
  const r = document.querySelector(`[data-seat-id="${seat}"]`)?.getBoundingClientRect();
  return r ? { left: r.left + r.width / 2 - CARD_W / 2, top: r.top + r.height / 2 - CARD_H / 2 } : null;
}

export function GameTable({ state, myId, onAction, canNextRound, exitLabel, onExit }: Props) {
  const [mode, setMode] = useState<'idle' | 'discard'>('idle');
  const [flights, setFlights] = useState<Flight[]>([]);
  const [floats, setFloats] = useState<FloatItem[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);
  /** 本人动作的飞牌动画进行中：暂锁交互，动画结束后才提交动作 */
  const [busy, setBusy] = useState(false);

  const me = state.players[myId];
  const opponents = [...state.players.slice(myId + 1), ...state.players.slice(0, myId)];
  const pk = state.picking;
  const pickerNow = currentPicker(state);
  const pickSourceId = pk && pickerNow !== null ? (pickerNow === pk.from ? pk.to : pk.from) : null;
  const iAmPicking = pickerNow === myId && !busy;
  const isMyTurn =
    state.phase === 'exchange' && state.turn === myId && !state.pending && !pk && !busy;
  const pendingToMe = state.pending && state.pending.to === myId;
  const myEval = evaluateHand(me.hand);
  const targets = eligibleTargets(state, myId);

  const addFloat = (seatId: number, text: string) => {
    const el = document.querySelector(`[data-seat-id="${seatId}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const key = `float-${Date.now()}-${Math.random()}`;
    setFloats((f) => [...f, { key, x: r.left + r.width / 2, y: r.top + 6, text }]);
    setTimeout(() => setFloats((f) => f.filter((i) => i.key !== key)), 1200);
  };

  const flyCards = (a: Point, b: Point, after?: () => void) => {
    const key = `fly-${Date.now()}-${Math.random()}`;
    setFlights((f) => [
      ...f,
      { key: `${key}-a`, x0: a.left, y0: a.top, x1: b.left, y1: b.top },
      { key: `${key}-b`, x0: b.left, y0: b.top, x1: a.left, y1: a.top },
    ]);
    setTimeout(() => {
      setFlights((f) => f.filter((x) => !x.key.startsWith(key)));
      after?.();
    }, FLIGHT_MS);
  };

  /** 本人动作：先飞牌再提交 */
  const flyThenAct = (a: Point, b: Point, action: PlayerAction) => {
    setBusy(true);
    setMode('idle');
    flyCards(a, b, () => {
      setBusy(false);
      onAction(action);
    });
  };

  // 回合横幅
  useEffect(() => {
    if (state.phase !== 'exchange') return;
    const p = state.players[state.turn];
    setBanner(p.id === myId ? '轮到你了！' : `轮到 ${p.name}`);
    const t = setTimeout(() => setBanner(null), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.turn, state.round, state.phase]);

  // 由结构化日志驱动的飘字与装饰性飞牌（本人的飞牌在交互时已播，跳过）
  const lastLogId = useRef(-1);
  useEffect(() => {
    const fresh = state.log.filter((e) => e.id > lastLogId.current);
    if (state.log.length > 0) {
      lastLogId.current = Math.max(lastLogId.current, state.log[state.log.length - 1].id);
    }
    for (const e of fresh) {
      if (e.seat === undefined) continue;
      switch (e.kind) {
        case 'deckSwap': {
          addFloat(e.seat, '🃏 换牌堆');
          if (e.seat !== myId) {
            const a = seatPoint(e.seat);
            const b = deckPoint();
            if (a && b) flyCards(a, b);
          }
          break;
        }
        case 'request':
          addFloat(e.seat, '🤝 求交换');
          break;
        case 'accept':
          addFloat(e.seat, '🤝 接受');
          break;
        case 'refuse':
          addFloat(e.seat, '❌ 拒绝');
          break;
        case 'swap': {
          if (e.seat !== myId && e.seat2 !== myId && e.seat2 !== undefined) {
            const a = seatPoint(e.seat);
            const b = seatPoint(e.seat2);
            if (a && b) flyCards(a, b);
          }
          break;
        }
        case 'pass':
          addFloat(e.seat, '✋ 结束换牌');
          break;
        case 'takeover':
          addFloat(e.seat, '🔌 AI 接管');
          break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.log]);

  const discardCard = (cardId: string) => {
    if (busy) return;
    const a = cardRect(cardId);
    const b = deckPoint();
    if (a && b) flyThenAct(a, b, { k: 'deckSwap', cardId });
    else {
      setMode('idle');
      onAction({ k: 'deckSwap', cardId });
    }
  };

  const pickCard = (index: number, cardId: string) => {
    if (busy || !pk) return;
    const otherPick = myId === pk.from ? pk.toPick : pk.fromPick;
    if (otherPick) {
      const a = cardRect(cardId);
      const b = cardRect(otherPick);
      if (a && b) {
        flyThenAct(a, b, { k: 'pick', index });
        return;
      }
    }
    onAction({ k: 'pick', index });
  };

  const isPicked = (cardId: string) => !!pk && (cardId === pk.fromPick || cardId === pk.toPick);

  /** 正在等待其决定的座位（跳动省略号），本人除外 */
  const thinkingId = (() => {
    if (state.phase !== 'exchange' || busy) return null;
    const waitingOn = pk ? pickerNow : state.pending ? state.pending.to : state.turn;
    return waitingOn === null || waitingOn === myId ? null : waitingOn;
  })();

  const phaseText = () => {
    if (state.phase !== 'exchange') return '摊牌';
    if (busy) return '交换中…';
    if (pk && pickerNow !== null) {
      return `${state.players[pickerNow].name} 正在暗选 ${state.players[pickSourceId!].name} 的一张牌…`;
    }
    if (state.pending) return `等待 ${state.players[state.pending.to].name} 响应交换…`;
    return `轮到 ${state.players[state.turn].name} 行动`;
  };

  return (
    <div className="table-screen">
      <header className="table-header">
        <span className="brand">
          PoCow <em>德牛</em>
        </span>
        <span className="round-tag">第 {state.round} 局</span>
        <span className="phase-tag">{phaseText()}</span>
        <button className="btn header-rules" onClick={() => setShowRules(true)}>
          规则
        </button>
      </header>

      <div className="opponents-row">
        {opponents.map((p) => {
          const swappable = isMyTurn && mode === 'idle' && targets.includes(p.id);
          const pickHere = iAmPicking && pickSourceId === p.id;
          const active =
            state.phase === 'exchange' && !pk && !state.pending && state.turn === p.id;
          return (
            <div
              key={p.id}
              data-seat-id={p.id}
              className={`seat ${active ? 'seat-active' : ''} ${pickHere ? 'seat-picking' : ''}`}
            >
              {swappable && (
                <button
                  className="seat-swap-btn"
                  onClick={() => onAction({ k: 'request', to: p.id })}
                >
                  🤝 换牌
                </button>
              )}
              <div className="seat-name">
                {!p.isHuman && <span className="ai-tag">AI</span>}
                {p.name}
                {thinkingId === p.id && (
                  <span className="think-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </div>
              <div className="seat-score">分数 {fmt(p.score)}</div>
              <div className="seat-cards">
                {p.hand.map((c, i) => (
                  <CardView
                    key={c.id}
                    card={c}
                    hidden
                    small
                    dataId={c.id}
                    picked={isPicked(c.id)}
                    selectable={pickHere}
                    onClick={() => {
                      if (pickHere) pickCard(i, c.id);
                    }}
                  />
                ))}
              </div>
              <div className="seat-status">
                {p.usedDeckSwap && <span className="chip">已换牌堆</span>}
                {p.requestsUsed > 0 && <span className="chip">已换 {p.requestsUsed}/2</span>}
                {p.passed && <span className="chip chip-done">已结束</span>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mid-row">
        <div
          className={`deck-pile ${mode === 'discard' ? 'deck-active' : ''} ${
            isMyTurn && canDeckSwap(state, myId) ? 'deck-clickable' : ''
          }`}
          data-deck="true"
          onClick={() => {
            if (isMyTurn && canDeckSwap(state, myId)) {
              setMode(mode === 'discard' ? 'idle' : 'discard');
            }
          }}
        >
          <div className="deck-stack">
            <div className="card card-sm card-back" />
            <div className="card card-sm card-back" />
            <div className="card card-sm card-back" />
          </div>
          <span className="deck-count">牌堆 {deckSize(state)}</span>
        </div>
        <div className="log-panel">
          {state.log.slice(-6).map((line) => (
            <div key={line.id} className="log-line">
              {line.text}
            </div>
          ))}
        </div>
      </div>

      <div
        className={`human-area ${isMyTurn || iAmPicking ? 'area-turn' : ''}`}
        data-seat-id={myId}
      >
        <div className="human-info">
          <span className="seat-name">
            {me.name}（分数 {fmt(me.score)}）
          </span>
          <span className="hand-hint">
            当前牌型：{myEval.label} · {myEval.detail}
          </span>
        </div>
        <div className="human-cards">
          {me.hand.map((c) => (
            <CardView
              key={c.id}
              card={c}
              dataId={c.id}
              picked={isPicked(c.id)}
              selectable={mode === 'discard' && isMyTurn}
              onClick={() => {
                if (mode === 'discard' && isMyTurn) discardCard(c.id);
              }}
            />
          ))}
        </div>

        {iAmPicking && pickSourceId !== null && (
          <div className="action-bar">
            <span className="mode-hint">
              点击 {state.players[pickSourceId].name} 的一张暗牌，选走它
            </span>
          </div>
        )}

        {isMyTurn && (
          <div className="action-bar">
            {mode === 'idle' && (
              <>
                <button
                  className="btn"
                  disabled={!canDeckSwap(state, myId)}
                  onClick={() => setMode('discard')}
                >
                  与牌堆换一张
                </button>
                <button className="btn btn-primary" onClick={() => onAction({ k: 'pass' })}>
                  结束换牌
                </button>
                {canRequest(state, myId) && (
                  <span className="bar-hint">
                    点对手座位上的 🤝 可发起换牌（{me.requestsUsed}/2）
                  </span>
                )}
              </>
            )}
            {mode === 'discard' && (
              <>
                <span className="mode-hint">点击你要弃掉的牌 · 换后本局退出与对手的换牌</span>
                <button className="btn" onClick={() => setMode('idle')}>
                  取消
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {pendingToMe && (
        <div className="modal-overlay">
          <div className="modal">
            <p>
              {state.players[state.pending!.from].name} 想与你交换手牌
              <br />
              <small>（若接受，双方各从对方手牌中暗选一张互换）</small>
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-primary"
                onClick={() => onAction({ k: 'respond', accept: true })}
              >
                接受
              </button>
              <button className="btn" onClick={() => onAction({ k: 'respond', accept: false })}>
                拒绝
              </button>
            </div>
          </div>
        </div>
      )}

      {banner && state.phase === 'exchange' && <div className="turn-banner">{banner}</div>}

      {floats.map((f) => (
        <div key={f.key} className="float-text" style={{ left: f.x, top: f.y }}>
          {f.text}
        </div>
      ))}

      {flights.map((f) => (
        <div
          key={f.key}
          className="flight-card"
          style={
            {
              '--x0': `${f.x0}px`,
              '--y0': `${f.y0}px`,
              '--x1': `${f.x1}px`,
              '--y1': `${f.y1}px`,
            } as CSSProperties
          }
        />
      ))}

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

      {state.phase === 'showdown' && state.result && (
        <ShowdownPanel
          state={state}
          myId={myId}
          canNextRound={canNextRound}
          onNextRound={() => onAction({ k: 'nextRound' })}
          exitLabel={exitLabel}
          onExit={onExit}
        />
      )}
    </div>
  );
}
