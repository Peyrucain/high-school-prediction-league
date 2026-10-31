/**
 * Pluggable final-result sources.
 *
 * The admin "Load finals" action asks a provider for raw finals for every item in a week, writes
 * them onto slate_items (home/away scores or fact value), and the scoring engine derives the
 * settled number from each item's metric. The admin can always review/override before finalizing.
 *
 * v1 ships SampleResultsProvider (simulated MaxPreps pull, no network).
 * MaxPrepsResultsProvider and NwsWeatherProvider are stubs showing where the real fetchers go.
 */
import type { SlateItem, Week } from '../../shared/types';

export interface RawFinal {
  itemId: number;
  homeScore?: number | null; // games
  awayScore?: number | null; // games
  value?: number | null; // facts
  source: string; // human-readable provenance, e.g. "MaxPreps (simulated)"
}

export interface ResultsProvider {
  readonly id: string;
  readonly label: string;
  /** Return finals for whatever items this provider can settle; skip items it can't. */
  fetchFinals(week: Week, items: SlateItem[]): Promise<RawFinal[]>;
}
