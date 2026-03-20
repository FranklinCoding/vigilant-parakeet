import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  resolveSteamUrl,
  getSteamProfile,
  getSteamLibrary,
  getSteamRecent,
  getSteamReplay,
  getDeals,
} from '../api';
import DealCard from '../components/DealCard';

const LS_KEY = 'vaultdeal_steam_profile';

function fmtHours(mins) {
  if (!mins) return '0h';
  const h = Math.round(mins / 60);
  if (h < 1) return `${mins}m`;
  return h >= 1000 ? `${(h / 1000).toFixed(1)}k h` : `${h}h`;
}

function GameRow({ game }) {
  return (
    <div className="steam-game-row">
      {game.iconUrl ? (
        <img className="steam-game-row__icon" src={game.iconUrl} alt={game.name} />
      ) : (
        <div className="steam-game-row__icon steam-game-row__icon--placeholder" />
      )}
      <span className="steam-game-row__name">{game.name}</span>
      <span className="steam-game-row__time">{fmtHours(game.playtimeMins ?? game.playtime2WeeksMins)}</span>
    </div>
  );
}

function ReplaySection({ steamId, year }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getSteamReplay(steamId, year)
      .then(setData)
      .catch(() => setData({ available: false }))
      .finally(() => setLoading(false));
  }, [steamId, year]);

  if (loading) return <div className="spinner" style={{ width: 20, height: 20, margin: '8px auto' }} />;

  if (!data?.available) {
    return (
      <p className="steam-replay__unavail">
        {data?.message || 'Year in Review not available for this account.'}
      </p>
    );
  }

  const r = data.replay;

  // Steam Replay response shape varies — surface what we can
  const totalMinutes =
    r?.total_playtime_minutes ||
    r?.stats?.total_playtime_minutes ||
    null;

  const gamesPlayed =
    r?.total_games ||
    r?.stats?.games_played ||
    null;

  const topGame =
    r?.top_game?.game_name ||
    r?.highlights?.[0]?.game_name ||
    null;

  return (
    <div className="steam-replay__grid">
      {totalMinutes != null && (
        <div className="stat-box">
          <div className="stat-box__label">{year} Total Playtime</div>
          <div className="stat-box__value">{fmtHours(totalMinutes)}</div>
        </div>
      )}
      {gamesPlayed != null && (
        <div className="stat-box">
          <div className="stat-box__label">Games Played</div>
          <div className="stat-box__value">{gamesPlayed}</div>
        </div>
      )}
      {topGame && (
        <div className="stat-box">
          <div className="stat-box__label">Most Played</div>
          <div className="stat-box__value" style={{ fontSize: 14 }}>{topGame}</div>
        </div>
      )}
      {!totalMinutes && !gamesPlayed && !topGame && (
        <p className="steam-replay__unavail">
          Year in Review data was returned but no summary stats were found.
          Your replay may still be processing.
        </p>
      )}
    </div>
  );
}

export default function SteamProfilePage() {
  const [inputUrl, setInputUrl] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState(null);

  // Persisted profile state
  const [profile, setProfile] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY)) || null;
    } catch {
      return null;
    }
  });

  const [library, setLibrary] = useState(null);
  const [libLoading, setLibLoading] = useState(false);
  const [recent, setRecent] = useState(null);
  const [recLoading, setRecLoading] = useState(false);

  // Deals matching top library genres
  const [recDeals, setRecDeals] = useState([]);
  const [recDealsLoading, setRecDealsLoading] = useState(false);

  // Fetch secondary data when profile is linked
  const fetchLibraryData = useCallback(async (steamId) => {
    setLibLoading(true);
    setRecLoading(true);
    try {
      const [lib, rec] = await Promise.all([
        getSteamLibrary(steamId).catch(() => ({ games: [], limited: true })),
        getSteamRecent(steamId).catch(() => ({ games: [] })),
      ]);
      setLibrary(lib);
      setRecent(rec);

      // Fetch deals based on the user's most-played genre
      // (simple heuristic: pick the most common playtime-weighted genre we know)
      const knownGenres = ['Action', 'RPG', 'Adventure', 'Strategy', 'Simulation', 'Indie', 'Sports', 'Racing'];
      if (!lib.limited && lib.games?.length) {
        // Use first high-playtime game's name to guess genre — in practice
        // this would cross-reference our DB. For now, show popular deals.
        setRecDealsLoading(true);
        getDeals({ sort: 'rating', limit: 6, minDiscount: 25 })
          .then((r) => setRecDeals(r.data || []))
          .catch(() => {})
          .finally(() => setRecDealsLoading(false));
      }
    } finally {
      setLibLoading(false);
      setRecLoading(false);
    }
  }, []);

  useEffect(() => {
    if (profile?.steamId) {
      fetchLibraryData(profile.steamId);
    }
  }, [profile?.steamId, fetchLibraryData]);

  async function handleLink(e) {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    setResolving(true);
    setResolveError(null);
    try {
      const { steamId } = await resolveSteamUrl(inputUrl.trim());

      // Fetch player summary
      const playerData = await getSteamProfile(steamId).catch(() => ({
        steamId,
        limited: true,
      }));

      const newProfile = {
        steamId,
        profileUrl: inputUrl.trim(),
        personaName: playerData.personaName || `Steam User ${steamId}`,
        avatarUrl: playerData.avatarUrl || null,
        isPublic: playerData.isPublic ?? null,
        linkedAt: Date.now(),
      };

      localStorage.setItem(LS_KEY, JSON.stringify(newProfile));
      setProfile(newProfile);
      setInputUrl('');
    } catch (err) {
      setResolveError(err.message);
    } finally {
      setResolving(false);
    }
  }

  function handleUnlink() {
    localStorage.removeItem(LS_KEY);
    setProfile(null);
    setLibrary(null);
    setRecent(null);
    setRecDeals([]);
  }

  return (
    <div className="page">
      <Link
        to="/"
        style={{ fontSize: 13, color: 'var(--text-muted)', display: 'inline-block', marginBottom: 20 }}
      >
        ← Back to deals
      </Link>

      <h1 className="page__title">Steam Profile</h1>

      {/* ── Link / Unlink ─────────────────────────────────────── */}
      {!profile ? (
        <div className="steam-link-box">
          <p className="steam-link-box__intro">
            Link your public Steam profile to see your playtime stats, recently
            played games, Year in Review highlights, and personalised deal
            recommendations. No login required — just paste your profile URL.
          </p>
          <form className="steam-link-box__form" onSubmit={handleLink}>
            <input
              className="filters__input steam-link-box__input"
              type="url"
              placeholder="https://steamcommunity.com/id/yourname"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              disabled={resolving}
            />
            <button
              className="btn-primary"
              type="submit"
              disabled={resolving || !inputUrl.trim()}
            >
              {resolving ? 'Resolving…' : 'Link Profile'}
            </button>
          </form>
          {resolveError && (
            <p className="steam-link-box__error">{resolveError}</p>
          )}
          <p className="steam-link-box__note">
            Your profile must be set to <strong>Public</strong> in Steam Privacy
            Settings. Your Steam ID is stored locally in your browser only.
          </p>
        </div>
      ) : (
        <>
          {/* ── Profile card ──────────────────────────────────── */}
          <div className="steam-profile-card">
            {profile.avatarUrl && (
              <img
                className="steam-profile-card__avatar"
                src={profile.avatarUrl}
                alt={profile.personaName}
              />
            )}
            <div className="steam-profile-card__info">
              <div className="steam-profile-card__name">{profile.personaName}</div>
              <div className="steam-profile-card__id">Steam ID: {profile.steamId}</div>
              {library && !library.limited && (
                <div className="steam-profile-card__stats">
                  <span>{library.totalGames?.toLocaleString()} games</span>
                  <span>·</span>
                  <span>{fmtHours(library.totalPlaytimeMins)} total</span>
                </div>
              )}
            </div>
            <button className="filters__btn" onClick={handleUnlink} style={{ marginLeft: 'auto' }}>
              Unlink
            </button>
          </div>

          {/* ── Library notice if limited ─────────────────────── */}
          {library?.limited && (
            <div className="steam-notice">
              {library.message}
            </div>
          )}

          {/* ── Recently Played ───────────────────────────────── */}
          <div className="game-section">
            <div className="game-section__title">Recently Played (Last 2 Weeks)</div>
            {recLoading && <div className="spinner" style={{ width: 20, height: 20, margin: '12px 0' }} />}
            {!recLoading && recent?.games?.length > 0 && (
              <div className="steam-game-list">
                {recent.games.map((g) => (
                  <GameRow key={g.appId} game={{ ...g, playtimeMins: g.playtime2WeeksMins }} />
                ))}
              </div>
            )}
            {!recLoading && !recent?.games?.length && !library?.limited && (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No games played in the last 2 weeks.</p>
            )}
          </div>

          {/* ── Top Games All-Time ────────────────────────────── */}
          {!library?.limited && library?.games?.length > 0 && (
            <div className="game-section">
              <div className="game-section__title">Top Games by All-Time Playtime</div>
              {libLoading ? (
                <div className="spinner" style={{ width: 20, height: 20, margin: '12px 0' }} />
              ) : (
                <div className="steam-game-list">
                  {library.games.slice(0, 10).map((g) => (
                    <GameRow key={g.appId} game={g} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Year in Review ────────────────────────────────── */}
          <div className="game-section">
            <div className="game-section__title">2025 Year in Review</div>
            <ReplaySection steamId={profile.steamId} year={2025} />
          </div>

          <div className="game-section">
            <div className="game-section__title">2024 Year in Review</div>
            <ReplaySection steamId={profile.steamId} year={2024} />
          </div>

          {/* ── Deal Recommendations ──────────────────────────── */}
          {recDeals.length > 0 && (
            <div className="game-section">
              <div className="game-section__title">Deals You Might Like</div>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
                Highly-rated games currently on sale.
              </p>
              {recDealsLoading ? (
                <div className="spinner" />
              ) : (
                <div className="deal-grid">
                  {recDeals.map((deal) => (
                    <DealCard key={`${deal.game_id}-${deal.store}`} deal={deal} />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
