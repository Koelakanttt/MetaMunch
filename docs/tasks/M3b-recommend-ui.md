# Task M3b — recommendation screen (wiring and UI)

## Goal
Let me pick my champion, my role and up to five enemy champions in the window, and show the recommended items and boots with reasons, computed in the main process by the provided engine.

## Rule for this task
You only WRITE files. Do NOT run any command (no npm, no node, no git). The owner runs all checks.

## Already provided by the owner (copy as-is, do not edit)
src/shared/item-traits.ts, rules.ts, recommend.ts      (engine; REPLACE the old files)
src/shared/recommend-api.ts                              (request and response types, zod request schema)
src/main/data/raw.d.ts, src/main/data/rules-data.ts     (bundles data/*.json into the app: loadRules, loadChampionTags)
src/main/services/recommendation-service.ts              (RecommendationService, interface StaticDataSource)
data/rules.json, data/champion-tags.json                 (REPLACE)
tests/helpers/items.ts
tests/unit/item-traits.test.ts, recommend.test.ts, rules-data.test.ts, recommendation-service.test.ts   (REPLACE or new)
tests/integration/items-inspect.test.ts                  (REPLACE)

## Create
src/main/db/static-data-source.ts
tests/integration/static-data-source.test.ts
src/renderer/components/ChampionPicker.tsx
src/renderer/pages/RecommendPage.tsx

## Modify
src/shared/ipc.ts
src/main/ipc/handlers.ts
src/main/index.ts
src/renderer/App.tsx
tests/unit/ipc-handlers.test.ts
docs/progress.md (append one line)

## Do not touch
AGENTS.md, docs/decisions.md, docs/stages.md, docs/tasks/*, the "provided" files above, package.json, tsconfig*.json, eslint.config.js, vitest.config.mts, any Riot API or static-data service file, existing migrations.

## Dependencies
None.

## Steps

1. src/main/db/static-data-source.ts:
```ts
export function createDbSource(db: DatabaseSync): StaticDataSource
```
`latestVersion()` = `getLatestPatch(db)?.version ?? null`; `champions(version)` = `listChampions(db, version)`; `items(version)` = `listItems(db, version)` (functions from static-data-repo.ts; interface from recommendation-service.ts).

2. src/shared/ipc.ts: add exactly two entries to `IpcChannels` (import the types with `import type` from `./recommend-api`):
```ts
'champions:list': { req: Record<string, never>; res: ChampionListResponse }
'recommend:run':  { req: RecommendRequest; res: RecommendResponse }
```

3. src/main/ipc/handlers.ts: `createHandlers` deps get a new field `recommendation: RecommendationService`. `'champions:list': () => recommendation.listChampions()` and `'recommend:run': (req) => recommendation.run(req)` — both NON-async arrow functions, so that errors are thrown synchronously and reach the renderer as rejected invokes.

4. src/main/index.ts: build `new RecommendationService({ source: createDbSource(db), rules: loadRules(), tags: loadChampionTags() })` (loaders from `./data/rules-data`) and pass it as `recommendation` to `createHandlers`. Nothing else changes.

5. src/renderer/components/ChampionPicker.tsx:
```ts
interface Props {
  label: string
  champions: ChampionSummary[]        // type from '@shared/recommend-api'
  value: string | null                // selected champion id
  onChange: (id: string | null) => void
  exclude?: string[]                  // ids that must not be offered
  listId: string                      // unique id for the <datalist>
}
```
A labelled text `<input list={listId}>` with a `<datalist>` of champion NAMES (excluding `exclude`). Keep the typed text in local state. When the text equals (case-insensitive) a champion name, call `onChange(thatChampion.id)`; otherwise call `onChange(null)`. When the text is not empty and matches nothing, show the text `unknown champion` next to the input. Empty text means no selection.

6. src/renderer/pages/RecommendPage.tsx: `export function RecommendPage({ refreshKey }: { refreshKey: number })`.
   - On mount and whenever `refreshKey` changes call `window.api.invoke('champions:list', {})`. If `version` is null show `No static data yet. Press "Update data".` and nothing else.
   - Controls: a `<select>` for role with the values TOP, JUNGLE, MIDDLE, BOTTOM, UTILITY (default TOP); one ChampionPicker "You"; five ChampionPickers "Enemy 1" … "Enemy 5". Each enemy picker excludes the other enemies' ids.
   - Whenever the role, my champion or the set of selected enemies changes AND my champion is selected, call `window.api.invoke('recommend:run', { meId, role, enemyIds })` (enemyIds = the non-null enemy ids in order). Ignore results of outdated calls (keep a request counter). While waiting show `loading…`. On a rejected call show `error: {message}` where the message is the Error message with the `Error invoking remote method '...': Error: ` prefix removed. When my champion is not selected show `Pick your champion.`
   - Result block:
     - line 1: `patch {version} · {level === 'rules' ? 'rules' : 'core fallback'} · you: {me.name} ({me.damage})`
     - line 2 (enemy summary, only when `profile.metrics.enemies > 0`): `Enemy team: {round(adShare*100)}% physical / {round(apShare*100)}% magic · healers: {names or none} · hard CC: {names or none} · tanks: {names or none}`
     - heading `Items`, then an ordered list: each entry shows the item name in bold, `[{source}]`, and its reasons as a nested bullet list;
     - heading `Boots`, same format; if a list is empty show `none` for it.
   - Plain unstyled elements are fine (the real design comes later). Do not import anything from `src/main`.

7. src/renderer/App.tsx: keep everything that exists. Add `const [refreshKey, setRefreshKey] = useState(0)`; increase it after a successful "Update data" (also when the result is `up to date`). Render `<RecommendPage refreshKey={refreshKey} />` right below the `MetaMunch` heading.

8. tests/unit/ipc-handlers.test.ts: pass the new `recommendation` dependency built with a fake source (`latestVersion: () => null`, `champions: () => []`, `items: () => []`) and the real `loadRules()` / `loadChampionTags()`. Add: `handlers['champions:list']({})` returns `{ version: null, champions: [] }`; `expect(() => handlers['recommend:run']({ meId: 'Garen', role: 'TOP', enemyIds: [] })).toThrow('Update data')`. Keep the existing tests.

9. tests/integration/static-data-source.test.ts: with `openDb(':memory:')` + migrations: before any data `latestVersion()` is null; after `savePatch` of the three fixture champions and the fixture items (parsed from tests/fixtures/ddragon), `latestVersion()` is `'16.3.1'`, `champions('16.3.1')` has 3 entries and `items('16.3.1')` has 4. Then build a `RecommendationService` with `createDbSource(db)`, `loadRules()`, `loadChampionTags()` and expect `run({ meId: 'Garen', role: 'TOP', enemyIds: ['Ahri'] })` to return `version` `'16.3.1'` and `me.name` `'Garen'`.

10. Append one line to docs/progress.md: `M3b files written, awaiting owner checks`.

## Acceptance (the owner runs these)
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` exit 0
- `npm run dev`, press "Update data", then pick: role TOP, You = Garen, enemies = Soraka, Vladimir, Ahri, Syndra, Leona. Expected: mode `rules`; healers `Soraka, Vladimir`; the top of the item list contains Thornmail, Chempunk Chainsword and Mortal Reminder with reasons mentioning the healers, followed by magic resist items; boots start with Chainlaced Crushers
- Change the role and remove enemies: the list updates by itself; with no enemies the mode is `core fallback`; typing a wrong champion name shows `unknown champion`

## Forbidden
Network calls from the renderer, importing `src/main` code in the renderer, new dependencies, a router or state library, styling work, changes to the provided files, running commands, changing paths or names above.

## Stop and ask when
A provided file does not compile in your environment; a step contradicts the provided files.
