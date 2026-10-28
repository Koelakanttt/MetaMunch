# Release checklist

Use this before tagging a release. Commands are run by the owner; the agent only writes files.

## 1. Prepare

- [ ] `npm install` (the lockfile must be committed).
- [ ] Install the packaging tool once: `npm install --save-exact --save-dev electron-builder`.
- [ ] Add real screenshots to `docs/screenshots/` (recommendations.png, patch-changes.png,
      settings.png) so the README is not broken.
- [ ] `package.json` version matches the intended tag (`0.1.0-alpha` → `v0.1.0-alpha`).

## 2. Checks

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run test:live:riot` (needs `RIOT_API_KEY`, `RIOT_TEST_ID` in `.env`)
- [ ] `npm run test:live:patch`
- [ ] `npm run inspect:items` (boots report for `bootsAllowlist`)

## 3. Manual smoke test (`npm run dev`)

- [ ] First run asks for the Riot API key; after saving it is not requested again.
- [ ] Theme switch works and survives a restart.
- [ ] Data Dragon refreshes automatically on launch; the status line is honest.
- [ ] Riot ID → Set account → Sync matches works; second sync skips existing matches.
- [ ] Recommendations show Core/Situational/Boots with sources and reasons; no exclusive-group
      duplicates.
- [ ] My pool, Matches (all filters), Stats (queue/patch), Patch changes load.
- [ ] Champion select detection applies the detected picks (read-only).
- [ ] Game tab shows live tips in a game and the post-game review afterwards.

## 4. Build the installer

- [ ] `npm run dist`
- [ ] `dist/MetaMunch-<version>-x64.exe`, `dist/latest.yml`, `dist/*.blockmap` exist.
- [ ] Install from the artifact on a clean Windows profile and repeat the key/account flow.

## 5. Publish

- [ ] Commit everything; the release workflow runs on `v*` tags.
- [ ] `git tag v<version>` and push the tag.
- [ ] The GitHub release contains the installer, `latest.yml` and blockmap.
- [ ] Note in the release text that the alpha installer is unsigned (SmartScreen warning) and that
      auto-update is not enabled yet.

## Notes

- `npm run dist` requires `electron-builder`; it is intentionally not pinned in `package.json` until
  the owner installs it.
- Auto-update (electron-updater) is a later step; the release already publishes the metadata file it
  will need.
