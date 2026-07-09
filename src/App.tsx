import { useEffect, useState } from 'react';
import {
  canDeckSwap,
  canRequest,
  createGame,
  doDeckSwap,
  doPass,
  doRequest,
  doRespond,
  eligibleTargets,
  GameState,
  startRound,
} from './engine/game';
import { aiChooseAction, aiRespond } from './engine/ai';
import { evaluateHand } from './engine/scoring';
import { CardView } from './ui/CardView';
import { ShowdownPanel } from './ui/ShowdownPanel';

const AI_NAMES = ['阿牛', '二妞', '三顺', '四喜', '五魁', '六合', '七巧'];
const HUMAN_ID = 0;
const AI_DELAY = 900;

type Mode = 'idle' | 'discard' | 'target';

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function App() {
  const [game, setGame] = useState<GameState | null>(null);
  const [aiCount, setAiCount] = useState(3);
  const [mode, setMode] = useState<Mode>('idle');

  const act = (fn: (g: GameState) => GameState) => {
    setGame((g) => (g ? fn(g) : g));
    setMode('idle');
  };

  // AI 自动行动
  useEffect(() => {
    if (!game || game.phase !== 'exchange') return;
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
        if (g.phase !== 'exchange' || g.pending || g.players[g.turn].isHuman) return g;
        const action = aiChooseAction(g, g.turn);
        if (action.type === 'deckSwap') return doDeckSwap(g, g.turn, action.cardId);
        if (action.type === 'request') return doRequest(g, g.turn, action.to);
        return doPass(g, g.turn);
      });
    }, AI_DELAY);
    return () => clearTimeout(t);
  }, [game]);

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
  const isHumanTurn = game.phase === 'exchange' && game.turn === HUMAN_ID && !game.pending;
  const pendingToHuman = game.pending && game.pending.to === HUMAN_ID;
  const humanEval = evaluateHand(human.hand);
  const targets = eligibleTargets(game, HUMAN_ID);

  return (
    <div className="table-screen">
      <header className="table-header">
        <span className="round-tag">第 {game.round} 局</span>
        <span className="phase-tag">
          {game.phase === 'exchange'
            ? game.pending
              ? `等待 ${game.players[game.pending.to].name} 响应交换…`
              : `轮到 ${game.players[game.turn].name} 行动`
            : '摊牌'}
        </span>
      </header>

      <div className="opponents-row">
        {opponents.map((p) => {
          const clickable = mode === 'target' && targets.includes(p.id);
          return (
            <div
              key={p.id}
              className={`seat ${game.phase === 'exchange' && game.turn === p.id ? 'seat-active' : ''} ${clickable ? 'seat-clickable' : ''}`}
              onClick={() => {
                if (clickable) act((g) => doRequest(g, HUMAN_ID, p.id));
              }}
            >
              <div className="seat-name">{p.name}</div>
              <div className="seat-score">分数 {fmt(p.score)}</div>
              <div className="seat-cards">
                {p.hand.map((c) => (
                  <CardView key={c.id} card={c} hidden small />
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
              selectable={mode === 'discard'}
              onClick={() => {
                if (mode === 'discard') act((g) => doDeckSwap(g, HUMAN_ID, c.id));
              }}
            />
          ))}
        </div>

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
              <small>（若接受，双方各随机抽走对方一张牌）</small>
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
