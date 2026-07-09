import { Card, isJoker, rankLabel, SUIT_SYMBOL } from '../engine/cards';

interface Props {
  card?: Card;
  hidden?: boolean;
  small?: boolean;
  selectable?: boolean;
  onClick?: () => void;
}

export function CardView({ card, hidden, small, selectable, onClick }: Props) {
  const size = small ? 'card-sm' : '';
  if (hidden || !card) {
    return <div className={`card card-back ${size}`} />;
  }
  if (isJoker(card)) {
    return (
      <div
        className={`card card-joker ${size} ${selectable ? 'selectable' : ''}`}
        onClick={onClick}
      >
        <span className="card-rank">🃏</span>
        <span className="card-suit joker-text">JOKER</span>
      </div>
    );
  }
  const red = card.suit === 'H' || card.suit === 'D';
  return (
    <div
      className={`card ${red ? 'card-red' : 'card-black'} ${size} ${selectable ? 'selectable' : ''}`}
      onClick={onClick}
    >
      <span className="card-rank">{rankLabel(card.rank)}</span>
      <span className="card-suit">{SUIT_SYMBOL[card.suit!]}</span>
    </div>
  );
}
