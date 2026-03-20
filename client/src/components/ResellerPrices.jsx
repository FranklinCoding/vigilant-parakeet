import { useState, useEffect, useCallback } from 'react';
import { getResellers } from '../api';

const SITE_LABELS = {
  g2a: 'G2A',
  kinguin: 'Kinguin',
};

const SITE_COLORS = {
  g2a: '#f4a017',
  kinguin: '#e74c3c',
};

function StarRating({ rating }) {
  if (rating == null) return <span style={{ color: 'var(--text-muted)' }}>N/A</span>;
  const pct = (rating / 5) * 100;
  return (
    <span className="star-rating" title={`${rating.toFixed(1)} / 5`}>
      <span className="star-rating__bg">★★★★★</span>
      <span className="star-rating__fill" style={{ width: `${pct}%` }}>★★★★★</span>
      <span className="star-rating__value">{rating.toFixed(1)}</span>
    </span>
  );
}

function SellerTable({ siteKey, siteData }) {
  if (!siteData) return null;

  const label = SITE_LABELS[siteKey] || siteKey.toUpperCase();
  const color = SITE_COLORS[siteKey] || 'var(--accent)';

  if (!siteData.configured) {
    return (
      <div className="reseller-site">
        <div className="reseller-site__header" style={{ borderColor: color }}>
          <span className="reseller-site__name" style={{ color }}>{label}</span>
          <span className="reseller-site__badge reseller-site__badge--unconfigured">Not configured</span>
        </div>
        <p className="reseller-site__notice">{siteData.reason}</p>
      </div>
    );
  }

  if (!siteData.available || !siteData.sellers?.length) {
    return (
      <div className="reseller-site">
        <div className="reseller-site__header" style={{ borderColor: color }}>
          <span className="reseller-site__name" style={{ color }}>{label}</span>
        </div>
        <p className="reseller-site__notice">
          {siteData.reason || 'No listings found matching your filters.'}
        </p>
      </div>
    );
  }

  return (
    <div className="reseller-site">
      <div className="reseller-site__header" style={{ borderColor: color }}>
        <span className="reseller-site__name" style={{ color }}>{label}</span>
        {siteData.productName && (
          <span className="reseller-site__product">{siteData.productName}</span>
        )}
      </div>

      <table className="price-table reseller-table">
        <thead>
          <tr>
            <th>Seller</th>
            <th>Price</th>
            <th>Rating</th>
            <th>Type</th>
            <th>Region</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {siteData.sellers.map((s, i) => (
            <tr key={i} className={s.type?.toLowerCase() === 'account' ? 'reseller-row--account' : ''}>
              <td className="reseller-row__seller">
                {s.sellerName}
                {s.positiveReviews != null && (
                  <span className="reseller-row__reviews">
                    {s.positiveReviews.toLocaleString()} positive
                    {s.negativeReviews ? ` / ${s.negativeReviews.toLocaleString()} negative` : ''}
                  </span>
                )}
              </td>
              <td className="price--sale">${s.price.toFixed(2)}</td>
              <td><StarRating rating={s.rating} /></td>
              <td>
                <span className={`reseller-type reseller-type--${s.type?.toLowerCase()}`}>
                  {s.type || 'Key'}
                </span>
              </td>
              <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{s.region}</td>
              <td>
                {s.url && (
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    <button className="btn-deal">Buy</button>
                  </a>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ResellerPrices({ gameId }) {
  const [enabled, setEnabled] = useState(false);
  const [sites, setSites] = useState({ g2a: true, kinguin: true });
  const [minRating, setMinRating] = useState('0');
  const [includeAccounts, setIncludeAccounts] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetch = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    const sitesParam = Object.entries(sites)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(',');

    if (!sitesParam) {
      setData(null);
      setLoading(false);
      return;
    }

    try {
      const result = await getResellers(gameId, {
        sites: sitesParam,
        minRating,
        includeAccounts: includeAccounts ? 'true' : 'false',
      });
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [enabled, gameId, sites, minRating, includeAccounts]);

  useEffect(() => {
    if (enabled) fetch();
  }, [enabled, fetch]);

  return (
    <div className="game-section reseller-section">
      <div className="reseller-section__header">
        <div className="game-section__title" style={{ marginBottom: 0 }}>Key Reseller Prices</div>
        <label className="reseller-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>Show marketplace listings</span>
        </label>
      </div>

      {!enabled && (
        <p className="reseller-section__blurb">
          Enable to show prices from G2A, Kinguin, and other key marketplaces.
          These sites list individual sellers — prices are often lower than MSRP.{' '}
          <strong>Requires API keys configured in your server environment.</strong>
        </p>
      )}

      {enabled && (
        <>
          <div className="reseller-filters">
            <div className="reseller-filters__group">
              <span className="reseller-filters__label">Sites:</span>
              {Object.keys(SITE_LABELS).map((key) => (
                <label key={key} className="reseller-filters__check">
                  <input
                    type="checkbox"
                    checked={sites[key] ?? true}
                    onChange={(e) =>
                      setSites((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                  />
                  {SITE_LABELS[key]}
                </label>
              ))}
            </div>

            <div className="reseller-filters__group">
              <label className="reseller-filters__label" htmlFor="min-rating">
                Min seller rating:
              </label>
              <select
                id="min-rating"
                className="filters__select"
                value={minRating}
                onChange={(e) => setMinRating(e.target.value)}
              >
                <option value="0">Any rating</option>
                <option value="3">3.0+</option>
                <option value="3.5">3.5+</option>
                <option value="4">4.0+</option>
                <option value="4.5">4.5+</option>
                <option value="4.8">4.8+ (Excellent)</option>
              </select>
            </div>

            <div className="reseller-filters__group">
              <label className="reseller-filters__check reseller-filters__check--warn">
                <input
                  type="checkbox"
                  checked={includeAccounts}
                  onChange={(e) => setIncludeAccounts(e.target.checked)}
                />
                Include account listings
                <span className="reseller-warn-badge">⚠ Risky</span>
              </label>
            </div>

            <button className="filters__btn" onClick={fetch} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {includeAccounts && (
            <div className="reseller-account-warning">
              Account listings (marked in red) contain a full Steam account with the game.
              These are against Steam's Terms of Service and carry risk of ban or account loss.
              Proceed with caution.
            </div>
          )}

          {loading && <div className="spinner" />}
          {error && <p className="state-msg">Failed to fetch reseller prices: {error}</p>}

          {!loading && !error && data && (
            <div className="reseller-results">
              {Object.entries(sites)
                .filter(([, v]) => v)
                .map(([siteKey]) => (
                  <SellerTable
                    key={siteKey}
                    siteKey={siteKey}
                    siteData={data.resellers?.[siteKey] ?? null}
                  />
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
