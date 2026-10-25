# Task M3a — availability fields for items (engine files are provided)

## Goal
Store the new item availability fields (`inStore`, `requiredAlly`, `requiredChampion`) in SQLite, and wire the provided recommendation engine files into the project without changing their code.

## Rule for this task
You only WRITE files. Do NOT run any command (no npm, no node, no git). The owner runs all checks.

## Already provided by the owner (copy as-is, do not edit)
src/shared/ddragon.ts                (REPLACES the old file: Item has three new fields)
src/shared/item-traits.ts, src/shared/rules.ts, src/shared/recommend.ts   (the engine; pure functions, no I/O)
src/main/db/migrations/0004_item_availability.sql
data/rules.json, data/champion-tags.json
tests/helpers/items.ts
tests/unit/item-traits.test.ts, recommend.test.ts, rules-data.test.ts
tests/unit/ddragon-parse.test.ts     (REPLACES the old file)
tests/integration/items-inspect.test.ts

## Modify
src/main/db/migrations/index.ts      (register version 4 from `0004_item_availability.sql?raw`)
src/main/db/static-data-repo.ts      (step 1)
tests/integration/static-data-repo.test.ts   (step 2)
tests/integration/db-migrate.test.ts          (wherever the real `migrations` array is used the expected schema version is now 4; custom migration arrays stay unchanged)
tests/unit/ipc-handlers.test.ts               (db:info now expects schemaVersion 4)
package.json                          (ONLY add the script `"inspect:items": "cross-env LIVE=1 vitest run tests/integration/items-inspect.test.ts"`)
.gitignore                            (add a line `tmp/`)
docs/progress.md                      (append one line)

## Do not touch
AGENTS.md, docs/decisions.md, docs/stages.md, docs/tasks/*, the "provided" files above, tsconfig*.json, eslint.config.js, vitest.config.mts, any Riot API file.

## Dependencies
None.

## Steps

1. src/main/db/static-data-repo.ts: the `items` table has three new columns. In `savePatch` add them to the INSERT: `in_store` (1 or 0 from `inStore`), `required_ally` and `required_champion` (the string, or NULL when `null`). In `listItems` read them back as `inStore: boolean` (`in_store === 1`), `requiredAlly: string | null`, `requiredChampion: string | null`. `listItems` must still return values deep-equal to what was saved.

2. tests/integration/static-data-repo.test.ts: keep the existing tests. Add one test: save a patch whose items include one item with `inStore: false`, `requiredAlly: 'Ornn'`, `requiredChampion: null` and another with `inStore: true`, `requiredAlly: null`, `requiredChampion: 'Viktor'` (spread a fixture item and change `id` and these fields); read it back with `listItems` and expect deep equality.

3. Other existing tests and code that build `Item` objects by hand (if any) must get the three new fields (`inStore: true`, `requiredAlly: null`, `requiredChampion: null`) so that typecheck passes. Search `src/` and `tests/` for object literals typed as `Item`; do not edit the provided files.

4. Migration note: version 4 deletes the cached static data on purpose. Nothing else needs to change in the UI: the owner presses "Update data" once after upgrading.

5. Append one line to docs/progress.md: `M3a files written, awaiting owner checks`.

## Acceptance (the owner runs these)
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` exit 0
- `npm run dev`: the window shows schema v4 and `no data yet`; "Update data" fetches the patch again
- `npm run inspect:items` passes and writes `tmp/items-inspect.txt`

## Forbidden
Editing the engine, data or provided test files, new dependencies, UI changes, IPC changes, running commands, changing paths or names above.

## Stop and ask when
A provided file does not compile in your environment; any step contradicts the provided files.
