# Stage B remaining — filters, intervals, highest-win

## Goal
Finish PLAN-v2 Stage B without starting Stage C. Current tests are green; do not regress them.

## Scope
1. **B3 — role quality**
   - Add a shared `ResearchFilters` contract (already started in `src/shared/research.ts`).
   - Default excludes `role_source` `inferred` and `unknown` from all aggregate queries used by Research and Recommendations.
   - UI: show “N games excluded (inferred roles)” and an opt-in checkbox; default off.
2. **B4 — tier filters**
   - Aggregate queries accept `diamond | master | emerald` and an unknown-tier toggle.
   - Default Diamond+ (Diamond, Master, Grandmaster, Challenger).
   - Research and Recommendations show the active tier scope on every figure.
   - Unknown tier excluded by default; opt-in checkbox.
3. **B6 — highest-win view**
   - Default ordering remains pick rate.
   - A “Highest win” view only appears when the conditioned champion-role sample is at least 300 games; otherwise show “Not enough games to compare win rates (needs 300)”.
   - Keep the 30-game minimum for any recommendation.
   - Every visible win rate shows a Wilson interval and games.

## Files
`src/shared/research.ts`, `src/main/db/research-aggregate-repo.ts`,
`src/main/services/research-evidence-provider.ts`, `src/main/services/research-service.ts`,
`src/main/services/rune-service.ts`, `src/main/services/recommendation-service.ts`,
`src/shared/recommend-api.ts`, `src/shared/ipc.ts`, `src/main/ipc/handlers.ts`,
`src/renderer/pages/ResearchPage.tsx`, `src/renderer/pages/RecommendPage.tsx`,
relevant tests in `tests/unit` and `tests/integration`, `docs/progress.md`, `docs/STATE.md`.

## Acceptance
- Tests for: default inferred/unknown exclusion, tier filtering, unknown opt-in, exact 300-game gate, 250-row count.
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` green.
- No user-visible “Global”; no invented numbers; every filtered figure states its scope.

## Do not
Start Stage C, add dependencies, run commands, or claim completion without owner checks.
