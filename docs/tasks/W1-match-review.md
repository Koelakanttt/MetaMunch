# Task W1 — personal match review loop

## Goal
Add a reliable post-game review loop for the tracked account:
personal match timeline summary → swing detection → review screen → review stored with the match.
This wave is deliberately local-only. Global research aggregates, server snapshots and research
timelines are deferred.

## Rule for this task
Write files only. Do NOT run npm, node, git or any build/lint/test command. The owner runs all
acceptance commands. Work in the four slices below in order; stop after each slice for owner
acceptance. Do not redesign the UI beyond what is listed; visual polish comes later.
## Current facts that must not be broken
- `RiotRequestManager` / `RateLimiter` already exist and already enforce the shared Riot limits
  (`20 req / 1 s`, `100 req / 2 min`). Do not add another queue or limiter. The application budget is
  tightened to `20 / 1 s` and `60 / 2 min` in this task.
- Research rows and personal matches are separate. Research timelines and `agg_*` tables are OUT of
  scope.
- Timeline frames do not contain goldDiff, XP diff or damageTaken. Gold and XP diffs are computed from
  the 10 participant frames. Do not add a damageTaken field.
- A timeline must never be stored as a raw dump and must never include other players' puuids/names.

---

## Slice 0 — safety and budget

### Files
- `src/main/db/backup.ts` (new)
- `src/main/providers/rate-limiter.ts` (only if a named budget constant is needed)
- `src/main/index.ts`
- `src/shared/ipc.ts`, `src/main/ipc/handlers.ts`, `src/main/db/migrations/0012_wave1_review.sql`,
  `src/main/db/migrations/index.ts`
- `tests/unit/rate-limiter.test.ts`, `tests/integration/db-migrate.test.ts`
- `docs/progress.md` (one line per slice)

### Contracts
- `backupDatabase(db, dir, now)` uses SQLite `VACUUM INTO` and writes
  `metamunch-YYYYMMDD-HHmmss.sqlite`; returns the absolute path. It must not overwrite an existing
  file. In `src/main/index.ts`, immediately after `openDb`, call it with
  `join(app.getPath('userData'), 'backups')` only when `getSchemaVersion(db) > 0 && < 12`, then run
  migrations. Expose `db:backup` through IPC for Settings to use later.
- In `src/main/index.ts` construct the shared manager with
  `new RateLimiter([{ limit: 20, windowMs: 1000 }, { limit: 60, windowMs: 120000 }])`.
  Do not change `DEV_KEY_LIMITS`.
- Migration 0012 adds:
  - `participants.role_source TEXT NOT NULL DEFAULT 'unknown'`
  - `research_rows.role_source TEXT NOT NULL DEFAULT 'unknown'`
  - `lp_history(id INTEGER PRIMARY KEY, queue_type TEXT NOT NULL, tier TEXT NOT NULL,
    division TEXT NOT NULL, league_points INTEGER NOT NULL, wins INTEGER NOT NULL,
    losses INTEGER NOT NULL, captured_at INTEGER NOT NULL)`
  - `match_timeline_summaries(match_id TEXT PRIMARY KEY REFERENCES matches(match_id) ON DELETE CASCADE,
    schema_version INTEGER NOT NULL, source_patch TEXT NOT NULL, payload_json TEXT NOT NULL,
    state TEXT NOT NULL, fetched_at INTEGER NOT NULL)`
  - `match_reviews(match_id TEXT PRIMARY KEY REFERENCES matches(match_id) ON DELETE CASCADE,
    fix_text TEXT NOT NULL DEFAULT '', checklist_json TEXT NOT NULL DEFAULT '{}',
    tags_json TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)`

### Acceptance
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` exit 0.
- `npm test` proves 61 requests in a 2-minute window cannot all be issued before the window advances.
- Migration test reports schema version 12.

---

## Slice 1 — role inference and LP snapshots

### Files
- `src/shared/role-inference.ts` (new)
- `src/shared/riot.ts` (parse `individualPosition`; keep `position` as teamPosition)
- `src/main/db/matches-repo.ts`, `src/main/db/research-repo.ts`
- `src/main/db/lp-repo.ts` (new), `src/main/services/lp-service.ts` (new)
- `src/main/providers/riot-api.ts`, `src/main/providers/http-riot-api.ts`,
  `src/main/providers/riot-api-proxy.ts`
- `src/main/index.ts`, `src/shared/ipc.ts`, `src/main/ipc/handlers.ts`
- `tests/unit/role-inference.test.ts` (new), `tests/integration/matches-repo.test.ts`,
  `tests/integration/research-pipeline.test.ts`

### Contracts
- `inferRole(input: { teamPosition: string; individualPosition: string; summoner1: number; summoner2: number }): { role: Role | null; source: 'riot' | 'inferred' | 'unknown' }`
  - valid team position → source `riot`;
  - else valid individual position → `inferred`;
  - else Smite (summoner spell id 11) → JUNGLE `inferred`;
  - else `{ role: null, source: 'unknown' }`.
  - Do not guess TOP/MID/BOTTOM from champion tags in this task. Ambiguous is better than false.
- `MatchParticipant` gains `individualPosition: string`; `parseMatch` maps `individualPosition` to it.
- When saving a match, `participants.position` is the inferred role when available and
  `role_source` is stored. This affects matchup/rune/skill queries, which currently silently drop
  blank positions. Existing rows stay `unknown`; no backfill in this task.
- `RiotApiProvider` gains optional
  `getLeagueEntriesByPuuid?(puuid: string): Promise<LeagueEntry[]>`; `HttpRiotApiProvider`
  implements `/lol/league/v4/entries/by-puuid/{puuid}` on the platform host.
- `LpService` reads the tracked account, fetches ranked-solo entries, and inserts a snapshot on
  startup and at most once per hour. It skips if no account/key/provider or if the last snapshot is
  newer than one hour. Omit `miniSeries` entirely.
- IPC: `lp:history` returns the last 500 snapshots ordered by `captured_at`; it is read-only and may
  be unused by the UI in this slice.

### Acceptance
- Existing recommendations run for a champion whose teamPosition was blank but whose
  individualPosition was valid.
- Unit tests cover every inference branch and the "ambiguous → unknown" case.
- LP service does not write twice within one hour; a fake clock test proves it.

---

## Slice 2 — compact personal timelines and swing math

### Files
- `src/shared/timeline-summary.ts` (new)
- `src/shared/swing.ts` (new)
- `src/main/db/timeline-summary-repo.ts` (new)
- `src/main/services/timeline-summary-service.ts` (new)
- `src/main/index.ts`, `src/main/ipc/handlers.ts`, `src/shared/ipc.ts`
- `src/main/providers/riot-api.ts`, `src/main/providers/http-riot-api.ts`,
  `src/main/providers/riot-api-proxy.ts` (raw timeline access)
- `tests/unit/timeline-summary.test.ts` (new), `tests/unit/swing.test.ts` (new),
  `tests/fixtures/riot/timeline.json` (only if an additional fixture is needed)

### Contracts
- Summary payload, version 1:
  - `minutes`: one point per elapsed minute with `minute`, `blueGold`, `redGold`, `blueXp`,
    `redXp`, `blueCs`, `redCs`. Values are sums of the five team participants' frames.
  - `markers`: `ELITE_MONSTER_KILL`, `BUILDING_KILL`, `CHAMPION_KILL`, `ITEM_PURCHASED`
    (completed items only, no components, no trinkets), with timestamp, team, participant ids
    where present, monster/building type and item id. No raw events, no damageTaken.
  - participant metadata: `participantId`, `teamId`, `championId`, `role`, `roleSource` only.
    No puuid, no summoner name.
  - JSON must be bounded; if it would exceed 20 KB, drop oldest minute points first and set
    `truncatedMinutes`.
- Summary service:
  - only personal matches of the tracked account;
  - priority: the last 50 personal games, newest first;
  - skip existing `ready` rows;
  - fetch through `RiotApiProvider.getTimeline` and the shared manager;
  - store `state = 'ready'` only after a successful parse; `unavailable` on 404/parse failure;
  - never store raw JSON.
- `src/shared/swing.ts` is pure and exports:
  - `SWING_THRESHOLDS = { goldRatio: 0.12, baseGold: 1500, perMinuteGold: 150 }`;
  - `detectSwings(summary, count = 3)` returning top absolute minute deltas with
    `classification: 'death' | 'kill' | 'objective' | 'item' | 'other'` based on the nearest marker
    within ±45 s, and the marker id when available;
  - `decidedAt(summary, thresholds = SWING_THRESHOLDS)` returning the first minute where
    `abs(goldDiff) / max(1, blueGold + redGold) >= 0.12` OR
    `abs(goldDiff) >= 1500 + 150 * minute`; otherwise `null`.
  - Do not label a game decided before minute 5.
- IPC: `review:summary` takes `{ matchId }`, returns the stored summary and computed swings; no raw
  timeline.

### Acceptance
- Fixture timeline produces the expected number of minutes, team gold/xp/cs sums, and marker count.
- Swing tests cover a death swing, an objective swing, an item swing, and a game that never crosses
  the decided threshold.
- JSON size test proves a full 40-minute summary is under 20 KB.
- A second run for the same match does not fetch or write again.

---

## Slice 3 — post-game watcher, review screen, review storage

### Files
- `src/main/services/game-session-watcher.ts` (new)
- `src/main/services/match-review-service.ts` (new)
- `src/main/db/review-repo.ts` (new)
- `src/renderer/pages/MatchHistoryPage.tsx`, `src/renderer/pages/MatchReviewPage.tsx` (new),
  `src/renderer/components/SwingChart.tsx` (new, SVG only, no chart dependency)
- `src/renderer/App.tsx` (wire the review callback; no new top-level tab unless required)
- `src/shared/review.ts` (new), `src/shared/ipc.ts`, `src/shared/history.ts`,
  `src/main/db/match-history-repo.ts`, `src/main/services/match-history-service.ts`,
  `src/main/ipc/handlers.ts`, `src/main/index.ts`
- `tests/unit/match-review-service.test.ts` (new), `tests/integration/game-session-watcher.test.ts` (new)

### Contracts
- `GameSessionWatcher` polls the existing LiveClientData endpoint every 10 s in the main process,
  independent of which renderer page is open. It keeps `wasLive` in memory. When a live game
  transitions to not-live, it schedules `match-v5` sync attempts after 45 s, 90 s and 180 s, stops
  after the first new personal match, and never runs more than one watcher loop. No `EndOfGame`
  event exists; do not reference one.
- The watcher calls the existing match sync path with the tracked account and then marks a pending
  review for the newest stored match. No Riot call is made when there is no account or no API key.
- `MatchReviewService`:
  - `get(matchId)` returns match header, timeline summary, swings, existing review;
  - `save(matchId, review)` validates `fixText` max 500 chars, 5 fixed checklist keys
    (`died_too_much`, `missed_cs`, `bad_recall`, `lost_vision`, `poor_teamfight`), tags max 8;
  - upsert by `match_id`; no review for a match not belonging to the tracked account.
- `MatchReviewPage`:
  - SVG goldDiff curve, markers, top-3 swing labels, decided point;
  - form: "1 thing to fix next game", 5 checklist items, tags;
  - save button shows saved state; no raw JSON and no other-player identifiers.
- `MatchHistoryPage`:
  - per-match "Review" action;
  - "Unreviewed" filter using `match_reviews` presence;
  - review panel opens without leaving the Matches tab.
- `review:pending` returns the newest unreviewed match for the tracked account; the UI may use it for
  a CTA later. No auto-open during a game.

### Acceptance
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` exit 0.
- Unit tests prove transition detection, no duplicate watcher, exponential retry attempts, review
  validation, and upsert.
- Manual: finish a game, wait for sync, open Matches → Review, see goldDiff curve and top-3 swings,
  save the form, reopen and see it persisted.
- Existing research, recommendations, stats and match sync remain unchanged.

---

## Explicitly deferred
- Materialized `agg_*` tables and `schema_version` aggregate recomputation.
- Research focus timelines; only personal timelines in this wave.
- Research verified badge changes.
- Server-side global snapshots.
- UI/UX polish, charts batch 2, sessions, training plan, live panel.

## Forbidden
New dependencies; raw timeline storage; storing opponent puuids/names; damageTaken claims; guessing
roles from champion tags; modifying applied migrations; touching server/backend files; running
commands.
