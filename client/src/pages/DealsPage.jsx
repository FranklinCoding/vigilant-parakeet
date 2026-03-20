import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getDeals } from '../api';
import DealCard from '../components/DealCard';
import FilterBar from '../components/FilterBar';
import Pagination from '../components/Pagination';
import SkeletonCard from '../components/SkeletonCard';

const DEFAULT_FILTERS = {
  sort: 'discount',
  genre: '',
  minDiscount: '',
  maxPrice: '',
  q: '',
  page: 1,
  limit: 24,
};

// Hero strip — always shows top 5 hottest deals (independent of filters)
function HeroStrip({ deals }) {
  if (!deals || deals.length === 0) return null;
  return (
    <div className="hero-strip">
      <div className="section-label">Hot Right Now</div>
      <div className="hero-strip__scroll">
        {deals.slice(0, 5).map((deal, i) => (
          <Link
            key={deal.game_id}
            to={`/game/${deal.game_id}`}
            className="hero-card"
            style={{ animationDelay: `${i * 0.07}s` }}
          >
            <img
              className="hero-card__img"
              src={deal.header_image}
              alt={deal.title}
              loading="lazy"
              onError={(e) => { e.currentTarget.style.opacity = '0'; }}
            />
            <div className="hero-card__overlay">
              {deal.discount_pct > 0 && (
                <span className="hero-card__badge">-{deal.discount_pct}%</span>
              )}
              <div className="hero-card__title">{deal.title}</div>
              <div className="hero-card__price">${Number(deal.price_current).toFixed(2)}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function DealsPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [deals, setDeals] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 24 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Hero deals fetched once, independently of filter state
  const [heroDeals, setHeroDeals] = useState([]);

  useEffect(() => {
    getDeals({ sort: 'discount', limit: 5, page: 1 })
      .then((r) => setHeroDeals(r.data || []))
      .catch(() => {});
  }, []);

  const fetchDeals = useCallback(async (params) => {
    setLoading(true);
    setError(null);
    try {
      const result = await getDeals(params);
      setDeals(result.data);
      setMeta(result.meta);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeals(filters);
  }, [filters, fetchDeals]);

  function handleFilterChange(partial) {
    setFilters((prev) => ({ ...prev, ...partial }));
  }

  function handleReset() {
    setFilters(DEFAULT_FILTERS);
  }

  // Active filter pills
  const activeFilters = [
    filters.q && { key: 'q', label: `"${filters.q}"`, clear: { q: '', page: 1 } },
    filters.genre && { key: 'genre', label: filters.genre, clear: { genre: '', page: 1 } },
    filters.minDiscount && { key: 'minDiscount', label: `${filters.minDiscount}%+ off`, clear: { minDiscount: '', page: 1 } },
    filters.maxPrice && { key: 'maxPrice', label: `Under $${filters.maxPrice}`, clear: { maxPrice: '', page: 1 } },
    filters.sort !== 'discount' && { key: 'sort', label: `Sort: ${filters.sort}`, clear: { sort: 'discount', page: 1 } },
  ].filter(Boolean);

  return (
    <div className="page">
      <HeroStrip deals={heroDeals} />

      <div className="section-label">All Deals</div>

      <FilterBar filters={filters} onChange={handleFilterChange} onReset={handleReset} />

      {activeFilters.length > 0 && (
        <div className="active-filters">
          {activeFilters.map((f) => (
            <span
              key={f.key}
              className="active-filter"
              onClick={() => handleFilterChange(f.clear)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleFilterChange(f.clear)}
            >
              {f.label}
              <span className="active-filter__x">×</span>
            </span>
          ))}
        </div>
      )}

      {loading && (
        <div className="deal-grid">
          {Array.from({ length: 12 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="empty-state">
          <div className="empty-state__icon">⚠️</div>
          <div className="empty-state__title">Failed to load</div>
          <div className="empty-state__sub">{error}</div>
        </div>
      )}

      {!loading && !error && deals.length === 0 && (
        <div className="empty-state">
          <div className="empty-state__icon">🎮</div>
          <div className="empty-state__title">No deals found</div>
          <div className="empty-state__sub">
            Try adjusting your filters or check back soon — deals update daily.
          </div>
        </div>
      )}

      {!loading && !error && deals.length > 0 && (
        <>
          <div className="deal-grid">
            {deals.map((deal, i) => (
              <DealCard
                key={`${deal.game_id}-${deal.store}`}
                deal={deal}
                style={{ animationDelay: `${Math.min(i, 11) * 0.04}s` }}
              />
            ))}
          </div>
          <Pagination
            page={meta.page}
            total={meta.total}
            limit={meta.limit}
            onChange={(p) => handleFilterChange({ page: p })}
          />
        </>
      )}
    </div>
  );
}
