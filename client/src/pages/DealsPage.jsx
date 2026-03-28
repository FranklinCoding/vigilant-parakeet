import { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getDeals, getDiscoveryHome, getEpicAccountStatus } from '../api';
import { useAuth } from '../context/AuthContext';
import { QUICK_PICK_TAGS } from '../constants/quickPicks';
import { buildDiscoveryQuery, formatCountdown, getQuickPicks, saveQuickPicks } from '../lib/discovery';
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

const STORE_CHIPS = [
  { id: 'all', label: 'All' },
  { id: 'steam', label: 'Steam' },
  { id: 'epic', label: 'Epic' },
  { id: 'free', label: 'Free' },
];

function DiscoveryHero({ items }) {
  if (!items?.length) return null;
  const [lead, ...rest] = items;

  return (
    <section className="discovery-hero">
      <Link to={`/game/${lead.game_id}`} className="discovery-hero__lead">
        <img src={lead.header_image} alt={lead.title} className="discovery-hero__img" />
        <div className="discovery-hero__overlay" />
        <div className="discovery-hero__copy">
          <span className="discovery-pill">{lead.store === 'epic' ? 'Epic spotlight' : 'Featured sale'}</span>
          <h1>{lead.title}</h1>
          <p>{lead.reason}</p>
          <div className="discovery-hero__meta">
            <span>{lead.discount_pct ? `-${lead.discount_pct}%` : 'Fresh pick'}</span>
            <span>{lead.price_current === 0 ? 'Free now' : `$${Number(lead.price_current).toFixed(2)}`}</span>
            {formatCountdown(lead.sale_ends_at || lead.promo_ends_at) && (
              <span>{formatCountdown(lead.sale_ends_at || lead.promo_ends_at)}</span>
            )}
          </div>
        </div>
      </Link>

      <div className="discovery-hero__stack">
        {rest.map((item) => (
          <Link key={`${item.game_id}-${item.store}`} to={`/game/${item.game_id}`} className="discovery-hero__mini">
            <img src={item.header_image} alt={item.title} className="discovery-hero__mini-img" />
            <div className="discovery-hero__mini-copy">
              <div className="discovery-hero__mini-title">{item.title}</div>
              <div className="discovery-hero__mini-sub">{item.reason}</div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function StoreChips({ active, onChange }) {
  return (
    <div className="store-chip-row">
      {STORE_CHIPS.map((chip) => (
        <button
          key={chip.id}
          className={`store-chip${active === chip.id ? ' store-chip--active' : ''}`}
          onClick={() => onChange(chip.id)}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}

function SectionRail({ section }) {
  if (!section?.items?.length) return null;
  return (
    <section className="discovery-section">
      <div className="discovery-section__head">
        <div>
          <div className="section-label">{section.title}</div>
          <p className="discovery-section__sub">{section.subtitle}</p>
        </div>
      </div>
      <div className="discovery-rail">
        {section.items.map((deal, index) => (
          <DealCard
            key={`${section.id}-${deal.game_id}-${deal.store}`}
            deal={deal}
            style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
            compact
          />
        ))}
      </div>
    </section>
  );
}

function QuickPicks({ value, onChange }) {
  function cycleTag(tag) {
    const liked = new Set(value.likedTags);
    const disliked = new Set(value.dislikedTags);

    if (liked.has(tag)) {
      liked.delete(tag);
      disliked.add(tag);
    } else if (disliked.has(tag)) {
      disliked.delete(tag);
    } else {
      liked.add(tag);
    }

    const next = {
      likedTags: [...liked],
      dislikedTags: [...disliked],
    };
    saveQuickPicks(next);
    onChange(next);
  }

  return (
    <section className="taste-panel">
      <div className="section-label">Quick Picks</div>
      <h3>Teach the recommender your taste in under a minute</h3>
      <p>
        Tap once for games you want more of, twice for styles you want less of.
        Your library and playtime stay the main signal, this just helps the app find smarter surprises.
      </p>
      <div className="taste-panel__chips">
        {QUICK_PICK_TAGS.map((tag) => {
          const state = value.likedTags.includes(tag)
            ? 'liked'
            : value.dislikedTags.includes(tag)
              ? 'disliked'
              : 'neutral';
          return (
            <button
              key={tag}
              className={`taste-chip taste-chip--${state}`}
              onClick={() => cycleTag(tag)}
            >
              {state === 'liked' ? 'Like' : state === 'disliked' ? 'Pass' : 'Pick'} {tag}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function LibraryConnect({ user, epicStatus }) {
  return (
    <section className="library-hub">
      <div className="library-hub__copy">
        <div className="section-label">Connect Your Libraries</div>
        <h2>Turn VaultDeal into a personal game scout</h2>
        <p>
          Link Steam to import your library and playtime, then let the discovery engine focus on games you do not already own.
          Epic linking is staged next so the same homepage can absorb that data when the external setup is ready.
        </p>
        <div className="library-hub__actions">
          {user ? (
            <Link to="/steam" className="btn-primary">Open your Steam profile</Link>
          ) : (
            <a href="/api/auth/steam" className="btn-primary">Sign in with Steam</a>
          )}
          <Link to="/steam" className="btn-secondary">Use public Steam profile</Link>
        </div>
      </div>

      <div className="library-hub__cards">
        <div className="library-card library-card--steam">
          <div className="library-card__eyebrow">Live now</div>
          <div className="library-card__title">Steam</div>
          <div className="library-card__body">
            Library, playtime, recent activity, and review-aware recommendations are active now.
          </div>
        </div>
        <div className="library-card library-card--epic">
          <div className="library-card__eyebrow">{epicStatus?.state === 'coming_soon' ? 'Coming soon' : 'Planned'}</div>
          <div className="library-card__title">Epic Games</div>
          <div className="library-card__body">
            {epicStatus?.message || 'Epic account linking will join the same recommendation flow once credentials are configured.'}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function DealsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [storeView, setStoreView] = useState('all');
  const [deals, setDeals] = useState([]);
  const [meta, setMeta] = useState({ total: 0, page: 1, limit: 24 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [discovery, setDiscovery] = useState({ hero: [], sections: [] });
  const [discoveryLoading, setDiscoveryLoading] = useState(true);
  const [epicStatus, setEpicStatus] = useState(null);
  const [quickPicks, setQuickPicks] = useState(() => getQuickPicks());

  const authError = searchParams.get('auth_error');

  const fetchDiscovery = useCallback(async () => {
    setDiscoveryLoading(true);
    try {
      const seed = buildDiscoveryQuery();
      const result = await getDiscoveryHome(seed);
      setDiscovery(result);
    } catch {
      setDiscovery({ hero: [], sections: [] });
    } finally {
      setDiscoveryLoading(false);
    }
  }, []);

  const fetchDeals = useCallback(async (params, activeStore) => {
    setLoading(true);
    setError(null);
    try {
      const requestParams = { ...params };
      if (activeStore === 'steam' || activeStore === 'epic') requestParams.store = activeStore;
      if (activeStore === 'free') requestParams.freeOnly = true;
      const result = await getDeals(requestParams);
      setDeals(result.data);
      setMeta(result.meta);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDiscovery();
    getEpicAccountStatus().then(setEpicStatus).catch(() => setEpicStatus(null));
  }, [fetchDiscovery]);

  useEffect(() => {
    fetchDeals(filters, storeView);
  }, [filters, storeView, fetchDeals]);

  function handleFilterChange(partial) {
    setFilters((prev) => ({ ...prev, ...partial }));
  }

  function handleReset() {
    setFilters(DEFAULT_FILTERS);
    setStoreView('all');
  }

  const activeFilters = [
    storeView !== 'all' && { key: 'storeView', label: storeView === 'free' ? 'Free to claim' : `Store: ${storeView}` },
    filters.q && { key: 'q', label: `"${filters.q}"` },
    filters.genre && { key: 'genre', label: filters.genre },
    filters.minDiscount && { key: 'minDiscount', label: `${filters.minDiscount}%+ off` },
    filters.maxPrice && { key: 'maxPrice', label: `Under $${filters.maxPrice}` },
  ].filter(Boolean);

  const personalizedSections = discovery.sections.filter((section) =>
    ['recommended', 'because-you-played', 'hidden-gems'].includes(section.id)
  );
  const merchandisingSections = discovery.sections.filter((section) =>
    !['recommended', 'because-you-played', 'hidden-gems'].includes(section.id)
  );

  return (
    <div className="page discovery-page">
      {authError && (
        <div className="auth-banner">
          <strong>Steam sign-in did not finish.</strong> We kept the rest of the homepage available, and you can retry once deployment variables are aligned.
        </div>
      )}

      {discoveryLoading ? (
        <div className="deal-grid">
          {Array.from({ length: 6 }).map((_, index) => <SkeletonCard key={index} />)}
        </div>
      ) : (
        <>
          <DiscoveryHero items={discovery.hero} />
          <StoreChips active={storeView} onChange={(value) => { setStoreView(value); setFilters((prev) => ({ ...prev, page: 1 })); }} />
          <LibraryConnect user={user} epicStatus={epicStatus} />
          <QuickPicks value={quickPicks} onChange={(next) => { setQuickPicks(next); fetchDiscovery(); }} />
          {merchandisingSections.map((section) => <SectionRail key={section.id} section={section} />)}
          {personalizedSections.map((section) => <SectionRail key={section.id} section={section} />)}
        </>
      )}

      <section className="all-deals-shell">
        <div className="section-label">Browse everything</div>
        <h2 className="all-deals-shell__title">All current deals</h2>
        <p className="all-deals-shell__sub">
          Switch between official stores at the top, then use deeper filters here to narrow the field.
        </p>

        <FilterBar filters={filters} onChange={handleFilterChange} onReset={handleReset} />

        {activeFilters.length > 0 && (
          <div className="active-filters">
            {activeFilters.map((filter) => (
              <span key={filter.key} className="active-filter">
                {filter.label}
              </span>
            ))}
          </div>
        )}

        {loading && (
          <div className="deal-grid">
            {Array.from({ length: 12 }).map((_, index) => <SkeletonCard key={index} />)}
          </div>
        )}

        {!loading && error && (
          <div className="empty-state">
            <div className="empty-state__icon">!</div>
            <div className="empty-state__title">Failed to load deals</div>
            <div className="empty-state__sub">{error}</div>
          </div>
        )}

        {!loading && !error && deals.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__icon">?</div>
            <div className="empty-state__title">No deals matched</div>
            <div className="empty-state__sub">
              Try another store chip or reset the filters to widen the feed.
            </div>
          </div>
        )}

        {!loading && !error && deals.length > 0 && (
          <>
            <div className="deal-grid">
              {deals.map((deal, index) => (
                <DealCard
                  key={`${deal.game_id}-${deal.store}`}
                  deal={deal}
                  style={{ animationDelay: `${Math.min(index, 11) * 0.04}s` }}
                />
              ))}
            </div>
            <Pagination
              page={meta.page}
              total={meta.total}
              limit={meta.limit}
              onChange={(page) => handleFilterChange({ page })}
            />
          </>
        )}
      </section>
    </div>
  );
}
