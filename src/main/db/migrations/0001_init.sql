CREATE TABLE patches (
  version    TEXT PRIMARY KEY,
  fetched_at INTEGER NOT NULL
) STRICT;

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
