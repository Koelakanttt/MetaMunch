# MetaMunch — Plan v2 (hand-off to the coding agent)

Put this file in `docs/PLAN-v2.md`. It is based on the owner's technical state summary, `docs/riot-policy-blockers.md` and `docs/known-issues.md`.

## 0. How to work with this plan

1. Read, in this order: `AGENTS.md`, this file, `docs/riot-policy-blockers.md`, `docs/known-issues.md`, and the current "Technical State Summary" if it is stored in `docs/`. Then READ THE CODE that the plan touches (research crawler, aggregation SQL, Recommendations/Research/Game/Settings pages, request manager, migrations).
2. Write `docs/assessment-v2.md` (max 80 lines): for every numbered item below say AGREE, AGREE WITH CHANGE or DISAGREE, with one concrete fact from the code as evidence. Do not disagree without evidence; if the code already does something, say so and skip it. Then continue with Stage A in the same session without waiting.
3. Work STAGE BY STAGE (A, B, C, D, E, F). After each stage STOP and report in at most 12 lines: files changed, tests added, the exact commands the owner must run, open questions. The owner runs `npm run lint`, `typecheck`, `test`, `build` and pastes failures back; fix them before the next stage.
4. Rules from AGENTS.md stay: you only WRITE files, never run commands. Existing migrations are never edited; add new ones. Every change keeps all existing tests green or updates them in the same change.
5. Reasoning effort: Medium for Stages A, B, E, F; High for Stage C.

## 1. Principles (non-negotiable)

- Every number shown in the UI has: a source label (research sample / own games), the number of games, and for win rates a 95% Wilson interval. Without a sample: "No data yet" plus the exact next step. No invented placeholder numbers.
- Names must not claim more than the data supports (no "Global", no "decided", no "tilt"). A heuristic is shown as the raw measurement it is.
- Local data stays local: no telemetry, no sharing. No Riot key in any distributed build. No identifiers of other players are retained beyond processing.
- The app never reads game memory and never automates the client or the game. Live Client Data stays strictly read-only.
- Anything that Riot policy marks risky lives behind the **Labs** switch (Stage A) and is off by default on a fresh install.
- Public release needs product registration, audit, a production key and a server side proxy. This plan does NOT do that; it only prepares the app and keeps `docs/riot-policy-blockers.md` accurate. Policies change: re-check the policy pages listed there. This is not legal advice.

## 2. Stage A — Honesty and policy quick fixes (small, do first)

A1. Rename the UI label **Global** to **Research sample** everywhere users see it (source switch `Combined / Research sample / Personal`, settings, tooltips, empty states). Internal identifiers may stay. Source lines always name the scope, e.g. "research sample: EUW1, Diamond+ (Master+/Grandmaster/Challenger), queue 420, patch 16.21".

A2. Riot disclaimer: show it in a first-run dialog that must be acknowledged once (store the acknowledgement in settings), and add an always reachable **About / Legal** page in the sidebar with the same text, the app version, the data folder path, the privacy statement ("all data stays on this computer; no telemetry, no analytics") and links to the policy pages. Text exactly:
"MetaMunch isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc."

A3. **Labs** switch (Settings, setting key `labs.enabled`). Behind Labs: the Game page (live client), the champion-select (LCU) card, the research crawl controls, and the experimental item-value math panel. Default OFF for a fresh database; a new migration turns it ON when the database already contains an account (the owner's existing install). When off, those parts are hidden and their background jobs do not start. Add a short explanation next to the switch ("features that may need Riot registration before a public release").

A4. In-game "Next items" (Game page): replace the directive "next recommended items" by **neutral options**: up to 3 alternatives per slot labeled "Options seen in the research sample" with pick rate and games, no ordering words like "you should/buy now", no enemy gold, no real-time optimization. Post-game panel: rename "missed recommendations" to "Compared with the research build" (a neutral comparison). Live Client stays read-only.

A5. TLS: the self-signed certificate exception for `127.0.0.1:2999` must be scoped to that host and port only (not a global flag). Show where it is enforced and add a test that other hosts are not affected. Evaluate (do not remove yet) the pinned TLS 1.2 agent and the Chromium fallback: add a counter in Diagnostics of how often each transport answered, and write the finding in `docs/assessment-v2.md`.

A6. Rename heuristics to the raw measurement and stop presenting them as facts: "game decided point" -> "Largest gold swing (minute X, ±Y gold)"; no "tilt index" anywhere (remove from the roadmap and UI); "math build" -> "Experimental: item value math" (inside Labs, collapsed, with a note that it is not validated). Remove vague explanation text (for example "Lane priority vs ..."): explanations must be facts with numbers and a source. Remove "token bucket" from the roadmap (the sliding window plus real Riot rate headers is enough).

A7. PUUID retention for other players: after a seed player is processed, DELETE the row from `research_frontier` (keep only match ids in `research_seen`); on a new patch purge the whole frontier; never keep other players' PUUIDs after processing. Add tests and a one-line statement on the Research page and in the README: "Other players' identifiers are deleted after processing." Update `docs/riot-policy-blockers.md` (mark items 1, 2, 4 as done).

Stage A acceptance: grep shows no user-visible "Global" label for the research sample; first-run dialog and About page exist; Labs off hides the listed parts; frontier test passes.

## 3. Stage B — Data correctness (fix and prove the aggregates)

B1. **The "exactly 100 games" symptom.** The Recommendations screen showed a research sample of exactly 100 games and item counts of 90 and 70 for Kai'Sa BOTTOM. Find the cause (a LIMIT, a cap, a threshold reused as a cap, the previous-patch fallback) and fix it so ALL stored rows of the champion-role on the patch are counted. Test: 250 stored rows -> the aggregate says 250.

B2. Aggregation tests on a small hand-made dataset: an item counts once per game even if it appears in several slots; consumables, wards, trinkets and components are excluded (use the shared item pool logic); price/mode variants of an item (ids like 3075 and 323075) merge by name; boots are a separate slot; the denominator is the games of that champion-role.

B3. **Role quality:** rows with `role_source` of `inferred` or `unknown` are excluded from aggregates by default. The UI shows "N games excluded (inferred roles)" and a checkbox to include them (default off).

B4. **Tier:** store the tier bucket on every research row (migration; old rows get `unknown`). Filter on the Research and Recommendations pages: default "Diamond+" (Diamond, Master, Grandmaster, Challenger), options "Master+ only" and "include Emerald". Every figure says which tiers it covers. Games with unknown tier count only when the owner ticks "include unknown tier".

B5. **Crawl diversity:** shuffle the seed players and crawl in ROUNDS: round 1 takes at most 3 match ids per player for all seeds, round 2 the next 3, and so on, instead of 20 matches per player in a row. Focus mode may prioritize players found on the focus champion but no player contributes more than 3 matches per round. Test: after round 1 no player contributed more than 3 matches.

B6. **Defaults and intervals:** focus target default 500 games (was 100); fallback to the previous patch only below 300 champion-role games (was 100) and labeled. Show the Wilson 95% interval next to every win rate, e.g. "51.2% ±5.6 (300 games)". Order by pick rate by default; the "highest win" view needs at least 300 games in the conditioned sample, otherwise "Not enough games to compare win rates (needs 300)". Anything below 30 games is never shown as a recommendation.

B7. **Data audit block** on the Research page for the selected champion-role: games, distinct matches, share per tier bucket, share per role_source, patch, and a WARNING line below 300 games ("Small sample: percentages are noisy; run the crawl longer").

Stage B acceptance: tests for all of the above; after re-crawling, the audit block shows the real game count (not capped at 100).

## 4. Stage C — Research timelines and a Lolalytics-style build (the missing core)

Match-v5 participants only contain FINAL items. Purchase order needs match-v5 timelines (one extra request per match). The existing "thin personal timeline summaries" stay as they are; this is a separate research data set.

C1. Setting **Timeline collection**: Off / 25% of kept matches / 100% (default 25%) and, in focus mode, "timelines only for matches that contain a priority champion in its own role". Requests go through the shared request manager. Show on the Research page that timelines double the request cost.

C2. From each collected timeline store compactly per participant (new migration, integers or short strings, no player ids):
- purchase order of COMPLETED items and boots (by the shared item pool logic, merged by name; components, consumables and wards ignored; `ITEM_UNDO` removes the undone purchase; sold items disappear from the order; at most 7 entries);
- starting items: purchases before 90 seconds;
- skill order: the sequence of `SKILL_LEVEL_UP` events with `levelUpType` NORMAL as a string of Q/W/E/R for levels 1-18;
- summoner spell pair and stat shards (statPerks) if not stored yet.
Tests with hand-made events: normal purchases, undo, sell, components ignored, skill string, starting window.

C3. **Build model** per champion-role (and for the exact lane matchup when it has at least 60 games, otherwise the champion-role overall with the note "lane matchup sample too small, showing all matchups"), cached per patch:
- Starting items: the most common set with games and win rate.
- Core build: greedy ordered first three completed items (boots count as a purchase): slot 1 = most picked item, slot 2 = most picked among games whose first item equals slot 1, slot 3 conditioned on the prefix. Stop when the conditioned sample falls below 60 games and say it ("build order reliable up to item 2, 118 games").
- Item 4 / 5 / 6: for each slot the top 3 alternatives by pick rate among games containing the chosen core (any later order), with pick rate, win rate, interval and games.
- Views: "Most common build" (default) and "Highest win build" (Wilson lower bound, only options with at least 300 conditioned games).
- Skill priority (which of Q/W/E is maxed first), the most common order for levels 1-15 with win rate and games; summoner spell pairs; runes (primary tree, perks, secondary tree, shards) and "other pages" with pick rate, win rate, games.
- Without timelines for the champion-role: show the final-item inclusion table and the note "Build order needs timeline collection (Research page, setting)".
Tests: the greedy prefix algorithm on a tiny dataset, thresholds, the highest-win ordering, the matchup -> champion-role fallback with the note.

C4. **Layout:** the Recommendations page shows the dashboard: compact header (portraits, role, swap, win rate with interval, games, source line, small-sample warning), a responsive grid (3 columns on wide windows, 2 medium, 1 narrow) with skills/spells/starting items on the left, the build row with core and item 4/5/6 alternatives in the centre, runes on the right; below it tabs: Situational vs this team (rules, factual reasons only), Matchups (sample, minimum 60 games), Synergies, Patch changes for this champion and suggested items, Your games. Tooltips with exact numbers, skeletons while loading, no decorative empty cards. No new network calls from the renderer.

Stage C acceptance: after a crawl of a few thousand matches with timelines on, a popular champion-role shows starting items, a 3-item core, item 4/5/6 alternatives, skill order, spells and runes with shards, each with pick rate, win rate, interval and games.

## 5. Stage D — Quality harness (golden set)

Goal: measure recommendation quality instead of arguing about it.

D1. Create `tests/golden/golden-set.json` with this schema and THREE example entries marked `"verified": false` (the owner fills real data from Lolalytics screenshots; never invent values yourself):
```json
{ "version": 1, "entries": [ {
  "champion": "Kaisa", "role": "BOTTOM", "patch": "16.21", "source": "lolalytics", "capturedAt": "2026-11-01",
  "verified": false,
  "coreItems": ["Item name 1", "Item name 2", "Item name 3"],
  "keystone": "Rune name", "primaryTree": "Precision", "skillMaxOrder": "QEW", "notes": ""
} ] }
```
Champion ids use Data Dragon ids; item and rune names match Data Dragon names.

D2. A pure scoring module and an npm script `golden` (`tsx` is NOT available: implement it as a Vitest-based live-style script like the other opt-in scripts, or as an app-internal "Run golden check" button on the Research page that writes `tmp/golden-report.txt`). For each verified entry compute from the local research sample: our core-3 (set overlap 0-3 and ordered overlap), keystone match (yes/no), skill max order match, and the sample size behind each; print a table and the totals. Entries without enough data are reported as "no data", not as failures. Unit tests for the scoring function with fake data.

D3. Document in `docs/golden-set.md` how the owner adds entries and how to read the report.

## 6. Stage E — Safety nets

E1. Migration chain test: apply migrations 1 to the current version to an empty database (assert final schema version, key tables and indexes exist) and to a database seeded with representative old-version rows (matches, participants, research rows) to prove the migrations that add columns keep the data. Also test the automatic backup (`VACUUM INTO`) path.

E2. Electron smoke test with Playwright: this needs the dev dependency `@playwright/test` (the owner will install it with `npm install -D -E @playwright/test`; say so in the stage report and wait for the owner's confirmation before relying on it). Launch the built app with a temporary user data folder; assert: the first-run disclaimer appears and can be acknowledged, every sidebar page opens without console errors, Settings diagnostics runs without throwing when the network is blocked. Script `npm run e2e`; not part of `npm test`. If that dependency is rejected, replace it with a renderer-level component test of the same assertions using the existing test tooling.

E3. A test that no log line, IPC payload, diagnostics output or error message contains the API key (extend the existing redaction test to the new code paths).

## 7. Stage F — Cleanup and documentation

F1. Update `docs/known-issues.md` (statuses and History only) and `docs/riot-policy-blockers.md` (what is done, what remains). Write the "Technical State Summary" into `docs/STATE.md` and keep it current at the end of every stage (pages, status, schema version, open risks).
F2. Reconcile `README.md`: "Research sample" wording, the disclaimer, the data retention statement, the Labs explanation, how to start the crawl and what sample size is needed for stable results (table of 95% intervals by sample size: 100 games ±10 pp, 300 ±6, 1000 ±3).
F3. A short `docs/RELEASE-CHECKLIST.md` for a future public release: registration and audit, production key, server side proxy, removing Labs features or declaring them in the registration, privacy review.

## 8. Parked (do NOT build now)

Session clustering, "1 thing to fix" training loop, win-rate/LP/death charts, pool health scoring, in-game enemy gold, materialized aggregate tables, server delivery of snapshots. Revisit only after the golden set shows an acceptable score for the build and runes (the owner decides the threshold).

## 9. Definition of done for the personal v0.1

- Labs off hides everything risky; the first-run disclaimer and About page exist; no "Global" label; no invented numbers.
- Research sample audit shows true counts; defaults 500/300; intervals everywhere; inferred roles excluded by default.
- A popular champion-role (collected in Diamond+) shows Lolalytics-style starting items, core, item 4/5/6, skills, spells and runes with games and intervals.
- `npm run golden` (or the button) reports how close the results are to the owner's verified Lolalytics entries.
- Migration chain test and the Playwright smoke test pass; lint, typecheck, test and build are green.

## 10. Questions the agent may ask the owner (only if blocking)

- Golden set data (Lolalytics screenshots) for at least 10 champion-role pairs.
- Confirmation to install `@playwright/test`.
- Whether the Labs switch should be ON in the owner's existing install (default: yes via the migration).
