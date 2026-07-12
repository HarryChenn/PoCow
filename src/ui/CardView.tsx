import { Card, isJoker, rankLabel, SUIT_SYMBOL } from '../engine/cards';

interface Props {
  card?: Card;
  hidden?: boolean;
  small?: boolean;
  selectable?: boolean;
  /** 被选中待交换的高亮 */
  picked?: boolean;
  /** 刚换到手的新牌高亮 */
  fresh?: boolean;
  /** 用于交换动画定位 */
  dataId?: string;
  onClick?: () => void;
}

export function CardView({ card, hidden, small, selectable, picked, fresh, dataId, onClick }: Props) {
  const cls = [
    'card',
    small ? 'card-sm' : '',
    selectable ? 'selectable' : '',
    picked ? 'picked' : '',
    fresh ? 'card-fresh' : '',
  ];
  if (hidden || !card) {
    return (
      <div
        className={[...cls, 'card-back'].join(' ')}
        data-card-id={dataId}
        onClick={onClick}
      />
    );
  }
  let color = 'card-black';
  if (isJoker(card)) color = 'card-joker';
  else if (card.suit === 'H' || card.suit === 'D') color = 'card-red';
  return (
    <div
      className={[...cls, color].join(' ')}
      data-card-id={dataId}
      data-rank={isJoker(card) ? undefined : rankLabel(card.rank)}
      onClick={onClick}
    >
      {isJoker(card) ? (
        <>
          <span className="card-rank">🃏</span>
          <span className="card-suit joker-text">JOKER</span>
        </>
      ) : (
        <>
          <span className="card-rank">{rankLabel(card.rank)}</span>
          <span className="card-suit">{SUIT_SYMBOL[card.suit!]}</span>
        </>
      )}
    </div>
  );
}
