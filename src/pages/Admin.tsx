import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { ErrorNote, StatusBadge, useLoad } from '../components/ui';
import { fmtDate, money } from '../format';

/** Admin home. TODO(auth): gate /admin behind an admin role (Supabase custom claim) — open in v1. */
export default function Admin() {
  const weeks = useLoad(() => api.weeks(), []);
  const nav = useNavigate();
  const [label, setLabel] = useState('Week 11 · Nov 6–7');
  const [startsOn, setStartsOn] = useState('2026-11-06');
  const [locksAt, setLocksAt] = useState('2026-11-06T19:00');
  const [fee, setFee] = useState('10');
  const [error, setError] = useState<string | null>(null);

  async function create(e: FormEvent) {
    e.preventDefault(); setError(null);
    try {
      const w = await api.createWeek({ label, startsOn, locksAt: locksAt ? new Date(locksAt).toISOString() : undefined, entryFeeCents: Math.round(Number(fee) * 100) });
      nav(`/admin/week/${w.id}`);
    } catch (err: any) { setError(err.message); }
  }

  async function reset() {
    if (!confirm('Reset ALL data back to the demo seed?')) return;
    await api.resetDemo(); localStorage.removeItem('pl:userId'); location.href = '/admin';
  }

  return (
    <div className="stack">
      <div className="row-between wrap">
        <h1 className="page-title">Commissioner's office</h1>
        <button className="btn btn-ghost" onClick={reset}>↺ Reset demo data</button>
      </div>
      <ErrorNote error={weeks.error} />
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Week</th><th>Status</th><th>Picks</th><th>Paid / entered</th><th>Pool</th><th>Payout</th><th /></tr></thead>
          <tbody>
            {weeks.data?.map((w) => (
              <tr key={w.id}>
                <td><b>{w.label}</b><br /><span className="muted">{fmtDate(w.startsOn)}</span></td>
                <td><StatusBadge status={w.status} /></td>
                <td>{w.itemCount}</td>
                <td>{w.pool.paidCount} / {w.pool.entrantCount}</td>
                <td className="gold strong">{money(w.pool.poolCents)}</td>
                <td>{w.payoutStatus}</td>
                <td><Link className="btn btn-sm btn-gold" to={`/admin/week/${w.id}`}>Manage</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="card form" onSubmit={create}>
        <h2 className="section-title">Create a week</h2>
        <div className="form-grid">
          <label>Label<input value={label} onChange={(e) => setLabel(e.target.value)} required /></label>
          <label>First game day<input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} required /></label>
          <label>Picks lock (kickoff)<input type="datetime-local" value={locksAt} onChange={(e) => setLocksAt(e.target.value)} /></label>
          <label>Entry fee ($)<input type="number" min={1} value={fee} onChange={(e) => setFee(e.target.value)} /></label>
        </div>
        <ErrorNote error={error} />
        <button className="btn btn-gold">Create week & build slate →</button>
      </form>
    </div>
  );
}
