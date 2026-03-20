import { useState } from 'react';

// Comprehensive genre/subgenre list matching Steam's depth.
// Values that are official Steam genres (Action, Adventure, etc.) match
// the genres[] column directly. Sub-genre values match via the tags[]
// column once tags are populated by the sync job.
const GENRE_GROUPS = [
  {
    label: 'Action & Combat',
    options: [
      { value: 'Action', label: 'Action (All)' },
      { value: 'FPS', label: 'First-Person Shooter' },
      { value: 'Third-Person Shooter', label: 'Third-Person Shooter' },
      { value: 'Tactical Shooter', label: 'Tactical Shooter' },
      { value: 'Hero Shooter', label: 'Hero Shooter' },
      { value: 'Looter Shooter', label: 'Looter Shooter' },
      { value: 'Battle Royale', label: 'Battle Royale' },
      { value: 'Fighting', label: 'Fighting' },
      { value: 'Beat \'em Up', label: 'Beat \'em Up' },
      { value: 'Hack and Slash', label: 'Hack and Slash' },
      { value: 'Soulslike', label: 'Soulslike' },
      { value: 'Action Roguelike', label: 'Action Roguelike' },
      { value: 'Metroidvania', label: 'Metroidvania' },
      { value: 'Stealth', label: 'Stealth' },
      { value: 'Bullet Hell', label: 'Bullet Hell' },
      { value: 'Run and Gun', label: 'Run and Gun' },
      { value: 'Tower Defense', label: 'Tower Defense' },
    ],
  },
  {
    label: 'Adventure',
    options: [
      { value: 'Adventure', label: 'Adventure (All)' },
      { value: 'Point & Click', label: 'Point & Click' },
      { value: 'Walking Simulator', label: 'Walking Simulator' },
      { value: 'Narrative', label: 'Narrative' },
      { value: 'Interactive Fiction', label: 'Interactive Fiction' },
      { value: 'Visual Novel', label: 'Visual Novel' },
      { value: 'Mystery', label: 'Mystery / Detective' },
      { value: 'Horror', label: 'Horror (All)' },
      { value: 'Survival Horror', label: 'Survival Horror' },
      { value: 'Psychological Horror', label: 'Psychological Horror' },
      { value: 'Atmospheric', label: 'Atmospheric' },
      { value: 'Open World', label: 'Open World' },
      { value: 'Exploration', label: 'Exploration' },
      { value: 'Survival', label: 'Survival' },
    ],
  },
  {
    label: 'RPG',
    options: [
      { value: 'RPG', label: 'RPG (All)' },
      { value: 'Action RPG', label: 'Action RPG' },
      { value: 'JRPG', label: 'JRPG' },
      { value: 'Turn-Based RPG', label: 'Turn-Based RPG' },
      { value: 'Tactical RPG', label: 'Tactical RPG' },
      { value: 'CRPG', label: 'CRPG / Western RPG' },
      { value: 'Dungeon Crawler', label: 'Dungeon Crawler' },
      { value: 'Roguelike', label: 'Roguelike' },
      { value: 'Roguelite', label: 'Roguelite' },
      { value: 'Deckbuilder', label: 'Deckbuilder / Card Game' },
      { value: 'Massively Multiplayer', label: 'MMORPG' },
      { value: 'Immersive Sim', label: 'Immersive Sim' },
    ],
  },
  {
    label: 'Strategy',
    options: [
      { value: 'Strategy', label: 'Strategy (All)' },
      { value: 'Real-Time Strategy', label: 'Real-Time Strategy (RTS)' },
      { value: 'Turn-Based Strategy', label: 'Turn-Based Strategy (TBS)' },
      { value: '4X', label: '4X Strategy' },
      { value: 'Grand Strategy', label: 'Grand Strategy' },
      { value: 'City Builder', label: 'City Builder' },
      { value: 'Colony Sim', label: 'Colony Sim' },
      { value: 'Base Building', label: 'Base Building' },
      { value: 'Auto Battler', label: 'Auto Battler / Auto Chess' },
      { value: 'Wargame', label: 'Wargame' },
      { value: 'Tower Defense', label: 'Tower Defense' },
    ],
  },
  {
    label: 'Simulation',
    options: [
      { value: 'Simulation', label: 'Simulation (All)' },
      { value: 'Life Sim', label: 'Life Sim' },
      { value: 'Farming Sim', label: 'Farming / Agriculture' },
      { value: 'Space Sim', label: 'Space Sim' },
      { value: 'Flight Sim', label: 'Flight Sim' },
      { value: 'Driving Sim', label: 'Driving / Truck Sim' },
      { value: 'Management', label: 'Management' },
      { value: 'Sandbox', label: 'Sandbox' },
      { value: 'Business Sim', label: 'Business Sim' },
      { value: 'Dating Sim', label: 'Dating Sim' },
      { value: 'Fishing', label: 'Fishing' },
      { value: 'Crafting', label: 'Crafting' },
      { value: 'Physics Sim', label: 'Physics Sandbox' },
    ],
  },
  {
    label: 'Platformer & Puzzle',
    options: [
      { value: 'Platformer', label: 'Platformer (All)' },
      { value: '2D Platformer', label: '2D Platformer' },
      { value: '3D Platformer', label: '3D Platformer' },
      { value: 'Precision Platformer', label: 'Precision Platformer' },
      { value: 'Puzzle Platformer', label: 'Puzzle Platformer' },
      { value: 'Puzzle', label: 'Puzzle (All)' },
      { value: 'Logic Puzzle', label: 'Logic' },
      { value: 'Physics Puzzle', label: 'Physics Puzzle' },
      { value: 'Match 3', label: 'Match 3' },
      { value: 'Hidden Object', label: 'Hidden Object' },
      { value: 'Escape Room', label: 'Escape Room' },
      { value: 'Word Game', label: 'Word Game' },
    ],
  },
  {
    label: 'Sports & Racing',
    options: [
      { value: 'Sports', label: 'Sports (All)' },
      { value: 'Racing', label: 'Racing (All)' },
      { value: 'Soccer', label: 'Soccer / Football' },
      { value: 'Basketball', label: 'Basketball' },
      { value: 'American Football', label: 'American Football' },
      { value: 'Baseball', label: 'Baseball' },
      { value: 'Golf', label: 'Golf' },
      { value: 'Tennis', label: 'Tennis' },
      { value: 'Wrestling', label: 'Wrestling / MMA' },
      { value: 'Hockey', label: 'Hockey' },
      { value: 'Extreme Sports', label: 'Extreme Sports / Skateboarding' },
      { value: 'Arcade Racing', label: 'Arcade Racing' },
      { value: 'Simulation Racing', label: 'Racing Simulation' },
      { value: 'Karting', label: 'Karting' },
    ],
  },
  {
    label: 'Setting / Theme',
    options: [
      { value: 'Fantasy', label: 'Fantasy' },
      { value: 'Dark Fantasy', label: 'Dark Fantasy' },
      { value: 'Sci-Fi', label: 'Science Fiction' },
      { value: 'Cyberpunk', label: 'Cyberpunk' },
      { value: 'Post-Apocalyptic', label: 'Post-Apocalyptic' },
      { value: 'Dystopian', label: 'Dystopian' },
      { value: 'Historical', label: 'Historical' },
      { value: 'Steampunk', label: 'Steampunk' },
      { value: 'Lovecraftian', label: 'Lovecraftian / Cosmic Horror' },
      { value: 'Western', label: 'Western' },
      { value: 'Noir', label: 'Noir / Crime' },
      { value: 'Anime', label: 'Anime / Manga' },
      { value: 'Pixel Art', label: 'Pixel Art' },
      { value: 'Cartoon', label: 'Cartoon / Colorful' },
      { value: 'Medieval', label: 'Medieval' },
      { value: 'Space', label: 'Space' },
      { value: 'Underwater', label: 'Underwater' },
      { value: 'Zombies', label: 'Zombies' },
      { value: 'Vampires', label: 'Vampires' },
      { value: 'Mythology', label: 'Mythology' },
    ],
  },
  {
    label: 'Play Style',
    options: [
      { value: 'Indie', label: 'Indie' },
      { value: 'Casual', label: 'Casual' },
      { value: 'Free to Play', label: 'Free to Play' },
      { value: 'Early Access', label: 'Early Access' },
      { value: 'Co-op', label: 'Co-op' },
      { value: 'Local Multiplayer', label: 'Local Multiplayer' },
      { value: 'Multiplayer', label: 'Online Multiplayer' },
      { value: 'VR', label: 'VR / Virtual Reality' },
      { value: 'Asymmetric Multiplayer', label: 'Asymmetric Multiplayer' },
      { value: 'Couch Co-op', label: 'Couch Co-op' },
      { value: 'PvP', label: 'PvP' },
      { value: 'PvE', label: 'PvE' },
      { value: 'Singleplayer', label: 'Singleplayer' },
    ],
  },
];

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
        onBlur={() => {
          if (search !== filters.q) onChange({ q: search, page: 1 });
        }}
      />

      <select
        className="filters__select filters__select--genre"
        value={filters.genre || ''}
        onChange={(e) => onChange({ genre: e.target.value, page: 1 })}
      >
        <option value="">All genres</option>
        {GENRE_GROUPS.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <select
        className="filters__select"
        value={filters.minDiscount || ''}
        onChange={(e) => onChange({ minDiscount: e.target.value, page: 1 })}
      >
        <option value="">Any discount</option>
        <option value="10">10%+ off</option>
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
        <option value="1">Under $1</option>
        <option value="5">Under $5</option>
        <option value="10">Under $10</option>
        <option value="20">Under $20</option>
        <option value="40">Under $40</option>
      </select>

      <select
        className="filters__select"
        value={filters.sort || 'discount'}
        onChange={(e) => onChange({ sort: e.target.value, page: 1 })}
      >
        <option value="discount">Best discount</option>
        <option value="price">Lowest price</option>
        <option value="title">A–Z</option>
        <option value="rating">Best reviewed</option>
      </select>

      <button className="filters__btn" onClick={onReset}>
        Reset
      </button>
    </div>
  );
}
