import type { ResultsProvider } from './ResultsProvider';
import { SampleResultsProvider } from './SampleResultsProvider';
import { MaxPrepsResultsProvider, NwsWeatherProvider } from './MaxPrepsResultsProvider';

/** Registered providers. Add real ones here; the admin UI lists them automatically. */
export const providers: Record<string, ResultsProvider> = {
  sample: new SampleResultsProvider(),
  maxpreps: new MaxPrepsResultsProvider(),
  nws: new NwsWeatherProvider(),
};
