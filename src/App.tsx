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
import { CardView } from './ui/CardView';
import { ShowdownPanel } from './ui/ShowdownPanel';

const AI_NAMES = ['阿牛', '二妞', '三顺', '四喜', '五魁', '六合', '七巧'];
const HUMAN_ID = 0;
const AI_DELAY = 900;
const FLIGHT_MS = 750;

type Mode = 'idle' | 'discard' | 'target';

interface Flight {
  key: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function cardRect(cardId: string): DOMRect | null {
  return document.querySelector(`[data-card-id="${cardId}"]`)?.getBoundingClientRect() ?? null;
}

export default function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [aiCount, setAiCount] = useState(3);
  const [mode, setMode] = useState<Mode>('idle');
  const [flights, setFlights] = useState<Flight[]>([]);

  const flying = flights.length > 0;

  const act = (fn: (g: GameState) => GameState) => {
    setGame((g) => (g ? fn(g) : g));
    setMode('idle');
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
        setFlights([
          { key: `${cardId}-go`, x0: a.left, y0: a.top, x1: b.left, y1: b.top },
          { key: `${otherPick}-go`, x0: b.left, y0: b.top, x1: a.left, y1: a.top },
        ]);
        setTimeout(() => {
          setFlights([]);
          act((g) => doPick(g, picker, cardId));
        }, FLIGHT_MS);
        return;
      }
    }
    act((g) => doPick(g, picker, cardId));
  };

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
      if (game.players[game.pending.to].isHuman) return;
      const t = setTimeout(() => {
        act((g) => (g.pending ? doRespond(g, aiRespond(g, g.pending.to)) : g));
      }, AI_DELAY);
      return () => clearTimeout(t);
    }

    if (game.players[game.turn].isHuman) return;
    const t = setTimeout(() => {
      act((g) => {
        if (g.phase !== 'exchange' || g.pending || g.picking || g.players[g.turn].isHuman) return g;
        const action = aiChooseAction(g, g.turn);
        if (action.type === 'deckSwap') return doDeckSwap(g, g.turn, action.cardId);
        if (action.type === 'request') return doRequest(g, g.turn, action.to);
        return doPass(g, g.turn);
      });
    }, AI_DELAY);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, flying]);

  if (!game) {
    return (
      <div className="setup-screen">
        <h1>德牛 3+2</h1>
        <p className="subtitle">PoCow · 底牌定倍数，踢脚定基数</p>
        <div className="setup-row">
          <span>AI 对手数量：</span>
          {[2, 3, 4, 5, 6, 7].map((n) => (
            <button
              key={n}
              className={`btn ${aiCount === n ? 'btn-primary' : ''}`}
              onClick={() => setAiCount(n)}
            >
              {n}
            </button>
          ))}
        </div>
        <button
          className="btn btn-primary btn-large"
          onClick={() => setGame(createGame(['你', ...AI_NAMES.slice(0, aiCount)], HUMAN_ID))}
        >
          开始游戏（{aiCount + 1} 人局）
        </button>
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
        <span className="round-tag">第 {game.round} 局</span>
        <span className="phase-tag">{phaseText()}</span>
      </header>

      <div className="opponents-row">
        {opponents.map((p) => {
          const targetClickable = mode === 'target' && targets.includes(p.id) && isHumanTurn;
          const pickHere = humanPicking && pickSourceId === p.id;
          const active =
            game.phase === 'exchange' &&
            !pk &&
            !game.pending &&
            game.turn === p.id;
          return (
            <div
              key={p.id}
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

      <div className="log-panel">
        {game.log.slice(-6).map((line, i) => (
          <div key={i} className="log-line">
            {line}
          </div>
        ))}
      </div>

      <div className="human-area">
        <div className="human-info">
          <span className="seat-name">{human.name}（分数 {fmt(human.score)}）</span>
          <span className="hand-hint">
            当前牌力：{humanEval.label} · 赔率 {humanEval.detail}
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
                if (mode === 'discard' && isHumanTurn) act((g) => doDeckSwap(g, HUMAN_ID, c.id));
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
                <button className="btn btn-primary" onClick={() => act((g) => doPass(g, HUMAN_ID))}>
                  结束换牌
                </button>
              </>
            )}
            {mode === 'discard' && (
              <>
                <span className="mode-hint">点击你要弃掉的牌（换后本局不能再与对手换牌）</span>
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
              <button className="btn btn-primary" onClick={() => act((g) => doRespond(g, true))}>
                接受
              </button>
              <button className="btn" onClick={() => act((g) => doRespond(g, false))}>
                拒绝
              </button>
            </div>
          </div>
        </div>
      )}

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
