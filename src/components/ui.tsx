import { useCallback, useEffect, useState } from 'react';
import type { PoolSummary, SlateItem, WeekStatus } from '../../shared/types';
import { money } from '../format';

/** Tiny data hook: { data, error, loading, reload }. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const reload = useCallback(() => {
    setLoading(true);
    return fn().then((d) => { setData(d); setError(null); }).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, deps);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

export function StatusBadge({ status }: { status: WeekStatus }) {
  const label = { open: 'Picks open', locked: 'Locked · games on', final: 'Final' }[status];
  return <span className={`badge badge-${status}`}>{label}</span>;
}

export function PoolCard({ pool, winners }: { pool: PoolSummary; winners?: { name: string; cents: number }[] }) {
  return (
    <div className="pool">
      <div className="pool-main">
        <span className="pool-label">Prize pool</span>
        <span className="pool-amount">{money(pool.poolCents)}</span>
      </div>
      <div className="pool-stats">
        <div><b>{pool.paidCount}</b><span>paid</span></div>
        <div><b>{pool.entrantCount}</b><span>entrants</span></div>
        <div><b>{money(pool.entryFeeCents)}</b><span>entry</span></div>
        <div>
          <b className={pool.payoutStatus === 'paid' ? 'ok' : ''}>{pool.payoutStatus === 'paid' ? 'PAID' : 'Pending'}</b>
          <span>payout</span>
        </div>
      </div>
      {winners && winners.length > 0 && (
        <div className="pool-winners">
          🏆 {winners.map((w) => `${w.name} (${money(w.cents)})`).join(' · ')}
        </div>
      )}
      <p className="fineprint">Pool = paid entrants × entry fee. 100% to the week's winner(s); ties split evenly.</p>
    </div>
  );
}

export function Matchup({ item }: { item: SlateItem }) {
  if (item.kind === 'fact') return <div className="matchup"><span className="fact-icon">🌡️</span><b>{item.title}</b></div>;
  return (
    <div className="matchup">
      <span className="team away">{item.awayTeam}</span>
      <span className="at">@</span>
      <span className="team home">{item.homeTeam}</span>
    </div>
  );
}

export function FinalLine({ item }: { item: SlateItem }) {
  if (item.finalValue === null) return null;
  if (item.kind === 'game' && item.homeScore !== null && item.awayScore !== null) {
    return <span className="final">Final: {short(item.awayTeam)} {item.awayScore} – {short(item.homeTeam)} {item.homeScore} → <b>{item.finalValue}</b></span>;
  }
  return <span className="final">Final: <b>{item.finalValue}{item.unit === '°F' ? '°F' : ''}</b></span>;
}

export const short = (t: string | null) => (t ?? '').split(' ').slice(0, -1).join(' ') || (t ?? '');

export function ErrorNote({ error }: { error: string | null }) {
  return error ? <div className="error">⚠️ {error}</div> : null;
}
