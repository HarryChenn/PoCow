import { CSSProperties, useState } from 'react';
import { Card } from '../engine/cards';
import { normalizeCode } from '../net/code';
import { CardView } from './CardView';
import { RulesModal } from './RulesModal';
import { LangSwitch, useI18n } from '../i18n';

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
  const { t } = useI18n();
  const [name, setName] = useState(() => localStorage.getItem('pocow-name') ?? '');
  const [aiCount, setAiCount] = useState(3);
  const [code, setCode] = useState('');
  const [showRules, setShowRules] = useState(false);

  const finalName = () => {
    const n = name.trim().slice(0, 12) || t('home.playerDefault');
    localStorage.setItem('pocow-name', n);
    return n;
  };

  return (
    <div className="setup-screen">
      <LangSwitch className="lang-corner" />
      <div className="title-cards">
        {TITLE_CARDS.map((c, i) => (
          <div key={c.id} className="title-card" style={{ '--i': i } as CSSProperties}>
            <CardView card={c} />
          </div>
        ))}
      </div>
      <h1 className="game-title">PoCow</h1>
      <div className="game-subtitle">{t('home.subtitle')}</div>

      <div className="setup-panel">
        <div className="setup-row">
          <span className="setup-label">{t('home.nickname')}</span>
          <input
            className="text-input"
            value={name}
            maxLength={12}
            placeholder={t('home.playerDefault')}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="setup-sep">{t('home.soloSection')}</div>
        <div className="setup-row">
          <span className="setup-label">{t('home.aiOpponents')}</span>
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
            {t('home.startSolo')}
          </button>
        </div>

        <div className="setup-sep">{t('home.onlineSection')}</div>
        <div className="setup-row">
          <button className="btn btn-play btn-create" disabled={!!busy} onClick={() => onCreate(finalName())}>
            {t('home.createRoom')}
          </button>
        </div>
        <div className="setup-row">
          <input
            className="text-input code-input"
            value={code}
            maxLength={5}
            placeholder={t('home.roomCode')}
            onChange={(e) => setCode(normalizeCode(e.target.value))}
          />
          <button
            className="btn"
            disabled={!!busy || code.length !== 5}
            onClick={() => onJoin(finalName(), code)}
          >
            {t('home.joinRoom')}
          </button>
        </div>

        {busy && <div className="home-status">{busy}</div>}
        {error && !busy && <div className="home-error">{error}</div>}

        <button className="btn btn-ghost" onClick={() => setShowRules(true)}>
          {t('home.viewRules')}
        </button>
      </div>

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}
