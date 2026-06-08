import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { env } from '../env'

const dir = resolve(env.GETO_DATA_DIR)
mkdirSync(dir, { recursive: true })

/** geto's own metadata store — NOT a user's Postgres data. */
export const db = new Database(join(dir, 'geto.sqlite'), { create: true })

db.exec('PRAGMA journal_mode = WAL;')
db.exec('PRAGMA foreign_keys = ON;')

db.exec(`
  CREATE TABLE IF NOT EXISTS connections (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    provider     TEXT NOT NULL DEFAULT 'postgresql',
    host         TEXT NOT NULL,
    port         INTEGER NOT NULL DEFAULT 5432,
    database     TEXT NOT NULL,
    username     TEXT NOT NULL,
    password_enc TEXT,
    ssl_mode     TEXT NOT NULL DEFAULT 'prefer',
    color        TEXT,
    readonly     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS query_history (
    id            TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL,
    sql           TEXT NOT NULL,
    started_at    TEXT NOT NULL,
    duration_ms   INTEGER,
    row_count     INTEGER,
    status        TEXT NOT NULL,
    error         TEXT,
    FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_history_conn
    ON query_history(connection_id, started_at DESC);

  CREATE TABLE IF NOT EXISTS saved_queries (
    id            TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL,
    name          TEXT NOT NULL,
    sql           TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL,
    FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
  );
`)

// Migration: add `provider` to pre-existing connections tables. Ignored if the
// column already exists.
try {
  db.exec("ALTER TABLE connections ADD COLUMN provider TEXT NOT NULL DEFAULT 'postgresql'")
} catch {
  /* column already present */
}
