import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { useSession } from './session';
import Home from './pages/Home';
import Join from './pages/Join';
import Play from './pages/Play';
import LeaderboardPage from './pages/Leaderboard';
import Admin from './pages/Admin';
import AdminWeek from './pages/AdminWeek';

export default function App() {
  const { user, setUser } = useSession();
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-ball">🏈</span>
          <span>
            <b>FRIDAY NIGHT PICKS</b>
            <small>East Bay HS Prediction League</small>
          </span>
        </Link>
        <nav>
          <NavLink to="/" end>Weeks</NavLink>
          <NavLink to="/admin">Admin</NavLink>
          {user ? (
            <button className="chip" onClick={() => setUser(null)} title="Switch player">
              {user.displayName} ✕
            </button>
          ) : (
            <NavLink to="/join" className="chip chip-gold">Sign in</NavLink>
          )}
        </nav>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/join" element={<Join />} />
          <Route path="/week/:id" element={<Play />} />
          <Route path="/week/:id/leaderboard" element={<LeaderboardPage />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/admin/week/:id" element={<AdminWeek />} />
          <Route path="*" element={<p className="muted">Page not found. <Link to="/">Go home</Link></p>} />
        </Routes>
      </main>
      <footer className="foot">
        Skill contest · $10/week into a fixed prize pool · closest without going over wins · prototype (no real money)
      </footer>
    </div>
  );
}
