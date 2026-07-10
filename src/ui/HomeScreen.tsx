import { CSSProperties, useState } from 'react';
import { Card } from '../engine/cards';
import { normalizeCode } from '../net/code';
import { CardView } from './CardView';
import { RulesModal } from './RulesModal';

/** 开屏装饰：一手 10-J-Q-K-Joker */
const TITLE_CARDS: Card[] = [
  { id: 'title-10', rank: 10, suit: 'H' },
  { id: 'title-j', rank: 11, suit: 'S' },
  { id: 'title-q', rank: 12, suit: 'D' },
  { id: 'title-k', rank: 13, suit: 'C' },
  { id: 'title-joker', rank: 14, suit: null },
];

interface Props {
  onSolo: (name: string, aiCount: number) => void;
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
  busy: string | null;
  error: string | null;
}

export function HomeScreen({ onSolo, onCreate, onJoin, busy, error }: Props) {
  const [name, setName] = useState(() => localStorage.getItem('pocow-name') ?? '');
  const [aiCount, setAiCount] = useState(3);
  const [code, setCode] = useState('');
  const [showRules, setShowRules] = useState(false);

  const finalName = () => {
    const n = name.trim().slice(0, 12) || '玩家';
    localStorage.setItem('pocow-name', n);
    return n;
  };

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
          <span className="setup-label">昵称</span>
          <input
            className="text-input"
            value={name}
            maxLength={12}
            placeholder="玩家"
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="setup-sep">单机练习</div>
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
          <button className="btn" disabled={!!busy} onClick={() => onSolo(finalName(), aiCount)}>
            单机开局
          </button>
        </div>

        <div className="setup-sep">和朋友联机</div>
        <div className="setup-row">
          <button className="btn btn-play btn-create" disabled={!!busy} onClick={() => onCreate(finalName())}>
            创建房间
          </button>
        </div>
        <div className="setup-row">
          <input
            className="text-input code-input"
            value={code}
            maxLength={5}
            placeholder="房间码"
            onChange={(e) => setCode(normalizeCode(e.target.value))}
          />
          <button
            className="btn"
            disabled={!!busy || code.length !== 5}
            onClick={() => onJoin(finalName(), code)}
          >
            加入房间
          </button>
        </div>

        {busy && <div className="home-status">{busy}</div>}
        {error && !busy && <div className="home-error">{error}</div>}

        <button className="btn btn-ghost" onClick={() => setShowRules(true)}>
          查看规则
        </button>
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}
