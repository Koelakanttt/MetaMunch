CREATE TABLE champion_details (
  patch TEXT NOT NULL,
  id    TEXT NOT NULL,
  json  TEXT NOT NULL,
  PRIMARY KEY (patch, id)
) STRICT;
