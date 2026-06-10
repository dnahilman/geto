import { db } from './db'

export interface HistoryEntry {
  id: string
  connectionId: string
  sql: string
  startedAt: string
  durationMs: number | null
  rowCount: number | null
  status: 'ok' | 'error'
  error: string | null
}

interface Row {
  id: string
  connection_id: string
  sql: string
  started_at: string
  duration_ms: number | null
  row_count: number | null
  status: 'ok' | 'error'
  error: string | null
}

function toEntry(r: Row): HistoryEntry {
  return {
    id: r.id,
    connectionId: r.connection_id,
    sql: r.sql,
    startedAt: r.started_at,
    durationMs: r.duration_ms,
    rowCount: r.row_count,
    status: r.status,
    error: r.error,
  }
}

export function recordHistory(e: Omit<HistoryEntry, 'id'>): HistoryEntry {
  const id = crypto.randomUUID()
  db.query(
    `INSERT INTO query_history
       (id, connection_id, sql, started_at, duration_ms, row_count, status, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, e.connectionId, e.sql, e.startedAt, e.durationMs, e.rowCount, e.status, e.error)
  return { id, ...e }
}

export function listHistory(connectionId: string, limit = 100): HistoryEntry[] {
  return (
    db
      .query('SELECT * FROM query_history WHERE connection_id = ? ORDER BY started_at DESC LIMIT ?')
      .all(connectionId, limit) as Row[]
  ).map(toEntry)
}

/** Delete all query history for a connection. Returns the number of rows removed. */
export function clearHistory(connectionId: string): number {
  return db.query('DELETE FROM query_history WHERE connection_id = ?').run(connectionId).changes
}
