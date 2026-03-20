import { Routes, Route, NavLink } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import DealsPage from './pages/DealsPage';
import GamePage from './pages/GamePage';
import SteamProfilePage from './pages/SteamProfilePage';
import AuthCallbackPage from './pages/AuthCallbackPage';

function Nav() {
  const { user, logout } = useAuth();

  return (
    <nav className="nav">
      <div className="container nav__inner">
        <NavLink to="/" className="nav__logo">VaultDeal</NavLink>
        <NavLink to="/" end className={({ isActive }) => `nav__link${isActive ? ' active' : ''}`}>
          Deals
        </NavLink>

        {user ? (
          <>
            <NavLink to="/steam" className={({ isActive }) => `nav__link${isActive ? ' active' : ''}`}>
              {user.avatarUrl && (
                <img src={user.avatarUrl} alt="" className="nav__avatar" />
              )}
              {user.personaName}
            </NavLink>
            <button className="nav__link nav__link--btn" onClick={logout}>
              Sign out
            </button>
          </>
        ) : (
          <a
            href="/api/auth/steam"
            className="nav__steam-login"
            title="Sign in through Steam"
          >
            <img
              src="https://steamcommunity-a.akamaihd.net/public/images/signinthroughsteam/sits_01.png"
              alt="Sign in through Steam"
              className="nav__steam-btn"
            />
          </a>
        )}
      </div>
    </nav>
  );
}

function AppShell() {
  return (
    <>
      <Nav />
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
      <AppShell />
    </AuthProvider>
  );
}
