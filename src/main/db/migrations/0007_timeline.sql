ALTER TABLE participants ADD COLUMN participant_id INTEGER;

CREATE TABLE timeline_events (
  id           INTEGER PRIMARY KEY,
  match_id     TEXT    NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
  puuid        TEXT    NOT NULL,
  type         TEXT    NOT NULL,
  timestamp_ms INTEGER NOT NULL,
  item_id      INTEGER,
  skill_slot   INTEGER,
  level        INTEGER
) STRICT;

CREATE INDEX timeline_events_lookup ON timeline_events(puuid, type, timestamp_ms);
