# MetaMunch

MetaMunch is a Windows desktop companion for League of Legends. It recommends items for your
champion from the enemy team composition, tracks your personal record from public match data, and
shows what changed in the latest patch for the champions and items you actually play.

It is read-only: it never automates the game or the client, never shows hidden information, and
uses only public data (Data Dragon and the Riot API).

## What it does

- **Recommendations.** Pick your champion, role and up to five enemies. You get three lists:
  **Core** (your usual build, or a class core when you have fewer than three games), **Situational**
  (answers to the enemy threats) and **Boots**. Every entry shows its source (`rules`, `your build`,
  `class core`) and a short reason that combines the threat with the champion's needs. Mutually
  exclusive categories (anti-heal, armor penetration, magic penetration, tenacity) never repeat.
- **Personal statistics.** Connect a Riot ID and sync recent matches. For the selected champion the
  app shows games, wins, win rate, your usual build and your record against each enemy. On small
  samples the win rate is shrunk toward your account average and marked as adjusted. Only
  Summoner's Rift queues (normal, ranked solo, ranked flex) are counted; ARAM and remakes are
  excluded, and other players' identifiers are never stored.
- **My pool.** A champion-pool overview: every champion you played, with games, wins, win rate and
  the last time you played it, plus your overall record for the same queues. Click a champion to
  open recommendations with it preselected.
- **Match history.** Your recent matches with champion, role, result, queue, patch, duration and
  final items, filtered by champion, role, queue or patch. Click a champion to open recommendations
  with it (and its role) preselected. Only the same personal queues are stored.
- **Stats (own sample).** Champion pick/win rates and item purchase/win rates over every participant
  of your synced matches, filterable by queue and patch. A stats-source layer with a per-patch cache
  and a Settings flag is in place; no external source is configured yet, so the app always uses your
  own sample and falls back to it automatically if a future source fails. External statistics are an
  optional later step.
- **Champion select (read-only).** While the League client is in champion select, MetaMunch detects
  your champion, role and the revealed enemy picks and can apply them to the recommendations with
  one click. It only reads the local client API — never clicks, picks or changes anything. If the
  client is installed in a non-standard folder, set that folder in Settings.
- **Lane-first picks.** A searchable champion dropdown with icons and a clear button. The lane
  opponent is the primary slot; swap your champion with the lane opponent, or promote any other
  enemy into the lane slot. Remaining enemy slots are labelled by role.
- **Matchups.** Strong against / weak against for the selected champion, computed from your stored
  sample by same-role lane opponents (at least 3 games per matchup), with champion icons and win
  rates. Small samples are labelled.
- **Runes.** The most common rune pages for the selected champion from your stored sample, with
  full rune selections when the match was synced after schema v6. Older matches show the keystone
  only; sync new matches to fill the full page. Names and icons come from Data Dragon.
- **Synergies.** Best with / worst with teammates for the selected champion from the stored sample,
  by same-team records (at least 3 games per duo), with champion icons and win rates.
- **Item tips.** Recommended items show their gold cost and Data Dragon plaintext, and the icon
  tooltip repeats the price and stats summary.
- **Icons and builds.** Champion and item art from Data Dragon is loaded through a local,
  in-memory-cached asset protocol (`mm-asset://`) and shown in recommendations, builds, pool,
  matches, stats, patch changes, champion select and live game.
- **Themes.** Two built-in themes: **Pixel Green** (default, terminal/pixel look with a lime accent,
  grid background, square frames and monospace font) and **Slate** (calm dark UI). Switch in Settings;
  add another theme by copying a `[data-theme]` block in `src/renderer/index.css`.
- **Live game & post-game review.** During a game, MetaMunch reads the local Live Client Data API
  (only what you already see): your champion, your items and the enemy team, plus the next
  recommended items that fit the current game. After the game, it compares what you bought with
  recommendations regenerated for that composition, lists missed items, and shows the latest patch
  changes for the champion. Read-only; no overlay and no game input.
- **Patch changes.** Compare the previous patch with the latest stored one for your most played
  champions and the items in your usual builds: base stats, ability numbers, item stats and cost.
  Missing data is reported as a note instead of being hidden.
- **No manual setup.** On first launch the app asks for a Riot API key, stores it encrypted with
  the operating system keystore and reuses it. Data Dragon is checked automatically on every launch.

## Screenshots

<!-- Add real screenshots before publishing the v0.1.0-alpha release:
     docs/screenshots/recommendations.png
     docs/screenshots/patch-changes.png
     docs/screenshots/settings.png -->

![Recommendations](docs/screenshots/recommendations.png)

![Patch changes](docs/screenshots/patch-changes.png)

![Settings](docs/screenshots/settings.png)

## Install (alpha)

1. Download the `MetaMunch-0.1.0-alpha-x64.exe` installer from the GitHub Releases page and run it.
   Windows SmartScreen may warn about an unsigned alpha build.
2. Start MetaMunch. The first screen asks for a Riot API key. Use a key you are authorized to use;
   development keys are for local prototyping only, expire every 24 hours and must not be shared.
   See the [Riot developer portal](https://developer.riotgames.com/) for the current policies.
3. If you are not on EU West, pick your server in **Settings** first, then enter your Riot ID
   (`Name#TAG`), press **Set account**, then **Sync matches**.
4. Go back to **Recommendations** and pick your champion, role and enemies.

MetaMunch ships no API key. For a public build, use only a key/allocation approved for public
distribution under Riot's current developer policies; never embed a key in a distributed binary.

Node.js is not required to run the installed app. The app stores its data in the standard Windows
app-data folder.

## Development

Requirements: Node.js 24 or newer, npm, Windows 10/11.

```bash
npm ci
npm run dev
```

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the app in development mode |
| `npm run build` | Build the Electron main, preload and renderer bundles |
| `npm run dist` | Build and create the Windows NSIS installer |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript checks for main and renderer |
| `npm test` | Unit and integration tests |
| `npm run test:live:riot` | Live Riot API test (needs `RIOT_API_KEY` and `RIOT_TEST_ID`) |
| `npm run test:live:patch` | Live Data Dragon patch test |
| `npm run inspect:items` | Write the Data Dragon item/boots report to `tmp/items-inspect.txt` |

For local development the Riot key and test account can also come from `.env` (copy `.env.example`).
Never commit `.env`. Packaged builds use the key saved in the app.

## Releases

The release workflow (`.github/workflows/release.yml`) builds the Windows installer on every `v*`
tag and uploads it with `latest.yml` and the blockmap. See
[docs/release-checklist.md](docs/release-checklist.md) for the full pre-release checklist. The alpha
installer is unsigned, so Windows SmartScreen may warn; auto-update is not enabled yet.

## Data and limitations

- Region is selectable in Settings (default EU West). The selected server is used for Riot ID
  lookups and match syncs; Data Dragon static data is global. After switching servers, set your
  Riot ID again. Static data comes from Data Dragon; matches come from the official Riot API.
- Alpha does not include external statistics sites, client integration or in-game overlays.
  Global/pro-build statistics, rank filters, ban rates and skill-order data need external aggregate
  sources or match timeline sync, which are not implemented. The “Suggested items” strip is
  recommendation order, not purchase timing.
- Recommendations are heuristic. They use public champion tags and your own match history; check
  them in the client before buying.
- No telemetry, no analytics, no accounts, no monetization.
- All data stays on your computer. Only your own puuid is stored; other participants are stored
  without identifiers.

## Principles

- No automation of the game or the client, in any form.
- No hidden information: only what a player can already see.
- Third-party data that forbids scraping is never used, and scraped data is never committed.

## Legal

MetaMunch isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or
anyone officially involved in producing or managing Riot Games properties. Riot Games, and all
associated properties are trademarks or registered trademarks of Riot Games, Inc.

## License

MIT — see [LICENSE](LICENSE).
