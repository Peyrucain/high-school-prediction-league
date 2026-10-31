import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Entry, Prediction, SlateItem, User, Week } from '../../shared/types';
import type { ItemPatch, LeagueRepository, NewItem, NewWeek, PayoutRecord, WeekPatch } from './LeagueRepository';

const here = path.dirname(fileURLToPath(import.meta.url));

// snake_case <-> camelCase column maps (keeps SQL readable and the domain types idiomatic)
const WEEK_COLS: Record<string, string> = {
  label: 'label', startsOn: 'starts_on', locksAt: 'locks_at', status: 'status', entryFeeCents: 'entry_fee_cents',
  payoutStatus: 'payout_status', payoutPaidAt: 'payout_paid_at', finalizedAt: 'finalized_at',
};
const ITEM_COLS: Record<string, string> = {
  kind: 'kind', title: 'title', homeTeam: 'home_team', awayTeam: 'away_team', metric: 'metric', targetLabel: 'target_label',
  unit: 'unit', sortOrder: 'sort_order', homeScore: 'home_score', awayScore: 'away_score', finalValue: 'final_value', sourceRef: 'source_ref',
};

const toUser = (r: any): User => ({ id: r.id, displayName: r.display_name, email: r.email, createdAt: r.created_at });
const toWeek = (r: any): Week => ({
  id: r.id, label: r.label, startsOn: r.starts_on, locksAt: r.locks_at, status: r.status, entryFeeCents: r.entry_fee_cents,
  payoutStatus: r.payout_status, payoutPaidAt: r.payout_paid_at, finalizedAt: r.finalized_at, createdAt: r.created_at,
});
const toItem = (r: any): SlateItem => ({
  id: r.id, weekId: r.week_id, kind: r.kind, title: r.title, homeTeam: r.home_team, awayTeam: r.away_team, metric: r.metric,
  targetLabel: r.target_label, unit: r.unit, sortOrder: r.sort_order, homeScore: r.home_score, awayScore: r.away_score,
  finalValue: r.final_value, sourceRef: r.source_ref,
});
const toEntry = (r: any): Entry => ({
  id: r.id, weekId: r.week_id, userId: r.user_id, displayName: r.display_name, paid: !!r.paid, paidAt: r.paid_at,
  paymentRef: r.payment_ref, createdAt: r.created_at,
});
const toPrediction = (r: any): Prediction => ({ id: r.id, entryId: r.entry_id, itemId: r.item_id, value: r.value, updatedAt: r.updated_at });

function buildSet(patch: Record<string, unknown>, cols: Record<string, string>) {
  const keys = Object.keys(patch).filter((k) => k in cols && patch[k] !== undefined);
  const params: Record<string, unknown> = {};
  for (const k of keys) params[k] = typeof patch[k] === 'boolean' ? Number(patch[k]) : patch[k];
  return { sql: keys.map((k) => `${cols[k]} = @${k}`).join(', '), params };
}

export class SqliteLeagueRepository implements LeagueRepository {
  readonly db: Database.Database;

  constructor(file = process.env.DB_FILE ?? path.resolve(here, '../../data/league.db')) {
    if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
    this.db = new Database(file);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(fs.readFileSync(path.resolve(here, '../db/schema.sql'), 'utf8'));
  }

  /** Drop all data (used by the demo reset/seed). */
  async wipe() {
    this.db.exec('DELETE FROM payouts; DELETE FROM predictions; DELETE FROM entries; DELETE FROM slate_items; DELETE FROM weeks; DELETE FROM users; DELETE FROM sqlite_sequence;');
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    // better-sqlite3 is synchronous; our async wrappers resolve immediately, so BEGIN/COMMIT is safe here.
    this.db.exec('BEGIN');
    try { const out = await fn(); this.db.exec('COMMIT'); return out; } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  // ---- users
  async listUsers() { return this.db.prepare('SELECT * FROM users ORDER BY display_name').all().map(toUser); }
  async getUser(id: number) { const r = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id); return r ? toUser(r) : undefined; }
  async findUserByEmail(email: string) { const r = this.db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim()); return r ? toUser(r) : undefined; }
  async createUser(input: { displayName: string; email: string }) {
    const info = this.db.prepare('INSERT INTO users (display_name, email) VALUES (?, ?)').run(input.displayName.trim(), input.email.trim().toLowerCase());
    return (await this.getUser(Number(info.lastInsertRowid)))!;
  }

  // ---- weeks
  async listWeeks() { return this.db.prepare('SELECT * FROM weeks ORDER BY starts_on DESC, id DESC').all().map(toWeek); }
  async getWeek(id: number) { const r = this.db.prepare('SELECT * FROM weeks WHERE id = ?').get(id); return r ? toWeek(r) : undefined; }
  async createWeek(input: NewWeek) {
    const info = this.db.prepare('INSERT INTO weeks (label, starts_on, locks_at, entry_fee_cents, status) VALUES (?, ?, ?, ?, ?)')
      .run(input.label, input.startsOn, input.locksAt ?? null, input.entryFeeCents ?? 1000, input.status ?? 'open');
    return (await this.getWeek(Number(info.lastInsertRowid)))!;
  }
  async updateWeek(id: number, patch: WeekPatch) {
    const { sql, params } = buildSet(patch as any, WEEK_COLS);
    if (sql) this.db.prepare(`UPDATE weeks SET ${sql} WHERE id = @id`).run({ ...params, id });
    return (await this.getWeek(id))!;
  }
  async deleteWeek(id: number) { this.db.prepare('DELETE FROM weeks WHERE id = ?').run(id); }

  // ---- items
  async listItems(weekId: number) { return this.db.prepare('SELECT * FROM slate_items WHERE week_id = ? ORDER BY sort_order, id').all(weekId).map(toItem); }
  async getItem(id: number) { const r = this.db.prepare('SELECT * FROM slate_items WHERE id = ?').get(id); return r ? toItem(r) : undefined; }
  async createItem(input: NewItem) {
    const sortOrder = input.sortOrder ?? ((this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM slate_items WHERE week_id = ?').get(input.weekId) as any).n);
    const info = this.db.prepare(`INSERT INTO slate_items (week_id, kind, title, home_team, away_team, metric, target_label, unit, sort_order, source_ref)
      VALUES (@weekId, @kind, @title, @homeTeam, @awayTeam, @metric, @targetLabel, @unit, @sortOrder, @sourceRef)`)
      .run({
        weekId: input.weekId, kind: input.kind, title: input.title, metric: input.metric, targetLabel: input.targetLabel,
        homeTeam: input.homeTeam ?? null, awayTeam: input.awayTeam ?? null, unit: input.unit ?? null, sourceRef: input.sourceRef ?? null, sortOrder,
      });
    return (await this.getItem(Number(info.lastInsertRowid)))!;
  }
  async updateItem(id: number, patch: ItemPatch) {
    const { sql, params } = buildSet(patch as any, ITEM_COLS);
    if (sql) this.db.prepare(`UPDATE slate_items SET ${sql} WHERE id = @id`).run({ ...params, id });
    return (await this.getItem(id))!;
  }
  async deleteItem(id: number) { this.db.prepare('DELETE FROM slate_items WHERE id = ?').run(id); }

  // ---- entries
  private entrySql = 'SELECT e.*, u.display_name FROM entries e JOIN users u ON u.id = e.user_id';
  async listEntries(weekId: number) { return this.db.prepare(`${this.entrySql} WHERE e.week_id = ? ORDER BY e.created_at, e.id`).all(weekId).map(toEntry); }
  async getEntry(id: number) { const r = this.db.prepare(`${this.entrySql} WHERE e.id = ?`).get(id); return r ? toEntry(r) : undefined; }
  async findEntry(weekId: number, userId: number) { const r = this.db.prepare(`${this.entrySql} WHERE e.week_id = ? AND e.user_id = ?`).get(weekId, userId); return r ? toEntry(r) : undefined; }
  async createEntry(weekId: number, userId: number) {
    const info = this.db.prepare('INSERT INTO entries (week_id, user_id) VALUES (?, ?)').run(weekId, userId);
    return (await this.getEntry(Number(info.lastInsertRowid)))!;
  }
  async markEntryPaid(entryId: number, paymentRef: string) {
    this.db.prepare("UPDATE entries SET paid = 1, paid_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), payment_ref = ? WHERE id = ?").run(paymentRef, entryId);
    return (await this.getEntry(entryId))!;
  }

  // ---- predictions
  async listPredictionsForWeek(weekId: number) {
    return this.db.prepare('SELECT p.* FROM predictions p JOIN entries e ON e.id = p.entry_id WHERE e.week_id = ?').all(weekId).map(toPrediction);
  }
  async listPredictionsForEntry(entryId: number) { return this.db.prepare('SELECT * FROM predictions WHERE entry_id = ?').all(entryId).map(toPrediction); }
  async upsertPredictions(entryId: number, values: { itemId: number; value: number | null }[]) {
    const del = this.db.prepare('DELETE FROM predictions WHERE entry_id = ? AND item_id = ?');
    const stmt = this.db.prepare(`INSERT INTO predictions (entry_id, item_id, value) VALUES (?, ?, ?)
      ON CONFLICT (entry_id, item_id) DO UPDATE SET value = excluded.value, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`);
    this.db.transaction(() => { for (const v of values) v.value === null ? del.run(entryId, v.itemId) : stmt.run(entryId, v.itemId, v.value); })();
    return this.listPredictionsForEntry(entryId);
  }

  // ---- payouts
  async recordPayouts(weekId: number, rows: { userId: number; amountCents: number }[]) {
    const stmt = this.db.prepare('INSERT INTO payouts (week_id, user_id, amount_cents) VALUES (?, ?, ?)');
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM payouts WHERE week_id = ?').run(weekId);
      for (const r of rows) stmt.run(weekId, r.userId, r.amountCents);
    })();
  }
  async listPayouts(): Promise<PayoutRecord[]> {
    return this.db.prepare('SELECT p.*, u.display_name FROM payouts p JOIN users u ON u.id = p.user_id ORDER BY p.created_at').all()
      .map((r: any) => ({ weekId: r.week_id, userId: r.user_id, displayName: r.display_name, amountCents: r.amount_cents, createdAt: r.created_at }));
  }
}
