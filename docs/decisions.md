# Locked decisions (change only via the owner)

## MVP = M0–M4
M0 skeleton+CI · M1 Data Dragon + patch cache · M2 my matches (Riot API) · M3 item recommendations from enemy comp · M4 patch notes for my champion pool.
Backlog (do NOT design for it now): M5 global stats provider (Lolalytics), M6 LCU champ select, M7 live client hints, M8 post-game review, matchup journal.

## Stack
Electron + electron-vite, TypeScript strict, React 19, Tailwind 4 (@tailwindcss/vite), zod 4, Vitest, ESLint 9 flat config + typescript-eslint, Prettier, npm.
Not in MVP: Zustand, React Router, Playwright (starts at M3), msw (starts at M2), Lcu/LiveClient interfaces.

## Storage
SQLite via `node:sqlite` (built into Node/Electron, no native build). Fallback to better-sqlite3 ONLY if M0-2 proves node:sqlite is unavailable in the pinned Electron. All SQL lives in `src/main/db/` behind repository functions, so the driver is swappable.

## Providers (interfaces only for these three)
DataDragonProvider, RiotApiProvider, GlobalStatsProvider (impl later: OwnSampleProvider first, LolalyticsProvider in M5).

## Recommendation engine (3 levels, degrade in order)
1. stats (own + global, smoothed) 2. rules from data/rules.json 3. core items from data/champion-tags.json.
Rules refer to item TAGS (e.g. antiheal, armor, mr), never to item IDs. Every recommendation has `source` and `reason`.

## Personal stats smoothing
shrunk = (wins + k*g) / (games + k), k = 25, g = global winrate. If g is unavailable: show raw wins/games and set `lowSample = true` when games < k. UI always shows `games`.

## Riot API
Region routing: EUW (platform euw1, regional europe). Key from `.env` (RIOT_API_KEY), user-supplied. Rate limiter is mandatory (M2).

## Sources
Public data only. League of Graphs is not used. Lolalytics only in M5, one request at a time with 1–2 s pause, honest User-Agent, cache per patch, on 403/429/captcha do not bypass: fall back to own sample. Never commit scraped data; never send it to an LLM.

Each milestone adds its own numbered migration; never edit an applied migration.
