ALTER TABLE research_crawl ADD COLUMN focus_champion_id TEXT;
ALTER TABLE research_crawl ADD COLUMN focus_role TEXT;
ALTER TABLE research_crawl ADD COLUMN focus_target INTEGER NOT NULL DEFAULT 100;
ALTER TABLE research_frontier ADD COLUMN priority INTEGER NOT NULL DEFAULT 0;
