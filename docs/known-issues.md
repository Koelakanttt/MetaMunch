# Known Issues & Deferred Improvements

## Purpose
... (Keep your existing Purpose, Maintenance Rules, and Statuses sections exactly as they are)

---

## REC-001 — Systemic Recommendation Quality & Champion Context (Generalized)

**Status:** `RESOLVED`  
**Category:** Recommendation Engine / Champion Priors / Logic Constraints / Explanations  
**Priority:** High (Blocks M4)  
**Detected during:** M3b (Initial observation using Aatrox vs. Akali, Azir, Bard, Aphelios, Briar)

### Context

The recommendation interface generates outputs successfully and handles basic threat mapping (e.g., identifying mixed damage and healing threats). However, test runs reveal a systemic flaw: **the engine currently treats all champions as blank canvases**, applying generic threat logic without validating it against champion-specific statistical priors, role constraints, or build rules. 

The Aatrox test case is merely a symptom. The underlying issue applies to all champions: the engine recommends items that are theoretically useful against the enemy team but practically suboptimal (or completely non-viable) for the specific champion being played.

**Agent Directive:** Do not hardcode fixes for Aatrox. The engine must be upgraded to support champion-agnostic logic that dynamically fetches and applies role, class, and build-prior constraints for *any* champion.

### What Already Works Well

- **Threat Detection:** Recognizes mixed damage profiles and identifies healing threats (e.g., Briar).
- **Explanations Generation:** Successfully attaches "reasons" to items based on triggered rules.
- **Survivability Mapping:** Identifies burst threats (e.g., Akali) and attempts to address them.

### Observed Issues (Systemic)

#### REC-001.1 — Static Threat Classification is Insufficient
**Observation:** The engine reports `hard CC: none` for a team containing Bard, Azir, and Aphelios. It also classifies Briar (a Diver/Bruiser) as an Assassin.
**Root Cause:** The system relies on overly simplistic, static champion tags rather than evaluating actual ability mechanics and current patch roles.
**Desired Improvement:** 
- Implement a more granular CC evaluator using Data Dragon/CommunityDragon data (distinguishing between hard CC, soft CC, displacements, and conditional CC).
- Threat classification (Assassin vs. Bruiser vs. Tank) must be based on current meta statistics and roles, not legacy tags. This affects how the engine evaluates burst vs. sustained damage threats.

#### REC-001.2 — Decoupled Threat Logic and Item Justification
**Observation:** A generic explanation (e.g., "extra health against Akali and Briar") is attached to multiple items (Jak'Sho, Thornmail, Bandlepipes).
**Root Cause:** Triggered threat rules are blindly mapped to any item that possesses the corresponding stat, without explaining why *this specific item* is the best vehicle for that stat.
**Desired Improvement:** The explanation must combine the threat context with the item's unique properties. Explain *why* the item's specific passive, stat profile, or synergy with the champion's kit makes it the correct choice over alternatives.

#### REC-001.3 — Lack of Champion Statistical Priors (Core Build Validation)
**Observation:** The engine recommends pure tank items (Jak'Sho, Randuin's) on Aatrox, ignoring his core bruiser builds (Eclipse, Sundered Sky, etc.).
**Root Cause:** The recommendation engine does not consult champion-specific build statistics, win rates, or core item priors before filtering situational options.
**Desired Improvement:** 
- **Implement a "Champion Prior" layer.** Before evaluating situational threats, the engine must fetch the standard core items, primary stat preferences (e.g., AD, AP, HP), and optimal runes for the champion in the specific role.
- Items that have a negative synergy with the champion's core playstyle (e.g., pure tank items on damage-reliant bruisers/mages) should be heavily penalized or excluded, regardless of enemy threats.

#### REC-001.4 — Violation of Build Constraints (Item Exclusivity)
**Observation:** The engine recommends multiple anti-healing items simultaneously (Chempunk Chainsword, Thornmail, Mortal Reminder).
**Root Cause:** The engine evaluates items independently rather than as a cohesive build, failing to recognize mutually exclusive item categories or redundant passives.
**Desired Improvement:**
- Implement strict **Item Group Constraints**. The engine must define item categories (e.g., Grievous Wounds, Anti-Burst, Armor Penetration) and enforce rules such as "Maximum 1 item from the Grievous Wounds group per build."
- When multiple items in the same category are viable, compare them based on the champion's scaling, stat requirements, and gold efficiency (e.g., Mortal Reminder is for Crit users, Chempunk is for Bruisers, Thornmail is for Tanks).

#### REC-001.5 — Flawed Boot Selection Logic
**Observation:** Recommends "Crimson Lucidity" (an upgraded Ionian Boots variant obtained via specific in-game quests) with the justification "no special threats."
**Root Cause:** The absence of a threat is being used as a positive justification for a highly specific boot upgrade, and the engine is ignoring the champion's actual mobility/stat needs and the standard boot win rates.
**Desired Improvement:**
- Boot recommendations must be driven by the enemy team's primary damage profile (Plated Steelcaps vs. Mercury's Treads) OR the champion's core stat requirement (Sorcerer's Shoes, Berserker's Greaves).
- Do not recommend upgraded boots (Crimson/Armored/etc.) as a default top-level choice unless the agent understands the in-game quest mechanics and the specific game state, which is outside the scope of pre-game recommendations. Stick to base boots for pre-game logic.

### Desired Recommendation Output Architecture (For the Agent)

When rewriting the recommendation logic, the agent must follow this pipeline for **every** champion:

1.  **Fetch Champion Priors:** Get the champion's standard build, role, and core stats.
2.  **Evaluate Threats:** Map the enemy team's damage types (Physical/Magic), CC types, and threat classes (Burst/Sustained).
3.  **Generate Candidate Items:** 
    *   *Start with core items* (from priors).
    *   *Add situational items* that directly counter the mapped threats.
4.  **Filter & Enforce Constraints:** 
    *   Remove items that conflict with champion priors (e.g., tank items on squishy carries).
    *   Enforce mutually exclusive item groups (Max 1 Anti-heal, Max 1 Armor Pen).
5.  **Rank and Select:** Choose the best item from each needed category.
6.  **Generate Contextual Explanations:** 
    *   Format: `[Item Name] - [Threat Context] + [Champion Synergy]`
    *   *Example:* "Chempunk Chainsword — Counters Briar's sustained healing. Provides health and AD, which synergizes perfectly with Aatrox's kit, whereas Mortal Reminder would be inefficient due to his lack of crit scaling."

### When to Revisit
Do not patch individual champion cases. Revisit this when implementing the systemic overhaul of the recommendation engine. The agent must ensure that the new logic successfully applies to Aatrox **and** produces valid recommendations for at least two other distinct archetypes (e.g., a Mage and an ADC) against the same enemy composition to prove the logic is truly generalized.

**History:** Initial owner observations following M3b testing. Updated to reflect systemic requirements over champion-specific patches. M3d: engine v2 implemented (archetype profiles, personal/class core split, exclusive item groups, fit-based explanations, boot allowlist); closed after owner checks.