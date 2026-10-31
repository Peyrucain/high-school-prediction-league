import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ItemMetric, SlateItem } from '../../shared/types';
import { api } from '../api';
import { ErrorNote, FinalLine, Matchup, PoolCard, StatusBadge, useLoad } from '../components/ui';
import { money } from '../format';

const TEAMS = [
  'Liberty Lions', 'Heritage Patriots', 'Freedom Falcons', 'Deer Valley Wolverines', 'Antioch Panthers', 'Pittsburg Pirates',
  'Clayton Valley Ugly Eagles', 'De La Salle Spartans', 'Concord Minutemen', 'Northgate Broncos', 'Campolindo Cougars',
  'Acalanes Dons', 'Miramonte Matadors', 'California Grizzlies', 'Monte Vista Mustangs', 'San Ramon Valley Wolves',
  'Dublin Gaels', 'Foothill Falcons', 'Amador Valley Dons', 'Granada Matadors', 'Pinole Valley Spartans', 'Moreau Catholic Mariners',
];

type Raw = { homeScore: string; awayScore: string; value: string };

export default function AdminWeek() {
  const id = Number(useParams().id);
  const detail = useLoad(() => api.week(id), [id]);
  const lb = useLoad(() => api.leaderboard(id), [id]);
  const providers = useLoad(() => api.providers(), []);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [raw, setRaw] = useState<Record<number, Raw>>({});

  useEffect(() => {
    const r: Record<number, Raw> = {};
    for (const i of detail.data?.items ?? []) {
      r[i.id] = { homeScore: i.homeScore?.toString() ?? '', awayScore: i.awayScore?.toString() ?? '', value: i.kind === 'fact' ? i.finalValue?.toString() ?? '' : '' };
    }
    setRaw(r);
  }, [detail.data]);

  const act = (fn: () => Promise<unknown>, ok?: string) => async () => {
    setBusy(true); setError(null); setMsg(null);
    try { await fn(); await Promise.all([detail.reload(), lb.reload()]); if (ok) setMsg(ok); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  if (!detail.data) return <ErrorNote error={detail.error} />;
  const { week, items, entries, pool } = detail.data;
  const open = week.status === 'open';
  const final = week.status === 'final';
  const settled = items.filter((i) => i.finalValue !== null).length;
  const winners = lb.data?.standings.filter((r) => r.isWinner) ?? [];
  const predCount = new Map<number, number>();
  for (const r of lb.data?.results ?? []) for (const [eid, pe] of Object.entries(r.perEntry)) if (pe.value !== null || open) predCount.set(Number(eid), (predCount.get(Number(eid)) ?? 0) + 1);

  return (
    <div className="stack">
      <div className="row-between wrap">
        <div>
          <Link to="/admin" className="muted">← All weeks</Link>
          <h1 className="page-title">{week.label}</h1>
          <StatusBadge status={week.status} />
        </div>
        <div className="row gap wrap">
          <Link className="btn" to={`/week/${id}`}>Player view</Link>
          <Link className="btn" to={`/week/${id}/leaderboard`}>Leaderboard</Link>
        </div>
      </div>

      {msg && <div className="success">{msg}</div>}
      <ErrorNote error={error} />

      {/* ---------------- 1. Slate */}
      <section className="card">
        <div className="row-between">
          <h2 className="section-title">1 · Slate ({items.length})</h2>
          {week.status === 'open' && items.length > 0 && (
            <button className="btn btn-sm" disabled={busy} onClick={act(() => api.updateWeek(id, { status: 'locked' }), 'Slate locked — picks closed.')}>🔒 Lock picks</button>
          )}
          {week.status === 'locked' && (
            <button className="btn btn-sm btn-ghost" disabled={busy} onClick={act(() => api.updateWeek(id, { status: 'open' }), 'Reopened for picks.')}>Reopen picks</button>
          )}
        </div>
        <ul className="slate-list">
          {items.map((i) => (
            <li key={i.id}>
              <div>
                <Matchup item={i} />
                <span className="muted">{i.targetLabel}{i.sourceRef ? ` · ${i.sourceRef}` : ''}</span>
              </div>
              {open && <button className="btn btn-sm btn-ghost" disabled={busy} onClick={act(() => api.deleteItem(i.id))}>Remove</button>}
            </li>
          ))}
        </ul>
        {open && <AddItem weekId={id} onAdded={() => { detail.reload(); lb.reload(); }} />}
      </section>

      {/* ---------------- 2. Finals */}
      <section className="card">
        <div className="row-between wrap">
          <h2 className="section-title">2 · Finals ({settled}/{items.length})</h2>
          {!final && (
            <div className="row gap wrap">
              {providers.data?.map((p) => (
                <button key={p.id} className={`btn btn-sm ${p.id === 'sample' ? 'btn-gold' : 'btn-ghost'}`} disabled={busy}
                  onClick={act(() => api.loadResults(id, p.id), `Loaded finals from ${p.label}. Review, then finalize.`)}>
                  {p.id === 'sample' ? '⚡ Load sample finals' : `Fetch: ${p.label}`}
                </button>
              ))}
            </div>
          )}
        </div>
        <p className="fineprint">Loading or saving finals locks the slate. The settled number is derived from each item's metric (total / one team / value).</p>
        <div className="finals">
          {items.map((i) => <FinalRow key={i.id} item={i} raw={raw[i.id]} disabled={final} onChange={(r) => setRaw((s) => ({ ...s, [i.id]: r }))} />)}
        </div>
        {!final && (
          <div className="row gap wrap">
            <button className="btn" disabled={busy} onClick={act(() => api.saveResults(id, items.map((i) => ({ itemId: i.id, ...raw[i.id] }))), 'Finals saved.')}>Save finals</button>
            <button className="btn btn-gold" disabled={busy || settled < items.length || items.length === 0}
              onClick={act(() => api.finalize(id), 'Week finalized! Standings are official.')}>🏁 Finalize & score week</button>
          </div>
        )}
      </section>

      {/* ---------------- 3. Pool & payout */}
      <section className="card">
        <h2 className="section-title">3 · Prize pool & payout</h2>
        <PoolCard pool={pool} winners={final ? winners.map((w) => ({ name: w.displayName, cents: w.payoutCents })) : undefined} />
        {final && week.payoutStatus === 'pending' && (
          <button className="btn btn-gold" disabled={busy || winners.length === 0}
            onClick={act(() => api.payout(id), 'Payout recorded.')}>💸 Mark {money(pool.poolCents)} paid to {winners.map((w) => w.displayName).join(' & ')}</button>
        )}
        {week.payoutStatus === 'paid' && <p className="ok">Paid out {week.payoutPaidAt ? new Date(week.payoutPaidAt).toLocaleString() : ''}.</p>}

        <h3 className="sub">Entrants</h3>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Player</th><th>Paid</th><th>Ref</th><th>Picks</th></tr></thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.displayName}</td>
                  <td className={e.paid ? 'ok' : 'bust'}>{e.paid ? '✓ ' + money(week.entryFeeCents) : 'unpaid'}</td>
                  <td className="muted">{e.paymentRef ?? '—'}</td>
                  <td>{e.paid ? (open ? 'hidden' : `${predCount.get(e.id) ?? 0}/${items.length}`) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FinalRow({ item, raw, disabled, onChange }: { item: SlateItem; raw?: Raw; disabled: boolean; onChange: (r: Raw) => void }) {
  const r = raw ?? { homeScore: '', awayScore: '', value: '' };
  return (
    <div className="final-row">
      <div className="final-label">
        <b>{item.title}</b>
        <span className="muted">{item.targetLabel}</span>
        <FinalLine item={item} />
      </div>
      {item.kind === 'game' ? (
        <div className="score-inputs">
          <label>{item.awayTeam}<input type="number" min={0} disabled={disabled} value={r.awayScore} onChange={(e) => onChange({ ...r, awayScore: e.target.value })} /></label>
          <label>{item.homeTeam}<input type="number" min={0} disabled={disabled} value={r.homeScore} onChange={(e) => onChange({ ...r, homeScore: e.target.value })} /></label>
        </div>
      ) : (
        <div className="score-inputs">
          <label>Value {item.unit ? `(${item.unit})` : ''}<input type="number" step="any" disabled={disabled} value={r.value} onChange={(e) => onChange({ ...r, value: e.target.value })} /></label>
        </div>
      )}
    </div>
  );
}

function AddItem({ weekId, onAdded }: { weekId: number; onAdded: () => void }) {
  const [kind, setKind] = useState<'game' | 'fact'>('game');
  const [awayTeam, setAway] = useState('');
  const [homeTeam, setHome] = useState('');
  const [metric, setMetric] = useState<ItemMetric>('total');
  const [title, setTitle] = useState('');
  const [targetLabel, setTarget] = useState('');
  const [unit, setUnit] = useState('');
  const [sourceRef, setSourceRef] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    try {
      await api.addItem(weekId, { kind, homeTeam, awayTeam, metric: kind === 'fact' ? 'value' : metric, title, targetLabel, unit: unit || (kind === 'fact' ? '°F' : ''), sourceRef });
      setAway(''); setHome(''); setTitle(''); setTarget(''); setSourceRef('');
      onAdded();
    } catch (err: any) { setError(err.message); }
  }

  const shortName = (t: string) => t.split(' ')[0] || '…';
  return (
    <form className="add-item form" onSubmit={submit}>
      <div className="seg">
        <button type="button" className={kind === 'game' ? 'on' : ''} onClick={() => setKind('game')}>🏈 Game</button>
        <button type="button" className={kind === 'fact' ? 'on' : ''} onClick={() => { setKind('fact'); setUnit('°F'); }}>🌡️ Fact</button>
      </div>
      <datalist id="teams">{TEAMS.map((t) => <option key={t} value={t} />)}</datalist>
      {kind === 'game' ? (
        <div className="form-grid">
          <label>Away team<input list="teams" value={awayTeam} onChange={(e) => setAway(e.target.value)} placeholder="Heritage Patriots" required /></label>
          <label>Home team<input list="teams" value={homeTeam} onChange={(e) => setHome(e.target.value)} placeholder="Liberty Lions" required /></label>
          <label>Predict
            <select value={metric} onChange={(e) => setMetric(e.target.value as ItemMetric)}>
              <option value="total">Total points</option>
              <option value="home">{shortName(homeTeam)} score (home)</option>
              <option value="away">{shortName(awayTeam)} score (away)</option>
            </select>
          </label>
          <label>Target label <small>(optional)</small><input value={targetLabel} onChange={(e) => setTarget(e.target.value)} placeholder="auto" /></label>
          <label>Title <small>(optional)</small><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="auto: Away @ Home" /></label>
          <label>MaxPreps ref <small>(later)</small><input value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} placeholder="maxpreps:https://www.maxpreps.com/games/…" /></label>
        </div>
      ) : (
        <div className="form-grid">
          <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Brentwood high temp — Sat 11/7" required /></label>
          <label>Target label<input value={targetLabel} onChange={(e) => setTarget(e.target.value)} placeholder="Brentwood high °F" required /></label>
          <label>Unit<input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="°F" /></label>
          <label>Source ref <small>(later)</small><input value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} placeholder="nws:KLVK" /></label>
        </div>
      )}
      <ErrorNote error={error} />
      <button className="btn btn-gold">+ Add to slate</button>
    </form>
  );
}
