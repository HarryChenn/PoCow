import { GameState } from '../engine/game';
import { CardView } from './CardView';

interface Props {
  game: GameState;
  onNextRound: () => void;
  onRestart: () => void;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function ShowdownPanel({ game, onNextRound, onRestart }: Props) {
  const result = game.result!;
  return (
    <div className="showdown-overlay">
      <div className="showdown-panel">
        <h2>第 {game.round} 局 · 摊牌</h2>
        <div className="showdown-rows">
          {game.players.map((p) => {
            const ev = result.evals[p.id];
            const isWinner = result.winners.includes(p.id);
            const delta = result.deltas[p.id];
            return (
              <div key={p.id} className={`showdown-row ${isWinner ? 'winner' : ''}`}>
                <div className="showdown-name">
                  {isWinner && <span className="crown">👑</span>}
                  {p.name}
                </div>
                <div className="showdown-cards">
                  {ev.split ? (
                    <>
                      <div className="card-group">
                        {ev.split.bottom.map((c) => (
                          <CardView key={c.id} card={c} small />
                        ))}
                      </div>
                      <div className="card-group kicker-group">
                        {ev.split.kicker.map((c) => (
                          <CardView key={c.id} card={c} small />
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="card-group">
                      {p.hand.map((c) => (
                        <CardView key={c.id} card={c} small />
                      ))}
                    </div>
                  )}
                </div>
                <div className="showdown-eval">
                  <div className="eval-label">{ev.label}</div>
                  <div className="eval-detail">{ev.detail}</div>
                </div>
                <div className={`showdown-delta ${delta >= 0 ? 'plus' : 'minus'}`}>
                  {delta >= 0 ? `+${fmt(delta)}` : fmt(delta)}
                </div>
                <div className="showdown-score">总分 {fmt(p.score)}</div>
              </div>
            );
          })}
        </div>
        <div className="showdown-actions">
          <button className="btn btn-primary" onClick={onNextRound}>
            下一局
          </button>
          <button className="btn" onClick={onRestart}>
            重新开始
          </button>
        </div>
      </div>
    </div>
  );
}
