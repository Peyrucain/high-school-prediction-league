/**
 * Scoring engine — pure functions, no I/O. Used by the API (and safe to use in the client).
 *
 * RULES ("Price Is Right" / closest without going over):
 *  - Each slate item is worth 1 point.
 *  - A prediction that is GREATER than the final value "busts" and cannot win the item.
 *  - Exact matches win first. If nobody is exact, the highest prediction that is still
 *    <= final wins (i.e. closest under).
 *  - If several entrants are still tied (same winning number), the 1 point is split evenly.
 *  - If every prediction busts, nobody gets the point for that item.
 *
 * WEEKLY STANDINGS:
 *  - Sort by points (desc), then exact hits (desc), then total distance-under (asc).
 *    Distance-under = sum over non-busted items of (final - prediction). Busted/missing items add 0
 *    but are tracked separately; the tiebreak rewards being consistently close.
 *  - Everyone still tied for 1st after those tiebreaks splits the prize pool evenly.
 *
 * Only PAID entries are scored.
 */
import type { Entry, Prediction, SlateItem, Week } from './types';

export interface ItemEntryResult {
  value: number | null;
  distance: number | null; // final - value when not busted
  busted: boolean;
  won: boolean;
  credit: number; // share of the item's 1 point
}

export interface ItemResult {
  itemId: number;
  finalValue: number | null;
  settled: boolean;
  winningValue: number | null;
  exact: boolean;
  winnerEntryIds: number[];
  creditEach: number;
  perEntry: Record<number, ItemEntryResult>;
}

export interface StandingRow {
  entryId: number;
  userId: number;
  displayName: string;
  points: number;
  itemWins: number; // items where this entrant got any credit
  exactHits: number;
  distanceUnder: number;
  busts: number;
  missing: number;
  rank: number;
  isWinner: boolean;
  payoutCents: number;
}

export interface WeekScore {
  items: ItemResult[];
  standings: StandingRow[];
  settledCount: number;
  itemCount: number;
  poolCents: number;
  winnerEntryIds: number[];
  /** True when the week is finalized and the winners/payouts are official. */
  official: boolean;
}

const EPS = 1e-9;

/** Score one item given the final value and every paid entry's prediction. */
export function scoreItem(
  item: Pick<SlateItem, 'id' | 'finalValue'>,
  predictions: { entryId: number; value: number | null }[],
): ItemResult {
  const perEntry: Record<number, ItemEntryResult> = {};
  const final = item.finalValue;

  if (final === null || final === undefined) {
    for (const p of predictions) {
      perEntry[p.entryId] = { value: p.value, distance: null, busted: false, won: false, credit: 0 };
    }
    return { itemId: item.id, finalValue: null, settled: false, winningValue: null, exact: false, winnerEntryIds: [], creditEach: 0, perEntry };
  }

  let best: number | null = null;
  for (const p of predictions) {
    const busted = p.value !== null && p.value > final + EPS;
    const distance = p.value === null || busted ? null : final - p.value;
    perEntry[p.entryId] = { value: p.value, distance, busted, won: false, credit: 0 };
    if (p.value !== null && !busted && (best === null || p.value > best)) best = p.value;
  }

  // Exact match is just the special case where best === final; the "exact first" rule falls out
  // naturally because an exact prediction is the highest possible non-busted value.
  const winners = best === null ? [] : predictions.filter((p) => p.value !== null && Math.abs(p.value - best!) < EPS).map((p) => p.entryId);
  const creditEach = winners.length ? 1 / winners.length : 0;
  for (const id of winners) {
    perEntry[id].won = true;
    perEntry[id].credit = creditEach;
  }
  return {
    itemId: item.id,
    finalValue: final,
    settled: true,
    winningValue: best,
    exact: best !== null && Math.abs(best - final) < EPS,
    winnerEntryIds: winners,
    creditEach,
    perEntry,
  };
}

/** Split cents evenly; leftover pennies go to the first winners in list order. */
export function splitCents(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalCents / n);
  const rem = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

export function scoreWeek(week: Week, items: SlateItem[], entries: Entry[], predictions: Prediction[]): WeekScore {
  const paid = entries.filter((e) => e.paid);
  const poolCents = paid.length * week.entryFeeCents;
  const byEntryItem = new Map<string, number>();
  for (const p of predictions) byEntryItem.set(`${p.entryId}:${p.itemId}`, p.value);

  const itemResults = items.map((item) =>
    scoreItem(
      item,
      paid.map((e) => ({ entryId: e.id, value: byEntryItem.get(`${e.id}:${item.id}`) ?? null })),
    ),
  );

  const rows: StandingRow[] = paid.map((e) => {
    const row: StandingRow = {
      entryId: e.id, userId: e.userId, displayName: e.displayName,
      points: 0, itemWins: 0, exactHits: 0, distanceUnder: 0, busts: 0, missing: 0,
      rank: 0, isWinner: false, payoutCents: 0,
    };
    for (const r of itemResults) {
      const pe = r.perEntry[e.id];
      if (!r.settled) continue;
      if (!pe || pe.value === null) { row.missing++; continue; }
      if (pe.busted) { row.busts++; continue; }
      row.distanceUnder += pe.distance ?? 0;
      if (pe.won) { row.points += pe.credit; row.itemWins++; if (r.exact) row.exactHits++; }
    }
    row.points = Math.round(row.points * 1000) / 1000;
    row.distanceUnder = Math.round(row.distanceUnder * 100) / 100;
    return row;
  });

  const cmp = (a: StandingRow, b: StandingRow) =>
    b.points - a.points || b.exactHits - a.exactHits || a.distanceUnder - b.distanceUnder;
  rows.sort((a, b) => cmp(a, b) || a.displayName.localeCompare(b.displayName));
  rows.forEach((r, i) => { r.rank = i > 0 && cmp(rows[i - 1], r) === 0 ? rows[i - 1].rank : i + 1; });

  const settledCount = itemResults.filter((r) => r.settled).length;
  const official = week.status === 'final';
  let winnerEntryIds: number[] = [];
  if (rows.length && settledCount > 0) {
    const top = rows.filter((r) => r.rank === 1);
    winnerEntryIds = top.map((r) => r.entryId);
    const shares = splitCents(poolCents, top.length);
    top.forEach((r, i) => { r.isWinner = true; r.payoutCents = shares[i]; });
  }

  return { items: itemResults, standings: rows, settledCount, itemCount: items.length, poolCents, winnerEntryIds, official };
}

/** Compute the settled number for an item from its raw final (game scores or fact value). */
export function deriveFinalValue(item: Pick<SlateItem, 'metric'>, homeScore: number | null, awayScore: number | null, value: number | null): number | null {
  switch (item.metric) {
    case 'total': return homeScore === null || awayScore === null ? null : homeScore + awayScore;
    case 'home': return homeScore;
    case 'away': return awayScore;
    case 'value': return value;
  }
}
