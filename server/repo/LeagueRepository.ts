/**
 * Data-access contract. The API only talks to this interface, never to SQL directly.
 *
 * v1: SqliteLeagueRepository (better-sqlite3, file at data/league.db).
 * Later: implement SupabaseLeagueRepository with @supabase/supabase-js against the same
 * tables (server/db/schema.sql) and switch it in server/repo/index.ts. Methods are async
 * on purpose so a network-backed implementation drops in without touching routes.
 */
import type { Entry, Prediction, SlateItem, User, Week } from '../../shared/types';

export type NewWeek = Pick<Week, 'label' | 'startsOn'> & Partial<Pick<Week, 'locksAt' | 'entryFeeCents' | 'status'>>;
export type WeekPatch = Partial<Pick<Week, 'label' | 'startsOn' | 'locksAt' | 'status' | 'payoutStatus' | 'payoutPaidAt' | 'finalizedAt'>>;
export type NewItem = Omit<SlateItem, 'id' | 'homeScore' | 'awayScore' | 'finalValue' | 'sortOrder'> & { sortOrder?: number };
export type ItemPatch = Partial<Omit<SlateItem, 'id' | 'weekId'>>;
export interface PayoutRecord { weekId: number; userId: number; displayName: string; amountCents: number; createdAt: string }

export interface LeagueRepository {
  // users
  listUsers(): Promise<User[]>;
  getUser(id: number): Promise<User | undefined>;
  findUserByEmail(email: string): Promise<User | undefined>;
  createUser(input: { displayName: string; email: string }): Promise<User>;

  // weeks
  listWeeks(): Promise<Week[]>;
  getWeek(id: number): Promise<Week | undefined>;
  createWeek(input: NewWeek): Promise<Week>;
  updateWeek(id: number, patch: WeekPatch): Promise<Week>;
  deleteWeek(id: number): Promise<void>;

  // slate items
  listItems(weekId: number): Promise<SlateItem[]>;
  getItem(id: number): Promise<SlateItem | undefined>;
  createItem(input: NewItem): Promise<SlateItem>;
  updateItem(id: number, patch: ItemPatch): Promise<SlateItem>;
  deleteItem(id: number): Promise<void>;

  // entries & payments
  listEntries(weekId: number): Promise<Entry[]>;
  getEntry(id: number): Promise<Entry | undefined>;
  findEntry(weekId: number, userId: number): Promise<Entry | undefined>;
  createEntry(weekId: number, userId: number): Promise<Entry>;
  markEntryPaid(entryId: number, paymentRef: string): Promise<Entry>;

  // predictions
  listPredictionsForWeek(weekId: number): Promise<Prediction[]>;
  listPredictionsForEntry(entryId: number): Promise<Prediction[]>;
  /** value null = clear that pick. */
  upsertPredictions(entryId: number, values: { itemId: number; value: number | null }[]): Promise<Prediction[]>;

  // payouts
  recordPayouts(weekId: number, rows: { userId: number; amountCents: number }[]): Promise<void>;
  listPayouts(): Promise<PayoutRecord[]>;

  /** Run fn atomically where the backend supports it. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
}
