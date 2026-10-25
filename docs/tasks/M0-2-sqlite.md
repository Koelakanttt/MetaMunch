# Task M0-2 — node:sqlite + migration runner

## Goal
Add a SQLite layer based on the built-in `node:sqlite` with a versioned migration runner, wired into the Electron main process and visible in the window.

## Rule for this task
You only WRITE files. Do NOT run any command (no npm, no node, no git). The owner installs dependencies and runs all checks.

## Create
scripts/sqlite-spike.cjs
src/main/db/open.ts
src/main/db/migrate.ts
src/main/db/sql.d.ts
src/main/db/migrations/index.ts
src/main/db/migrations/0001_init.sql
tests/integration/db-migrate.test.ts

## Modify
package.json (ONLY add the script below; do not touch dependencies)
electron.vite.config.ts (main section only)
src/shared/ipc.ts
src/main/ipc/handlers.ts
src/main/index.ts
src/renderer/App.tsx
tests/unit/ipc-handlers.test.ts
docs/progress.md (append one line)

## Do not touch
AGENTS.md, docs/decisions.md, docs/stages.md, docs/tasks/*, tsconfig*.json, eslint.config.js, vitest.config.ts, .gitignore.

## Dependencies
None to add. (Owner runs: `npm install -D -E cross-env` before checking.)

## Steps

1. package.json scripts: add `"spike:sqlite": "cross-env ELECTRON_RUN_AS_NODE=1 electron scripts/sqlite-spike.cjs"`.

2. scripts/sqlite-spike.cjs (plain CommonJS, no imports besides node:sqlite):
```js
const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(':memory:')
db.exec('CREATE TABLE t (x INTEGER) STRICT; INSERT INTO t VALUES (1)')
const sqlite = db.prepare('SELECT sqlite_version() AS v').get().v
const rows = db.prepare('SELECT count(*) AS c FROM t').get().c
console.log(JSON.stringify({ electron: process.versions.electron, node: process.versions.node, sqlite, rows }))
db.close()
```

3. electron.vite.config.ts: in the `main` section add `build: { rollupOptions: { external: ['node:sqlite'] } }`, merging with anything already there. Reason: `sqlite` is not in Node's builtinModules list, so the bundler would not externalize it by itself.

4. src/main/db/sql.d.ts:
```ts
declare module '*.sql?raw' {
  const sql: string
  export default sql
}
```

5. src/main/db/migrations/0001_init.sql — write EXACTLY:
```sql
CREATE TABLE patches (
  version    TEXT PRIMARY KEY,
  fetched_at INTEGER NOT NULL
) STRICT;

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
) STRICT;
```

6. src/main/db/migrate.ts — write EXACTLY this public surface:
```ts
import type { DatabaseSync } from 'node:sqlite'

export interface Migration {
  version: number // integer >= 1
  sql: string
}

export function getSchemaVersion(db: DatabaseSync): number
export function runMigrations(db: DatabaseSync, migrations: readonly Migration[]): number
```
Behaviour:
- `getSchemaVersion`: read `PRAGMA user_version`, return it as number.
- `runMigrations`: throw `Error('Invalid migrations')` if versions are not integers >= 1, strictly ascending, and unique. Read the current version. For each migration with `version` greater than the current one, in order: `db.exec('BEGIN')`, `db.exec(m.sql)`, `db.exec(\`PRAGMA user_version = ${m.version}\`)`, `db.exec('COMMIT')`. On any error inside: `db.exec('ROLLBACK')` then rethrow the original error. Return the final schema version. Already-applied migrations are skipped (idempotent).

7. src/main/db/open.ts:
```ts
import { DatabaseSync } from 'node:sqlite'
export function openDb(path: string): DatabaseSync
```
Create `new DatabaseSync(path)`, run `db.exec('PRAGMA foreign_keys = ON')`, and for a file path (not `:memory:`) also `db.exec('PRAGMA journal_mode = WAL')`. Return the db.

8. src/main/db/migrations/index.ts:
```ts
import type { Migration } from '../migrate'
import init from './0001_init.sql?raw'
export const migrations: readonly Migration[] = [{ version: 1, sql: init }]
```

9. src/shared/ipc.ts: add to `IpcChannels` exactly one entry, keeping everything else unchanged:
```ts
'db:info': { req: Record<string, never>; res: { schemaVersion: number; sqliteVersion: string } }
```

10. src/main/ipc/handlers.ts: replace the exported `handlers` constant with
```ts
export function createHandlers(deps: { db: DatabaseSync }): IpcHandlers
```
Handlers:
- `'app:ping'`: unchanged behaviour (`reply: 'pong: ' + message`, `at: Date.now()`).
- `'db:info'`: `schemaVersion` = `getSchemaVersion(deps.db)`; `sqliteVersion` = value of `SELECT sqlite_version() AS v` converted with `String(...)`.
No `any`; narrow query results with `typeof` or `String()/Number()`.

11. src/main/index.ts: after `app.whenReady()` resolves and BEFORE creating the window:
```ts
const db = openDb(join(app.getPath('userData'), 'metamunch.db'))
runMigrations(db, migrations)
registerIpc(createHandlers({ db }))
```
(remove the old `registerIpc(handlers)` call). Add `app.on('will-quit', () => db.close())`. Keep everything else in the file as is. Do not add logging.

12. src/renderer/App.tsx: keep the existing heading, Ping button and reply. Add below them one line of text that, on mount (`useEffect`), calls `window.api.invoke('db:info', {})` and shows `schema v{schemaVersion} · SQLite {sqliteVersion}`; while loading show `loading…`; on error show `db error`.

13. tests/unit/ipc-handlers.test.ts: build handlers with `createHandlers({ db })` where `db = openDb(':memory:')` migrated with `runMigrations(db, migrations)`. Keep the ping test. Add: `handlers['db:info']({})` returns `schemaVersion === 1` and `sqliteVersion` matching `/^3\./`.

14. tests/integration/db-migrate.test.ts (all use `openDb(':memory:')`):
- applies `migrations`: `runMigrations` returns 1, `getSchemaVersion` is 1, and `sqlite_master` contains tables `patches` and `settings`;
- idempotent: running twice returns 1 without error;
- round trip: insert `('theme','dark')` into `settings` and read it back;
- rollback: with `[{version:1, sql:'CREATE TABLE a (x INTEGER)'}, {version:2, sql:'CREATE TABLE a (x INTEGER)'}]` the run throws, `getSchemaVersion` stays 1, table `a` exists;
- invalid: versions `[2, 1]` throw `Invalid migrations`.

15. Append one line to docs/progress.md: `M0-2 files written, awaiting owner checks`.

## Acceptance (the owner runs these)
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` exit 0 (tests: ping, db:info and 5 migration tests)
- `npm run spike:sqlite` prints JSON with a non-empty `electron` field, `rows: 1` and a `sqlite` version string
- `npm run dev`: the window shows the ping and a line `schema v1 · SQLite 3.x`; file `metamunch.db` appears in `%APPDATA%\metamunch`

## Forbidden
better-sqlite3 or any other DB library, an ORM, extra tables or columns, extra dependencies, running commands, changing paths or names above.

## Stop and ask when
The owner reports that `node:sqlite` cannot be imported (typecheck says module not found, vitest cannot resolve it, or the spike fails in Electron). Do not work around it; wait for the owner's decision.
