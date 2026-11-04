# Deployment blockers (parked, review before any public release)

Status: audited 2026-11-01; Stage A quick fixes applied. Re-check the policy pages below before
acting, they change over time. Not legal advice.

## Policy sources
- General Policies: https://developer.riotgames.com/policies/general
- LoL Developer API Policy: https://support-developer.riotgames.com/hc/en-us/articles/22698698001939-League-of-Legends
- Terms: https://developer.riotgames.com/terms
- Legal Jibber Jabber: https://www.riotgames.com/en/legal

## BLOCKER: product not registered
- Riot requires every player-facing product to be registered and audited through the Developer
  Portal — including products that use unsupported/undocumented client APIs.
- LCU endpoints must be declared in the registration.
- A Production key must never be embedded in a distributed Electron binary.
- Public distribution therefore needs: registration, audit, production key, and a server-side
  proxy (see docs/backend-roadmap.md).

## Planned fixes, in order
1. Rename the UI label "Global" to "Research sample". **DONE in Stage A.**
   The crawl is Master+/Diamond/optional Emerald I only; the current label overstates scope.
   README already says it is "explicitly not global" — the UI must match.
2. Show the Riot disclaimer on first run and keep it in an always-reachable About/Legal screen.
   **DONE in Stage A.**
3. Soften in-game "Next items" (Live Game page) into neutral multi-option guidance.
   **DONE in Stage A.**
   Policy restricts apps that dictate decisions and apps that change game decisions.
   Keep Live Client Data strictly read-only.
4. Add PUUID cleanup and retention rules for other players in `research_frontier`.
   **DONE in Stage A: rows are deleted after processing and migration 13 purges old done rows.**
5. Keep local data local. No telemetry, no sale, no sharing — this is allowed and should stay.

## Feature status after the audit
- ALLOWED: Riot ID lookup, personal sync, match history, personal stats, timelines, post-game
  review, LP history, matchups, synergies, Data Dragon assets, rate limiting, read-only live data.
- RISKY: in-game "Next items"; the "Global" label.
- NEEDS REVIEW: pre-game recommendations and runes built from crawled aggregate data;
  LCU champion-select detection; the research crawler itself; visible-disclaimer placement.

## Top 3 risks
1. Public release without registration/audit.
2. Retention of other players' PUUIDs and broad research collection.
3. In-game next-item guidance plus the "Global" label.

## Do not do
- Never embed a Riot key in a distributed build.
- Never read game memory or automate the client/game.
- Never claim global statistics until the sample scope is honest.
- Never add accounts, telemetry or data sharing without a privacy review.
