# Task M2 — my matches from the Riot API

## Goal
Resolve my Riot ID to a puuid, download my recent matches (match-v5) into SQLite without exceeding Riot rate limits, and show the account and match count with "Set account" and "Sync matches" controls.

## Rule for this task
You only WRITE files. Do NOT run any command (no npm, no node, no git). The owner runs all checks.

## Already provided by the owner (copy as-is, do not edit)
src/shared/riot.ts                       (types; parseRiotId, parseAccount, parseMatchIds, parseMatch, toPatch)
src/main/providers/riot-api.ts           (interface RiotApiProvider, class RiotApiError)
src/main/providers/rate-limiter.ts       (RateLimiter, DEV_KEY_LIMITS, parseRateLimitHeader, parseRetryAfterMs)
src/main/db/migrations/0003_matches.sql  (tables accounts, matches, participants)
tests/fixtures/riot/account.json, match.json, match-ids.json   (synthetic, shaped like Riot responses)
tests/unit/riot-parse.test.ts, tests/unit/rate-limiter.test.ts

## Create
src/main/env.ts
src/main/providers/http-riot-api.ts
src/main/providers/missing-key-riot-api.ts
src/main/db/matches-repo.ts
src/main/services/match-sync-service.ts
tests/unit/http-riot-api.test.ts
tests/integration/matches-repo.test.ts
tests/integration/match-sync-service.test.ts
tests/integration/riot-live.test.ts

## Modify
package.json (ONLY add the script `"test:live:riot": "cross-env LIVE_RIOT=1 vitest run tests/integration/riot-live.test.ts"`)
.env.example (add a line `RIOT_TEST_ID=`; keep `RIOT_API_KEY=`)
src/main/db/migrations/index.ts (register version 3)
src/shared/ipc.ts (three channels, step 7)
src/main/ipc/handlers.ts
src/main/index.ts
src/renderer/App.tsx
tests/integration/db-migrate.test.ts   (expected schema version 3 wherever the real `migrations` array is used; tables accounts, matches, participants must exist; custom migration arrays stay unchanged)
tests/unit/ipc-handlers.test.ts        (pass the new `matchSync` dependency built with a fake provider; db:info expects schemaVersion 3)
docs/progress.md (append one line)

## Do not touch
AGENTS.md, docs/decisions.md, docs/stages.md, docs/tasks/*, the "provided" files above, tsconfig*.json, eslint.config.js, vitest.config.mts, any static-data file.

## Dependencies
None.

## Steps

1. src/main/db/migrations/index.ts: import `0003_matches.sql?raw`, append `{ version: 3, sql: ... }`.

2. src/main/env.ts:
```ts
export function loadEnv(dir: string): void          // process.loadEnvFile(join(dir, '.env')); ignore the error if the file does not exist; never overwrite variables that are already set
export function getRiotApiKey(): string | null      // process.env['RIOT_API_KEY'] trimmed; null when missing or empty
```

3. src/main/providers/http-riot-api.ts:
```ts
export interface HttpRiotApiOptions {
  apiKey: string
  fetchFn?: typeof fetch          // default: global fetch
  region?: string                 // default 'europe' (account-v1 and match-v5 use regional routing)
  baseUrl?: string                // default `https://${region}.api.riotgames.com`
  limiter?: RateLimiter           // default new RateLimiter()
  userAgent?: string              // default 'MetaMunch (personal project)'
  timeoutMs?: number              // default 15000
  maxRetries429?: number          // default 3
}
export class HttpRiotApiProvider implements RiotApiProvider { constructor(options: HttpRiotApiOptions) }
```
Paths (all GET, relative to baseUrl):
- account: `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}` -> `parseAccount`
- ids: `/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${queue}&start=${start}&count=${count}` -> `parseMatchIds`
- match: `/lol/match/v5/matches/${matchId}` -> `parseMatch`
One private `request(path)` used by all three. Per attempt: `await limiter.acquire()`; `fetchFn(url, { headers: { 'X-Riot-Token': apiKey, 'User-Agent': userAgent }, signal: AbortSignal.timeout(timeoutMs) })`; then if the response has a parsable `X-App-Rate-Limit` header (`parseRateLimitHeader` non-empty), call `limiter.setLimits(...)`. Status handling:
- 2xx: return `await res.json()`.
- 429: wait is `parseRetryAfterMs(res.headers.get('Retry-After')) ?? 1000 * (attempt + 1)`; call `limiter.penalize(wait)` and retry, at most `maxRetries429` retries; afterwards throw `new RiotApiError(429, 'Riot API rate limit exceeded')`.
- 401 or 403: throw `new RiotApiError(status, 'Riot API key is invalid or expired (development keys expire every 24 hours). Update RIOT_API_KEY in .env and restart the app.')`.
- 404: throw `new RiotApiError(404, 'Not found')`.
- any other non-2xx: throw `new RiotApiError(status, \`Riot API HTTP ${status}\`)`.
The API key must never appear in an error message, a log line or a URL.

4. src/main/providers/missing-key-riot-api.ts: `export class MissingKeyRiotApiProvider implements RiotApiProvider`; every method rejects with `new Error('RIOT_API_KEY is not set. Add it to .env and restart the app.')`.

5. src/main/db/matches-repo.ts (all functions take a `DatabaseSync` first):
```ts
export interface StoredAccount { puuid: string; gameName: string; tagLine: string; platform: string; addedAt: number }
export function upsertAccount(db, account: RiotAccount, platform: string, addedAt: number): void  // insert; on conflict update names, keep the original added_at
export function getAccount(db): StoredAccount | null                  // the account with the highest added_at
export function knownMatchIds(db, ids: readonly string[]): Set<string>
export function saveMatch(db, match: Match, trackedPuuids: readonly string[]): void
export function countMatches(db, puuid: string): number               // matches that have a participant with this puuid
export function lastGameCreation(db, puuid: string): number | null
```
`saveMatch` runs in ONE transaction (`BEGIN`/`COMMIT`, `ROLLBACK` + rethrow): insert into `matches` (`remake` and `win` stored as 1/0), then every participant with `slot` = its index; the participant's `puuid` column is set ONLY when it is in `trackedPuuids`, otherwise NULL (we never store other players' ids); `items` as `JSON.stringify`. Saving an existing match id throws.

6. src/main/services/match-sync-service.ts:
```ts
export interface SyncOptions { queues?: number[]; maxNewMatches?: number }   // defaults: [420, 440, 400] and 60
export interface SyncResult { requested: number; saved: number; skippedExisting: number; failed: number }
export interface MatchStatus { account: { gameName: string; tagLine: string } | null; matches: number; lastGameCreation: number | null }
export class MatchSyncService {
  constructor(deps: { db: DatabaseSync; provider: RiotApiProvider; platform?: string; now?: () => number })   // platform default 'EUW1'
  setAccount(riotId: string): Promise<RiotAccount>
  status(): MatchStatus
  sync(options?: SyncOptions): Promise<SyncResult>
}
```
- `setAccount`: `parseRiotId`, `provider.getAccountByRiotId`, `upsertAccount(db, account, platform, now())`, return the account.
- `status`: from `getAccount`, `countMatches`, `lastGameCreation` (no account -> `{ account: null, matches: 0, lastGameCreation: null }`).
- `sync`: throw `new Error('No account set')` when there is no account. For each queue sequentially call `provider.getMatchIds(puuid, { queue, start: 0, count: 100 })`. Merge all ids without duplicates and sort by the numeric suffix after `_` descending (newest first). `known = knownMatchIds(db, ids)`; `skippedExisting` = number of ids in `known`. Take the first `maxNewMatches` ids that are not known: `requested` = their count. For each, sequentially: `getMatch` then `saveMatch(db, match, [puuid])`, `saved++`. If a call throws `RiotApiError` with status 401 or 403, rethrow immediately (already saved matches stay). Any other error: `failed++` and continue.

7. src/shared/ipc.ts: add exactly three entries to `IpcChannels`:
```ts
'account:set':    { req: { riotId: string }; res: { gameName: string; tagLine: string } }
'matches:status': { req: Record<string, never>; res: { account: { gameName: string; tagLine: string } | null; matches: number; lastGameCreation: number | null } }
'matches:sync':   { req: Record<string, never>; res: { requested: number; saved: number; skippedExisting: number; failed: number } }
```

8. src/main/ipc/handlers.ts: `createHandlers` deps become `{ db; staticData; matchSync: MatchSyncService }`. `account:set` returns `{ gameName, tagLine }` from `matchSync.setAccount(riotId)`; `matches:status` -> `matchSync.status()`; `matches:sync` -> `matchSync.sync()`. Errors propagate.

9. src/main/index.ts: first thing after `app` is available, `loadEnv(app.getAppPath())`. Then `const key = getRiotApiKey()`; provider = `key ? new HttpRiotApiProvider({ apiKey: key }) : new MissingKeyRiotApiProvider()`; build `new MatchSyncService({ db, provider })` and pass it to `createHandlers`. No automatic sync or network calls on startup.

10. src/renderer/App.tsx: keep everything existing. Add a section: a text input for the Riot ID (placeholder `Name#TAG`), a button "Set account" calling `account:set`; a status line `{gameName}#{tagLine} · {matches} matches` or `no account yet`; a button "Sync matches" calling `matches:sync`, disabled while running, showing `syncing… (can take a few minutes)` and then `saved {saved}, skipped {skippedExisting}, failed {failed}`; errors as `failed: {message}`. Load `matches:status` on mount and after each action. Plain unstyled elements.

11. Tests. Use `openDb(':memory:')` + `runMigrations(db, migrations)`; read fixtures with `readFileSync(join(process.cwd(), 'tests/fixtures/riot', name), 'utf8')`.
- tests/unit/http-riot-api.test.ts: fake `fetchFn` returning `Response` objects; use `new RateLimiter([{ limit: 1000, windowMs: 1000 }], { margin: 0 })`. Check: the account URL for gameName `Бигбули`, tagLine `22222` is exactly `https://europe.api.riotgames.com/riot/account/v1/accounts/by-riot-id/%D0%91%D0%B8%D0%B3%D0%B1%D1%83%D0%BB%D0%B8/22222`; the headers contain `X-Riot-Token` equal to the test key and the User-Agent; the ids URL contains `queue=420&start=0&count=5`; `getMatch('EUW1_7000000001')` returns a parsed match with 10 participants; 401 -> `RiotApiError` status 401 whose message contains `expired` and does NOT contain the key; 404 -> status 404; 429 with `Retry-After: 0` then 200 -> the call succeeds and fetch was called twice; 429 on every call with `maxRetries429: 2` -> `RiotApiError` status 429 after exactly 3 fetch calls; 500 -> `RiotApiError` status 500.
- tests/integration/matches-repo.test.ts: `upsertAccount` twice keeps the first `addedAt` and updates names; `getAccount` returns the newest; `saveMatch` with `['puuid-me-0001']` stores that puuid for exactly one participant and NULL for the other nine, items round-trip as 6 numbers; saving the same match twice throws and participant count stays 10; `knownMatchIds`, `countMatches`, `lastGameCreation` return expected values.
- tests/integration/match-sync-service.test.ts: fake provider returning ids for queue 420 only (`[]` for 440 and 400) and matches built by cloning `match.json` with another `metadata.matchId` for each id. Cases: first sync saves 3; second sync has `skippedExisting` 3, `saved` 0 and `getMatch` is not called; one `getMatch` throws a plain Error -> `failed` 1, the others saved; `getMatch` throws `RiotApiError(403, ...)` -> `sync` rejects; `maxNewMatches: 2` -> `saved` 2 and `requested` 2; `setAccount('Бигбули#22222')` stores the account and `status()` reports it; `sync()` without an account rejects with `No account set`.
- tests/integration/riot-live.test.ts: `describe.skipIf(!process.env['LIVE_RIOT'])`. First `loadEnv(process.cwd())`. Needs `RIOT_API_KEY` and `RIOT_TEST_ID` (fail with a clear message if missing). Build `HttpRiotApiProvider`, `parseRiotId(process.env['RIOT_TEST_ID'])`, resolve the account, try queues `[420, 440, 400]` with `count: 3` until some ids are returned (fail if none), fetch the first match and assert it has 10 participants and one of them has the account's puuid. Timeout 120000 ms.

12. Append one line to docs/progress.md: `M2 files written, awaiting owner checks`.

## Acceptance (the owner runs these)
- Put `RIOT_API_KEY=...` and `RIOT_TEST_ID=Бигбули#22222` into `.env` (UTF-8, saved from VS Code; never commit it).
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` exit 0
- `npm run test:live:riot` passes (real Riot data validates against our schemas)
- `npm run dev`: enter the Riot ID, "Set account" shows it with 0 matches; "Sync matches" (up to a few minutes on a development key) ends with `saved N`; a second sync shows `skipped N, saved 0`

## Forbidden
Timeline or any endpoint other than the three above, storing other players' puuids or names, automatic sync on startup, background timers, retries other than for HTTP 429, new dependencies, logging the key, running commands, changing paths or names above.

## Stop and ask when
`npm run test:live:riot` shows a response shape that our schemas reject (the owner pastes the failure); `process.loadEnvFile` is not typed; any step contradicts the provided files.
