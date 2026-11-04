# Assessment v2

Scope: Stage A only. Evidence is from the checkout before Stage A; schema was 12 then and is 13 after migration 13.

## A1 — Rename "Global" to "Research sample"
**AGREE WITH CHANGE.**
`RecommendPage.tsx` still renders the user-visible switch label `Global` (source buttons around line 1339).
`CompactRunes` says "No global rune sample"; `RuneBlock` says "(not global)".
Internal identifiers must remain `global`; only user-visible text changes.

## A2 — First-run disclaimer and About/Legal page
**AGREE WITH CHANGE.**
The legal text exists only in `SettingsPage.tsx` (Legal card) and README; there is no first-run acknowledgement and no About tab in `App.tsx`.
`settings` table already stores arbitrary keys via `settings-repo.ts`, so no new table is needed.
Need an `app:info`/`db:info` data path for the About page; `db:info` currently returns only schema/SQLite/app version.

## A3 — Labs switch
**AGREE WITH CHANGE.**
No `labs.enabled` setting exists in `SettingsService`.
`GameSessionWatcher.start()` is called unconditionally in `index.ts`; `RecommendPage` polls `champSelect:status` every 4 seconds regardless of visibility.
`Game` is a permanent tab in `App.tsx`.
Need: setting, migration default-on for existing accounts, hide Game/champion-select/research controls/math panel, and gate background jobs.

## A4 — Neutral in-game options and post-game comparison
**AGREE WITH CHANGE.**
`GamePage.tsx` labels the live panel "Next items", says "You already own the recommended items", and labels post-game "Missed from the recommendation"/"You bought every recommended item".
Live data is already read-only and contains no enemy gold; the change is wording and neutral presentation, not data access.

## A5 — TLS scope and transport evaluation
**AGREE.**
`live-client.ts` sets `rejectUnauthorized: false` inside the single `https.request` for host `127.0.0.1`, port `2999`; there is no global TLS flag.
`RiotRequestManager` records each attempt's `transport`, and diagnostics already returns those attempts. The pinned TLS 1.2 agent and Chromium fallback remain documented in `riot-fetch.ts`.
No code change is required for host scoping; add a regression test/documentation line.

## A6 — Raw measurements and neutral labels
**AGREE WITH CHANGE.**
`shared/recommend.ts` still adds "Lane priority vs ..." without a number or sample.
`MatchReviewPage.tsx` says "Gold swing became decisive around ...".
`RecommendPage.tsx` labels the panel "Math build (formula prior)".
No "tilt" or "token bucket" exists in UI or production code; those words are only in planning docs.
Implement: remove the lane-priority sentence, use "Largest gold swing: minute X, ±Y gold", label math "Experimental: item value math" and hide it unless Labs is on.

## A7 — Other-player PUUID retention
**AGREE WITH CHANGE.**
`research-service.ts` focus mode calls `markFrontierPlayerDone`, leaving other players' PUUIDs in `research_frontier` after processing.
General mode deletes the row; patch change already calls `clearFrontier`.
Implement: always delete the current frontier row after processing; purge old `done` rows in migration 13; state the deletion on Research/README; update blockers.
No other player IDs are stored in `research_rows`.
