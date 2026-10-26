# Task M4 — patch changes for my champion pool

## Goal
Show what changed between the previous patch and the latest stored patch for the champions I play most and for the items in my usual builds (base stats, ability numbers, item stats and price).

## Rule for this task
You only WRITE files. Do NOT run any command (no npm, no node, no git). The owner runs all checks and pastes failures back to you. You design the internals yourself, but every path, name, type and behavior below is fixed. Reasoning effort may be Medium for this task.

## Fixed contracts

### src/shared/patch-diff.ts (pure, no I/O)
```ts
export interface Change { label: string; before: string; after: string }
export interface EntityChanges { id: string; name: string; changes: Change[] }
export interface PatchChangesResponse {
  from: string | null            // previous patch version used for the comparison (null when none was found)
  to: string | null              // latest stored version (null without static data)
  pool: { id: string; name: string; games: number }[]
  champions: EntityChanges[]     // one entry per pool champion; `changes` may be empty
  items: EntityChanges[]         // only items with at least one change
  notes: string[]                // human readable problems, e.g. "No details for Camille in 16.20.1"
}
export function previousPatchVersion(versions: readonly string[], current: string): string | null
export function diffStats(before: Record<string, number>, after: Record<string, number>): Change[]
export function diffChampion(before: ChampionDetail, after: ChampionDetail): Change[]
export function diffItem(before: Item, after: Item): Change[]
```
- `previousPatchVersion`: `versions` is the Data Dragon list, newest first. Return the first version whose patch (`toPatch` from `src/shared/riot.ts`: first two parts) differs from the patch of `current`; ignore entries that do not look like `\d+.\d+.\d+`; null when none.
- `diffStats`: one Change per key whose number differs, sorted by key, `label` = the key, numbers rendered with `String(n)`. Keys present on one side only are reported with `—` for the missing side.
- `diffChampion`: base stats via `diffStats`; then for the passive and for each spell by index (Q, W, E, R in this order) compare name, cooldown, cost, range, and each effect array; label like `Q (Spell name) cooldown`; arrays are rendered as `8/7.5/7`. Ignore tooltips and descriptions (they are noisy markup).
- `diffItem`: compare `goldTotal` (label `Total cost`), each stat via `diffStats` (label `Stat: <key>`), and the plain-text description (use `plainText` from `src/shared/item-traits.ts`): when different add one Change with label `Description` and the two texts cut to 200 characters.

### src/shared/ddragon-detail.ts
```ts
export interface SpellDetail { id: string; name: string; cooldown: number[]; cost: number[]; range: number[]; effects: number[][] }
export interface ChampionDetail { id: string; name: string; stats: Record<string, number>; passiveName: string; spells: SpellDetail[] }
export function parseChampionDetail(json: unknown, championId: string): ChampionDetail
```
Source: Data Dragon `champion/<id>.json`, shape `{ data: { "<id>": { id, name, stats: {...numbers}, passive: { name }, spells: [{ id, name, cooldown: number[], cost: number[], range: number[], effect: (number[] | null)[] }] } } }`. Use zod (already installed) leniently: unknown keys ignored, missing arrays default to `[]`, `effect` null entries become `[]`. Throw an Error with a readable message when `data[championId]` is missing.

### Database
`src/main/db/migrations/0005_champion_details.sql`:
```sql
CREATE TABLE champion_details (
  patch TEXT NOT NULL,
  id    TEXT NOT NULL,
  json  TEXT NOT NULL,
  PRIMARY KEY (patch, id)
) STRICT;
```
`src/main/db/champion-details-repo.ts`: `getDetailJson(db, patch, id): string | null`, `saveDetailJson(db, patch, id, json): void` (insert or replace).
`src/main/db/pool-repo.ts`: `listPool(db, puuid, limit = 8, minGames = 3): { championKey: number; games: number }[]` using
```sql
SELECT p.champion_id AS championKey, count(*) AS games
FROM participants p JOIN matches m ON m.match_id = p.match_id
WHERE p.puuid = ? AND m.remake = 0 AND m.queue_id IN (400, 420, 440)
GROUP BY p.champion_id HAVING count(*) >= ?
ORDER BY games DESC, p.champion_id ASC LIMIT ?
```
Register migration 5. IMPORTANT fix in `src/main/db/static-data-repo.ts`: `getLatestPatch` must pick the highest VERSION compared numerically part by part (so a later-fetched older patch never wins); update its tests.

### Provider
Add to `DataDragonProvider` (src/main/providers/data-dragon.ts) and implement in `HttpDataDragonProvider`:
```ts
getVersions(): Promise<string[]>                                   // GET {baseUrl}/api/versions.json, array of strings
getChampionDetail(version: string, championId: string): Promise<ChampionDetail>   // GET {baseUrl}/cdn/{version}/data/{locale}/champion/{id}.json
```
Same rules as the other methods (user agent, timeout, HTTP errors).

### Service: src/main/services/patch-changes-service.ts
```ts
export class PatchChangesService {
  constructor(deps: { db: DatabaseSync; provider: DataDragonProvider; getAccount: () => TrackedAccount | null })
  run(): Promise<PatchChangesResponse>
}
```
Behavior of `run()` (never throws for data problems; add a note instead; network errors of the whole operation may throw):
1. No account: `{ from: null, to: latest or null, pool: [], champions: [], items: [], notes: ['No account set.'] }`. No stored static data: same with note `No static data yet. Press "Update data" first.`
2. `to` = latest stored version. `versions = provider.getVersions()`, `from = previousPatchVersion(versions, to)`; when null add a note and return.
3. Pool = `listPool` mapped to champions of the stored latest patch by numeric key (skip unknown keys with a note); `pool` entries carry `id`, `name`, `games`.
4. For each pool champion get the detail JSON for `from` and `to` through the cache (`champion_details`; fetch with the provider only when missing, store the JSON text you got from the provider's parse input or re-serialize the parsed object), compute `diffChampion`. When one of the two details cannot be loaded add a note and give that champion an empty `changes`.
5. Items: take the usual-build names of every pool champion (`listMyGames` from `src/main/db/personal-stats-repo.ts` + `summarizeBuild` from `src/shared/personal.ts`, using the stored items of `to`), deduplicate by name. Items of `from` come from `provider.getItems(from)` (kept in memory only, not stored); match by name, using for each name the item with the lowest id on both sides; diff with `diffItem`; keep only items with changes.
6. Requests are sequential (no parallel calls).

### IPC and UI
- `src/shared/ipc.ts`: add `'patch:changes': { req: Record<string, never>; res: PatchChangesResponse }`; handler in `src/main/ipc/handlers.ts` returns `patchChanges.run()` (async is fine); construct the service in `src/main/index.ts` (same `getAccount` adapter as for the personal stats).
- `src/renderer/pages/PatchChangesPage.tsx`, rendered by `App.tsx` below the recommendation page: a button "Load patch changes" (disabled while running, text `loading…`), then `Patch {from} → {to}`, the pool line `Pool: Camille (7), ...`, per champion a heading with its changes as `label: before → after` bullets or `no changes`, an `Items` section with the same format, and the notes in a plain list. Show errors as `error: {message}`. Plain unstyled elements.

## Tests (you write them)
- `tests/unit/patch-diff.test.ts`: `previousPatchVersion` (normal case, current not in the list, junk entries, none found), `diffStats` (changed, unchanged, one-sided keys), `diffChampion` and `diffItem` with small hand-made objects (cooldown arrays, effect arrays, cost, description cut to 200 chars).
- `tests/unit/ddragon-detail.test.ts`: a small inline JSON in the real shape (include a spell with `effect: [null, [1,2,3]]`), missing arrays, a missing champion entry.
- `tests/unit/http-data-dragon.test.ts` (extend): URLs and parsing for `getVersions` and `getChampionDetail`.
- `tests/integration/pool-repo.test.ts` and `champion-details-repo.test.ts` (use `memoryDb` and `insertMatch` from `tests/helpers/db.ts`), plus a `getLatestPatch` test with versions `16.9.1` and `16.21.1` where the older one was fetched later.
- `tests/integration/patch-changes-service.test.ts`: fake provider (call counter) and seeded matches: the no-account and no-data notes; a full run producing champion and item changes; the second run does not call `getChampionDetail` again (cache); a missing detail produces a note and an empty `changes`.
- `tests/integration/patch-live.test.ts`: `describe.skipIf(!process.env['LIVE'])`; real `HttpDataDragonProvider`: `getVersions` has more than 50 entries, `previousPatchVersion` finds a version for the newest one, `getChampionDetail` of `Camille` for both versions parses, `diffChampion` runs without throwing. Script in package.json: `"test:live:patch": "cross-env LIVE=1 vitest run tests/integration/patch-live.test.ts"`.
- Existing tests: `db-migrate.test.ts` and `ipc-handlers.test.ts` expect the new schema version 5 and the new handler dependency; update them and any other test that breaks because of the changed contracts.

## Do not touch
AGENTS.md, docs/decisions.md, docs/stages.md, docs/tasks/*, the engine and rules files (`src/shared/recommend*.ts`, `item-traits.ts`, `rules.ts`, `personal.ts`), `data/*.json`, the Riot API files, tsconfig*.json, eslint.config.js, vitest.config.mts.

## Dependencies
None.

## Acceptance (the owner runs these)
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` exit 0
- `npm run test:live:patch` passes
- `npm run dev`: after "Update data" and a synced account, "Load patch changes" shows the previous and the current patch, the pool of my most played champions and their changes (a champion without changes says `no changes`)

## Forbidden
Parallel requests, comparing tooltip or description markup of champions, storing full previous-patch item lists, new dependencies, running commands, changing paths or names above.

## Stop and ask when
The real Data Dragon champion file does not match the described shape (the owner pastes the live test failure); any contract above contradicts an existing provided file.
