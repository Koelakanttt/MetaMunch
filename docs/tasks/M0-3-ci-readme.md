# Task M0-3 — CI, README, vitest config cleanup

## Goal
Add a GitHub Actions workflow that runs lint, typecheck, test and build on every push and pull request, add a short README, and remove the Vite config-loader warning.

## Rule for this task
You only WRITE files. Do NOT run any command (no npm, no node, no git). The owner runs all checks.

## Create
.github/workflows/ci.yml
.gitattributes
README.md
vitest.config.mts

## Modify
tsconfig.node.json (one string only, see step 4)
docs/progress.md (append one line)

## Delete
vitest.config.ts (only after vitest.config.mts is written with the same content)

## Do not touch
AGENTS.md, docs/decisions.md, docs/stages.md, docs/tasks/*, package.json, eslint.config.js, electron.vite.config.ts, src/*, tests/*.

## Dependencies
None.

## Steps

1. vitest.config.mts: copy the full content of vitest.config.ts unchanged, except:
   - if it uses `__dirname`, `__filename` or `require`, replace them with ESM equivalents built from `import.meta.url` (`fileURLToPath(new URL('./src/shared', import.meta.url))` for the `@shared` alias);
   - nothing else changes (same aliases, same environment, same test globs).

2. Delete vitest.config.ts.

3. .gitattributes — write EXACTLY:
```
* text=auto eol=lf
```

4. tsconfig.node.json: in its `include` array replace the string `vitest.config.ts` with `vitest.config.mts`. No other change.

5. .github/workflows/ci.yml — write EXACTLY:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

6. README.md in English, max 45 lines, exactly these sections in this order:
   - `# MetaMunch` and one sentence: desktop app for League of Legends that recommends items from enemy team composition and tracks your own match statistics; read-only, uses only public data (Data Dragon, Riot API).
   - `## Status`: early development (milestone M0, skeleton).
   - `## Requirements`: Node.js 24 or newer, npm, Windows 10/11.
   - `## Setup`: `npm ci`, copy `.env.example` to `.env`, put your own Riot API key into `RIOT_API_KEY` (never commit `.env`).
   - `## Scripts`: a short list for dev, build, lint, typecheck, test (exact names from package.json: `npm run dev`, `npm run build`, `npm run lint`, `npm run typecheck`, `npm test`).
   - `## Principles`: no game or client automation, no hidden information, only what a player can see; scraped third-party data is never committed.
   - `## Legal`: this text verbatim: "MetaMunch isn't endorsed by Riot Games and doesn't reflect the views or opinions of Riot Games or anyone officially involved in producing or managing Riot Games properties. Riot Games, and all associated properties are trademarks or registered trademarks of Riot Games, Inc."
   No license section, no badges, no screenshots.

7. Append one line to docs/progress.md: `M0-3 files written, awaiting owner checks`.

## Acceptance (the owner runs these)
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` exit 0, and `npm test` no longer prints the configLoader warning
- PowerShell: `Select-String -Path out\renderer\assets\*.js -Pattern "react-dom.development" -List` prints nothing (this checks that the production bundle contains no development React)
- push the branch to GitHub and open a pull request: the CI check turns green

## Forbidden
Extra workflow files, matrix builds, caching tricks, deploy or release steps, Dependabot, extra dependencies, running commands, changing paths or names above.

## Stop and ask when
vitest.config.ts contains logic other than aliases, environment and test globs; or you cannot port it to ESM without changing behavior.
