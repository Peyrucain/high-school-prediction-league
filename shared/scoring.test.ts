import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreItem, scoreWeek, splitCents } from './scoring';
import type { Entry, Prediction, SlateItem, Week } from './types';

test('closest without going over wins', () => {
  const r = scoreItem({ id: 1, finalValue: 48 }, [
    { entryId: 1, value: 45 }, { entryId: 2, value: 50 }, { entryId: 3, value: 40 },
  ]);
  assert.deepEqual(r.winnerEntryIds, [1]);
  assert.equal(r.perEntry[2].busted, true);
  assert.equal(r.exact, false);
});

test('exact match wins and ties split credit', () => {
  const r = scoreItem({ id: 1, finalValue: 48 }, [
    { entryId: 1, value: 48 }, { entryId: 2, value: 48 }, { entryId: 3, value: 47 },
  ]);
  assert.deepEqual(r.winnerEntryIds, [1, 2]);
  assert.equal(r.exact, true);
  assert.equal(r.perEntry[1].credit, 0.5);
});

test('all bust => no winner', () => {
  const r = scoreItem({ id: 1, finalValue: 10 }, [{ entryId: 1, value: 11 }, { entryId: 2, value: null }]);
  assert.deepEqual(r.winnerEntryIds, []);
});

test('splitCents distributes remainder', () => {
  assert.deepEqual(splitCents(1000, 3), [334, 333, 333]);
});

test('week standings, tiebreaks and pool', () => {
  const week: Week = { id: 1, label: 'W', startsOn: '2026-10-30', locksAt: null, status: 'final', entryFeeCents: 1000, payoutStatus: 'pending', payoutPaidAt: null, finalizedAt: null, createdAt: '' };
  const item = (id: number, finalValue: number): SlateItem => ({ id, weekId: 1, kind: 'game', title: '', homeTeam: null, awayTeam: null, metric: 'total', targetLabel: '', unit: null, sortOrder: id, homeScore: null, awayScore: null, finalValue, sourceRef: null });
  const entry = (id: number, paid = true): Entry => ({ id, weekId: 1, userId: id, displayName: `U${id}`, paid, paidAt: null, paymentRef: null, createdAt: '' });
  const preds: Prediction[] = [
    [1, 1, 40], [1, 2, 20], [2, 1, 41], [2, 2, 25], [3, 1, 99], [3, 2, 99], [4, 1, 42], [4, 2, 30],
  ].map(([entryId, itemId, value], i) => ({ id: i, entryId, itemId, value, updatedAt: '' }));
  const s = scoreWeek(week, [item(1, 42), item(2, 28)], [entry(1), entry(2), entry(3), entry(4, false)], preds);
  assert.equal(s.poolCents, 3000); // entry 4 unpaid
  assert.equal(s.standings[0].displayName, 'U2'); // wins both items (41, 25)
  assert.equal(s.standings[0].payoutCents, 3000);
  assert.equal(s.standings.find((r) => r.displayName === 'U3')!.busts, 2);
});
