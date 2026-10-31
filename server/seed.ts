/**
 * Demo seed data. Matchups are ILLUSTRATIVE Brentwood / East Bay schedules, not the real 2026 slate.
 *  - Week 9  (Oct 23): finalized + paid out, so the leaderboard/history isn't empty.
 *  - Week 10 (Oct 30): open, a few entrants/predictions, waiting for you to finalize in the demo.
 * Run `npm run seed` to reset the database to this state (also auto-runs on first boot).
 */
import { fileURLToPath } from 'node:url';
import { deriveFinalValue, scoreWeek } from '../shared/scoring';
import type { ItemMetric } from '../shared/types';
import { repo } from './repo';

type ItemSeed = {
  kind: 'game' | 'fact'; title: string; home?: string; away?: string; metric: ItemMetric; target: string; unit: string;
  ref: string; final?: { home?: number; away?: number; value?: number };
};

const USERS = [
  { displayName: 'Christian P.', email: 'christian@example.com' },
  { displayName: 'Dana (Lions Mom)', email: 'dana@example.com' },
  { displayName: 'Coach Ray', email: 'ray@example.com' },
  { displayName: 'Big Game Benny', email: 'benny@example.com' },
  { displayName: 'Pirate Priya', email: 'priya@example.com' },
  { displayName: 'Falcon Frank', email: 'frank@example.com' },
  { displayName: 'Marcus T.', email: 'marcus@example.com' },
];

const WEEK9: ItemSeed[] = [
  { kind: 'game', title: 'Liberty @ Freedom', home: 'Freedom Falcons', away: 'Liberty Lions', metric: 'total', target: 'Total points', unit: 'pts', ref: 'sample:w9-liberty-freedom', final: { home: 14, away: 35 } },
  { kind: 'game', title: 'Heritage @ Antioch', home: 'Antioch Panthers', away: 'Heritage Patriots', metric: 'away', target: 'Heritage score', unit: 'pts', ref: 'sample:w9-heritage-antioch', final: { home: 10, away: 28 } },
  { kind: 'game', title: 'Pittsburg @ Deer Valley', home: 'Deer Valley Wolverines', away: 'Pittsburg Pirates', metric: 'total', target: 'Total points', unit: 'pts', ref: 'sample:w9-pittsburg-deervalley', final: { home: 7, away: 41 } },
  { kind: 'game', title: 'Clayton Valley @ Concord', home: 'Concord Minutemen', away: 'Clayton Valley Ugly Eagles', metric: 'total', target: 'Total points', unit: 'pts', ref: 'sample:w9-cvc-concord', final: { home: 21, away: 38 } },
  { kind: 'fact', title: 'Brentwood high temp — Fri 10/23', metric: 'value', target: 'Brentwood high °F', unit: '°F', ref: 'sample:w9-weather-brentwood', final: { value: 76 } },
];

const WEEK10: ItemSeed[] = [
  { kind: 'game', title: 'Heritage @ Liberty — Big Game', home: 'Liberty Lions', away: 'Heritage Patriots', metric: 'total', target: 'Total points', unit: 'pts', ref: 'sample:w10-heritage-liberty' },
  { kind: 'game', title: 'Freedom @ Pittsburg', home: 'Pittsburg Pirates', away: 'Freedom Falcons', metric: 'home', target: 'Pittsburg score', unit: 'pts', ref: 'sample:w10-freedom-pittsburg' },
  { kind: 'game', title: 'Antioch @ Deer Valley', home: 'Deer Valley Wolverines', away: 'Antioch Panthers', metric: 'total', target: 'Total points', unit: 'pts', ref: 'sample:w10-antioch-deervalley' },
  { kind: 'game', title: 'De La Salle @ Clayton Valley', home: 'Clayton Valley Ugly Eagles', away: 'De La Salle Spartans', metric: 'away', target: 'De La Salle score', unit: 'pts', ref: 'sample:w10-dls-claytonvalley' },
  { kind: 'game', title: 'Acalanes @ Campolindo', home: 'Campolindo Cougars', away: 'Acalanes Dons', metric: 'total', target: 'Total points', unit: 'pts', ref: 'sample:w10-acalanes-campolindo' },
  { kind: 'fact', title: 'Brentwood high temp — Sat 10/31', metric: 'value', target: 'Brentwood high °F', unit: '°F', ref: 'sample:w10-weather-brentwood' },
];

// predictions per user (by email prefix), in item order
const W9_PICKS: Record<string, number[]> = {
  christian: [45, 28, 44, 60, 74],
  dana: [48, 24, 50, 55, 75],
  ray: [52, 21, 47, 58, 72],
  benny: [42, 31, 48, 62, 78],
  priya: [47, 27, 40, 59, 70],
  frank: [38, 28, 35, 50, 76],
};
const W10_PICKS: Record<string, number[]> = {
  dana: [52, 27, 38, 35, 45, 70],
  ray: [48, 30, 30, 42, 41, 68],
  benny: [58, 24, 33, 38, 50, 73],
  priya: [54, 21, 27, 40, 47, 72],
};
const W10_UNPAID = ['marcus'];

export async function seed() {
  await repo.wipe();
  const users = new Map<string, number>();
  for (const u of USERS) users.set(u.email.split('@')[0], (await repo.createUser(u)).id);

  const addWeek = async (label: string, startsOn: string, locksAt: string, items: ItemSeed[]) => {
    const week = await repo.createWeek({ label, startsOn, locksAt });
    const created = [];
    for (const [i, it] of items.entries()) {
      created.push(await repo.createItem({
        weekId: week.id, kind: it.kind, title: it.title, homeTeam: it.home ?? null, awayTeam: it.away ?? null,
        metric: it.metric, targetLabel: it.target, unit: it.unit, sourceRef: it.ref, sortOrder: i + 1,
      }));
    }
    return { week, items: created };
  };
  const enter = async (weekId: number, itemIds: number[], key: string, picks?: number[], paid = true) => {
    const entry = await repo.createEntry(weekId, users.get(key)!);
    if (paid) await repo.markEntryPaid(entry.id, `SIM-SEED-${weekId}-${key.toUpperCase()}`);
    if (picks) await repo.upsertPredictions(entry.id, picks.map((value, i) => ({ itemId: itemIds[i], value })));
  };

  // ---- Week 9: finalized and paid out
  const w9 = await addWeek('Week 9 · Oct 23–24', '2026-10-23', '2026-10-23T19:00:00-07:00', WEEK9);
  for (const [key, picks] of Object.entries(W9_PICKS)) await enter(w9.week.id, w9.items.map((i) => i.id), key, picks);
  for (const [i, item] of w9.items.entries()) {
    const f = WEEK9[i].final!;
    await repo.updateItem(item.id, {
      homeScore: f.home ?? null, awayScore: f.away ?? null,
      finalValue: deriveFinalValue(item, f.home ?? null, f.away ?? null, f.value ?? null),
    });
  }
  let week9 = await repo.updateWeek(w9.week.id, { status: 'final', finalizedAt: '2026-10-25T09:00:00.000Z' });
  const score9 = scoreWeek(week9, await repo.listItems(week9.id), await repo.listEntries(week9.id), await repo.listPredictionsForWeek(week9.id));
  await repo.recordPayouts(week9.id, score9.standings.filter((r) => r.isWinner).map((r) => ({ userId: r.userId, amountCents: r.payoutCents })));
  week9 = await repo.updateWeek(week9.id, { payoutStatus: 'paid', payoutPaidAt: '2026-10-26T17:00:00.000Z' });

  // ---- Week 10: open
  const w10 = await addWeek('Week 10 · Oct 30–31', '2026-10-30', '2026-10-30T19:00:00-07:00', WEEK10);
  for (const [key, picks] of Object.entries(W10_PICKS)) await enter(w10.week.id, w10.items.map((i) => i.id), key, picks);
  for (const key of W10_UNPAID) await enter(w10.week.id, [], key, undefined, false);

  return { weeks: [week9.id, w10.week.id], users: users.size };
}

// `npm run seed`
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed().then((r) => { console.log('Seeded demo data:', r); process.exit(0); });
}
