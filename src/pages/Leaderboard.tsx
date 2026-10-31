import { Link, useParams } from 'react-router-dom';
import type { ItemResult } from '../../shared/scoring';
import type { SlateItem } from '../../shared/types';
import { api } from '../api';
import { ErrorNote, FinalLine, Matchup, PoolCard, StatusBadge, useLoad } from '../components/ui';
import { money, ordinal, pts } from '../format';
import { useSession } from '../session';

export default function LeaderboardPage() {
  const id = Number(useParams().id);
  const { user } = useSession();
  const lb = useLoad(() => api.leaderboard(id), [id]);
  if (!lb.data) return <ErrorNote error={lb.error} />;
  const d = lb.data;
  const nameOf = new Map(d.standings.map((r) => [r.entryId, r.displayName]));
  const myEntryId = d.standings.find((r) => r.userId === user?.id)?.entryId;
  const winners = d.standings.filter((r) => r.isWinner).map((r) => ({ name: r.displayName, cents: r.payoutCents }));
  const hidden = d.week.status === 'open';
  const scored = d.settledCount > 0;

  return (
    <div className="stack">
      <div className="row-between wrap">
        <div>
          <h1 className="page-title">{d.week.label} · Leaderboard</h1>
          <div className="row gap">
            <StatusBadge status={d.week.status} />
            <span className="muted">{d.settledCount}/{d.itemCount} items settled{!d.official && scored ? ' · provisional' : ''}</span>
          </div>
        </div>
        {d.week.status === 'open' && <Link className="btn btn-gold" to={`/week/${id}`}>Make picks</Link>}
      </div>

      <PoolCard pool={d.pool} winners={d.official ? winners : undefined} />

      <section className="card table-wrap">
        <table className="table standings">
          <thead>
            <tr>
              <th>Rank</th><th>Player</th><th>Pts</th><th title="Items won (incl. split)">Wins</th><th title="Exact hits">🎯</th>
              <th title="Total distance under on non-busted picks (lower is better)">Δ under</th><th title="Picks that went over">Busts</th><th>Payout</th>
            </tr>
          </thead>
          <tbody>
            {d.standings.map((r) => (
              <tr key={r.entryId} className={`${r.isWinner && scored ? 'winner' : ''} ${user?.id === r.userId ? 'me' : ''}`}>
                <td className="rank">{scored ? ordinal(r.rank) : '—'}</td>
                <td>{r.isWinner && d.official ? '🏆 ' : ''}{r.displayName}</td>
                <td className="strong">{pts(r.points)}</td>
                <td>{r.itemWins}</td>
                <td>{r.exactHits}</td>
                <td>{scored ? r.distanceUnder : '—'}</td>
                <td className={r.busts ? 'bust' : ''}>{r.busts}</td>
                <td className="gold">{scored && r.payoutCents ? (d.official ? money(r.payoutCents) : `(${money(r.payoutCents)} proj.)`) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {d.standings.length === 0 && <p className="muted pad">No paid entries yet.</p>}
        {d.unpaid.length > 0 && <p className="fineprint pad">Entered but unpaid (not scored): {d.unpaid.join(', ')}</p>}
        <p className="fineprint pad">Ranking: points → exact hits → smallest total distance under. Anyone still tied for 1st splits the pool.</p>
      </section>

      <h2 className="section-title">Item by item</h2>
      {hidden && <p className="muted">Everyone's picks stay hidden until the slate locks.</p>}
      <div className="grid">
        {d.slate.map((item) => (
          <ItemCard key={item.id} item={item} result={d.results.find((r) => r.itemId === item.id)} nameOf={nameOf} hidden={hidden} myEntryId={myEntryId} />
        ))}
      </div>
    </div>
  );
}

function ItemCard({ item, result, nameOf, hidden, myEntryId }: {
  item: SlateItem; result?: ItemResult; nameOf: Map<number, string>; hidden: boolean; myEntryId?: number;
}) {
  const rows = result ? Object.entries(result.perEntry).map(([entryId, pe]) => ({ entryId: Number(entryId), ...pe })) : [];
  rows.sort((a, b) => Number(b.won) - Number(a.won) || Number(a.busted) - Number(b.busted) || (b.value ?? -1) - (a.value ?? -1));
  return (
    <article className="card item-card">
      <Matchup item={item} />
      <div className="target">{item.targetLabel}</div>
      {result?.settled ? <FinalLine item={item} /> : <span className="muted">Awaiting final</span>}
      {result?.settled && (
        <div className="item-winner">
          {result.winnerEntryIds.length === 0
            ? 'Everyone went over — no winner'
            : `${result.exact ? '🎯 Exact: ' : 'Closest under: '}${result.winnerEntryIds.map((e) => nameOf.get(e)).join(', ')}${result.winnerEntryIds.length > 1 ? ` (split ${pts(result.creditEach)} each)` : ''}`}
        </div>
      )}
      {!hidden && rows.length > 0 && (
        <ul className="picklist">
          {rows.map((r) => (
            <li key={r.entryId} className={`${r.won ? 'won' : ''} ${r.busted ? 'busted' : ''} ${r.entryId === myEntryId ? 'me' : ''}`}>
              <span>{nameOf.get(r.entryId)}</span>
              <span>
                {r.value ?? '—'}
                {result?.settled && r.value !== null && (r.busted ? ' · over' : ` · −${pts(r.distance ?? 0)}`)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
