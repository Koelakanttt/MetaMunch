# Task M1 — Data Dragon static data with per-patch cache

## Goal
Fetch champions and items for the current EUW patch from Data Dragon, store them in SQLite per patch, and show the status with an "Update data" button.

## Rule for this task
You only WRITE files. Do NOT run any command (no npm, no node, no git). The owner runs all checks.

## Already provided by the owner (copy as-is, do not edit)
src/shared/ddragon.ts                      (types, zod schemas, parseRealmVersion / parseChampionList / parseItemList)
src/main/providers/data-dragon.ts          (interface DataDragonProvider)
src/main/db/migrations/0002_static_data.sql
tests/fixtures/ddragon/realm-euw.json, champion.json, item.json   (synthetic, shaped like Data Dragon)
tests/unit/ddragon-parse.test.ts

## Create
src/main/providers/http-data-dragon.ts
src/main/db/static-data-repo.ts
src/main/services/static-data-service.ts
tests/unit/http-data-dragon.test.ts
tests/integration/static-data-repo.test.ts
tests/integration/static-data-service.test.ts
tests/integration/ddragon-live.test.ts

## Modify
package.json (ONLY add the script `"test:live": "cross-env LIVE=1 vitest run tests/integration/ddragon-live.test.ts"`)
src/main/db/migrations/index.ts (register version 2)
src/shared/ipc.ts (two channels, step 5)
src/main/ipc/handlers.ts
src/main/index.ts
src/renderer/App.tsx
docs/progress.md (append one line)

## Do not touch
AGENTS.md, docs/decisions.md, docs/stages.md, docs/tasks/*, the "provided" files above, tsconfig*.json, eslint.config.js, vitest.config.mts.

## Dependencies
zod@4 is needed by src/shared/ddragon.ts. Do NOT edit dependencies; the owner installs it (`npm install -E zod`).

## Steps

1. src/main/db/migrations/index.ts: import `0002_static_data.sql?raw` and append `{ version: 2, sql: ... }` after version 1.

2. src/main/providers/http-data-dragon.ts:
```ts
export interface HttpDataDragonOptions {
  fetchFn?: typeof fetch   // default: global fetch
  baseUrl?: string         // default: 'https://ddragon.leagueoflegends.com'
  region?: string         // default: 'euw'
  locale?: string         // default: 'en_US'
  userAgent?: string      // default: 'MetaMunch (personal project)'
  timeoutMs?: number      // default: 15000
}
export class HttpDataDragonProvider implements DataDragonProvider { constructor(options?: HttpDataDragonOptions) }
```
URLs: `${baseUrl}/realms/${region}.json`; `${baseUrl}/cdn/${version}/data/${locale}/champion.json`; `${baseUrl}/cdn/${version}/data/${locale}/item.json`.
Every request: `fetchFn(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(timeoutMs) })`. Non-2xx status -> `throw new Error(\`Data Dragon HTTP ${status}: ${url}\`)`. Parse JSON, then call `parseRealmVersion` / `parseChampionList` / `parseItemList`. No retries, no parallel requests (call sequentially).

3. src/main/db/static-data-repo.ts — write exactly these exports (all take a `DatabaseSync` as the first argument):
```ts
export interface PatchStatus { version: string; fetchedAt: number; champions: number; items: number }
export function hasPatch(db, version: string): boolean
export function savePatch(db, version: string, champions: Champion[], items: Item[], fetchedAt: number): void
export function getLatestPatch(db): PatchStatus | null   // the patch with the highest fetched_at; ties -> highest version string
export function listChampions(db, version: string): Champion[]   // ordered by key
export function listItems(db, version: string): Item[]           // ordered by id
```
`savePatch` runs in ONE transaction (`BEGIN` / `COMMIT`, `ROLLBACK` + rethrow on error): insert into `patches`, then all champions, then all items, with prepared statements. JSON columns use `JSON.stringify`; `purchasable` is stored as 1/0; field mapping: `goldTotal -> gold_total`, `from -> from_ids`, `into -> into_ids`. Saving a version that already exists throws (primary key). Readers rebuild the domain objects with `JSON.parse` and must return values equal to what was saved.

4. src/main/services/static-data-service.ts:
```ts
export interface RefreshResult { version: string; fromCache: boolean; champions: number; items: number }
export class StaticDataService {
  constructor(deps: { db: DatabaseSync; provider: DataDragonProvider; now?: () => number })
  status(): PatchStatus | null            // = getLatestPatch(db)
  refresh(): Promise<RefreshResult>
}
```
`refresh()`: `version = await provider.getLatestVersion()`. If `hasPatch(db, version)` -> return `{ version, fromCache: true, champions, items }` (counts from the DB) WITHOUT any further provider calls. Otherwise call `getChampions(version)` then `getItems(version)` (sequentially), `savePatch(db, version, champions.values, items.values, now())`, return `fromCache: false`. If any provider call throws, nothing is written and the error propagates.

5. src/shared/ipc.ts: add exactly two entries to `IpcChannels`:
```ts
'staticData:status':  { req: Record<string, never>; res: { version: string | null; champions: number; items: number; fetchedAt: number | null } }
'staticData:refresh': { req: Record<string, never>; res: { version: string; fromCache: boolean; champions: number; items: number } }
```

6. src/main/ipc/handlers.ts: `createHandlers` deps become `{ db: DatabaseSync; staticData: StaticDataService }`. `staticData:status` maps `service.status()` (null -> `{ version: null, champions: 0, items: 0, fetchedAt: null }`). `staticData:refresh` returns `service.refresh()` directly (errors propagate to the renderer).

7. src/main/index.ts: build `new StaticDataService({ db, provider: new HttpDataDragonProvider() })` and pass it to `createHandlers`. No automatic fetch on startup.

8. src/renderer/App.tsx: keep everything existing. Add a block with: a status line (`patch {version} · {champions} champions · {items} items`, or `no data yet` when version is null), a button "Update data" that calls `staticData:refresh`, disabled while running, then reloads the status; show `up to date` when `fromCache` is true, `updated` otherwise, and `update failed: {message}` on error. Load status on mount. Plain unstyled elements are fine.

9. Tests (all with `openDb(':memory:')` + `runMigrations(db, migrations)`; fixtures read from `tests/fixtures/ddragon` with `readFileSync(join(process.cwd(), ...))`):
   - tests/unit/http-data-dragon.test.ts: a fake `fetchFn` returns `Response` objects built from the fixtures. Check the three requested URLs (exact strings, default options), the `User-Agent` header, that `getLatestVersion()` returns `'16.3.1'`, that a 503 response throws a message containing `HTTP 503`, and that `getChampions('16.3.1')` returns 3 values.
   - tests/integration/static-data-repo.test.ts: `savePatch` then `hasPatch`, `getLatestPatch` (counts 3 champions and 4 items from the fixtures), `listChampions`/`listItems` deep-equal to what was saved (use `parseChampionList(...).values` etc.); saving the same version twice throws; a failing save (champion list with a duplicate key) rolls back: `hasPatch` is false afterwards and `patches` has no row.
   - tests/integration/static-data-service.test.ts: fake provider (counts calls). First `refresh()` -> `fromCache: false`, `status()` reports the version and counts, provider called once per method. Second `refresh()` -> `fromCache: true`, `getChampions`/`getItems` not called again. A provider that throws in `getItems` -> `refresh()` rejects and `status()` stays `null`.
   - tests/integration/ddragon-live.test.ts: `describe.skipIf(!process.env['LIVE'])`. With a real `HttpDataDragonProvider()`: `getLatestVersion()` matches `/^\d+\.\d+\.\d+$/`; champions: `values.length > 150` and `skipped.length` is at most 5; items: `values.length > 300` and `skipped.length` is at most 20; the champion with `key === 103` exists. Timeout 60000 ms for the test.

10. Append one line to docs/progress.md: `M1 files written, awaiting owner checks`.

## Acceptance (the owner runs these)
- `npm install -E zod`, then `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` exit 0
- `npm run test:live` passes (real EUW data validates against our schemas; this is the check that the synthetic fixtures match reality)
- `npm run dev`: press "Update data": the status line shows the patch with ~170 champions and several hundred items; press again: `up to date`

## Forbidden
msw or any new test library, retries, parallel requests, background timers, auto-fetch on startup, storing images, per-champion detail files, extra tables or columns, extra dependencies, running commands, changing paths or names above.

## Stop and ask when
`npm run test:live` data shape differs (the owner will paste the failure); a provided file does not compile in your environment; any step contradicts the provided files.
