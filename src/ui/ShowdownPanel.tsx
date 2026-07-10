import { CSSProperties, useEffect } from 'react';
import { Card } from '../engine/cards';
import { GameStateLike } from '../engine/game';
import { CardView } from './CardView';
import { burst, burstGold, shake } from './effects';

interface Props {
  state: GameStateLike;
  myId: number;
  canNextRound: boolean;
  onNextRound: () => void;
  exitLabel: string;
  onExit: () => void;
}

/** 摊牌节奏：逐家亮牌，每家内部逐张翻牌，最后揭晓赢家 */
const BASE = 0.35;
const ROW_STEP = 0.55;
const CARD_STEP = 0.09;

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function FlipCard({ card, delay }: { card: Card; delay: number }) {
  return (
    <div className="flip">
      <div className="flip-inner" style={{ animationDelay: `${delay}s` } as CSSProperties}>
        <div className="flip-face flip-back">
          <div className="card card-sm card-back" />
        </div>
        <div className="flip-face flip-front">
          <CardView card={card} small />
        </div>
      </div>
    </div>
  );
}

export function ShowdownPanel({ state, myId, canNextRound, onNextRound, exitLabel, onExit }: Props) {
  const result = state.result!;
  const winDelay = BASE + state.players.length * ROW_STEP + 0.25;
  const winnerEval = result.evals[result.winners[0]];
  const isSpecialWin = winnerEval.kind === 'special';

  // 赢家揭晓时刻：震屏 + 皇冠行礼花；特殊胜利额外全屏光辉
  useEffect(() => {
    const t = setTimeout(() => {
      shake('.showdown-panel');
      document.querySelectorAll('.showdown-row.winner').forEach((el) => {
        const r = el.getBoundingClientRect();
        burstGold(r.left + r.width / 2, r.top + r.height / 2, 24);
        burst(r.left + r.width * 0.2, r.top, { count: 12, spread: 110 });
        burst(r.left + r.width * 0.8, r.top, { count: 12, spread: 110 });
      });
      if (isSpecialWin) {
        setTimeout(() => {
          burstGold(window.innerWidth / 2, window.innerHeight / 2, 30);
        }, 250);
      }
    }, winDelay * 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="showdown-overlay">
      <div className="showdown-panel">
        <h2>第 {state.round} 局 · 摊牌</h2>
        <div className="showdown-rows">
          {state.players.map((p, idx) => {
            const ev = result.evals[p.id];
            const isWinner = result.winners.includes(p.id);
            const delta = result.deltas[p.id];
            const rowDelay = BASE + idx * ROW_STEP;
            let cardIdx = 0;
            const nextCardDelay = () => rowDelay + 0.12 + cardIdx++ * CARD_STEP;
            return (
              <div
                key={p.id}
                className={`showdown-row ${isWinner ? 'winner' : ''}`}
                style={{
                  animation: `row-in 0.4s ease both ${rowDelay}s${
                    isWinner ? `, winner-glow 0.9s ease both ${winDelay}s` : ''
                  }`,
                }}
              >
                <div className="showdown-name">
                  {isWinner && (
                    <span className="crown" style={{ animationDelay: `${winDelay}s` }}>
                      👑
                    </span>
                  )}
                  {p.name}
                  {p.id === myId ? '（你）' : ''}
                </div>
                <div className="showdown-cards">
                  {ev.split ? (
                    <>
                      <div className="card-group">
                        {ev.split.bottom.map((c) => (
                          <FlipCard key={c.id} card={c} delay={nextCardDelay()} />
                        ))}
                      </div>
                      <div className="card-group kicker-group">
                        {ev.split.kicker.map((c) => (
                          <FlipCard key={c.id} card={c} delay={nextCardDelay()} />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="card-group">
                      {p.hand.map((c) => (
                        <FlipCard key={c.id} card={c} delay={nextCardDelay()} />
                      ))}
                    </div>
                  )}
                </div>
                <div
                  className="showdown-eval pop-in"
                  style={{ animationDelay: `${rowDelay + 0.55}s` }}
                >
                  <div className="eval-label">{ev.label}</div>
                  <div className="eval-detail">{ev.detail}</div>
                </div>
                <div
                  className={`showdown-delta ${delta >= 0 ? 'plus' : 'minus'} pop-in`}
                  style={{ animationDelay: `${winDelay + 0.15}s` }}
                >
                  {delta >= 0 ? `+${fmt(delta)}` : fmt(delta)}
                </div>
                <div
                  className="showdown-score pop-in"
                  style={{ animationDelay: `${winDelay + 0.15}s` }}
                >
                  总分 {fmt(p.score)}
                </div>
              </div>
            );
          })}
        </div>
        {isSpecialWin && (
          <div className="slam" style={{ animationDelay: `${winDelay + 0.1}s` }}>
            <div className="slam-rays" />
            <span className="slam-text">{winnerEval.label}</span>
            <span className="slam-payout">{result.payout} 分</span>
          </div>
        )}

        <div className="showdown-actions pop-in" style={{ animationDelay: `${winDelay + 0.4}s` }}>
          {canNextRound ? (
            <button className="btn btn-primary" onClick={onNextRound}>
              下一局
            </button>
          ) : (
            <span className="waiting-host">等待房主开始下一局…</span>
          )}
          <button className="btn" onClick={onExit}>
            {exitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
