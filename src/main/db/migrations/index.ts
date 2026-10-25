import type { Migration } from '../migrate'
import init from './0001_init.sql?raw'
export const migrations: readonly Migration[] = [{ version: 1, sql: init }]
