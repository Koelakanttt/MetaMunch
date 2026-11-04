-- Stage C: compact research timelines. One row per participant of a matches that were sampled.
CREATE TABLE research_timelines (
  match_id        TEXT    NOT NULL REFERENCES research_matches(match_id) ON DELETE CASCADE,
  participant_id  INTEGER NOT NULL,
  team_id         INTEGER NOT NULL,
  champion_id     INTEGER NOT NULL,
  team_position   TEXT    NOT NULL,
  role_source     TEXT    NOT NULL,
  tier_bucket     TEXT,
  win             INTEGER NOT NULL,
  patch           TEXT    NOT NULL,
  purchase_order  TEXT    NOT NULL,
  starting_items  TEXT    NOT NULL,
  skill_order     TEXT    NOT NULL,
  summoner_spells TEXT    NOT NULL,
  stat_shards     TEXT    NOT NULL,
  PRIMARY KEY (match_id, participant_id)
) STRICT;

CREATE INDEX research_timelines_patch_champion_role
  ON research_timelines(patch, champion_id, team_position);
CREATE INDEX research_timelines_match ON research_timelines(match_id);
