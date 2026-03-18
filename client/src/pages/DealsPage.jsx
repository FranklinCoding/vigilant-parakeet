import { useState, useEffect, useCallback } from 'react';
import { getDeals } from '../api';
import DealCard from '../components/DealCard';
import FilterBar from '../components/FilterBar';
import Pagination from '../components/Pagination';

const DEFAULT_FILTERS = {
  sort: 'discount',
  genre: '',
  minDiscount: '',
  maxPrice: '',
  q: '',
  page: 1,
  limit: 24,
};

export default function DealsPage() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [deals, setDeals] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 24 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

  return (
    <div className="page">
      <h1 className="page__title">Current Deals</h1>

      <FilterBar filters={filters} onChange={handleFilterChange} onReset={handleReset} />

      {loading && <div className="spinner" />}

      {!loading && error && (
        <p className="state-msg">Failed to load deals: {error}</p>
      )}

      {!loading && !error && deals.length === 0 && (
        <p className="state-msg">No deals match your filters.</p>
      )}

      {!loading && !error && deals.length > 0 && (
        <>
          <div className="deal-grid">
            {deals.map((deal) => (
              <DealCard key={`${deal.game_id}-${deal.store}`} deal={deal} />
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
