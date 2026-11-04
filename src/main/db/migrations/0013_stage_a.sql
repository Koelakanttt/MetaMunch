-- Retire identifiers left by the old focus frontier.
DELETE FROM research_frontier WHERE state = 'done';

-- Existing installs with an account keep Labs enabled; fresh databases stay off.
UPDATE settings
SET value = '1'
WHERE key = 'labs.enabled'
  AND EXISTS (SELECT 1 FROM accounts);

INSERT OR IGNORE INTO settings (key, value)
SELECT 'labs.enabled', '1'
WHERE EXISTS (SELECT 1 FROM accounts);
