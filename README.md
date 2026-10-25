# MetaMunch

MetaMunch is a desktop app for League of Legends that recommends items from the enemy team composition and tracks your own match statistics; it is read-only and uses only public data (Data Dragon, Riot API).

## Status

Early development (milestone M0, skeleton).

## Requirements

- Node.js 24 or newer
- npm
- Windows 10/11

## Setup

1. `npm ci`
2. Copy `.env.example` to `.env`.
3. Put your own Riot API key into `RIOT_API_KEY` (never commit `.env`).

## Scripts

- `npm run dev` — start the app in development mode
- `npm run build` — build the app
- `npm run lint` — run ESLint
- `npm run typecheck` — run TypeScript checks
- `npm test` — run the tests

## Principles

- No game or client automation.
- No hidden information; only what a player can see.
- Scraped third-party data is never committed.

## Legal

MetaMunch isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc.
