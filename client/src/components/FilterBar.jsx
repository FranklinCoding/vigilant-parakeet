import { useState } from 'react';

const GENRES = ['Action', 'Adventure', 'RPG', 'Strategy', 'Simulation', 'Sports', 'Racing', 'Indie'];

export default function FilterBar({ filters, onChange, onReset }) {
  const [search, setSearch] = useState(filters.q || '');

  function handleSearchKey(e) {
    if (e.key === 'Enter') onChange({ q: search, page: 1 });
  }

  return (
    <div className="filters">
      <input
        className="filters__input"
        type="search"
        placeholder="Search games…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onKeyDown={handleSearchKey}
        onBlur={() => { if (search !== filters.q) onChange({ q: search, page: 1 }); }}
      />

      <select
        className="filters__select"
        value={filters.genre || ''}
        onChange={(e) => onChange({ genre: e.target.value, page: 1 })}
      >
        <option value="">All genres</option>
        {GENRES.map((g) => (
          <option key={g} value={g}>{g}</option>
        ))}
      </select>

      <select
        className="filters__select"
        value={filters.minDiscount || ''}
        onChange={(e) => onChange({ minDiscount: e.target.value, page: 1 })}
      >
        <option value="">Any discount</option>
        <option value="25">25%+ off</option>
        <option value="50">50%+ off</option>
        <option value="75">75%+ off</option>
        <option value="90">90%+ off</option>
      </select>

      <select
        className="filters__select"
        value={filters.maxPrice || ''}
        onChange={(e) => onChange({ maxPrice: e.target.value, page: 1 })}
      >
        <option value="">Any price</option>
        <option value="5">Under $5</option>
        <option value="10">Under $10</option>
        <option value="20">Under $20</option>
      </select>

      <select
        className="filters__select"
        value={filters.sort || 'discount'}
        onChange={(e) => onChange({ sort: e.target.value, page: 1 })}
      >
        <option value="discount">Best discount</option>
        <option value="price">Lowest price</option>
        <option value="title">A–Z</option>
      </select>

      <button className="filters__btn" onClick={onReset}>Reset</button>
    </div>
  );
}
