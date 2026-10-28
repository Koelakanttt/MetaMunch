import type { Migration } from '../migrate'
import init from './0001_init.sql?raw'
import matches from './0003_matches.sql?raw'
import itemAvailability from './0004_item_availability.sql?raw'
import championDetails from './0005_champion_details.sql?raw'
import fullRunes from './0006_full_runes.sql?raw'
import staticData from './0002_static_data.sql?raw'
export const migrations: readonly Migration[] = [
  { version: 1, sql: init },
  { version: 2, sql: staticData },
  { version: 3, sql: matches },
  { version: 4, sql: itemAvailability },
  { version: 5, sql: championDetails },
  { version: 6, sql: fullRunes },
]
