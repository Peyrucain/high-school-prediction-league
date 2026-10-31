import { Link } from 'react-router-dom';
import { api } from '../api';
import { ErrorNote, StatusBadge, useLoad } from '../components/ui';
import { fmtDate, money, pts } from '../format';
import { useSession } from '../session';

export default function Home() {
  const { user } = useSession();
  const weeks = useLoad(() => api.weeks(), []);
  const season = useLoad(() => api.season(), []);
  const current = weeks.data?.find((w) => w.status !== 'final') ?? weeks.data?.[0];

  return (
    <div className="stack">
      <section className="hero">
        <div className="hero-kicker">Brentwood · Oakley · Antioch · Pittsburg · East Bay</div>
        <h1>Call the score.<br /><span className="gold">Don't go over.</span></h1>
        <p>One number per game. Closest without going over wins it. Most wins takes the whole pot.</p>
        {current && (
          <div className="hero-cta">
            <Link className="btn btn-gold btn-lg" to={user ? `/week/${current.id}` : `/join?next=/week/${current.id}`}>
              {current.status === 'open' ? `Make your ${current.label.split('·')[0].trim()} picks →` : `View ${current.label.split('·')[0].trim()} →`}
            </Link>
            <span className="hero-pool">Pot: <b>{money(current.pool.poolCents)}</b> · {current.pool.paidCount} in</span>
          </div>
        )}
      </section>

      <ErrorNote error={weeks.error} />
      <section>
        <h2 className="section-title">Weeks</h2>
        <div className="grid">
          {weeks.data?.map((w) => (
            <article key={w.id} className="card week-card">
              <div className="row-between">
                <h3>{w.label}</h3>
                <StatusBadge status={w.status} />
              </div>
              <p className="muted">{fmtDate(w.startsOn)} · {w.itemCount} picks</p>
              <div className="week-pool">
                <span className="big">{money(w.pool.poolCents)}</span>
                <span className="muted">{w.pool.paidCount} paid / {w.pool.entrantCount} entered · payout {w.payoutStatus}</span>
              </div>
              <div className="row gap">
                {w.status === 'open' && <Link className="btn btn-gold" to={`/week/${w.id}`}>Play</Link>}
                <Link className="btn" to={`/week/${w.id}/leaderboard`}>Leaderboard</Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">Season money list</h2>
        {season.data && season.data.length > 0 ? (
          <div className="card table-wrap">
            <table className="table">
              <thead><tr><th>#</th><th>Player</th><th>Won</th><th>Wks won</th><th>Played</th><th>Pts</th></tr></thead>
              <tbody>
                {season.data.map((r, i) => (
                  <tr key={r.userId} className={user?.id === r.userId ? 'me' : ''}>
                    <td>{i + 1}</td><td>{r.displayName}</td><td className="gold">{money(r.wonCents)}</td>
                    <td>{r.weeksWon}</td><td>{r.weeksPlayed}</td><td>{pts(r.points)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted">No finalized weeks yet.</p>}
      </section>

      <section className="card rules">
        <h2 className="section-title">How it works</h2>
        <ol>
          <li><b>$10 buys you in</b> for the week. Every dollar goes into that week's fixed prize pool.</li>
          <li><b>Predict one number</b> per item — a game total, one team's score, or a fact like Brentwood's high temp.</li>
          <li><b>Closest without going over</b> wins the item (1 point). Exact hits win first; identical picks split the point.</li>
          <li><b>Most points wins the pot.</b> Tiebreaks: more exact hits, then smallest total distance under. Still tied? Split it.</li>
          <li>Finals come from public box scores (MaxPreps) and weather records.</li>
        </ol>
      </section>
    </div>
  );
}
