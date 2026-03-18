import { Link } from 'react-router-dom';

export default function DealCard({ deal }) {
  const {
    game_id,
    title,
    header_image,
    store,
    price_current,
    price_regular,
    discount_pct,
    steam_review_desc,
  } = deal;

  return (
    <Link to={`/game/${game_id}`} className="deal-card">
      <img
        className="deal-card__img"
        src={header_image}
        alt={title}
        loading="lazy"
        onError={(e) => { e.currentTarget.style.opacity = '0'; }}
      />
      <div className="deal-card__body">
        <div className="deal-card__title">{title}</div>
        {steam_review_desc && (
          <div className="deal-card__review">{steam_review_desc}</div>
        )}
        <div className="deal-card__meta">
          {discount_pct > 0 && (
            <span className="deal-card__discount">-{discount_pct}%</span>
          )}
          <span className="deal-card__price">${Number(price_current).toFixed(2)}</span>
          {price_regular && Number(price_regular) > Number(price_current) && (
            <span className="deal-card__original">${Number(price_regular).toFixed(2)}</span>
          )}
          <span className="deal-card__store">{store}</span>
        </div>
      </div>
    </Link>
  );
}
