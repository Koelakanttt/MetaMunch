# MetaMunch — agent rules

Read this file, then ONLY the task file you were given. Do not read other docs unless the task says so.

## Project
Desktop app for League of Legends (region EUW). Uses only public data. Read-only: never automate the game or the client, never show hidden information. Locked decisions: docs/decisions.md (read only if the task says so).

## Hard rules
1. Do exactly what the task file says. Do not choose libraries, versions, paths, names or structure that the task does not specify. Missing or ambiguous -> STOP and ask ONE question.
2. Create/modify only files listed in the task. Never touch files listed under "Do not touch".
3. No dependencies beyond the task's list. Pin exact versions (`npm install --save-exact`).
4. Be terse. No plan essays, no re-reading files you already read, no re-running commands that already passed.
5. When done: run the acceptance commands once, report PASS/FAIL per command (max 10 lines), append one line to docs/progress.md, stop.
6. Secrets only in `.env` (gitignored). Never print or log keys.
7. TypeScript strict, no `any`. Code and comments in English; comment only non-obvious things.
8. All network access only inside `src/main/providers/`. The renderer never makes network calls and never imports from `src/main`.
9. Must work on Windows (no bash-only scripts). No git commands unless the task says so.
10. Do NOT run npm install, lint, typecheck, test, build or dev. Write files only. The owner runs all commands and reports results.
## Stop and ask when
- an install or build step fails twice;
- the task needs a file or dependency it does not list;
- an acceptance command cannot pass;
- anything touches data sources, terms of use, or API keys.

## Commands (after M0-1)
`npm run lint` · `npm run typecheck` · `npm test` · `npm run build`

## Layout
src/main (index.ts, ipc/, providers/, services/, db/) · src/preload · src/renderer · src/shared (types, zod schemas, ipc.ts) · data/ · tests/unit · tests/integration · tests/fixtures · docs/
