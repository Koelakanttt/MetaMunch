const { DatabaseSync } = require('node:sqlite')
const db = new DatabaseSync(':memory:')
db.exec('CREATE TABLE t (x INTEGER) STRICT; INSERT INTO t VALUES (1)')
const sqlite = db.prepare('SELECT sqlite_version() AS v').get().v
const rows = db.prepare('SELECT count(*) AS c FROM t').get().c
process.stdout.write(JSON.stringify({ electron: process.versions.electron, node: process.versions.node, sqlite, rows }) + '\n')
db.close()
