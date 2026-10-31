import type { Entry, Prediction, PoolSummary, SlateItem, User, Week } from '../shared/types';
import type { WeekScore } from '../shared/scoring';

export type WeekSummary = Week & { pool: PoolSummary; itemCount: number };
export type WeekDetail = { week: Week; items: SlateItem[]; entries: Entry[]; pool: PoolSummary };
export type Leaderboard = Omit<WeekScore, 'items'> & { week: Week; slate: SlateItem[]; results: WeekScore['items']; pool: PoolSummary; unpaid: string[] };
export type SeasonRow = { userId: number; displayName: string; wonCents: number; weeksWon: number; weeksPlayed: number; points: number };

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  users: () => req<User[]>('GET', '/users'),
  register: (displayName: string, email: string) => req<User>('POST', '/users', { displayName, email }),
  weeks: () => req<WeekSummary[]>('GET', '/weeks'),
  week: (id: number) => req<WeekDetail>('GET', `/weeks/${id}`),
  createWeek: (body: { label: string; startsOn: string; locksAt?: string; entryFeeCents?: number }) => req<Week>('POST', '/weeks', body),
  updateWeek: (id: number, body: Partial<Week>) => req<Week>('PATCH', `/weeks/${id}`, body),
  deleteWeek: (id: number) => req('DELETE', `/weeks/${id}`),
  addItem: (weekId: number, body: Record<string, unknown>) => req<SlateItem>('POST', `/weeks/${weekId}/items`, body),
  deleteItem: (id: number) => req('DELETE', `/items/${id}`),
  myEntry: (weekId: number, userId: number) => req<{ entry: Entry | null; predictions: Prediction[] }>('GET', `/weeks/${weekId}/my-entry?userId=${userId}`),
  join: (weekId: number, userId: number) => req<Entry>('POST', `/weeks/${weekId}/entries`, { userId }),
  pay: (entryId: number) => req<Entry>('POST', `/entries/${entryId}/pay`),
  savePredictions: (entryId: number, userId: number, predictions: { itemId: number; value: number | string | null }[]) =>
    req<{ predictions: Prediction[] }>('PUT', `/entries/${entryId}/predictions`, { userId, predictions }),
  providers: () => req<{ id: string; label: string }[]>('GET', '/providers'),
  loadResults: (weekId: number, provider = 'sample') => req<{ loaded: number }>('POST', `/weeks/${weekId}/results/load`, { provider }),
  saveResults: (weekId: number, results: { itemId: number; homeScore?: unknown; awayScore?: unknown; value?: unknown }[]) =>
    req('PUT', `/weeks/${weekId}/results`, { results }),
  finalize: (weekId: number) => req('POST', `/weeks/${weekId}/finalize`),
  payout: (weekId: number) => req<Week>('POST', `/weeks/${weekId}/payout`),
  leaderboard: (weekId: number) => req<Leaderboard>('GET', `/weeks/${weekId}/leaderboard`),
  season: () => req<SeasonRow[]>('GET', '/season'),
  resetDemo: () => req('POST', '/admin/reset-demo'),
};
