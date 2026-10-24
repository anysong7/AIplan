PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  queries TEXT NOT NULL DEFAULT '[]',
  source_kinds TEXT,
  interval_sec INTEGER NOT NULL DEFAULT 1800,
  min_credibility REAL NOT NULL DEFAULT 0.65,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_scan_at TEXT
);

CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  weight REAL NOT NULL DEFAULT 0.5,
  enabled INTEGER NOT NULL DEFAULT 1,
  cursor TEXT,
  etag TEXT,
  last_modified TEXT,
  last_fetch_at TEXT,
  fail_count INTEGER NOT NULL DEFAULT 0,
  cooldown_until TEXT,
  health TEXT NOT NULL DEFAULT 'ok',
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_sources_kind_url ON sources(kind, IFNULL(url, ''));

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  source_id INTEGER NOT NULL REFERENCES sources(id),
  platform TEXT NOT NULL,
  external_id TEXT NOT NULL,
  url_hash TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT,
  author TEXT,
  author_handle TEXT,
  author_followers INTEGER,
  author_verified INTEGER NOT NULL DEFAULT 0,
  author_created_at TEXT,
  published_at TEXT,
  fetched_at TEXT NOT NULL,
  lang TEXT,
  is_first_party INTEGER NOT NULL DEFAULT 0,
  impersonation INTEGER NOT NULL DEFAULT 0,
  typosquat INTEGER NOT NULL DEFAULT 0,
  metrics_json TEXT,
  raw_json TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_items_platform_external ON items(platform, external_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_items_url_hash ON items(url_hash);
CREATE INDEX IF NOT EXISTS ix_items_published ON items(published_at DESC);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT,
  first_seen_at TEXT NOT NULL,
  last_updated_at TEXT NOT NULL,
  item_count INTEGER NOT NULL DEFAULT 1,
  source_count INTEGER NOT NULL DEFAULT 1,
  independent_domains INTEGER NOT NULL DEFAULT 1,
  source_trust REAL NOT NULL DEFAULT 0,
  corroboration REAL NOT NULL DEFAULT 0,
  rumor REAL NOT NULL DEFAULT 0,
  credibility REAL NOT NULL DEFAULT 0,
  heat REAL NOT NULL DEFAULT 0,
  verdict TEXT NOT NULL DEFAULT 'unverified',
  status TEXT NOT NULL DEFAULT 'open'
);
CREATE INDEX IF NOT EXISTS ix_events_last_updated ON events(last_updated_at DESC);

CREATE TABLE IF NOT EXISTS event_items (
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, item_id)
);

CREATE TABLE IF NOT EXISTS watches (
  id INTEGER PRIMARY KEY,
  keyword TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  exclude_terms TEXT NOT NULL DEFAULT '[]',
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  min_credibility REAL NOT NULL DEFAULT 0.65,
  interval_sec INTEGER NOT NULL DEFAULT 1800,
  channels TEXT NOT NULL DEFAULT '["inpage","email"]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_scan_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_watches_keyword ON watches(keyword);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  watch_id INTEGER REFERENCES watches(id) ON DELETE SET NULL,
  topic_id INTEGER REFERENCES topics(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  score REAL NOT NULL,
  verdict TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_alerts_created ON alerts(created_at DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  alert_id INTEGER REFERENCES alerts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  preview_url TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY,
  item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
  verdict TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_usage (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL,
  day TEXT NOT NULL,
  calls INTEGER NOT NULL DEFAULT 0,
  units INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  UNIQUE(source, day)
);

CREATE TABLE IF NOT EXISTS crawl_cache (
  url_hash TEXT PRIMARY KEY,
  host TEXT NOT NULL,
  etag TEXT,
  last_modified TEXT,
  content_hash TEXT,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS robots_cache (
  host TEXT PRIMARY KEY,
  rules_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_usage (
  id INTEGER PRIMARY KEY,
  provider TEXT,
  model TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  purpose TEXT,
  created_at TEXT NOT NULL
);
