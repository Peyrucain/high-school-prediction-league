-- Prediction League schema (SQLite).
-- Written to be Postgres/Supabase-portable: swap INTEGER PRIMARY KEY AUTOINCREMENT -> bigint generated
-- always as identity, TEXT timestamps -> timestamptz, INTEGER booleans -> boolean, REAL -> numeric.
-- Supabase notes: add RLS so users can only read/write their own entries/predictions, and hide
-- other users' predictions until weeks.status <> 'open'.

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  display_name  TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS weeks (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  label            TEXT NOT NULL,
  starts_on        TEXT NOT NULL,
  locks_at         TEXT,
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','locked','final')),
  entry_fee_cents  INTEGER NOT NULL DEFAULT 1000,
  payout_status    TEXT NOT NULL DEFAULT 'pending' CHECK (payout_status IN ('pending','paid')),
  payout_paid_at   TEXT,
  finalized_at     TEXT,
  created_at       TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS slate_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id       INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN ('game','fact')),
  title         TEXT NOT NULL,
  home_team     TEXT,
  away_team     TEXT,
  metric        TEXT NOT NULL CHECK (metric IN ('total','home','away','value')),
  target_label  TEXT NOT NULL,
  unit          TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  home_score    INTEGER,
  away_score    INTEGER,
  final_value   REAL,
  source_ref    TEXT
);

CREATE TABLE IF NOT EXISTS entries (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id      INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  paid         INTEGER NOT NULL DEFAULT 0,
  paid_at      TEXT,
  payment_ref  TEXT,             -- simulated now; Stripe PaymentIntent id later
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (week_id, user_id)
);

CREATE TABLE IF NOT EXISTS predictions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_id    INTEGER NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  item_id     INTEGER NOT NULL REFERENCES slate_items(id) ON DELETE CASCADE,
  value       REAL NOT NULL,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (entry_id, item_id)
);

-- Ledger of what was actually paid out when admin marks a week's payout as sent.
CREATE TABLE IF NOT EXISTS payouts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  week_id       INTEGER NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_cents  INTEGER NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
