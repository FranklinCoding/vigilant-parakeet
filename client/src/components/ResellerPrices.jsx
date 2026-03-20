import { useState, useEffect, useCallback, Component } from 'react';
import { getResellers } from '../api';

const DRM_LABELS = {
  steam: 'Steam DRM',
  drm_free: 'DRM-Free',
  gog: 'GOG Galaxy',
  uplay: 'Ubisoft Connect',
  ea: 'EA App',
  epic: 'Epic',
};

function fmt(val, currency) {
  if (val == null) return '—';
  const safeCurrency = /^[A-Z]{3}$/.test(currency || '') ? currency : 'USD';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: safeCurrency }).format(val);
  } catch {
    return `$${Number(val).toFixed(2)}`;
  }
}

function DrmTags({ drm }) {
  if (!Array.isArray(drm) || !drm.length) return null;
  return (
    <span className="reseller-deal-card__drm">
      {drm.map((d) => (
        <span key={d} className="tag" style={{ fontSize: 10 }}>
          {DRM_LABELS[d] || d}
        </span>
      ))}
    </span>
  );
}

class ResellerErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false, message: '' };
  }
  static getDerivedStateFromError(err) {
    return { crashed: true, message: err?.message || 'Unknown error' };
  }
  render() {
    if (this.state.crashed) {
      return (
        <div className="steam-notice">
          Prices could not be loaded: {this.state.message}
        </div>
      );
    }
    return this.props.children;
  }
}

function ResellerPricesInner({ gameId }) {
  const [enabled, setEnabled] = useState(false);
  const [minCut, setMinCut] = useState('0');
  const [country, setCountry] = useState('US');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchPrices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getResellers(gameId, { minCut, country });
      setData(result);
    } catch (err) {
      setError(err.message || 'Failed to fetch prices');
    } finally {
      setLoading(false);
    }
  }, [gameId, minCut, country]);

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
          <span>{enabled ? 'Showing prices from 30+ stores' : 'Compare from 30+ stores'}</span>
        </label>
      </div>

      {!enabled && (
        <p className="reseller-section__blurb">
          Enable to compare prices from Fanatical, GreenManGaming, Humble, GOG,
          GamersGate, and 25+ more stores — powered by{' '}
          <strong style={{ color: 'var(--text)' }}>IsThereAnyDeal</strong>.
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

          {!loading && error && (
            <div className="steam-notice">Failed to load prices: {error}</div>
          )}

          {!loading && !error && data && !data.configured && (
            <div className="steam-notice">{data.message}</div>
          )}

          {!loading && !error && data?.configured && (
            <>
              {data.historyLow?.price != null && (
                <div className="itad-history-low">
                  <span className="itad-history-low__label">
                    All-time low{data.historyLow.shop ? ` on ${data.historyLow.shop}` : ''}:
                  </span>
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

              {!data.deals?.length ? (
                <div className="empty-state" style={{ padding: '40px 0' }}>
                  <div className="empty-state__icon">🏷️</div>
                  <div className="empty-state__title">No deals found</div>
                  <div className="empty-state__sub">
                    {data.message || 'Try lowering the minimum discount filter.'}
                  </div>
                </div>
              ) : (
                <div className="reseller-deals">
                  {data.deals.map((d, i) => (
                    <div key={i} className="reseller-deal-card">
                      <div className="reseller-deal-card__store">
                        <span>{d.store || 'Unknown'}</span>
                        {d.voucher && (
                          <span
                            className="reseller-deal-card__voucher"
                            title={`Use code: ${d.voucher}`}
                          >
                            Code: {d.voucher}
                          </span>
                        )}
                      </div>

                      <div className="reseller-deal-card__prices">
                        <span className="reseller-deal-card__sale">
                          {fmt(d.price, d.currency)}
                        </span>
                        {d.regular && (
                          <span className="reseller-deal-card__regular">
                            {fmt(d.regular, d.currency)}
                          </span>
                        )}
                        {d.cut > 0 && (
                          <span className="reseller-deal-card__cut">-{d.cut}%</span>
                        )}
                      </div>

                      <DrmTags drm={d.drm} />

                      {d.storeLow != null && (
                        <span className="reseller-deal-card__store-low">
                          Store low: {fmt(d.storeLow, d.currency)}
                        </span>
                      )}

                      {d.url && (
                        <a href={d.url} target="_blank" rel="noopener noreferrer">
                          <button className="reseller-deal-card__btn">Buy →</button>
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <p style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 12 }}>
                Prices via{' '}
                <a
                  href="https://isthereanydeal.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: 'var(--text-muted)', textDecoration: 'underline' }}
                >
                  IsThereAnyDeal
                </a>
                . Updates may be delayed a few hours.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function ResellerPrices({ gameId }) {
  return (
    <ResellerErrorBoundary>
      <ResellerPricesInner gameId={gameId} />
    </ResellerErrorBoundary>
  );
}
