ALTER TABLE participants ADD COLUMN role_source TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE research_rows ADD COLUMN role_source TEXT NOT NULL DEFAULT 'unknown';

CREATE TABLE lp_history (
  id            INTEGER PRIMARY KEY,
  queue_type    TEXT    NOT NULL,
  tier          TEXT    NOT NULL,
  division      TEXT    NOT NULL,
  league_points INTEGER NOT NULL,
  wins          INTEGER NOT NULL,
  losses        INTEGER NOT NULL,
  captured_at   INTEGER NOT NULL
) STRICT;

CREATE INDEX lp_history_captured ON lp_history(captured_at);

CREATE TABLE match_timeline_summaries (
  match_id       TEXT    PRIMARY KEY REFERENCES matches(match_id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL,
  source_patch   TEXT    NOT NULL,
  payload_json   TEXT    NOT NULL,
  state          TEXT    NOT NULL,
  fetched_at     INTEGER NOT NULL
) STRICT;

CREATE TABLE match_reviews (
  match_id       TEXT    PRIMARY KEY REFERENCES matches(match_id) ON DELETE CASCADE,
  fix_text       TEXT    NOT NULL DEFAULT '',
  checklist_json TEXT    NOT NULL DEFAULT '{}',
  tags_json      TEXT    NOT NULL DEFAULT '[]',
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
) STRICT;
