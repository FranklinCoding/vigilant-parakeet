import { Routes, Route, NavLink } from 'react-router-dom';
import DealsPage from './pages/DealsPage';
import GamePage from './pages/GamePage';
import RecommendationsPage from './pages/RecommendationsPage';

export default function App() {
  return (
    <>
      <nav className="nav">
        <div className="container nav__inner">
          <NavLink to="/" className="nav__logo">VaultDeal</NavLink>
          <NavLink to="/" end className={({ isActive }) => `nav__link${isActive ? ' active' : ''}`}>
            Deals
          </NavLink>
          <NavLink to="/for-you" className={({ isActive }) => `nav__link${isActive ? ' active' : ''}`}>
            For You
          </NavLink>
        </div>
      </nav>
      <main className="container">
        <Routes>
          <Route path="/" element={<DealsPage />} />
          <Route path="/game/:gameId" element={<GamePage />} />
          <Route path="/for-you" element={<RecommendationsPage />} />
        </Routes>
      </main>
    </>
  );
}
