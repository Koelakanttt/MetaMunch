CREATE TABLE champions (
  patch TEXT    NOT NULL REFERENCES patches(version),
  key   INTEGER NOT NULL,
  id    TEXT    NOT NULL,
  name  TEXT    NOT NULL,
  tags  TEXT    NOT NULL, -- JSON array of strings
  info  TEXT    NOT NULL, -- JSON {attack, defense, magic, difficulty}
  stats TEXT    NOT NULL, -- JSON object of base stats
  PRIMARY KEY (patch, key)
) STRICT;

CREATE TABLE items (
  patch       TEXT    NOT NULL REFERENCES patches(version),
  id          INTEGER NOT NULL,
  name        TEXT    NOT NULL,
  plaintext   TEXT    NOT NULL,
  description TEXT    NOT NULL,
  tags        TEXT    NOT NULL, -- JSON array of strings
  stats       TEXT    NOT NULL, -- JSON object of stat modifiers
  gold_total  INTEGER NOT NULL,
  purchasable INTEGER NOT NULL, -- 0 or 1
  from_ids    TEXT    NOT NULL, -- JSON array of numbers
  into_ids    TEXT    NOT NULL, -- JSON array of numbers
  maps        TEXT    NOT NULL, -- JSON object map id -> boolean
  PRIMARY KEY (patch, id)
) STRICT;
