import { Link } from 'react-router-dom';
import { useWatchlist } from '../context/WatchlistContext';
import { useToast } from '../context/ToastContext';
import { formatCountdown } from '../lib/discovery';

export default function DealCard({ deal, style, compact = false }) {
  const {
    game_id,
    title,
    header_image,
    store,
    price_current,
    price_regular,
    discount_pct,
    steam_review_desc,
    promo_type,
    promo_label,
    promo_ends_at,
    sale_ends_at,
    reason,
  } = deal;

  const { toggle, isWatched } = useWatchlist();
  const { addToast } = useToast();
  const watched = isWatched(game_id);

  function handleWatch(e) {
    e.preventDefault();
    e.stopPropagation();
    const nowWatched = toggle(deal);
    addToast(
      nowWatched ? `Added "${title}" to watchlist` : `Removed "${title}" from watchlist`,
      nowWatched ? 'success' : 'remove'
    );
  }

  return (
    <Link to={`/game/${game_id}`} className={`deal-card${compact ? ' deal-card--compact' : ''}`} style={style}>
      <div className="deal-card__art">
        <img
          className="deal-card__img"
          src={header_image}
          alt={title}
          loading="lazy"
          onError={(e) => { e.currentTarget.style.opacity = '0'; }}
        />
        <div className="deal-card__img-gradient" />
        {discount_pct > 0 && (
          <span className="deal-card__badge">-{discount_pct}%</span>
        )}
        <button
          className={`deal-card__watch${watched ? ' deal-card__watch--active' : ''}`}
          onClick={handleWatch}
          title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
          aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
        >
          {watched ? '🔖' : '🔖'}
        </button>
      </div>
      <div className="deal-card__body">
        {(promo_label || promo_type === 'free') && (
          <div className="deal-card__eyebrow">
            {promo_type === 'free' ? 'Free now' : promo_label}
          </div>
        )}
        <div className="deal-card__title">{title}</div>
        {steam_review_desc && (
          <div className="deal-card__review">{steam_review_desc}</div>
        )}
        {reason && (
          <div className="deal-card__reason">{reason}</div>
        )}
        <div className="deal-card__meta">
          <span className="deal-card__price">
            ${Number(price_current).toFixed(2)}
          </span>
          {price_regular && Number(price_regular) > Number(price_current) && (
            <span className="deal-card__original">
              ${Number(price_regular).toFixed(2)}
            </span>
          )}
          <span className="deal-card__store">
            {store === 'epic' ? (
              <span className="store-badge--epic">EPIC</span>
            ) : store}
          </span>
        </div>
        {formatCountdown(sale_ends_at || promo_ends_at) && (
          <div className="deal-card__countdown">{formatCountdown(sale_ends_at || promo_ends_at)}</div>
        )}
      </div>
    </Link>
  );
}
