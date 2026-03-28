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

const LS_ANON_KEY = 'vaultdeal_steam_profile';

const SteamIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.187.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.718L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.252 0-2.265-1.014-2.265-2.265z"/>
  </svg>
);

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
        <img
          className="steam-game-row__icon"
          src={game.iconUrl}
          alt={game.name}
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
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

  if (loading) {
    return <div className="spinner" style={{ width: 24, height: 24, margin: '10px 0', borderWidth: 2 }} />;
  }

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
    return (
      <p className="steam-replay__unavail">
        Year in Review data was returned but contains no summary stats yet.
      </p>
    );
  }

  return (
    <div className="steam-replay__grid">
      {totalMinutes != null && (
        <div className="stat-box">
          <div className="stat-box__label">{year} Total Playtime</div>
          <div className="stat-box__value" style={{ color: 'var(--accent)' }}>
            {fmtHours(totalMinutes)}
          </div>
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
          <div className="stat-box__value" style={{ fontSize: 16, lineHeight: 1.3 }}>{topGame}</div>
        </div>
      )}
    </div>
  );
}

export default function SteamProfilePage() {
  const { user } = useAuth();

  const [anonProfile, setAnonProfile] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS_ANON_KEY)) || null; }
    catch { return null; }
  });

  const activeSteamId = user?.steamId || anonProfile?.steamId || null;
  const activePersonaName = user?.personaName || anonProfile?.personaName || null;
  const activeAvatarUrl = user?.avatarUrl || anonProfile?.avatarUrl || null;

  const [inputUrl, setInputUrl] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState(null);

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
      localStorage.setItem(`vaultdeal_library_${steamId}`, JSON.stringify(lib));
      localStorage.setItem(`vaultdeal_recent_${steamId}`, JSON.stringify(rec));

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

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!activeSteamId) {
    return (
      <div className="page">
        <Link to="/" className="back-link">← Back to deals</Link>
        <h1 className="page__title">Steam Profile</h1>

        <div className="steam-connect-split">
          {/* Login option */}
          <div className="steam-link-box">
            <div className="steam-link-box__title">Sign in with Steam</div>
            <p className="steam-link-box__intro">
              Automatically load your library, playtime, recently played games,
              and Year in Review. No password stored — Steam handles all authentication.
            </p>
            <a href="/api/auth/steam" className="btn-steam">
              <SteamIcon className="btn-steam__icon" />
              Sign in with Steam
            </a>
          </div>

          <div className="steam-divider">or</div>

          {/* Anonymous link option */}
          <div className="steam-link-box">
            <div className="steam-link-box__title">Link Public Profile</div>
            <p className="steam-link-box__intro">
              Paste your <strong>public</strong> Steam profile URL to view stats without logging in.
              Library data requires your profile to be set to Public.
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
                {resolving ? 'Resolving…' : 'Link'}
              </button>
            </form>
            {resolveError && <p className="steam-link-box__error">{resolveError}</p>}
            <p className="steam-link-box__note">
              Your Steam ID is only stored in your browser — nothing sent to our servers.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Profile loaded ─────────────────────────────────────────────────────────
  return (
    <div className="page">
      <Link to="/" className="back-link">← Back to deals</Link>

      {/* Profile card */}
      <div className="steam-profile-card">
        {activeAvatarUrl && (
          <img
            className="steam-profile-card__avatar"
            src={activeAvatarUrl}
            alt={activePersonaName}
          />
        )}
        <div className="steam-profile-card__info">
          <div className="steam-profile-card__name">
            {activePersonaName}
            {user && (
              <span className="owned-badge badge--accent" style={{ fontSize: 9 }}>
                Logged in
              </span>
            )}
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
        <div className="game-section__title">Recently Played — Last 2 Weeks</div>
        {recLoading && (
          <div className="spinner" style={{ width: 24, height: 24, margin: '12px 0', borderWidth: 2 }} />
        )}
        {!recLoading && recent?.games?.length > 0 && (
          <div className="steam-game-list">
            {recent.games.map((g) => (
              <GameRow key={g.appId} game={{ ...g, playtimeMins: g.playtime2WeeksMins }} />
            ))}
          </div>
        )}
        {!recLoading && !recent?.games?.length && (
          <p className="steam-replay__unavail">
            {library?.limited
              ? 'Sign in with Steam or make your profile public to see recently played games.'
              : 'No games played in the last 2 weeks.'}
          </p>
        )}
      </div>

      {/* Top Games */}
      {!library?.limited && library?.games?.length > 0 && (
        <div className="game-section">
          <div className="game-section__title">Top Games by All-Time Playtime</div>
          {libLoading ? (
            <div className="spinner" style={{ width: 24, height: 24, margin: '12px 0', borderWidth: 2 }} />
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
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            Highly-rated games currently on sale.
          </p>
          <div className="deal-grid">
            {recDeals.map((deal, i) => (
              <DealCard
                key={`${deal.game_id}-${deal.store}`}
                deal={deal}
                style={{ animationDelay: `${i * 0.05}s` }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
