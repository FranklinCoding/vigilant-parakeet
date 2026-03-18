import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getDeal } from '../api';

function fmt(val) {
  return val != null ? `$${Number(val).toFixed(2)}` : '—';
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function GamePage() {
  const { gameId } = useParams();
  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getDeal(gameId)
      .then(setGame)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [gameId]);

  if (loading) return <div className="spinner" style={{ marginTop: 60 }} />;
  if (error) return <p className="state-msg">Error: {error}</p>;
  if (!game) return null;

  const {
    title,
    header_image,
    short_description,
    genres,
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
  } = game;

  const currentPrice = prices?.[0]?.price_current;
  const regularPrice = prices?.[0]?.price_regular;

  return (
    <div className="page">
      <Link to="/" style={{ fontSize: 13, color: 'var(--text-muted)', display: 'inline-block', marginBottom: 20 }}>
        ← Back to deals
      </Link>

      <div className="game-hero">
        <img
          className="game-hero__img"
          src={header_image || `https://cdn.akamai.steamstatic.com/steam/apps/${steam_app_id}/header.jpg`}
          alt={title}
          onError={(e) => { e.currentTarget.style.opacity = '0'; }}
        />
        <div className="game-hero__info">
          <h1 className="game-hero__title">{title}</h1>
          {short_description && (
            <p className="game-hero__desc">{short_description}</p>
          )}
          {genres?.length > 0 && (
            <div className="game-hero__tags">
              {genres.map((g) => <span key={g} className="tag">{g}</span>)}
            </div>
          )}
          <div style={{ fontSize: 13, color: 'var(--text-muted)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {developers?.length > 0 && <span>Dev: {developers[0]}</span>}
            {release_date && <span>Released: {fmtDate(release_date)}</span>}
            {metacritic_score && <span>Metacritic: {metacritic_score}</span>}
            {steam_review_desc && <span>Reviews: {steam_review_desc}{steam_review_score ? ` (${steam_review_score}%)` : ''}</span>}
          </div>
        </div>
      </div>

      {/* Price stats */}
      <div className="game-section">
        <div className="game-section__title">Price Overview</div>
        <div className="stats-row">
          <div className="stat-box">
            <div className="stat-box__label">Current Price</div>
            <div className="stat-box__value" style={{ color: 'var(--green)' }}>{fmt(currentPrice)}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box__label">Regular Price</div>
            <div className="stat-box__value">{fmt(regularPrice)}</div>
          </div>
          <div className="stat-box">
            <div className="stat-box__label">All-Time Low</div>
            <div className="stat-box__value" style={{ color: 'var(--green)' }}>
              {fmt(all_time_low)}
            </div>
            {all_time_low_date && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{fmtDate(all_time_low_date)}</div>
            )}
          </div>
          <div className="stat-box">
            <div className="stat-box__label">Avg Discount</div>
            <div className="stat-box__value">{avg_discount_pct != null ? `${avg_discount_pct}%` : '—'}</div>
          </div>
        </div>
      </div>

      {/* Prices across stores */}
      {prices?.length > 0 && (
        <div className="game-section">
          <div className="game-section__title">Where to Buy</div>
          <table className="price-table">
            <thead>
              <tr>
                <th>Store</th>
                <th>Sale Price</th>
                <th>Regular</th>
                <th>Discount</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {prices.map((p, i) => (
                <tr key={i}>
                  <td style={{ textTransform: 'capitalize' }}>{p.store}</td>
                  <td className="price--sale">{fmt(p.price_current)}</td>
                  <td style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>{fmt(p.price_regular)}</td>
                  <td>{p.discount_pct ? `-${p.discount_pct}%` : '—'}</td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{fmtDate(p.recorded_at)}</td>
                  <td>
                    {p.deal_url && (
                      <a href={p.deal_url} target="_blank" rel="noopener noreferrer">
                        <button className="btn-deal">Get Deal</button>
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
