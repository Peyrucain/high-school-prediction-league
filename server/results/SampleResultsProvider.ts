import type { SlateItem } from '../../shared/types';
import type { RawFinal, ResultsProvider } from './ResultsProvider';

/** Hand-picked finals for seeded items (source_ref "sample:<key>") so the demo is repeatable. */
const SAMPLE_FINALS: Record<string, { home?: number; away?: number; value?: number }> = {
  // Week 10 (open in the seed; finalize it in the demo)
  'w10-heritage-liberty': { home: 31, away: 24 },
  'w10-freedom-pittsburg': { home: 28, away: 21 },
  'w10-antioch-deervalley': { home: 20, away: 14 },
  'w10-dls-claytonvalley': { home: 17, away: 42 },
  'w10-acalanes-campolindo': { home: 35, away: 13 },
  'w10-weather-brentwood': { value: 71 },
};

/** Deterministic pseudo-random so unknown items (admin-created) still get stable sample finals. */
function rand(seed: number) {
  let x = (seed * 2654435761) >>> 0;
  return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 10000) / 10000; };
}
const FOOTBALL_SCORES = [0, 3, 7, 10, 13, 14, 17, 20, 21, 24, 27, 28, 31, 34, 35, 38, 42, 45, 49];

export class SampleResultsProvider implements ResultsProvider {
  readonly id = 'sample';
  readonly label = 'Sample finals (simulated MaxPreps + weather pull)';

  async fetchFinals(_week: unknown, items: SlateItem[]): Promise<RawFinal[]> {
    return items.map((item) => {
      const key = item.sourceRef?.startsWith('sample:') ? item.sourceRef.slice(7) : null;
      const known = key ? SAMPLE_FINALS[key] : undefined;
      const r = rand(item.id + 7);
      if (item.kind === 'game') {
        const home = known?.home ?? FOOTBALL_SCORES[Math.floor(r() * FOOTBALL_SCORES.length)];
        const away = known?.away ?? FOOTBALL_SCORES[Math.floor(r() * FOOTBALL_SCORES.length)];
        return { itemId: item.id, homeScore: home, awayScore: away, source: 'MaxPreps (simulated)' };
      }
      const value = known?.value ?? Math.round(55 + r() * 25);
      return { itemId: item.id, value, source: 'Weather (simulated)' };
    });
  }
}
