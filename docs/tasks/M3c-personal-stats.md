# Task M3c — personal statistics next to the recommendations

## Goal
Show, under the recommendations, my own record on the chosen champion, my usual build on it, and my record against each selected enemy champion, computed from the matches stored by the Riot sync.

## Rule for this task
You only WRITE files. Do NOT run any command (no npm, no node, no git). The owner runs all checks.

## Already provided by the owner (copy as-is, do not edit)
src/shared/personal.ts                         (types PersonalStats, MyGame, BuildEntry, MatchupEntry; queues 400/420/440; `summarizeBuild`, `isLowSample`)
src/shared/recommend-api.ts                    (REPLACES the old file: `RecommendResponse` has a new field `personal: PersonalStats | null`)
src/main/db/personal-stats-repo.ts             (SQL: `listMyGames`, `matchupRecord`)
src/main/services/personal-stats-service.ts    (`PersonalStatsService`, interface `TrackedAccount`)
src/main/services/recommendation-service.ts    (REPLACES the old file: optional `personal` dependency)
tests/helpers/db.ts                            (in-memory database with all migrations, `insertMatch`)
tests/unit/personal.test.ts, tests/unit/recommendation-service.test.ts (REPLACES), tests/integration/personal-stats.test.ts

## Modify
src/main/index.ts
src/renderer/pages/RecommendPage.tsx
docs/progress.md (append one line)

## Do not touch
AGENTS.md, docs/decisions.md, docs/stages.md, docs/tasks/*, the "provided" files above, package.json, tsconfig*.json, eslint.config.js, vitest.config.mts, migrations, any Riot API or static-data file, tests that are not listed.

## Dependencies
None.

## Steps

1. src/main/index.ts: build `new PersonalStatsService({ db, getAccount })` where `getAccount` returns `null` when `getAccount(db)` (from `matches-repo`) returns `null`, otherwise `{ puuid, gameName, tagLine }` of the stored account. Pass the service as `personal` when constructing the existing `RecommendationService`. Nothing else changes.

2. Search `src/` and `tests/` for object literals explicitly typed as `RecommendResponse` (if any) and add `personal: null` to them. Do not touch provided files.

3. src/renderer/pages/RecommendPage.tsx: keep everything that exists. Below the Boots list render a block from `result.personal`:
   - `null`: the text `Personal stats: no account set.`
   - otherwise a heading `Your stats ({personal.account})` and:
     - if `personal.games === 0`: `No games on {me.name} yet.`; otherwise `{me.name}: {games} games, {wins} wins ({round(wins / games * 100)}%)` followed by ` · low sample` when `personal.lowSample` is true;
     - when `personal.build` is not empty: the label `Your usual build:` and a bullet list `{name} — {games} of {personal.games} games`;
     - when `personal.vs` is not empty: the label `Against this team:` and a bullet list; each entry `{enemyName}: {games} games, {wins} wins`, followed by ` · low sample` when `lowSample` is true; entries with `games === 0` read `{enemyName}: no games`.
   - Plain unstyled elements. No new network calls: the data arrives in the same `recommend:run` response.

4. Append one line to docs/progress.md: `M3c files written, awaiting owner checks`.

## Acceptance (the owner runs these)
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` exit 0
- `npm run dev` after "Sync matches": choose a champion you played in your flex or normal games, add a few enemies: the block shows your games and wins on that champion (ARAM and remakes are not counted), a build list, and a line per enemy. A champion you never played shows `No games on ... yet.`
- Without a set account the block says `Personal stats: no account set.`

## Forbidden
SQL or business logic in the renderer, changing the provided files, new dependencies, extra IPC channels, styling work, running commands, changing paths or names above.

## Stop and ask when
A provided file does not compile in your environment (for example `tests/helpers/db.ts` cannot find `openDb`, `runMigrations` or `migrations`); a step contradicts the provided files.
