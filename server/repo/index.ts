/**
 * Repository wiring. To move to Supabase:
 *   1. Run server/db/schema.sql (Postgres-adjusted) in the Supabase SQL editor.
 *   2. Implement SupabaseLeagueRepository implements LeagueRepository (same method contract).
 *   3. Return it here when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are set.
 */
import { SqliteLeagueRepository } from './SqliteLeagueRepository';

export const repo = new SqliteLeagueRepository();
export type { LeagueRepository } from './LeagueRepository';
