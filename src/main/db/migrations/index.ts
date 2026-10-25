import type { Migration } from '../migrate'
import init from './0001_init.sql?raw'
import matches from './0003_matches.sql?raw'
import staticData from './0002_static_data.sql?raw'
export const migrations: readonly Migration[] = [
  { version: 1, sql: init },
  { version: 2, sql: staticData },
  { version: 3, sql: matches },
]
