import { CSSProperties, useEffect, useState } from 'react';
import {
  canDeckSwap,
  canRequest,
  createGame,
  currentPicker,
  doDeckSwap,
  doPass,
  doPick,
  doRequest,
  doRespond,
  eligibleTargets,
  GameState,
  startRound,
} from './engine/game';
import { aiChooseAction, aiPickFromOpponent, aiRespond } from './engine/ai';
import { evaluateHand } from './engine/scoring';
import { Card } from './engine/cards';
import { CardView } from './ui/CardView';
import { ShowdownPanel } from './ui/ShowdownPanel';
import { RulesModal } from './ui/RulesModal';

const AI_NAMES = ['阿牛', '二妞', '三顺', '四喜', '五魁', '六合', '七巧'];
const HUMAN_ID = 0;
const AI_DELAY = 900;
const FLIGHT_MS = 750;

/** 开屏装饰：一手 10-J-Q-K-Joker */
const TITLE_CARDS: Card[] = [
  { id: 'title-10', rank: 10, suit: 'H' },
  { id: 'title-j', rank: 11, suit: 'S' },
  { id: 'title-q', rank: 12, suit: 'D' },
  { id: 'title-k', rank: 13, suit: 'C' },
  { id: 'title-joker', rank: 14, suit: null },
];

type Mode = 'idle' | 'discard' | 'target';

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

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function cardRect(cardId: string): DOMRect | null {
  return document.querySelector(`[data-card-id="${cardId}"]`)?.getBoundingClientRect() ?? null;
}

function deckRect(): DOMRect | null {
  return document.querySelector('[data-deck]')?.getBoundingClientRect() ?? null;
}

export default function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [aiCount, setAiCount] = useState(3);
  const [mode, setMode] = useState<Mode>('idle');
  const [flights, setFlights] = useState<Flight[]>([]);
  const [floats, setFloats] = useState<FloatItem[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);

  const flying = flights.length > 0;

  const act = (fn: (g: GameState) => GameState) => {
    setGame((g) => (g ? fn(g) : g));
    setMode('idle');
  };

  /** 座位上方的飘字反馈 */
  const addFloat = (seatId: number, text: string) => {
    const el = document.querySelector(`[data-seat-id="${seatId}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const key = `float-${Date.now()}-${Math.random()}`;
    setFloats((f) => [...f, { key, x: r.left + r.width / 2, y: r.top + 6, text }]);
    setTimeout(() => setFloats((f) => f.filter((i) => i.key !== key)), 1200);
  };

  /** 两张牌背互飞，动画结束后提交状态变更 */
  const flyBetween = (a: DOMRect, b: DOMRect, commit: () => void) => {
    const key = `fly-${Date.now()}`;
    setFlights([
      { key: `${key}-a`, x0: a.left, y0: a.top, x1: b.left, y1: b.top },
      { key: `${key}-b`, x0: b.left, y0: b.top, x1: a.left, y1: a.top },
    ]);
    setTimeout(() => {
      setFlights([]);
      commit();
    }, FLIGHT_MS);
  };

  /** 与牌堆换牌：手牌与牌堆互飞后提交 */
  const deckSwapAnimated = (pid: number, cardId: string) => {
    if (flying) return;
    setMode('idle');
    addFloat(pid, '🃏 换牌堆');
    const a = cardRect(cardId);
    const b = deckRect();
    if (a && b) flyBetween(a, b, () => act((g) => doDeckSwap(g, pid, cardId)));
    else act((g) => doDeckSwap(g, pid, cardId));
  };

  /** 提交一次选牌；若这是第二张（双方都已选定），先播放两张牌互飞的动画再提交 */
  const applyPick = (picker: number, cardId: string) => {
    if (!game?.picking || flying) return;
    const pk = game.picking;
    const otherPick = picker === pk.from ? pk.toPick : pk.fromPick;
    if (otherPick) {
      const a = cardRect(cardId);
      const b = cardRect(otherPick);
      if (a && b) {
        flyBetween(a, b, () => act((g) => doPick(g, picker, cardId)));
        return;
      }
    }
    act((g) => doPick(g, picker, cardId));
  };

  // 回合开始横幅
  useEffect(() => {
    if (!game || game.phase !== 'exchange') return;
    const p = game.players[game.turn];
    setBanner(p.isHuman ? '轮到你了！' : `轮到 ${p.name}`);
    const t = setTimeout(() => setBanner(null), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.turn, game?.round, game?.phase]);

  // AI 自动行动（响应请求 / 选牌 / 出招）
  useEffect(() => {
    if (!game || game.phase !== 'exchange' || flying) return;

    if (game.picking) {
      const picker = currentPicker(game);
      if (picker === null || game.players[picker].isHuman) return;
      const t = setTimeout(() => applyPick(picker, aiPickFromOpponent(game, picker)), AI_DELAY);
      return () => clearTimeout(t);
    }

    if (game.pending) {
      const responder = game.pending.to;
      if (game.players[responder].isHuman) return;
      const t = setTimeout(() => {
        const accepted = aiRespond(game, responder);
        addFloat(responder, accepted ? '🤝 接受' : '❌ 拒绝');
        act((g) => (g.pending ? doRespond(g, accepted) : g));
      }, AI_DELAY);
      return () => clearTimeout(t);
    }

    if (game.players[game.turn].isHuman) return;
    const t = setTimeout(() => {
      const pid = game.turn;
      const action = aiChooseAction(game, pid);
      if (action.type === 'deckSwap') {
        deckSwapAnimated(pid, action.cardId);
        return;
      }
      if (action.type === 'request') {
        addFloat(pid, '🤝 求交换');
        act((g) => doRequest(g, pid, action.to));
        return;
      }
      addFloat(pid, '✋ 结束换牌');
      act((g) => doPass(g, pid));
    }, AI_DELAY);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, flying]);

  if (!game) {
    return (
      <div className="setup-screen">
        <div className="title-cards">
          {TITLE_CARDS.map((c, i) => (
            <div key={c.id} className="title-card" style={{ '--i': i } as CSSProperties}>
              <CardView card={c} />
            </div>
          ))}
        </div>
        <h1 className="game-title">PoCow</h1>
        <div className="game-subtitle">德 牛</div>
        <div className="setup-panel">
          <div className="setup-row">
            <span className="setup-label">AI 对手</span>
            <div className="count-chips">
              {[2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  className={`chip-btn ${aiCount === n ? 'chip-on' : ''}`}
                  onClick={() => setAiCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <button
            className="btn btn-play"
            onClick={() => setGame(createGame(['你', ...AI_NAMES.slice(0, aiCount)], HUMAN_ID))}
          >
            开 局
          </button>
          <button className="btn" onClick={() => setShowRules(true)}>
            查看规则
          </button>
        </div>
        {showRules && <RulesModal onClose={() => setShowRules(false)} />}
      </div>
    );
  }

  const human = game.players[HUMAN_ID];
  const opponents = game.players.filter((p) => !p.isHuman);
  const pk = game.picking;
  const pickerNow = currentPicker(game);
  const pickSourceId = pk && pickerNow !== null ? (pickerNow === pk.from ? pk.to : pk.from) : null;
  const humanPicking = pickerNow === HUMAN_ID && !flying;
  const isHumanTurn =
    game.phase === 'exchange' && game.turn === HUMAN_ID && !game.pending && !pk && !flying;
  const pendingToHuman = game.pending && game.pending.to === HUMAN_ID;
  const humanEval = evaluateHand(human.hand);
  const targets = eligibleTargets(game, HUMAN_ID);

  const phaseText = () => {
    if (game.phase !== 'exchange') return '摊牌';
    if (flying) return '交换中…';
    if (pk && pickerNow !== null) {
      return `${game.players[pickerNow].name} 正在暗选 ${game.players[pickSourceId!].name} 的一张牌…`;
    }
    if (game.pending) return `等待 ${game.players[game.pending.to].name} 响应交换…`;
    return `轮到 ${game.players[game.turn].name} 行动`;
  };

  const isPicked = (cardId: string) => !!pk && (cardId === pk.fromPick || cardId === pk.toPick);

  return (
    <div className="table-screen">
      <header className="table-header">
        <span className="brand">
          PoCow <em>德牛</em>
        </span>
        <span className="round-tag">第 {game.round} 局</span>
        <span className="phase-tag">{phaseText()}</span>
        <button className="btn header-rules" onClick={() => setShowRules(true)}>
          规则
        </button>
      </header>

      <div className="opponents-row">
        {opponents.map((p) => {
          const targetClickable = mode === 'target' && targets.includes(p.id) && isHumanTurn;
          const pickHere = humanPicking && pickSourceId === p.id;
          const active =
            game.phase === 'exchange' && !pk && !game.pending && game.turn === p.id;
          return (
            <div
              key={p.id}
              data-seat-id={p.id}
              className={`seat ${active ? 'seat-active' : ''} ${targetClickable ? 'seat-clickable' : ''} ${pickHere ? 'seat-picking' : ''}`}
              onClick={() => {
                if (targetClickable) act((g) => doRequest(g, HUMAN_ID, p.id));
              }}
            >
              <div className="seat-name">{p.name}</div>
              <div className="seat-score">分数 {fmt(p.score)}</div>
              <div className="seat-cards">
                {p.hand.map((c) => (
                  <CardView
                    key={c.id}
                    card={c}
                    hidden
                    small
                    dataId={c.id}
                    picked={isPicked(c.id)}
                    selectable={pickHere}
                    onClick={() => {
                      if (pickHere) applyPick(HUMAN_ID, c.id);
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
        <div className="deck-pile" data-deck="true">
          <div className="deck-stack">
            <div className="card card-sm card-back" />
            <div className="card card-sm card-back" />
            <div className="card card-sm card-back" />
          </div>
          <span className="deck-count">牌堆 {game.deck.length}</span>
        </div>
        <div className="log-panel">
          {game.log.slice(-6).map((line, i) => (
            <div key={i} className="log-line">
              {line}
            </div>
          ))}
        </div>
      </div>

      <div
        className={`human-area ${isHumanTurn || humanPicking ? 'area-turn' : ''}`}
        data-seat-id={HUMAN_ID}
      >
        <div className="human-info">
          <span className="seat-name">{human.name}（分数 {fmt(human.score)}）</span>
          <span className="hand-hint">
            当前牌型：{humanEval.label} · {humanEval.detail}
          </span>
        </div>
        <div className="human-cards">
          {human.hand.map((c) => (
            <CardView
              key={c.id}
              card={c}
              dataId={c.id}
              picked={isPicked(c.id)}
              selectable={mode === 'discard' && isHumanTurn}
              onClick={() => {
                if (mode === 'discard' && isHumanTurn) deckSwapAnimated(HUMAN_ID, c.id);
              }}
            />
          ))}
        </div>

        {humanPicking && (
          <div className="action-bar">
            <span className="mode-hint">
              点击 {game.players[pickSourceId!].name} 的一张暗牌，选走它
            </span>
          </div>
        )}

        {isHumanTurn && (
          <div className="action-bar">
            {mode === 'idle' && (
              <>
                <button
                  className="btn"
                  disabled={!canDeckSwap(game, HUMAN_ID)}
                  onClick={() => setMode('discard')}
                >
                  与牌堆换一张
                </button>
                <button
                  className="btn"
                  disabled={!canRequest(game, HUMAN_ID)}
                  onClick={() => setMode('target')}
                >
                  找对手换牌（{human.requestsUsed}/2）
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    addFloat(HUMAN_ID, '✋ 结束换牌');
                    act((g) => doPass(g, HUMAN_ID));
                  }}
                >
                  结束换牌
                </button>
              </>
            )}
            {mode === 'discard' && (
              <>
                <span className="mode-hint">点击你要弃掉的牌（换后本局退出与对手的换牌，别人也不能再找你换）</span>
                <button className="btn" onClick={() => setMode('idle')}>
                  取消
                </button>
              </>
            )}
            {mode === 'target' && (
              <>
                <span className="mode-hint">点击一名对手发起交换（对方可拒绝）</span>
                <button className="btn" onClick={() => setMode('idle')}>
                  取消
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {pendingToHuman && (
        <div className="modal-overlay">
          <div className="modal">
            <p>
              {game.players[game.pending!.from].name} 想与你交换手牌
              <br />
              <small>（若接受，双方各从对方手牌中暗选一张互换）</small>
            </p>
            <div className="modal-actions">
              <button
                className="btn btn-primary"
                onClick={() => {
                  addFloat(HUMAN_ID, '🤝 接受');
                  act((g) => doRespond(g, true));
                }}
              >
                接受
              </button>
              <button
                className="btn"
                onClick={() => {
                  addFloat(HUMAN_ID, '❌ 拒绝');
                  act((g) => doRespond(g, false));
                }}
              >
                拒绝
              </button>
            </div>
          </div>
        </div>
      )}

      {banner && game.phase === 'exchange' && <div className="turn-banner">{banner}</div>}

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

      {game.phase === 'showdown' && game.result && (
        <ShowdownPanel
          game={game}
          onNextRound={() => act(startRound)}
          onRestart={() => {
            setGame(null);
            setMode('idle');
          }}
        />
      )}
    </div>
  );
}
