import { Router, type Request, type Response, type NextFunction } from 'express';
import { deriveFinalValue, scoreWeek } from '../shared/scoring';
import type { ItemKind, ItemMetric, PoolSummary, Week, WeekStatus } from '../shared/types';
import { repo } from './repo';
import { providers } from './results';
import { seed } from './seed';

export const api = Router();

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const bad = (msg: string) => new HttpError(400, msg);
const notFound = (what: string) => new HttpError(404, `${what} not found`);

/** Wrap async handlers so thrown errors reach the error middleware (Express 5 also does this natively). */
const h = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req, res).then((body) => { if (!res.headersSent) res.json(body); }).catch(next);

const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : NaN; };
const optNum = (v: unknown) => (v === null || v === undefined || v === '' ? null : num(v));

async function loadWeek(id: unknown) {
  const week = await repo.getWeek(num(id));
  if (!week) throw notFound('Week');
  return week;
}

async function poolFor(week: Week): Promise<PoolSummary> {
  const entries = await repo.listEntries(week.id);
  const paidCount = entries.filter((e) => e.paid).length;
  return { entrantCount: entries.length, paidCount, entryFeeCents: week.entryFeeCents, poolCents: paidCount * week.entryFeeCents, payoutStatus: week.payoutStatus };
}

async function scoreFor(week: Week) {
  const [items, entries, predictions] = await Promise.all([repo.listItems(week.id), repo.listEntries(week.id), repo.listPredictionsForWeek(week.id)]);
  return { items, entries, predictions, score: scoreWeek(week, items, entries, predictions) };
}

// ------------------------------------------------------------------ meta
api.get('/health', h(async () => ({ ok: true })));
api.get('/providers', h(async () => Object.values(providers).map((p) => ({ id: p.id, label: p.label }))));

// ------------------------------------------------------------------ users (light "pick a user" auth for v1)
// TODO(auth): replace with Supabase Auth (magic link) — userId would come from the session, not the client.
api.get('/users', h(async () => repo.listUsers()));
api.post('/users', h(async (req) => {
  const displayName = String(req.body?.displayName ?? '').trim();
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  if (!displayName) throw bad('Display name is required');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('A valid email is required');
  const existing = await repo.findUserByEmail(email);
  return existing ?? repo.createUser({ displayName, email });
}));

// ------------------------------------------------------------------ weeks
api.get('/weeks', h(async () => {
  const weeks = await repo.listWeeks();
  return Promise.all(weeks.map(async (w) => ({ ...w, pool: await poolFor(w), itemCount: (await repo.listItems(w.id)).length })));
}));

api.post('/weeks', h(async (req) => {
  const label = String(req.body?.label ?? '').trim();
  const startsOn = String(req.body?.startsOn ?? '').trim();
  if (!label) throw bad('Label is required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) throw bad('startsOn must be YYYY-MM-DD');
  const fee = req.body?.entryFeeCents === undefined ? 1000 : num(req.body.entryFeeCents);
  if (!(fee > 0)) throw bad('Entry fee must be positive');
  return repo.createWeek({ label, startsOn, locksAt: req.body?.locksAt || null, entryFeeCents: fee });
}));

api.get('/weeks/:id', h(async (req) => {
  const week = await loadWeek(req.params.id);
  const [items, entries] = await Promise.all([repo.listItems(week.id), repo.listEntries(week.id)]);
  return { week, items, entries, pool: await poolFor(week) };
}));

api.patch('/weeks/:id', h(async (req) => {
  const week = await loadWeek(req.params.id);
  const status = req.body?.status as WeekStatus | undefined;
  if (status && !['open', 'locked'].includes(status)) throw bad('Use /finalize to finalize a week');
  if (status && week.status === 'final' && week.payoutStatus === 'paid') throw bad('Payout already sent; week cannot be reopened');
  return repo.updateWeek(week.id, {
    label: req.body?.label, startsOn: req.body?.startsOn, locksAt: req.body?.locksAt, status,
    ...(status ? { finalizedAt: null } : {}),
  });
}));

api.delete('/weeks/:id', h(async (req) => {
  const week = await loadWeek(req.params.id);
  if ((await poolFor(week)).paidCount > 0) throw bad('Week has paid entries; refund flow not built — cannot delete');
  await repo.deleteWeek(week.id);
  return { ok: true };
}));

// ------------------------------------------------------------------ slate items
const KINDS: ItemKind[] = ['game', 'fact'];
const METRICS: ItemMetric[] = ['total', 'home', 'away', 'value'];

api.post('/weeks/:id/items', h(async (req) => {
  const week = await loadWeek(req.params.id);
  if (week.status !== 'open') throw bad('Slate is locked');
  const b = req.body ?? {};
  const kind = b.kind as ItemKind;
  if (!KINDS.includes(kind)) throw bad('kind must be game or fact');
  const metric = (kind === 'fact' ? 'value' : b.metric) as ItemMetric;
  if (!METRICS.includes(metric) || (kind === 'game' && metric === 'value')) throw bad('Invalid metric');
  const homeTeam = kind === 'game' ? String(b.homeTeam ?? '').trim() : null;
  const awayTeam = kind === 'game' ? String(b.awayTeam ?? '').trim() : null;
  if (kind === 'game' && (!homeTeam || !awayTeam)) throw bad('Home and away teams are required');
  const short = (t: string) => t.split(' ')[0];
  const title = String(b.title ?? '').trim() || (kind === 'game' ? `${short(awayTeam!)} @ ${short(homeTeam!)}` : '');
  if (!title) throw bad('Title is required');
  const defaultLabel = metric === 'total' ? 'Total points' : metric === 'home' ? `${short(homeTeam!)} score` : metric === 'away' ? `${short(awayTeam!)} score` : 'Value';
  return repo.createItem({
    weekId: week.id, kind, title, homeTeam, awayTeam, metric,
    targetLabel: String(b.targetLabel ?? '').trim() || defaultLabel,
    unit: String(b.unit ?? '').trim() || (kind === 'game' ? 'pts' : null),
    sourceRef: String(b.sourceRef ?? '').trim() || null,
  });
}));

api.delete('/items/:id', h(async (req) => {
  const item = await repo.getItem(num(req.params.id));
  if (!item) throw notFound('Item');
  const week = await loadWeek(item.weekId);
  if (week.status !== 'open') throw bad('Slate is locked');
  await repo.deleteItem(item.id);
  return { ok: true };
}));

// ------------------------------------------------------------------ entries, payment, predictions
api.post('/weeks/:id/entries', h(async (req) => {
  const week = await loadWeek(req.params.id);
  if (week.status !== 'open') throw bad('Entries are closed for this week');
  const user = await repo.getUser(num(req.body?.userId));
  if (!user) throw notFound('User');
  return (await repo.findEntry(week.id, user.id)) ?? repo.createEntry(week.id, user.id);
}));

/** The current user's entry + their predictions for a week. */
api.get('/weeks/:id/my-entry', h(async (req) => {
  const week = await loadWeek(req.params.id);
  const entry = await repo.findEntry(week.id, num(req.query.userId));
  return { entry: entry ?? null, predictions: entry ? await repo.listPredictionsForEntry(entry.id) : [] };
}));

/**
 * SIMULATED payment. Money goes into the week's fixed pool (entrants never pay each other).
 * TODO(payments): create a Stripe Checkout Session / PaymentIntent here, return its URL, and mark the
 * entry paid from the Stripe webhook instead. Check state/age eligibility rules for paid skill contests
 * in California before taking real money.
 */
api.post('/entries/:id/pay', h(async (req) => {
  const entry = await repo.getEntry(num(req.params.id));
  if (!entry) throw notFound('Entry');
  const week = await loadWeek(entry.weekId);
  if (week.status !== 'open') throw bad('Entries are closed for this week');
  if (entry.paid) return entry;
  return repo.markEntryPaid(entry.id, `SIM-${Date.now().toString(36).toUpperCase()}`);
}));

api.put('/entries/:id/predictions', h(async (req) => {
  const entry = await repo.getEntry(num(req.params.id));
  if (!entry) throw notFound('Entry');
  if (num(req.body?.userId) !== entry.userId) throw new HttpError(403, 'Not your entry');
  const week = await loadWeek(entry.weekId);
  if (week.status !== 'open') throw bad('Predictions are locked for this week');
  if (!entry.paid) throw bad('Pay the entry fee before submitting predictions');
  const items = new Map((await repo.listItems(week.id)).map((i) => [i.id, i]));
  const values: { itemId: number; value: number | null }[] = [];
  for (const p of (req.body?.predictions ?? []) as { itemId: number; value: unknown }[]) {
    if (!items.has(num(p.itemId))) throw bad(`Unknown item ${p.itemId}`);
    if (p.value === null || p.value === '' || p.value === undefined) { values.push({ itemId: num(p.itemId), value: null }); continue; }
    const v = num(p.value);
    if (!Number.isFinite(v) || v < 0 || v > 999) throw bad('Predictions must be numbers between 0 and 999');
    values.push({ itemId: num(p.itemId), value: v });
  }
  return { predictions: await repo.upsertPredictions(entry.id, values) };
}));

// ------------------------------------------------------------------ results & finalize (admin)
/** Pull finals from a provider (default: sample) and write them onto the items. Does NOT finalize. */
api.post('/weeks/:id/results/load', h(async (req) => {
  const week = await loadWeek(req.params.id);
  if (week.status === 'final') throw bad('Week already finalized');
  const provider = providers[String(req.body?.provider ?? 'sample')];
  if (!provider) throw bad('Unknown provider');
  const items = await repo.listItems(week.id);
  const finals = await provider.fetchFinals(week, items).catch((e) => { throw bad(e.message); });
  const byId = new Map(items.map((i) => [i.id, i]));
  await repo.transaction(async () => {
    for (const f of finals) {
      const item = byId.get(f.itemId);
      if (!item) continue;
      const home = f.homeScore ?? null, away = f.awayScore ?? null, value = f.value ?? null;
      await repo.updateItem(item.id, { homeScore: home, awayScore: away, finalValue: deriveFinalValue(item, home, away, value) });
    }
    // Loading results implies the games have started: lock the slate.
    if (week.status === 'open') await repo.updateWeek(week.id, { status: 'locked' });
  });
  return { loaded: finals.length, provider: provider.id, items: await repo.listItems(week.id) };
}));

/** Manually enter/override finals. Body: { results: [{ itemId, homeScore?, awayScore?, value? }] } */
api.put('/weeks/:id/results', h(async (req) => {
  const week = await loadWeek(req.params.id);
  if (week.status === 'final') throw bad('Week already finalized');
  const items = new Map((await repo.listItems(week.id)).map((i) => [i.id, i]));
  await repo.transaction(async () => {
    for (const r of (req.body?.results ?? []) as any[]) {
      const item = items.get(num(r.itemId));
      if (!item) throw bad(`Unknown item ${r.itemId}`);
      const home = optNum(r.homeScore), away = optNum(r.awayScore), value = optNum(r.value);
      if ([home, away, value].some((v) => v !== null && (Number.isNaN(v) || v < 0))) throw bad('Results must be non-negative numbers');
      await repo.updateItem(item.id, {
        homeScore: item.kind === 'game' ? home : null, awayScore: item.kind === 'game' ? away : null,
        finalValue: deriveFinalValue(item, home, away, value),
      });
    }
    if (week.status === 'open') await repo.updateWeek(week.id, { status: 'locked' });
  });
  return { items: await repo.listItems(week.id) };
}));

api.post('/weeks/:id/finalize', h(async (req) => {
  const week = await loadWeek(req.params.id);
  if (week.status === 'final') throw bad('Already finalized');
  const items = await repo.listItems(week.id);
  if (items.length === 0) throw bad('Slate is empty');
  const missing = items.filter((i) => i.finalValue === null);
  if (missing.length) throw bad(`Missing finals for: ${missing.map((i) => i.title).join(', ')}`);
  const updated = await repo.updateWeek(week.id, { status: 'final', finalizedAt: new Date().toISOString() });
  return { week: updated, ...(await scoreFor(updated)).score };
}));

/** Mark the pool as paid out to the winner(s) and write the payout ledger. */
api.post('/weeks/:id/payout', h(async (req) => {
  const week = await loadWeek(req.params.id);
  if (week.status !== 'final') throw bad('Finalize the week first');
  if (week.payoutStatus === 'paid') throw bad('Payout already recorded');
  const { score } = await scoreFor(week);
  const winners = score.standings.filter((r) => r.isWinner);
  // TODO(payments): trigger real transfers (Stripe Connect / PayPal Payouts) here; record their ids.
  await repo.recordPayouts(week.id, winners.map((r) => ({ userId: r.userId, amountCents: r.payoutCents })));
  return repo.updateWeek(week.id, { payoutStatus: 'paid', payoutPaidAt: new Date().toISOString() });
}));

// ------------------------------------------------------------------ leaderboard
api.get('/weeks/:id/leaderboard', h(async (req) => {
  const week = await loadWeek(req.params.id);
  const { items, entries, score } = await scoreFor(week);
  // Keep picks secret while the slate is open: strip everyone's values from per-item results.
  if (week.status === 'open') for (const r of score.items) for (const pe of Object.values(r.perEntry)) pe.value = null;
  const { items: results, ...rest } = score;
  return { week, slate: items, results, pool: await poolFor(week), unpaid: entries.filter((e) => !e.paid).map((e) => e.displayName), ...rest };
}));

/** All-time money + wins across finalized weeks. */
api.get('/season', h(async () => {
  const payouts = await repo.listPayouts();
  const weeks = (await repo.listWeeks()).filter((w) => w.status === 'final');
  const totals = new Map<number, { userId: number; displayName: string; wonCents: number; weeksWon: number; weeksPlayed: number; points: number }>();
  for (const w of weeks) {
    const { score } = await scoreFor(w);
    for (const r of score.standings) {
      const t = totals.get(r.userId) ?? { userId: r.userId, displayName: r.displayName, wonCents: 0, weeksWon: 0, weeksPlayed: 0, points: 0 };
      t.weeksPlayed++; t.points += r.points; if (r.isWinner) t.weeksWon++;
      totals.set(r.userId, t);
    }
  }
  for (const p of payouts) { const t = totals.get(p.userId); if (t) t.wonCents += p.amountCents; }
  return [...totals.values()].sort((a, b) => b.wonCents - a.wonCents || b.points - a.points);
}));

// ------------------------------------------------------------------ demo
api.post('/admin/reset-demo', h(async () => seed()));

// ------------------------------------------------------------------ errors
api.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof HttpError ? err.status : /UNIQUE/.test(err?.message ?? '') ? 409 : 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err?.message ?? 'Server error' });
});
