import { Routes, Route, NavLink } from 'react-router-dom';
import DealsPage from './pages/DealsPage';
import GamePage from './pages/GamePage';
import SteamProfilePage from './pages/SteamProfilePage';

// Check if a Steam profile is linked to show a visual indicator
function SteamNavLink() {
  let isLinked = false;
  try {
    isLinked = !!localStorage.getItem('vaultdeal_steam_profile');
  } catch {}

  return (
    <NavLink
      to="/steam"
      className={({ isActive }) => `nav__link${isActive ? ' active' : ''}`}
    >
      Steam Profile{isLinked && <span className="nav__steam-dot" title="Profile linked" />}
    </NavLink>
  );
}

export default function App() {
  return (
    <>
      <nav className="nav">
        <div className="container nav__inner">
          <NavLink to="/" className="nav__logo">VaultDeal</NavLink>
          <NavLink to="/" end className={({ isActive }) => `nav__link${isActive ? ' active' : ''}`}>
            Deals
          </NavLink>
          <SteamNavLink />
        </div>
      </nav>
      <main className="container">
        <Routes>
          <Route path="/" element={<DealsPage />} />
          <Route path="/game/:gameId" element={<GamePage />} />
          <Route path="/steam" element={<SteamProfilePage />} />
        </Routes>
      </main>
    </>
  );
}
