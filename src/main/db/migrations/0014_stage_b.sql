-- Data-correctness defaults introduced after the Stage B audit.
UPDATE research_crawl SET focus_target = 500 WHERE focus_target = 100;

UPDATE research_rows SET tier_bucket = 'unknown' WHERE tier_bucket IS NULL;

ALTER TABLE research_frontier ADD COLUMN match_offset INTEGER NOT NULL DEFAULT 0;
