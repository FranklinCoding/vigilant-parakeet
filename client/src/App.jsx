import { Routes, Route, NavLink } from 'react-router-dom';
import DealsPage from './pages/DealsPage';
import GamePage from './pages/GamePage';

export default function App() {
  return (
    <>
      <nav className="nav">
        <div className="container nav__inner">
          <NavLink to="/" className="nav__logo">VaultDeal</NavLink>
          <NavLink to="/" className={({ isActive }) => `nav__link${isActive ? ' active' : ''}`}>
            Deals
          </NavLink>
        </div>
      </nav>
      <main className="container">
        <Routes>
          <Route path="/" element={<DealsPage />} />
          <Route path="/game/:gameId" element={<GamePage />} />
        </Routes>
      </main>
    </>
  );
}
