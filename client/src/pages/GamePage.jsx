import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getDeal } from '../api';
import ResellerPrices from '../components/ResellerPrices';
import TrailerEmbed from '../components/TrailerEmbed';
import MediaGallery from '../components/MediaGallery';

const LS_KEY = 'vaultdeal_steam_profile';

function fmt(val) {
  return val != null ? `$${Number(val).toFixed(2)}` : '—';
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function fmtHours(mins) {
  if (!mins || mins < 1) return null;
  const h = Math.round(mins / 60);
  return h >= 1 ? `${h.toLocaleString()}h played` : `${mins}m played`;
}

export default function GamePage() {
  const { gameId } = useParams();
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [libraryInfo, setLibraryInfo] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getDeal(gameId)
      .then(setGame)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [gameId]);

  useEffect(() => {
    if (!game?.steam_app_id) return;
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (!stored) return;
      const profile = JSON.parse(stored);
      const libKey = `vaultdeal_library_${profile.steamId}`;
      const libStored = localStorage.getItem(libKey);
      if (!libStored) return;
      const lib = JSON.parse(libStored);
      const entry = lib?.games?.find((g) => g.appId === game.steam_app_id);
      if (entry) setLibraryInfo(entry);
    } catch {}
  }, [game?.steam_app_id]);

  if (loading) return <div className="spinner" style={{ marginTop: 80 }} />;
  if (error) return (
    <div className="empty-state" style={{ marginTop: 40 }}>
      <div className="empty-state__icon">⚠️</div>
      <div className="empty-state__title">Failed to load</div>
      <div className="empty-state__sub">{error}</div>
    </div>
  );
  if (!game) return null;

  const {
    title,
    header_image,
    short_description,
    genres,
    tags,
    categories,
    developers,
    metacritic_score,
    steam_review_desc,
    steam_review_score,
    release_date,
    prices,
    all_time_low,
    all_time_low_date,
    avg_discount_pct,
    steam_app_id,
    screenshots,
    steam_movies,
  } = game;

  const currentPrice = prices?.[0]?.price_current;
  const regularPrice = prices?.[0]?.price_regular;
  const discountPct = prices?.[0]?.discount_pct;

  const allTags = [...(genres || []), ...(tags || []), ...(categories || [])].filter(Boolean);
  const uniqueTags = [...new Set(allTags)];

  return (
    <div className="page">
      <Link to="/" className="back-link">← Back to deals</Link>

      {/* ── Hero ── */}
      <div className="game-hero">
        <div className="game-hero__art">
          <img
            className="game-hero__img"
            src={header_image || `https://cdn.akamai.steamstatic.com/steam/apps/${steam_app_id}/header.jpg`}
            alt={title}
            onError={(e) => { e.currentTarget.style.opacity = '0'; }}
          />
        </div>

        <div className="game-hero__info">
          <h1 className="game-hero__title">
            {title}
            {libraryInfo && (
              <span className="owned-badge" title="In your Steam library">Owned</span>
            )}
          </h1>

          {short_description && (
            <p className="game-hero__desc">{short_description}</p>
          )}

          {uniqueTags.length > 0 && (
            <div className="game-hero__tags">
              {uniqueTags.slice(0, 12).map((t) => (
                <span key={t} className="tag">{t}</span>
              ))}
            </div>
          )}

          <div className="game-hero__meta">
            {developers?.length > 0 && (
              <span>{developers[0]}</span>
            )}
            {release_date && <span>Released {fmtDate(release_date)}</span>}
            {metacritic_score && <span>Metacritic {metacritic_score}</span>}
            {steam_review_desc && (
              <span>
                {steam_review_desc}
                {steam_review_score ? ` (${steam_review_score}%)` : ''}
              </span>
            )}
            {libraryInfo && fmtHours(libraryInfo.playtimeMins) && (
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                {fmtHours(libraryInfo.playtimeMins)}
              </span>
            )}
          </div>

          {currentPrice != null && (
            <div className="game-hero__price-row">
              <span className="game-hero__sale-price">{fmt(currentPrice)}</span>
              {regularPrice && Number(regularPrice) > Number(currentPrice) && (
                <span className="game-hero__reg-price">{fmt(regularPrice)}</span>
              )}
              {discountPct > 0 && (
                <span className="game-hero__discount-badge">-{discountPct}%</span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Trailer ── */}
      {steam_app_id && (
        <TrailerEmbed gameId={parseInt(gameId)} gameTitle={title} />
      )}

      {/* ── Media Gallery ── */}
      {((screenshots?.length > 0) || (steam_movies?.length > 0)) && (
        <MediaGallery screenshots={screenshots ?? []} movies={steam_movies ?? []} />
      )}

      {/* ── Price overview ── */}
      <div className="game-section">
        <div className="game-section__title">Price Overview</div>
        <div className="stats-row">
          <div className="stat-box">
            <div className="stat-box__label">Current Price</div>
            <div className="stat-box__value" style={{ color: 'var(--accent)' }}>
              {fmt(currentPrice)}
            </div>
          </div>
          <div className="stat-box">
            <div className="stat-box__label">Regular Price</div>
            <div className="stat-box__value">{fmt(regularPrice)}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box__label">All-Time Low</div>
            <div className="stat-box__value" style={{ color: 'var(--accent)' }}>
              {fmt(all_time_low)}
            </div>
            {all_time_low_date && (
              <div className="stat-box__sub">{fmtDate(all_time_low_date)}</div>
            )}
          </div>
          <div className="stat-box">
            <div className="stat-box__label">Avg Discount</div>
            <div className="stat-box__value">
              {avg_discount_pct != null ? `${avg_discount_pct}%` : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* ── Where to Buy ── */}
      {prices?.length > 0 && (
        <div className="game-section">
          <div className="game-section__title">Where to Buy</div>
          <div className="price-cards">
            {prices.map((p, i) => (
              <div key={i} className="price-card">
                <div className="price-card__store">{p.store}</div>
                {p.discount_pct > 0 && (
                  <span className="price-card__badge">-{p.discount_pct}%</span>
                )}
                <div className="price-card__prices">
                  <span className="price-card__sale">{fmt(p.price_current)}</span>
                  {p.price_regular && Number(p.price_regular) > Number(p.price_current) && (
                    <span className="price-card__regular">{fmt(p.price_regular)}</span>
                  )}
                </div>
                <span className="price-card__date">{fmtDate(p.recorded_at)}</span>
                {p.deal_url && (
                  <a href={p.deal_url} target="_blank" rel="noopener noreferrer">
                    <button className="price-card__btn">Get Deal →</button>
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Reseller Prices ── */}
      <ResellerPrices gameId={parseInt(gameId)} />
    </div>
  );
}
