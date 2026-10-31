CREATE TABLE research_snapshots (
  id             INTEGER PRIMARY KEY,
  patch          TEXT    NOT NULL,
  region         TEXT    NOT NULL,
  queue_id       INTEGER NOT NULL,
  rank_scope     TEXT    NOT NULL,
  created_at     INTEGER NOT NULL,
  target_matches INTEGER NOT NULL
) STRICT;

CREATE TABLE research_matches (
  match_id      TEXT    PRIMARY KEY,
  snapshot_id   INTEGER NOT NULL REFERENCES research_snapshots(id) ON DELETE CASCADE,
  platform      TEXT    NOT NULL,
  patch         TEXT    NOT NULL,
  queue_id      INTEGER NOT NULL,
  game_version  TEXT    NOT NULL,
  game_creation INTEGER NOT NULL,
  duration_s    INTEGER NOT NULL,
  remake        INTEGER NOT NULL
) STRICT;

CREATE INDEX research_matches_snapshot ON research_matches(snapshot_id);
CREATE INDEX research_matches_patch ON research_matches(patch);

CREATE TABLE research_participants (
  match_id        TEXT    NOT NULL REFERENCES research_matches(match_id) ON DELETE CASCADE,
  participant_id  INTEGER NOT NULL,
  team_id         INTEGER NOT NULL,
  champion_id     INTEGER NOT NULL,
  team_position   TEXT    NOT NULL,
  win             INTEGER NOT NULL,
  items           TEXT    NOT NULL,
  perks           TEXT,
  summoner1       INTEGER NOT NULL,
  summoner2       INTEGER NOT NULL,
  kills           INTEGER NOT NULL,
  deaths          INTEGER NOT NULL,
  assists         INTEGER NOT NULL,
  gold_earned     INTEGER NOT NULL,
  damage_champions INTEGER NOT NULL,
  vision_score    INTEGER NOT NULL,
  cs              INTEGER NOT NULL,
  PRIMARY KEY (match_id, participant_id)
) STRICT;

CREATE INDEX research_participants_champion ON research_participants(champion_id, team_position);
CREATE INDEX research_participants_team ON research_participants(match_id, team_id, team_position);

CREATE TABLE research_bans (
  match_id     TEXT    NOT NULL REFERENCES research_matches(match_id) ON DELETE CASCADE,
  team_id      INTEGER NOT NULL,
  champion_id  INTEGER NOT NULL,
  PRIMARY KEY (match_id, team_id, champion_id)
) STRICT;

CREATE INDEX research_bans_champion ON research_bans(champion_id);
