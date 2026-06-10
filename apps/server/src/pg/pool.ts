// The connection-construction primitives moved to db/drivers/postgres/pool.ts.
// The per-connection pool *registry* below (getPool/closePool/sweepIdlePools) is
// superseded by db/registry.ts (getDriver) once the routes migrate; it is kept
// here, transitionally, so the still-Sql-based routes keep working meanwhile.
import { getConnectionSecret } from '../store/connections'
import { makeSql, type Sql } from '../db/drivers/postgres/pool'

export { type Sql, type PgOptions, type TestResult, testConnection } from '../db/drivers/postgres/pool'

interface Pooled {
  sql: Sql
  lastUsed: number
}

const pools = new Map<string, Pooled>()
const MAX_IDLE_MS = 5 * 60_000

/** Lazily open (or reuse) a pooled client for a saved connection. */
export function getPool(connectionId: string): Sql {
  const existing = pools.get(connectionId)
  if (existing) {
    existing.lastUsed = Date.now()
    return existing.sql
  }
  const secret = getConnectionSecret(connectionId)
  if (!secret) throw new Error('Connection not found')
  const sql = makeSql(secret, 5)
  pools.set(connectionId, { sql, lastUsed: Date.now() })
  return sql
}

/** Close and drop a pool (call on connection update/delete). */
export async function closePool(connectionId: string): Promise<void> {
  const p = pools.get(connectionId)
  if (!p) return
  pools.delete(connectionId)
  await p.sql.end({ timeout: 5 }).catch(() => {})
}

/** Evict pools idle longer than MAX_IDLE_MS. */
export function sweepIdlePools(): void {
  const now = Date.now()
  for (const [id, p] of pools) {
    if (now - p.lastUsed > MAX_IDLE_MS) {
      pools.delete(id)
      void p.sql.end({ timeout: 5 }).catch(() => {})
    }
  }
}

setInterval(sweepIdlePools, 60_000).unref?.()
