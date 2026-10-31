/**
 * Domain types shared by the API server and the React client.
 *
 * These map 1:1 to the tables in server/db/schema.sql. If you move to Supabase/Postgres,
 * keep these types as the contract and swap the repository implementation
 * (see server/repo/LeagueRepository.ts).
 */

export type WeekStatus = 'open' | 'locked' | 'final';
export type PayoutStatus = 'pending' | 'paid';
export type ItemKind = 'game' | 'fact';

/**
 * What number entrants predict for an item.
 *  - total: home + away final score
 *  - home / away: one team's final score
 *  - value: a free-standing publicly settled number (weather high, etc.)
 */
export type ItemMetric = 'total' | 'home' | 'away' | 'value';

export interface User {
  id: number;
  displayName: string;
  email: string;
  createdAt: string;
}

export interface Week {
  id: number;
  label: string;
  startsOn: string; // YYYY-MM-DD (first game day)
  locksAt: string | null; // ISO datetime, informational in v1 (admin locks manually)
  status: WeekStatus;
  entryFeeCents: number;
  payoutStatus: PayoutStatus;
  payoutPaidAt: string | null;
  finalizedAt: string | null;
  createdAt: string;
}

export interface SlateItem {
  id: number;
  weekId: number;
  kind: ItemKind;
  title: string; // e.g. "Heritage @ Liberty" or "Brentwood high temp, Sat"
  homeTeam: string | null;
  awayTeam: string | null;
  metric: ItemMetric;
  targetLabel: string; // e.g. "Total points", "Liberty score", "Brentwood high °F"
  unit: string | null; // e.g. "pts", "°F"
  sortOrder: number;
  homeScore: number | null;
  awayScore: number | null;
  finalValue: number | null; // the settled number predictions are scored against
  /**
   * Where the result comes from. Free-form for now, e.g.
   *  "maxpreps:https://www.maxpreps.com/games/..." or "nws:KCCR" or "sample:w10-liberty".
   * Result providers (server/results) use this to look the final up.
   */
  sourceRef: string | null;
}

export interface Entry {
  id: number;
  weekId: number;
  userId: number;
  displayName: string; // joined from users for convenience
  paid: boolean;
  paidAt: string | null;
  paymentRef: string | null;
  createdAt: string;
}

export interface Prediction {
  id: number;
  entryId: number;
  itemId: number;
  value: number;
  updatedAt: string;
}

export interface PoolSummary {
  entrantCount: number;
  paidCount: number;
  entryFeeCents: number;
  poolCents: number; // paidCount * entryFeeCents — fixed pool, 100% paid out
  payoutStatus: PayoutStatus;
}
