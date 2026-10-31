import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { ErrorNote, Matchup, PoolCard, StatusBadge, useLoad } from '../components/ui';
import { fmtDateTime, money } from '../format';
import { useSession } from '../session';

export default function Play() {
  const id = Number(useParams().id);
  const { user, ready } = useSession();
  const detail = useLoad(() => api.week(id), [id]);
  const mine = useLoad(() => (user ? api.myEntry(id, user.id) : Promise.resolve({ entry: null, predictions: [] })), [id, user?.id]);
  const [values, setValues] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const v: Record<number, string> = {};
    for (const p of mine.data?.predictions ?? []) v[p.itemId] = String(p.value);
    setValues(v);
  }, [mine.data]);

  if (ready && !user) return <Navigate to={`/join?next=/week/${id}`} replace />;
  if (!detail.data || !user) return <ErrorNote error={detail.error} />;

  const { week, items, pool } = detail.data;
  const entry = mine.data?.entry ?? null;
  const open = week.status === 'open';
  const filled = items.filter((i) => values[i.id] !== undefined && values[i.id] !== '').length;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError(null); setSaved(false);
    try { await fn(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };

  const payIn = () => run(async () => {
    const e = entry ?? (await api.join(id, user.id));
    await api.pay(e.id);
    await Promise.all([mine.reload(), detail.reload()]);
  });

  const save = () => run(async () => {
    await api.savePredictions(entry!.id, user.id, items.map((i) => ({ itemId: i.id, value: values[i.id] ?? null })));
    await mine.reload();
    setSaved(true);
  });

  return (
    <div className="stack">
      <div className="row-between wrap">
        <div>
          <h1 className="page-title">{week.label}</h1>
          <div className="row gap">
            <StatusBadge status={week.status} />
            {week.locksAt && open && <span className="muted">Locks {fmtDateTime(week.locksAt)}</span>}
          </div>
        </div>
        <Link className="btn" to={`/week/${id}/leaderboard`}>Leaderboard →</Link>
      </div>

      <PoolCard pool={pool} />

      {/* Step 1: pay into the pool */}
      {!entry?.paid && (
        <div className="card paywall">
          {open ? (
            <>
              <div>
                <h2 className="section-title">Buy in for {money(week.entryFeeCents)}</h2>
                <p className="muted">Your entry goes straight into this week's fixed prize pool ({money(pool.poolCents)} now → {money(pool.poolCents + week.entryFeeCents)} with you).</p>
              </div>
              {/* TODO(payments): redirect to Stripe Checkout instead of simulating. */}
              <button className="btn btn-gold btn-lg" disabled={busy} onClick={payIn}>💳 Pay {money(week.entryFeeCents)} <small>(simulated)</small></button>
            </>
          ) : (
            <p className="muted">Entries are closed for this week{entry ? ' — your entry was never paid, so it isn’t scored.' : '.'}</p>
          )}
        </div>
      )}
      {entry?.paid && (
        <div className="paid-banner">✅ You're in — paid {money(week.entryFeeCents)} · ref {entry.paymentRef}</div>
      )}

      {/* Step 2: one number per item */}
      <section className="picks">
        <div className="row-between">
          <h2 className="section-title">Your picks</h2>
          <span className="muted">{filled}/{items.length} filled</span>
        </div>
        {items.map((item, i) => (
          <div key={item.id} className={`card pick ${item.kind}`}>
            <div className="pick-num">{i + 1}</div>
            <div className="pick-body">
              <Matchup item={item} />
              <div className="target">Predict: <b>{item.targetLabel}</b>{item.kind === 'game' && <span className="muted"> · {item.title}</span>}</div>
            </div>
            <div className="pick-input">
              <input
                inputMode="decimal" type="number" min={0} max={999} step="any"
                disabled={!open || !entry?.paid}
                value={values[item.id] ?? ''}
                placeholder="—"
                onChange={(e) => { setSaved(false); setValues((v) => ({ ...v, [item.id]: e.target.value })); }}
              />
              <span className="unit">{item.unit}</span>
            </div>
          </div>
        ))}
        {items.length === 0 && <p className="muted">No games on this slate yet.</p>}
        <ErrorNote error={error} />
        {open && entry?.paid && (
          <div className="sticky-save">
            <button className="btn btn-gold btn-lg" disabled={busy} onClick={save}>{saved ? '✓ Picks saved' : 'Lock in picks'}</button>
            <span className="muted">You can edit until the admin locks the slate. Remember: don't go over!</span>
          </div>
        )}
      </section>
    </div>
  );
}
