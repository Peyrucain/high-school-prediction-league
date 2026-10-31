import type { SlateItem, Week } from '../../shared/types';
import type { RawFinal, ResultsProvider } from './ResultsProvider';

/**
 * TODO(MaxPreps): real final-score fetcher.
 *
 * Plan:
 *  - When creating a game item, store the MaxPreps game URL in source_ref as
 *    "maxpreps:https://www.maxpreps.com/games/<date>/<sport>/<slug>.htm?c=<contestId>".
 *  - fetchFinals(): for each game item with a maxpreps: ref, GET the page (or the contest JSON the
 *    page loads), confirm the game status is "Final", and read home/away scores.
 *  - Respect MaxPreps terms / rate limits; cache responses; only accept "Final" (not in-progress).
 *  - Alternatives if scraping is not allowed: CIF section/NCS results feeds, league sites
 *    (e.g. BVAL / DAL), or a licensed data provider. Keep the RawFinal shape so nothing else changes.
 *  - Run on a schedule (e.g. Saturday 1am PT + Sunday) and auto-finalize when every item is settled.
 */
export class MaxPrepsResultsProvider implements ResultsProvider {
  readonly id = 'maxpreps';
  readonly label = 'MaxPreps (not wired up yet)';

  async fetchFinals(_week: Week, items: SlateItem[]): Promise<RawFinal[]> {
    const refs = items.filter((i) => i.kind === 'game' && i.sourceRef?.startsWith('maxpreps:'));
    if (refs.length === 0) throw new Error('No game items have a "maxpreps:<game url>" source ref yet — use "Load sample finals" or enter scores manually.');
    throw new Error('MaxPreps fetcher is not implemented in the prototype — use "Load sample finals" or enter scores manually.');
  }
}

/**
 * TODO(weather): settle weather facts from NOAA/NWS observations (free, public, no key).
 *  - source_ref "nws:KLVK" (Livermore) / "nws:KCCR" (Concord) station id + item date.
 *  - GET https://api.weather.gov/stations/{id}/observations?start=...&end=... and take max temp (°F).
 */
export class NwsWeatherProvider implements ResultsProvider {
  readonly id = 'nws';
  readonly label = 'NWS weather (not wired up yet)';
  async fetchFinals(): Promise<RawFinal[]> {
    throw new Error('NWS weather fetcher is not implemented in the prototype.');
  }
}
