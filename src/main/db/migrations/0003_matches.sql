CREATE TABLE accounts (
  puuid     TEXT PRIMARY KEY,
  game_name TEXT    NOT NULL,
  tag_line  TEXT    NOT NULL,
  platform  TEXT    NOT NULL,
  added_at  INTEGER NOT NULL
) STRICT;

CREATE TABLE matches (
  match_id      TEXT PRIMARY KEY,
  platform      TEXT    NOT NULL,
  queue_id      INTEGER NOT NULL,
  patch         TEXT    NOT NULL, -- "16.21"
  game_version  TEXT    NOT NULL,
  game_creation INTEGER NOT NULL, -- epoch ms
  duration_s    INTEGER NOT NULL,
  remake        INTEGER NOT NULL  -- 0 or 1
) STRICT;

CREATE INDEX matches_patch ON matches(patch);

CREATE TABLE participants (
  match_id      TEXT    NOT NULL REFERENCES matches(match_id) ON DELETE CASCADE,
  slot          INTEGER NOT NULL, -- order inside the match, 0-based
  puuid         TEXT,             -- set ONLY for tracked accounts, NULL for everyone else
  team_id       INTEGER NOT NULL,
  champion_id   INTEGER NOT NULL,
  position      TEXT    NOT NULL,
  win           INTEGER NOT NULL, -- 0 or 1
  items         TEXT    NOT NULL, -- JSON array of 6 numbers
  trinket       INTEGER NOT NULL,
  summoner1     INTEGER NOT NULL,
  summoner2     INTEGER NOT NULL,
  keystone      INTEGER,
  primary_style INTEGER,
  sub_style     INTEGER,
  PRIMARY KEY (match_id, slot)
) STRICT;

CREATE INDEX participants_puuid ON participants(puuid, champion_id);
