import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WatchlistProvider, useWatchlist } from './context/WatchlistContext';
import { ToastProvider } from './context/ToastContext';
import DealsPage from './pages/DealsPage';
import GamePage from './pages/GamePage';
import SteamProfilePage from './pages/SteamProfilePage';
import AuthCallbackPage from './pages/AuthCallbackPage';

const SteamIcon = () => (
  <svg className="nav__steam-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.187.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.718L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.252 0-2.265-1.014-2.265-2.265z"/>
  </svg>
);

function WatchlistDrawer({ onClose }) {
  const { watchlist, toggle } = useWatchlist();

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      <div className="watchlist-overlay" onClick={onClose} />
      <div className="watchlist-drawer" role="dialog" aria-label="Watchlist">
        <div className="watchlist-drawer__header">
          <span className="watchlist-drawer__title">
            Watchlist
            {watchlist.length > 0 && (
              <span className="nav__watchlist-count" style={{ marginLeft: 10 }}>
                {watchlist.length}
              </span>
            )}
          </span>
          <button className="watchlist-drawer__close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="watchlist-drawer__body">
          {watchlist.length === 0 ? (
            <div className="watchlist-empty">
              <div className="watchlist-empty__icon">🔖</div>
              <div className="watchlist-empty__title">Nothing here yet</div>
              <div className="watchlist-empty__sub">
                Hover a deal card and click the bookmark icon to track games you want.
              </div>
            </div>
          ) : (
            watchlist.map((item) => (
              <Link
                key={item.game_id}
                to={`/game/${item.game_id}`}
                className="watchlist-item"
                onClick={onClose}
              >
                <img
                  className="watchlist-item__img"
                  src={item.header_image}
                  alt={item.title}
                  onError={(e) => { e.currentTarget.style.opacity = '0'; }}
                />
                <div className="watchlist-item__info">
                  <div className="watchlist-item__title">{item.title}</div>
                  <div className="watchlist-item__meta">
                    {item.price_current != null && (
                      <span className="watchlist-item__price">
                        ${Number(item.price_current).toFixed(2)}
                      </span>
                    )}
                    {item.discount_pct > 0 && (
                      <span className="watchlist-item__discount">-{item.discount_pct}%</span>
                    )}
                  </div>
                </div>
                <button
                  className="watchlist-item__remove"
                  title="Remove from watchlist"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggle(item);
                  }}
                >
                  ✕
                </button>
              </Link>
            ))
          )}
        </div>
      </div>
    </>
  );
}

function Nav({ onWatchlistOpen }) {
  const { user, logout } = useAuth();
  const { watchlist } = useWatchlist();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handler, { passive: true });
    return () => window.removeEventListener('scroll', handler);
  }, []);

  return (
    <nav className={`nav${scrolled ? ' nav--scrolled' : ''}`}>
      <div className="container nav__inner">
        <NavLink to="/" className="nav__logo">
          Vault<span>Deal</span>
        </NavLink>

        <NavLink
          to="/"
          end
          className={({ isActive }) => `nav__link${isActive ? ' active' : ''}`}
        >
          Deals
        </NavLink>

        <div className="nav__right">
          <button className="nav__watchlist-btn" onClick={onWatchlistOpen} aria-label="Open watchlist">
            🔖 Watchlist
            {watchlist.length > 0 && (
              <span className="nav__watchlist-count">{watchlist.length}</span>
            )}
          </button>

          {user ? (
            <>
              <NavLink
                to="/steam"
                className={({ isActive }) => `nav__user-link nav__link${isActive ? ' active' : ''}`}
              >
                {user.avatarUrl && (
                  <img src={user.avatarUrl} alt="" className="nav__avatar" />
                )}
                <span style={{ fontSize: 13, fontWeight: 500 }}>{user.personaName}</span>
              </NavLink>
              <button className="nav__link--btn" onClick={logout}>
                Sign out
              </button>
            </>
          ) : (
            <>
              <NavLink
                to="/steam"
                className={({ isActive }) => `nav__link${isActive ? ' active' : ''}`}
              >
                Profile
              </NavLink>
              <a href="/api/auth/steam" className="nav__steam-login">
                <SteamIcon />
                Sign in
              </a>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

function AppShell() {
  const [watchlistOpen, setWatchlistOpen] = useState(false);

  return (
    <>
      <Nav onWatchlistOpen={() => setWatchlistOpen(true)} />
      {watchlistOpen && <WatchlistDrawer onClose={() => setWatchlistOpen(false)} />}
      <main className="container">
        <Routes>
          <Route path="/" element={<DealsPage />} />
          <Route path="/game/:gameId" element={<GamePage />} />
          <Route path="/steam" element={<SteamProfilePage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
        </Routes>
      </main>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <WatchlistProvider>
        <ToastProvider>
          <AppShell />
        </ToastProvider>
      </WatchlistProvider>
    </AuthProvider>
  );
}
