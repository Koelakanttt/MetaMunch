# Task M3d — recommendation engine v2 (known issue REC-001)

## Goal
Make the recommendations fit the champion being played: a "Core" list first (the owner's own usual build, or a class core), then situational items against the enemy team, with at most one item per exclusive group (anti-heal, armor penetration, ...), explanations that combine the threat and the item's fit for the champion, and sensible boots.

## Rule for this task
You only WRITE files. Do NOT run any command (no npm, no node, no git). The owner runs all checks and pastes failures back to you. You design the internals, but the paths, names, types, data and behavior below are fixed. Reasoning effort Medium is recommended.

## Files you may modify (this time the engine files are yours)
src/shared/recommend.ts, src/shared/rules.ts, src/shared/recommend-api.ts, src/shared/personal.ts (only if needed),
src/main/services/recommendation-service.ts, data/rules.json, data/champion-tags.json,
src/renderer/pages/RecommendPage.tsx,
tests/unit/recommend.test.ts, tests/unit/rules-data.test.ts, tests/unit/recommendation-service.test.ts, tests/integration/items-inspect.test.ts,
docs/known-issues.md (status lines and History only; if the file is not there, look in the repo root),
docs/progress.md (append one line).

## Do not touch
AGENTS.md, docs/decisions.md, docs/stages.md, docs/tasks/*, `src/shared/item-traits.ts`, `ddragon.ts`, `riot.ts`, the Riot API, database and migration files, package.json, tsconfig*.json, eslint.config.js, vitest.config.mts.

## Contracts

### 1. Archetypes
```ts
export const ARCHETYPES = ['tank', 'bruiser', 'assassin', 'mage', 'marksman', 'enchanter'] as const
export type Archetype = (typeof ARCHETYPES)[number]
export function archetypeOf(champion: Champion, tags: ChampionTags): Archetype
```
`champion-tags.json` entries get an optional `archetype` field (validated in `rules.ts`). Resolution order: explicit `archetype`; else tank when `isTank(champion, tags)`; else by Data Dragon tags in this priority: Marksman -> `marksman`, Assassin -> `assassin`, Mage -> `mage`, Fighter or Tank -> `bruiser`, Support -> `enchanter`; fallback `bruiser`.
The enemy profile metrics `tanks`, `assassins`, `marksmen`, `mages` now count champions by `archetypeOf` (tank, assassin, marksman, mage) instead of raw Data Dragon tags; the `*Names` lists follow. `isTank` and the `tank` override keep working (archetype `tank` iff `isTank`).

### 2. New fields in data/rules.json (schema in rules.ts, all validated by zod)
- `archetypes`: object keyed by archetype, each `{ "label": string, "prefer": Trait[], "avoid": Trait[] }`. Content (write exactly):

| key | label | prefer | avoid |
|---|---|---|---|
| bruiser | bruisers | ad, health, abilityHaste | crit, mana |
| tank | tanks | health, armor, mr, abilityHaste | crit, attackSpeed |
| assassin | assassins | ad, ap, armorPen, magicPen, abilityHaste | (none) |
| mage | mages | ap, abilityHaste, magicPen, mana | attackSpeed, crit |
| marksman | marksmen | ad, attackSpeed, crit, onHit, armorPen | mana, healShieldPower |
| enchanter | enchanters | healShieldPower, abilityHaste, mana, ap | ad, crit |

- `groups`: array of `{ "id": string, "trait": Trait, "max": number }`: `antiheal`/max 1, `armorPen`/max 1, `magicPen`/max 1, `tenacity`/max 1 (id = trait name).
- `bootsAllowlist`: array of item names, default `[]`. When not empty only boots with these names may be recommended.
- Rules get an optional `archetypes` array (like `roles`): the rule applies only when the champion's archetype is listed.
- Remove the rule `boots-haste-default` (no more default boots for "no special threat"). Keep the threat based boots rules and `boots-magic-pen-for-ap`. Add rule `boots-attack-speed-marksman` (slot boots, archetypes `["marksman"]`, `when` enemies >= 1, anyOf attackSpeed, weight 2, reason "Marksmen scale with attack speed: attack speed boots.").

### 3. Core list
`RecommendInput` gets `prior?: { games: number; build: { name: string; games: number }[] }`. `RecommendResult` gets `core: Recommendation[]` and `Recommendation.source` becomes `'rules' | 'core' | 'personal'`.
- When `prior` exists with `games >= 3`: core = the prior build entries that exist in the item pool (match by name, compatible with the champion), in the given order, at most 4, source `personal`, reasons `["In your usual build ({entry.games} of {prior.games} games)."]`.
- Otherwise: core = the class core (existing `coreByClass` logic, at most 4), source `core`, same reason text as today plus the fit sentence.
- The old "top up the situational list with core items" behavior is REMOVED. Situational items never repeat an item (by name) that is already in `core`.
- `level` is `'rules'` when at least one situational item or boots recommendation came from rules, otherwise `'core'`.

### 4. Situational ranking, groups and fit
For each candidate: `score = ruleScore + fit`, where `fit = 0.5 * (number of the archetype's prefer traits the item has) - 1 * (number of avoid traits it has)`. Candidates with `ruleScore < MIN_RULE_SCORE` are still excluded (fit never rescues them). An item that has an avoid trait and no prefer trait is dropped. Sort as before (score, then gold, then id). Then enforce groups: walk the sorted list and skip an item when it has the trait of a group whose `max` is already reached by the items kept so far. Boots follow `bootsAllowlist`.

### 5. Explanations
`reasons` of a situational recommendation = up to 2 threat reasons (as today) + ONE fit sentence: `Fits {label}: {matched prefer traits in words}.` when at least one prefer trait matches, otherwise `Not a typical pick for {label}.` Words: ad "attack damage", ap "ability power", health "health", armor "armor", mr "magic resist", abilityHaste "ability haste", armorPen "armor penetration", magicPen "magic penetration", crit "critical strike chance", attackSpeed "attack speed", mana "mana", healShieldPower "heal and shield power", onHit "on-hit effects", lifesteal "life steal", omnivamp "omnivamp", tenacity "tenacity", moveSpeed "move speed", antiheal "Grievous Wounds", adaptive "adaptive force", boots "boots". Never claim item passives you do not know.

### 6. API and service
`src/shared/recommend-api.ts`: `RecommendationView.source: 'rules' | 'core' | 'personal'`; `RecommendResponse` gets `core: RecommendationView[]` and `me.archetype: Archetype`. `RecommendationService.run` computes the personal stats FIRST and passes `prior = { games: personal.games, build: personal.build.map(b => ({ name: b.name, games: b.games })) }` to `recommend` when personal exists.

### 7. UI (RecommendPage.tsx)
Show, in this order: the existing header and enemy summary lines (header line also shows the archetype: `you: {me.name} ({me.damage}, {me.archetype})`), `Core` list (label each entry `[your build]` for `personal` and `[class core]` for `core`), `Situational` list (the old Items list, renamed), `Boots`, then the existing personal stats block. Same plain format; empty lists show `none`.

### 8. Data edits (exact; the owner reviews them later)
In `data/champion-tags.json`:
- `archetype: "bruiser"` for Briar, Camille, Aatrox, Darius, Sett, Renekton, Jax, Irelia, Fiora, Riven, Gwen, Vi.
- `archetype: "mage"` for Ahri.
- `archetype: "assassin"` for Akali, Zed, Talon, Rengar, Khazix, Katarina, Evelynn, Fizz.
- `cc: "hard"` added for Ahri, Bard, Azir, Aphelios, Cassiopeia, Neeko, Annie, Fiddlesticks, Janna, Lulu, Swain, Varus, Camille, Aatrox, Sett, Draven, Gragas.
Keep every existing entry and field; merge, do not overwrite.

### 9. Boots report
Extend the live test `tests/integration/items-inspect.test.ts` with a section `== BOOTS AND BOOTS-LIKE ITEMS (name | id | gold | from | into | inStore | maps) ==` listing every pool boots item and every other item with the Boots tag, with `from`/`into` shown as item names. The owner will use it to fill `bootsAllowlist`; do not guess the list yourself.

## Tests (you write and update them)
- Update every existing test that the changes break (profile counts by archetype, removed top-up, removed default boots rule, new response fields, `rules-data` validation of the new schema parts, `recommendation-service` fake sources).
- New unit tests: `archetypeOf` (override, tank, each Data Dragon tag, fallback); group constraint (two anti-heal items in the catalog, only one is returned, and for a bruiser the one with AD and health beats the crit one while a marksman gets the crit one); fit sentence text; core from `prior` (>= 3 games) versus class core (fewer games) and no duplicates between `core` and situational; boots: no boots when nothing triggers, armor boots against a physical team, magic penetration boots for an AP champion, `bootsAllowlist` filtering, marksman attack speed boots.
- Generalization test (required by REC-001): with one synthetic catalog and the same enemy team, run an Aatrox-like bruiser, an Ahri-like mage and a Jinx-like marksman and assert: results are non-empty; the bruiser gets no purely defensive tank item as core; the mage's situational items all carry `ap`/`adaptive` (boots excepted); each result contains at most one item per exclusive group; the marksman's list has an AD or crit item.

## Acceptance (the owner runs these)
- `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` exit 0
- `npm run dev`: Aatrox vs Akali, Azir, Bard, Aphelios, Briar shows `hard CC` with Azir, Bard and Aphelios, a Core section (your build if you have 3+ games on the champion), at most one anti-heal item, no default haste boots, and fit sentences in the reasons
- `npm run inspect:items` writes the boots section for the owner

## Forbidden
CommunityDragon or any new data source, hardcoded fixes for single champions in code (data files only), new dependencies, running commands, changing paths or names above.

## Stop and ask when
Two contracts above contradict each other or an existing test cannot be reconciled without changing a "do not touch" file.
