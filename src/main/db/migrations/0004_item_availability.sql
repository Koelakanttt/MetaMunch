-- Cached static data is wiped so the next "Update data" refetches it with the new columns.
DELETE FROM items;
DELETE FROM champions;
DELETE FROM patches;

ALTER TABLE items ADD COLUMN in_store INTEGER NOT NULL DEFAULT 1;
ALTER TABLE items ADD COLUMN required_ally TEXT;
ALTER TABLE items ADD COLUMN required_champion TEXT;
