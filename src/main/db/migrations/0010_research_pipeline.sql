CREATE TABLE research_crawl (
  id                INTEGER PRIMARY KEY CHECK (id = 1),
  patch              TEXT,
  status             TEXT    NOT NULL DEFAULT 'idle',
  target_matches     INTEGER NOT NULL DEFAULT 5000,
  daily_request_cap  INTEGER NOT NULL DEFAULT 20000,
  requests_today     INTEGER NOT NULL DEFAULT 0,
  request_day        TEXT    NOT NULL DEFAULT '',
  emerald_plus       INTEGER NOT NULL DEFAULT 0,
  started_at         INTEGER,
  updated_at         INTEGER NOT NULL DEFAULT 0,
  last_error         TEXT,
  seeds_exhausted    INTEGER NOT NULL DEFAULT 0
) STRICT;

INSERT OR IGNORE INTO research_crawl
  (id, status, target_matches, daily_request_cap, updated_at)
VALUES (1, 'idle', 5000, 20000, 0);

CREATE TABLE research_patch_seen (
  patch         TEXT PRIMARY KEY,
  first_seen_at INTEGER NOT NULL
) STRICT;

CREATE TABLE research_frontier (
  puuid       TEXT PRIMARY KEY,
  tier_bucket TEXT NOT NULL,
  state       TEXT NOT NULL DEFAULT 'pending',
  added_at    INTEGER NOT NULL
) STRICT;

CREATE INDEX research_frontier_state ON research_frontier(state, added_at);

CREATE TABLE research_seen_matches (
  match_id TEXT PRIMARY KEY,
  patch    TEXT NOT NULL,
  seen_at  INTEGER NOT NULL,
  discarded TEXT
) STRICT;

CREATE INDEX research_seen_matches_patch ON research_seen_matches(patch);

CREATE TABLE research_rows (
  match_id      TEXT    NOT NULL REFERENCES research_matches(match_id) ON DELETE CASCADE,
  team_id       INTEGER NOT NULL,
  tier_bucket   TEXT,
  champion_id   INTEGER NOT NULL,
  team_position TEXT    NOT NULL,
  win           INTEGER NOT NULL,
  item0         INTEGER NOT NULL,
  item1         INTEGER NOT NULL,
  item2         INTEGER NOT NULL,
  item3         INTEGER NOT NULL,
  item4         INTEGER NOT NULL,
  item5         INTEGER NOT NULL,
  keystone      INTEGER,
  primary_style INTEGER,
  sub_style     INTEGER,
  primary_rune_ids   TEXT NOT NULL,
  secondary_rune_ids TEXT NOT NULL,
  stat_shard_ids TEXT   NOT NULL,
  patch         TEXT    NOT NULL,
  PRIMARY KEY (match_id, team_id, team_position, champion_id)
) STRICT;

CREATE INDEX research_rows_patch_champion_role
  ON research_rows(patch, champion_id, team_position);
CREATE INDEX research_rows_patch_role
  ON research_rows(patch, team_position, champion_id);
CREATE INDEX research_rows_match ON research_rows(match_id);
