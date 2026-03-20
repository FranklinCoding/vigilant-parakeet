import { useState, useEffect, useCallback } from 'react';
import { getResellers } from '../api';

const DRM_LABELS = {
  steam: 'Steam DRM',
  drm_free: 'DRM-Free',
  gog: 'GOG Galaxy',
  uplay: 'Ubisoft Connect',
  ea: 'EA App',
  epic: 'Epic',
};

function fmt(val, currency = 'USD') {
  if (val == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val);
}

function CutBadge({ cut }) {
  if (!cut) return null;
  return <span className="deal-card__discount">-{cut}%</span>;
}

function DrmTags({ drm }) {
  if (!drm?.length) return null;
  return (
    <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {drm.map((d) => (
        <span key={d} className="tag" style={{ fontSize: 10 }}>
          {DRM_LABELS[d] || d}
        </span>
      ))}
    </span>
  );
}

export default function ResellerPrices({ gameId }) {
  const [enabled, setEnabled] = useState(false);
  const [minCut, setMinCut] = useState('0');
  const [country, setCountry] = useState('US');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPrices = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getResellers(gameId, { minCut, country });
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [enabled, gameId, minCut, country]);

  useEffect(() => {
    if (enabled) fetchPrices();
  }, [enabled, fetchPrices]);

  return (
    <div className="game-section reseller-section">
      <div className="reseller-section__header">
        <div className="game-section__title" style={{ marginBottom: 0 }}>
          Prices Across Stores
        </div>
        <label className="reseller-toggle">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>Show prices from other stores</span>
        </label>
      </div>

      {!enabled && (
        <p className="reseller-section__blurb">
          Enable to compare prices from 30+ stores — Fanatical, GreenManGaming,
          Humble, GOG, GamersGate, and more — powered by{' '}
          <strong>IsThereAnyDeal</strong>.
        </p>
      )}

      {enabled && (
        <>
          <div className="reseller-filters">
            <div className="reseller-filters__group">
              <label className="reseller-filters__label">Min discount:</label>
              <select
                className="filters__select"
                value={minCut}
                onChange={(e) => setMinCut(e.target.value)}
              >
                <option value="0">Any price</option>
                <option value="10">10%+ off</option>
                <option value="25">25%+ off</option>
                <option value="50">50%+ off</option>
                <option value="75">75%+ off</option>
              </select>
            </div>

            <div className="reseller-filters__group">
              <label className="reseller-filters__label">Region:</label>
              <select
                className="filters__select"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              >
                <option value="US">🇺🇸 USD</option>
                <option value="GB">🇬🇧 GBP</option>
                <option value="DE">🇩🇪 EUR</option>
                <option value="CA">🇨🇦 CAD</option>
                <option value="AU">🇦🇺 AUD</option>
                <option value="BR">🇧🇷 BRL</option>
              </select>
            </div>

            <button className="filters__btn" onClick={fetchPrices} disabled={loading}>
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>

          {loading && <div className="spinner" />}
          {error && <p className="state-msg">Failed to load prices: {error}</p>}

          {!loading && !error && data && !data.configured && (
            <div className="steam-notice">
              {data.message}
            </div>
          )}

          {!loading && !error && data?.configured && (
            <>
              {/* History low banner */}
              {data.historyLow && (
                <div className="itad-history-low">
                  <span className="itad-history-low__label">All-time low on {data.historyLow.shop}:</span>
                  <span className="itad-history-low__price">
                    {fmt(data.historyLow.price, data.historyLow.currency)}
                  </span>
                  {data.historyLow.date && (
                    <span className="itad-history-low__date">
                      {new Date(data.historyLow.date).toLocaleDateString('en-US', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </span>
                  )}
                </div>
              )}

              {data.deals?.length === 0 ? (
                <p className="state-msg" style={{ padding: '24px 0' }}>
                  {data.message || 'No deals found matching your filters.'}
                </p>
              ) : (
                <table className="price-table reseller-table">
                  <thead>
                    <tr>
                      <th>Store</th>
                      <th>Sale Price</th>
                      <th>Regular</th>
                      <th>Discount</th>
                      <th>DRM</th>
                      <th>Store Low</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.deals.map((d, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>
                          {d.store}
                          {d.voucher && (
                            <span
                              className="reseller-warn-badge"
                              style={{ background: '#1a3a1a', color: 'var(--green)', marginLeft: 6 }}
                              title={`Use code: ${d.voucher}`}
                            >
                              Code: {d.voucher}
                            </span>
                          )}
                        </td>
                        <td className="price--sale">{fmt(d.price, d.currency)}</td>
                        <td style={{ color: 'var(--text-muted)', textDecoration: 'line-through' }}>
                          {fmt(d.regular, d.currency)}
                        </td>
                        <td><CutBadge cut={d.cut} /></td>
                        <td><DrmTags drm={d.drm} /></td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {d.storeLow != null ? fmt(d.storeLow, d.currency) : '—'}
                        </td>
                        <td>
                          {d.url && (
                            <a href={d.url} target="_blank" rel="noopener noreferrer">
                              <button className="btn-deal">Buy</button>
                            </a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
                Prices via <a href="https://isthereanydeal.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}>IsThereAnyDeal</a>.
                Updates may be delayed by a few hours.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
