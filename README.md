# 🏈 Friday Night Picks — East Bay HS Prediction League (prototype)

A skill-based weekly prediction contest for Brentwood / Bay Area high school sports.
Players pay **$10/week into a fixed prize pool**, predict **one number per slate item** (a game total,
one team's score, or a public fact like Brentwood's high temp), and the **closest without going over** wins each item.
Most points takes the pot.

Runs 100% locally: Vite + React + TypeScript frontend, Express API, SQLite (better-sqlite3). No external APIs or credentials.

## Run it

Requires **Node 22+** (`nvm use` reads `.nvmrc`).

```bash
cd prediction-league
npm install
npm run dev
```

Open **http://localhost:5173** (API runs on http://localhost:3001/api and is proxied by Vite).

On first boot the database (`data/league.db`) is created and seeded automatically.

| Script | What it does |
| --- | --- |
| `npm run dev` | API (tsx watch, :3001) + Vite (:5173) together |
| `npm run seed` | Wipe and re-seed demo data (stop `dev` first, or use **Admin → Reset demo data** in the UI) |
| `npm test` | Scoring engine unit tests |
| `npm run typecheck` | TypeScript check (client + server + shared) |
| `npm start` | Production build, served by Express on http://localhost:3001 |

## Pages

| Route | What |
| --- | --- |
| `/` | Hero + current pot, all weeks (pool / paid / payout status), season money list, rules |
| `/join` | Register (display name + email) or pick a demo player. Stored in localStorage — no real auth in v1 |
| `/week/:id` | Player view: pay $10 (simulated), enter one number per item, edit until locked |
| `/week/:id/leaderboard` | Standings (points, wins, exact hits, Δ under, busts, payout) + item-by-item results |
| `/admin` | Weeks table, create a week, reset demo data |
| `/admin/week/:id` | Build slate → lock → load/enter finals → finalize → mark payout paid; entrant/payment list |

## Demo script (≈3 minutes)

Seed state: **Week 9** is final and paid out ($60 to Falcon Frank). **Week 10** is open with 4 paid entrants ($40 pot) + 1 unpaid.

1. **Home** (`/`) — show the $40 Week 10 pot, Week 9's result, and the season money list.
2. **Admin → Manage Week 10** — add a game: away `Antioch Panthers`, home `Pittsburg Pirates`, Predict = *Total points* → **+ Add to slate**.
   (Or **Create a week** on `/admin` to build a fresh slate from scratch — try a 🌡️ Fact like "Brentwood high °F".)
3. **Sign in** (top right) → register a new player (e.g. "Christian", any email) → you land on Week 10.
4. **Pay $10 (simulated)** — the pot ticks up to $50 and you get a `SIM-…` payment ref.
5. Enter one number per item → **Lock in picks**. (Try a Big Game total of 55, Pittsburg 27, weather 70.)
6. **Leaderboard** — picks are hidden while the slate is open.
7. **Admin → Week 10 → ⚡ Load sample finals** — simulates the MaxPreps/weather pull and locks the slate.
   Scores can be reviewed/overridden by hand, then **Save finals**.
8. **🏁 Finalize & score week** → **💸 Mark $50 paid to …**.
9. **Leaderboard** — 🏆 winner, payout, and per-item breakdown: green = won, strike-through = went over, `−n` = distance under.
10. **Admin → ↺ Reset demo data** to run it again.

## Rules as implemented (`shared/scoring.ts`)

- Each item is worth **1 point**. A prediction **over** the final busts.
- **Exact match wins first**; otherwise the highest prediction ≤ final wins.
- Identical winning numbers **split the point** (e.g. 0.5 each). If everyone busts, nobody scores the item.
- Weekly rank: **points ↓ → exact hits ↓ → total distance-under ↑**. Anyone still tied for 1st **splits the pool** (pennies go to the first listed).
- **Pool = paid entrants × entry fee** (default $10). Only paid entries are scored. 100% paid out — no rake, no player-to-player transfers.
- Picks are editable until the week is locked (admin "Lock picks", or automatically when finals are loaded/entered). Others' picks are hidden until lock.

## Project layout

```
shared/            types + pure scoring engine (+ tests) — used by API and UI
server/
  index.ts         Express app, auto-seed, serves dist/ in production
  routes.ts        REST API (/api/...)
  seed.ts          demo users/weeks/predictions
  db/schema.sql    SQLite schema (Postgres-portable; notes inside)
  repo/            LeagueRepository interface + SQLite implementation  ← Supabase swap point
  results/         ResultsProvider interface, Sample provider, MaxPreps/NWS stubs  ← MaxPreps plug-in point
src/               React app (pages/, components/ui.tsx, api.ts, session.tsx)
```

### API (selected)
`GET /api/weeks` · `POST /api/weeks` · `GET /api/weeks/:id` · `PATCH /api/weeks/:id` (lock/reopen) ·
`POST /api/weeks/:id/items` · `DELETE /api/items/:id` · `POST /api/users` ·
`POST /api/weeks/:id/entries` · `POST /api/entries/:id/pay` · `PUT /api/entries/:id/predictions` ·
`POST /api/weeks/:id/results/load {provider}` · `PUT /api/weeks/:id/results` · `POST /api/weeks/:id/finalize` ·
`POST /api/weeks/:id/payout` · `GET /api/weeks/:id/leaderboard` · `GET /api/season` · `POST /api/admin/reset-demo`

## Later: MaxPreps auto-scoring

- `server/results/ResultsProvider.ts` defines `fetchFinals(week, items) → RawFinal[]` (home/away score or value).
- `server/results/MaxPrepsResultsProvider.ts` is the stub to fill in: store each game's MaxPreps URL in the item's
  **source ref** as `maxpreps:<url>` (field exists in the Add-game form), fetch, accept only status *Final*, return scores.
  Check MaxPreps' terms first; fallbacks are NCS/league result pages or a licensed data feed.
- Weather facts: `NwsWeatherProvider` stub — `nws:<station>` ref (e.g. KLVK/KCCR), max temp from api.weather.gov observations (free, no key).
- Register providers in `server/results/index.ts`; the admin page lists them automatically. Add a cron (Sat/Sun) that loads
  finals and calls finalize when every item is settled.

## Later: Supabase

- Run `server/db/schema.sql` in Supabase (adjust types per the header comment), add RLS:
  users see only their own entries/predictions; everyone's picks readable once `weeks.status <> 'open'`; admin role for writes.
- Implement `SupabaseLeagueRepository implements LeagueRepository` (all methods are already async) and select it in `server/repo/index.ts`.
- Replace the localStorage "pick a user" session (`src/session.tsx`, `userId` in request bodies) with Supabase Auth; gate `/admin`.

## Prototype assumptions / not built

- **Payments are simulated** (`POST /entries/:id/pay`); payouts are a "mark paid" ledger. Real money needs Stripe (Checkout + webhook)
  and a payout rail, plus a legal review of California rules for paid-entry skill contests (age limits, eligibility, no minors).
- No auth, no admin protection, no auto-lock at kickoff (lock time is shown; admin locks manually or by loading finals).
- Seed matchups are **illustrative**, not the real 2026 schedule; sample finals are fixed for seeded items and pseudo-random for new ones.
- Predictions: numbers 0–999, decimals allowed. Unfilled items count as "missing" (no point).
