# Backend roadmap (future)

Status: deferred until the local desktop app is finished. This file records the decision and
the constraints, not an implementation.

## Why a backend is needed

MetaMunch currently runs locally and uses a user-supplied Riot API key. Riot's rules do not allow a
personal/development key for a public product, and a production key must never be embedded in a
distributed Electron binary. A backend is the only way to ship a public app that does not ask every
player for a developer key.

A backend is also required for any future **global** statistics. The local app only knows the
user's own synced matches; it must never present those numbers as global.

## Target architecture

```
Electron app ──HTTPS──> MetaMunch API ──> Riot API
                         │
                         ├── production key (server-only)
                         ├── match/timeline collector
                         └── aggregate database (patch/queue/role)
```

- The Electron client never receives the Riot key.
- The server owns rate limiting, retries and caching.
- Aggregates are versioned by patch, queue, region and role; sample size is always returned.
- Personal features and global aggregates must be labelled separately.

## Prerequisites before starting

1. Riot production key for the public product (current personal key is local-only).
2. Hosting + database budget (a small serverless or VPS deployment is enough for a first proxy).
3. Privacy policy and a clear data-retention statement; the backend will see Riot IDs and match
   data even if it stores only aggregates.
4. Update the Riot product description *before* releasing a backend build.
5. Keep the existing local BYO-key/static mode as a development path only.

## Smallest useful first backend milestone

A proxy for account lookup and match sync only. No global statistics yet.

- `POST /v1/account` (Riot ID) -> PUUID, rate-limited.
- `GET /v1/matches?puuid=...` -> recent match summaries.
- Server stores no API keys and no long-term personal history by default.
- The app keeps its local SQLite database; the server is stateless if possible.

Only after this works should a collector for global aggregates be considered. That collector needs
`league-v4` (Challenger/Grandmaster/Master samples), `match-v5` and optionally timeline data; it is a
separate data-engineering task, not a desktop feature.

## Non-goals for now

- No embedded production key.
- No scraping of Lolalytics/OP.GG/LeagueOfGraphs.
- No claim of “global” statistics until the collector exists and its sample is documented.
- No telemetry or account system without a privacy review.
