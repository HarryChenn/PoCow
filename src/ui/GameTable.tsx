import { CSSProperties, useEffect, useRef, useState } from 'react';
import {
  availableTargets,
  canDeckSwap,
  deckSize,
  GameStateLike,
  isBusy,
  sessionOf,
} from '../engine/game';
import { Card, rankLabel, SUIT_SYMBOL, totalPoints } from '../engine/cards';
import { evaluateChosen, evaluateHand } from '../engine/scoring';
import { PlayerAction } from '../net/protocol';
import { CardView } from './CardView';
import { ShowdownPanel } from './ShowdownPanel';
import { RulesModal } from './RulesModal';
import { burst, burstGold, burstGreen, shake } from './effects';

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
  stamp?: boolean;
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
  /** 拆分阶段：当前点选为底牌的 3 张 */
  const [bottomSel, setBottomSel] = useState<string[]>([]);

  const me = state.players[myId];
  const opponents = [...state.players.slice(myId + 1), ...state.players.slice(0, myId)];
  const mySession = sessionOf(state, myId);
  const myPickDone = mySession
    ? (myId === mySession.from ? mySession.fromPick : mySession.toPick) !== null
    : false;
  const myPartnerId = mySession ? (myId === mySession.from ? mySession.to : mySession.from) : null;
  const iAmPicking = !!mySession && mySession.stage === 'picking' && !myPickDone && !busy;
  const pendingToMe = !!mySession && mySession.stage === 'pending' && mySession.to === myId;
  const iRequested = !!mySession && mySession.stage === 'pending' && mySession.from === myId;
  /** 空闲：可自由行动（发起交换 / 换牌堆 / 结束） */
  const iAmFree =
    state.phase === 'exchange' && !me.passed && !mySession && !busy;
  const myEval = evaluateHand(me.hand);
  const targets = availableTargets(state, myId);
  const arranging = state.phase === 'arrange' && !me.arrangedDone;

  const addFloat = (seatId: number, text: string, stamp = false) => {
    const el = document.querySelector(`[data-seat-id="${seatId}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const key = `float-${Date.now()}-${Math.random()}`;
    setFloats((f) => [...f, { key, x: r.left + r.width / 2, y: r.top + 6, text, stamp }]);
    setTimeout(() => setFloats((f) => f.filter((i) => i.key !== key)), 1200);
  };

  const seatCenter = (seat: number): Point | null => {
    const r = document.querySelector(`[data-seat-id="${seat}"]`)?.getBoundingClientRect();
    return r ? { left: r.left + r.width / 2, top: r.top + r.height / 2 } : null;
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

  // 阶段横幅
  useEffect(() => {
    if (state.phase === 'showdown') return;
    setBanner(state.phase === 'arrange' ? '拆分 3 + 2 ！' : '自由换牌，开始！');
    const t = setTimeout(() => setBanner(null), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.round, state.phase]);

  // 换局/换阶段时清空拆分选择
  useEffect(() => {
    setBottomSel([]);
  }, [state.round, state.phase]);

  const toggleBottom = (cardId: string) => {
    setBottomSel((sel) =>
      sel.includes(cardId) ? sel.filter((id) => id !== cardId) : sel.length < 3 ? [...sel, cardId] : sel,
    );
  };

  /** 拆分预览用的迷你牌面标签 */
  const miniCard = (c: Card) => (
    <span
      key={c.id}
      className={`mini-card ${c.suit === 'H' || c.suit === 'D' ? 'mini-red' : c.suit === null ? 'mini-joker' : ''}`}
    >
      {c.suit === null ? '🃏' : `${rankLabel(c.rank)}${SUIT_SYMBOL[c.suit]}`}
    </span>
  );

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
          setTimeout(() => {
            const d = deckPoint();
            if (d) burst(d.left + CARD_W / 2, d.top + CARD_H / 2, { count: 10, spread: 60 });
          }, FLIGHT_MS - 100);
          break;
        }
        case 'request':
          addFloat(e.seat, '🤝 求交换');
          break;
        case 'accept': {
          addFloat(e.seat, '🤝 接受');
          const p = seatCenter(e.seat);
          if (p) burstGreen(p.left, p.top);
          break;
        }
        case 'refuse': {
          addFloat(e.seat, '拒 绝', true);
          shake();
          break;
        }
        case 'swap': {
          const a = seatCenter(e.seat);
          const b = e.seat2 !== undefined ? seatCenter(e.seat2) : null;
          if (a) burstGold(a.left, a.top, 12);
          if (b) burstGold(b.left, b.top, 12);
          break;
        }
        case 'pass':
          addFloat(e.seat, '✋ 结束换牌');
          break;
        case 'arranged':
          addFloat(e.seat, '✅ 已拆分');
          break;
        case 'takeover': {
          addFloat(e.seat, '🔌 AI 接管');
          const p = seatCenter(e.seat);
          if (p) burst(p.left, p.top, { symbols: ['⚡', '✦'], colors: ['#9aa7b3', '#d5dde3'], count: 10 });
          break;
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.log]);

  // 会话双方都选定 → 亮牌窗口：两张被选中的牌互飞（实际互换由驱动方计时提交）
  const animatedReveals = useRef(new Set<string>());
  useEffect(() => {
    for (const ses of state.sessions) {
      if (ses.fromPick === null || ses.toPick === null) continue;
      const key = `${state.round}-${ses.from}-${ses.to}-${ses.fromPick}-${ses.toPick}`;
      if (animatedReveals.current.has(key)) continue;
      animatedReveals.current.add(key);
      setTimeout(() => {
        const a = cardRect(ses.fromPick!);
        const b = cardRect(ses.toPick!);
        if (a && b) flyCards(a, b);
      }, 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.sessions]);

  // 手牌变化后的强弱反馈：变强撒金星，变弱掉滴汗
  const prevHand = useRef<{ round: number; ids: string; power: number } | null>(null);
  useEffect(() => {
    const ids = me.hand
      .map((c) => c.id)
      .sort()
      .join(',');
    const prev = prevHand.current;
    prevHand.current = { round: state.round, ids, power: myEval.power };
    if (!prev || prev.round !== state.round || prev.ids === ids) return;
    if (state.phase !== 'exchange') return;
    if (myEval.power > prev.power) {
      addFloat(myId, '✨ 变强了！');
      const p = seatCenter(myId);
      if (p) burstGold(p.left, p.top, 20);
    } else if (myEval.power < prev.power) {
      addFloat(myId, '💧 变弱了…');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.hand.map((c) => c.id).join(',')]);

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

  const pickCard = (index: number) => {
    if (busy || !iAmPicking) return;
    onAction({ k: 'pick', index });
  };

  const isPicked = (cardId: string) =>
    state.sessions.some((x) => x.fromPick === cardId || x.toPick === cardId);

  /** 座位是否在等待其决定（跳动省略号） */
  const isDeciding = (pid: number): boolean => {
    if (state.phase === 'arrange') return !state.players[pid].arrangedDone;
    if (state.phase !== 'exchange') return false;
    const ses = sessionOf(state, pid);
    if (!ses) return false;
    if (ses.stage === 'pending') return ses.to === pid;
    return (pid === ses.from ? ses.fromPick : ses.toPick) === null;
  };

  const partnerName = (pid: number): string | null => {
    const ses = sessionOf(state, pid);
    if (!ses) return null;
    const partner = pid === ses.from ? ses.to : ses.from;
    return partner === myId ? '你' : state.players[partner].name;
  };

  const phaseText = () => {
    if (state.phase === 'showdown') return '摊牌';
    if (state.phase === 'arrange') {
      const done = state.players.filter((p) => p.arrangedDone).length;
      return `拆分阶段（${done}/${state.players.length} 已提交）`;
    }
    const passed = state.players.filter((p) => p.passed).length;
    return `自由换牌（${passed}/${state.players.length} 已结束）`;
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
          const swappable = iAmFree && mode === 'idle' && targets.includes(p.id);
          const pickHere = iAmPicking && myPartnerId === p.id;
          const busySeat = state.phase === 'exchange' && isBusy(state, p.id);
          const rippling = state.sessions.some((x) => x.stage === 'pending' && x.to === p.id);
          return (
            <div
              key={p.id}
              data-seat-id={p.id}
              className={`seat ${busySeat ? 'seat-busy' : ''} ${pickHere ? 'seat-picking' : ''} ${rippling ? 'seat-ripple' : ''}`}
            >
              {swappable && (
                <button
                  className="seat-swap-btn"
                  onClick={() => onAction({ k: 'request', to: p.id })}
                >
                  🤝 换牌{(me.swapsWith[p.id] ?? 0) > 0 ? '（剩1次）' : ''}
                </button>
              )}
              <div className="seat-name">
                {!p.isHuman && <span className="ai-tag">AI</span>}
                {p.name}
                {isDeciding(p.id) && (
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
                      if (pickHere) pickCard(i);
                    }}
                  />
                ))}
              </div>
              <div className="seat-status">
                {busySeat && (
                  <span className="chip chip-busy">🔄 与 {partnerName(p.id)} 交换中</span>
                )}
                {p.usedDeckSwap && <span className="chip">已换牌堆</span>}
                {(p.swapsWith[myId] ?? 0) > 0 && (
                  <span className="chip">与你已换 {p.swapsWith[myId]}/2</span>
                )}
                {state.phase === 'arrange' ? (
                  p.arrangedDone && <span className="chip chip-done">已拆分</span>
                ) : (
                  p.passed && <span className="chip chip-done">已结束</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mid-row">
        <div
          className={`deck-pile ${mode === 'discard' ? 'deck-active' : ''} ${
            iAmFree && canDeckSwap(state, myId) ? 'deck-clickable' : ''
          }`}
          data-deck="true"
          onClick={() => {
            if (iAmFree && canDeckSwap(state, myId)) {
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
        className={`human-area ${iAmFree || iAmPicking || arranging ? 'area-turn' : ''}`}
        data-seat-id={myId}
      >
        <div className="human-info">
          <span className="seat-name">
            {me.name}（分数 {fmt(me.score)}）
          </span>
          {state.phase === 'exchange' && (
            <span className="hand-hint">
              最佳可拆：{myEval.label} · {myEval.detail}
            </span>
          )}
        </div>
        <div className="human-cards">
          {me.hand.map((c) => (
            <div
              key={c.id}
              className="tilt-wrap"
              onMouseMove={(e) => {
                const el = e.currentTarget;
                const r = el.getBoundingClientRect();
                const px = (e.clientX - r.left) / r.width - 0.5;
                const py = (e.clientY - r.top) / r.height - 0.5;
                el.style.transform = `perspective(600px) rotateY(${px * 18}deg) rotateX(${-py * 18}deg) translateY(-4px)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = '';
              }}
            >
              <CardView
                card={c}
                dataId={c.id}
                picked={
                  isPicked(c.id) ||
                  (arranging && bottomSel.includes(c.id)) ||
                  (state.phase === 'arrange' && !!me.chosenBottom?.includes(c.id))
                }
                selectable={(mode === 'discard' && iAmFree) || arranging}
                onClick={() => {
                  if (arranging) toggleBottom(c.id);
                  else if (mode === 'discard' && iAmFree) discardCard(c.id);
                }}
              />
            </div>
          ))}
        </div>

        {state.phase === 'arrange' &&
          (me.arrangedDone ? (
            <div className="action-bar">
              <span className="bar-hint">已提交拆分，等待其他玩家…</span>
            </div>
          ) : (
            <>
              <div className="arrange-preview">
                <span className="arrange-group">
                  <b>底牌</b>
                  {me.hand.filter((c) => bottomSel.includes(c.id)).map(miniCard)}
                  {Array.from({ length: 3 - bottomSel.length }).map((_, i) => (
                    <span key={`slot-${i}`} className="mini-card mini-empty">
                      ？
                    </span>
                  ))}
                  {bottomSel.length > 0 &&
                    (() => {
                      const bottom = me.hand.filter((c) => bottomSel.includes(c.id));
                      const sum = totalPoints(bottom);
                      const niu = bottomSel.length === 3 && sum % 10 === 0;
                      return (
                        <span className={`arrange-sum ${niu ? 'sum-niu' : ''}`}>
                          和 {sum}
                          {bottomSel.length === 3 && (niu ? ' ✓ 成牛' : ' ✗ 无牛')}
                        </span>
                      );
                    })()}
                </span>
                <span className="arrange-group">
                  <b>踢脚</b>
                  {bottomSel.length === 3 ? (
                    me.hand.filter((c) => !bottomSel.includes(c.id)).map(miniCard)
                  ) : (
                    <span className="mini-card mini-empty">…</span>
                  )}
                </span>
                {bottomSel.length === 3 &&
                  (() => {
                    const ev = evaluateChosen(me.hand, bottomSel);
                    return (
                      <span className="arrange-eval">
                        {ev.label} · {ev.detail}
                      </span>
                    );
                  })()}
              </div>
              <div className="action-bar">
                <span className="mode-hint">
                  点选 3 张作为底牌（{bottomSel.length}/3），其余 2 张为踢脚
                </span>
                <button
                  className="btn btn-primary"
                  disabled={bottomSel.length !== 3}
                  onClick={() => onAction({ k: 'arrange', bottomIds: bottomSel })}
                >
                  确认拆分
                </button>
              </div>
            </>
          ))}

        {iAmPicking && myPartnerId !== null && (
          <div className="action-bar">
            <span className="mode-hint">
              点击 {state.players[myPartnerId].name} 的一张暗牌，选走它
            </span>
          </div>
        )}

        {mySession && mySession.stage === 'picking' && myPickDone && (
          <div className="action-bar">
            <span className="bar-hint">已选定，等待对方选牌…</span>
          </div>
        )}

        {iRequested && myPartnerId !== null && (
          <div className="action-bar">
            <span className="bar-hint">等待 {state.players[myPartnerId].name} 响应交换…</span>
          </div>
        )}

        {state.phase === 'exchange' && me.passed && (
          <div className="action-bar">
            <span className="bar-hint">已结束换牌，等待其他玩家…</span>
          </div>
        )}

        {iAmFree && (
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
                {targets.length > 0 && (
                  <span className="bar-hint">
                    点对手座位上的 🤝 可发起换牌（同一对玩家最多互换 2 次）
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

      {pendingToMe && mySession && (
        <div className="modal-overlay">
          <div className="modal">
            <p>
              {state.players[mySession.from].name} 想与你交换手牌
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

      {banner && state.phase !== 'showdown' && (
        <>
          <div className="turn-banner">{banner}</div>
          <div className="turn-flash" />
        </>
      )}

      {floats.map((f) => (
        <div
          key={f.key}
          className={f.stamp ? 'float-stamp' : 'float-text'}
          style={{ left: f.x, top: f.y }}
        >
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
