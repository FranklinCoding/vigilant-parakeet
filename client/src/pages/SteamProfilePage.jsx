import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  resolveSteamUrl,
  getSteamProfile,
  getSteamLibrary,
  getSteamRecent,
  getSteamReplay,
  getDeals,
} from '../api';
import DealCard from '../components/DealCard';

// localStorage key for the anonymous (no-login) linked profile
const LS_ANON_KEY = 'vaultdeal_steam_profile';

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
        <img className="steam-game-row__icon" src={game.iconUrl} alt={game.name}
          onError={(e) => { e.currentTarget.style.display = 'none'; }} />
      ) : (
        <div className="steam-game-row__icon steam-game-row__icon--placeholder" />
      )}
      <span className="steam-game-row__name">{game.name}</span>
      <span className="steam-game-row__time">
        {fmtHours(game.playtimeMins ?? game.playtime2WeeksMins)}
      </span>
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

  if (loading) return <div className="spinner" style={{ width: 20, height: 20, margin: '8px 0' }} />;

  if (!data?.available) {
    return (
      <p className="steam-replay__unavail">
        {data?.message || 'Year in Review not available for this account.'}
      </p>
    );
  }

  const r = data.replay;
  const totalMinutes = r?.total_playtime_minutes || r?.stats?.total_playtime_minutes || null;
  const gamesPlayed = r?.total_games || r?.stats?.games_played || null;
  const topGame = r?.top_game?.game_name || r?.highlights?.[0]?.game_name || null;

  if (!totalMinutes && !gamesPlayed && !topGame) {
    return <p className="steam-replay__unavail">Year in Review data was returned but contains no summary stats yet.</p>;
  }

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
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SteamProfilePage() {
  const { user } = useAuth();

  // Determine which Steam ID to use: logged-in user takes priority
  const [anonProfile, setAnonProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_ANON_KEY)) || null; }
    catch { return null; }
  });

  const activeSteamId = user?.steamId || anonProfile?.steamId || null;
  const activePersonaName = user?.personaName || anonProfile?.personaName || null;
  const activeAvatarUrl = user?.avatarUrl || anonProfile?.avatarUrl || null;

  // Anonymous link form (only shown when not logged in)
  const [inputUrl, setInputUrl] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState(null);

  // Library + recently played
  const [library, setLibrary] = useState(null);
  const [libLoading, setLibLoading] = useState(false);
  const [recent, setRecent] = useState(null);
  const [recLoading, setRecLoading] = useState(false);
  const [recDeals, setRecDeals] = useState([]);

  const fetchData = useCallback(async (steamId) => {
    setLibLoading(true);
    setRecLoading(true);
    try {
      const [lib, rec] = await Promise.all([
        getSteamLibrary(steamId).catch(() => ({ games: [], limited: true })),
        getSteamRecent(steamId).catch(() => ({ games: [] })),
      ]);
      setLibrary(lib);
      setRecent(rec);

      if (!lib.limited && lib.games?.length) {
        getDeals({ sort: 'rating', limit: 6, minDiscount: 25 })
          .then((r) => setRecDeals(r.data || []))
          .catch(() => {});
      }
    } finally {
      setLibLoading(false);
      setRecLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSteamId) fetchData(activeSteamId);
  }, [activeSteamId, fetchData]);

  // ── Anonymous link handler ──────────────────────────────────────────────────
  async function handleLink(e) {
    e.preventDefault();
    if (!inputUrl.trim()) return;
    setResolving(true);
    setResolveError(null);
    try {
      const { steamId } = await resolveSteamUrl(inputUrl.trim());
      const playerData = await getSteamProfile(steamId).catch(() => ({ steamId, limited: true }));
      const newProfile = {
        steamId,
        profileUrl: inputUrl.trim(),
        personaName: playerData.personaName || `Steam User ${steamId}`,
        avatarUrl: playerData.avatarUrl || null,
        linkedAt: Date.now(),
      };
      localStorage.setItem(LS_ANON_KEY, JSON.stringify(newProfile));
      setAnonProfile(newProfile);
      setInputUrl('');
    } catch (err) {
      setResolveError(err.message);
    } finally {
      setResolving(false);
    }
  }

  function handleUnlink() {
    localStorage.removeItem(LS_ANON_KEY);
    setAnonProfile(null);
    setLibrary(null);
    setRecent(null);
    setRecDeals([]);
  }

  // ── Not linked and not logged in ───────────────────────────────────────────
  if (!activeSteamId) {
    return (
      <div className="page">
        <Link to="/" style={{ fontSize: 13, color: 'var(--text-muted)', display: 'inline-block', marginBottom: 20 }}>
          ← Back to deals
        </Link>
        <h1 className="page__title">Steam Profile</h1>

        {/* Preferred: log in */}
        <div className="steam-link-box" style={{ marginBottom: 20 }}>
          <p className="steam-link-box__intro">
            <strong>Sign in with Steam</strong> to automatically load your library,
            playtime, recently played games, and Year in Review data.
            No password stored — Steam handles all authentication.
          </p>
          <a href="/api/auth/steam">
            <img
              src="https://steamcommunity-a.akamaihd.net/public/images/signinthroughsteam/sits_01.png"
              alt="Sign in through Steam"
              style={{ height: 40, cursor: 'pointer' }}
            />
          </a>
        </div>

        {/* Alternative: paste URL (read-only, public profiles only) */}
        <div className="steam-link-box">
          <p className="steam-link-box__intro">
            Or paste your <strong>public</strong> Steam profile URL to view stats without logging in.
            Library and recently-played data requires your profile to be set to Public.
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
            <button className="btn-primary" type="submit" disabled={resolving || !inputUrl.trim()}>
              {resolving ? 'Resolving…' : 'Link Profile'}
            </button>
          </form>
          {resolveError && <p className="steam-link-box__error">{resolveError}</p>}
          <p className="steam-link-box__note">
            Your Steam ID is only stored in your browser — nothing is sent to our servers.
          </p>
        </div>
      </div>
    );
  }

  // ── Profile is loaded (logged-in OR anonymous link) ────────────────────────
  return (
    <div className="page">
      <Link to="/" style={{ fontSize: 13, color: 'var(--text-muted)', display: 'inline-block', marginBottom: 20 }}>
        ← Back to deals
      </Link>
      <h1 className="page__title">Steam Profile</h1>

      {/* Profile card */}
      <div className="steam-profile-card">
        {activeAvatarUrl && (
          <img className="steam-profile-card__avatar" src={activeAvatarUrl} alt={activePersonaName} />
        )}
        <div className="steam-profile-card__info">
          <div className="steam-profile-card__name">
            {activePersonaName}
            {user && <span className="owned-badge" style={{ background: 'var(--accent)' }}>Logged in</span>}
          </div>
          <div className="steam-profile-card__id">Steam ID: {activeSteamId}</div>
          {library && !library.limited && (
            <div className="steam-profile-card__stats">
              <span>{library.totalGames?.toLocaleString()} games</span>
              <span>·</span>
              <span>{fmtHours(library.totalPlaytimeMins)} total</span>
            </div>
          )}
        </div>
        {!user && anonProfile && (
          <button className="filters__btn" onClick={handleUnlink} style={{ marginLeft: 'auto' }}>
            Unlink
          </button>
        )}
      </div>

      {library?.limited && <div className="steam-notice">{library.message}</div>}
      {library?.note && <div className="steam-notice">{library.note}</div>}

      {/* Recently Played */}
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
        {!recLoading && !recent?.games?.length && (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {library?.limited
              ? 'Sign in with Steam or make your profile public to see recently played games.'
              : 'No games played in the last 2 weeks.'}
          </p>
        )}
      </div>

      {/* Top Games All-Time */}
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

      {/* Year in Review */}
      <div className="game-section">
        <div className="game-section__title">2025 Year in Review</div>
        <ReplaySection steamId={activeSteamId} year={2025} />
      </div>
      <div className="game-section">
        <div className="game-section__title">2024 Year in Review</div>
        <ReplaySection steamId={activeSteamId} year={2024} />
      </div>

      {/* Deal Recommendations */}
      {recDeals.length > 0 && (
        <div className="game-section">
          <div className="game-section__title">Deals You Might Like</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
            Highly-rated games currently on sale.
          </p>
          <div className="deal-grid">
            {recDeals.map((deal) => (
              <DealCard key={`${deal.game_id}-${deal.store}`} deal={deal} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
