# Stage C — what was checked online (2026-11-01)

Sources (all public, read-only):
- https://wiki.leagueoflegends.com/en-us/Role_Quests — role quest list (V26 rules)
- https://wiki.leagueoflegends.com/en-us/Armored_Advance — item requirements and patch history
- https://wiki.leagueoflegends.com/en-us/Feats_of_Strength — removed 2025 reward (history only)
- https://wiki.leagueoflegends.com/en-us/Item_group — Boots item group
- https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/items.json — current shop snapshot, including tombstone entries
- https://ddragon.leagueoflegends.com/api/versions.json — Data Dragon version list

## How item availability works now (V26)

- Every Summoner's Rift shop item is buyable by every lane.
- Tier-3 boots are **not** a normal shop purchase: the **Midlane Quest** upgrades the player's own
  tier-2 boots into the tier-3 version at no cost. The 2025 "Feats of Strength" unlock was removed
  in V26.01, so nothing else grants tier-3 boots.
- Therefore the only lane-locked items are the seven tier-3 boots, and they belong to MIDDLE:
  Armored Advance (Plated Steelcaps), Chainlaced Crushers (Mercury's Treads), Crimson Lucidity
  (Ionian Boots of Lucidity), Gunmetal Greaves (Berserker's Greaves), Immortal Path (Gluttonous
  Greaves), Spellslinger's Shoes (Sorcerer's Shoes), Swiftmarch (Boots of Swiftness).
- Data Dragon still lists removed items as tombstones (for example the 2025 tier-3 boots that no
  longer exist). They are dropped together with zero-gold `Quest:` placeholder items.

Implied by `buildItemPool(items, excluded, lane)` in `src/shared/item-traits.ts`. Lane is passed
from `recommend()` and the experimental math build, so "Armored Advance" can no longer appear for
BOTTOM.

## What still needs the owner

1. Re-run the app: Recommendations for BOTTOM must list only the six tier-2 boots; MIDDLE may show
   the tier-3 quest boots.
2. If a name above is wrong for the live patch, only `MID_QUEST_TIER3_BOOTS` /
   `MID_QUEST_TIER2_BOOTS` need editing.
3. Event/removed items are rejected by `isPurchasableOnSR` (strict map-11 catalog gate) and by the
   explicit `NON_SR_ITEM_IDS` / `NON_SR_ITEM_NAMES` entries for known offenders such as
   **Demon King's Crown (#3904)**. If another event item appears, add it there together with a test
   in `tests/unit/item-traits.test.ts`.

## Recommended next steps (not done)

- Stage E1 migration chain test (schema is now 15).
- Verify the Patch changes tab shows the Data Dragon diff for `patch:changes` before/after.
