PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS world_gold_history (
  ts INTEGER PRIMARY KEY,
  price REAL NOT NULL,
  source TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_world_gold_ts
ON world_gold_history(ts);

CREATE TABLE IF NOT EXISTS vn_gold_latest (
  brand TEXT NOT NULL,
  product TEXT NOT NULL,
  product_name TEXT NOT NULL,
  buy REAL NOT NULL,
  sell REAL NOT NULL,
  source_url TEXT NOT NULL,
  source_kind TEXT,
  verification_state TEXT,
  verification_sources TEXT,
  quality_state TEXT,
  quality_reason TEXT,
  deviation_pct REAL,
  consensus_price REAL,
  observed_at TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (brand, product)
);

CREATE TABLE IF NOT EXISTS vn_gold_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  brand TEXT NOT NULL,
  product TEXT NOT NULL,
  product_name TEXT NOT NULL,
  buy REAL NOT NULL,
  sell REAL NOT NULL,
  source_url TEXT NOT NULL,
  source_kind TEXT,
  verification_state TEXT
);

CREATE INDEX IF NOT EXISTS idx_vn_gold_history_lookup
ON vn_gold_history(brand, product, ts);

CREATE TABLE IF NOT EXISTS provider_status (
  brand TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS fx_latest (
  pair TEXT PRIMARY KEY,
  value REAL NOT NULL,
  observed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cron_log (
  job TEXT PRIMARY KEY,
  last_run_at INTEGER NOT NULL,
  last_ok_at INTEGER,
  last_error TEXT
);
