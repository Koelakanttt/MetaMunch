import type { Migration } from '../migrate'
import init from './0001_init.sql?raw'
import matches from './0003_matches.sql?raw'
import itemAvailability from './0004_item_availability.sql?raw'
import championDetails from './0005_champion_details.sql?raw'
import fullRunes from './0006_full_runes.sql?raw'
import timeline from './0007_timeline.sql?raw'
import research from './0008_research.sql?raw'
import researchStatPerks from './0009_research_stat_perks.sql?raw'
import researchPipeline from './0010_research_pipeline.sql?raw'
import researchFocus from './0011_research_focus.sql?raw'
import wave1Review from './0012_wave1_review.sql?raw'
import stageA from './0013_stage_a.sql?raw'
import stageB from './0014_stage_b.sql?raw'
import researchTimelines from './0015_research_timelines.sql?raw'
import staticData from './0002_static_data.sql?raw'
export const migrations: readonly Migration[] = [
  { version: 1, sql: init },
  { version: 2, sql: staticData },
  { version: 3, sql: matches },
  { version: 4, sql: itemAvailability },
  { version: 5, sql: championDetails },
  { version: 6, sql: fullRunes },
  { version: 7, sql: timeline },
  { version: 8, sql: research },
  { version: 9, sql: researchStatPerks },
  { version: 10, sql: researchPipeline },
  { version: 11, sql: researchFocus },
  { version: 12, sql: wave1Review },
  { version: 13, sql: stageA },
  { version: 14, sql: stageB },
  { version: 15, sql: researchTimelines },
]
