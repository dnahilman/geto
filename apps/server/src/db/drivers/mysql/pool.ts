import mysql from 'mysql2/promise'
import type { SslMode } from '$src/store/connections'
import type { ConnectionTarget, TestResult } from '$src/db/types'

export type MysqlPool = mysql.Pool

/** Map our ssl mode to mysql2's `ssl` option. */
function sslOption(mode: SslMode): mysql.SslOptions | undefined {
  switch (mode) {
    case 'disable':
      return undefined
    case 'require':
      return { rejectUnauthorized: false }
    case 'verify-ca':
    case 'verify-full':
      return { rejectUnauthorized: true }
    case 'allow':
    case 'prefer':
    default:
      return undefined
  }
}

/** Create a pooled mysql2 client for a connection's options. */
export function makePool(opts: ConnectionTarget, max: number): MysqlPool {
  return mysql.createPool({
    host: opts.host,
    port: opts.port,
    user: opts.username,
    password: opts.password ?? undefined,
    database: opts.database || undefined,
    ssl: sslOption(opts.sslMode),
    connectionLimit: max,
    connectTimeout: 10000,
    waitForConnections: true,
    multipleStatements: true,
    dateStrings: true,
  })
}

/** One-shot connectivity test for a (possibly unsaved) connection. */
export async function testConnection(opts: ConnectionTarget): Promise<TestResult> {
  const pool = makePool(opts, 1)
  const started = Date.now()
  try {
    const [rows] = await pool.query({ sql: 'SELECT VERSION() AS version', rowsAsArray: false })
    const v = (rows as Array<Record<string, unknown>>)?.[0]?.version
    return { version: String(v ?? 'MySQL'), latencyMs: Date.now() - started }
  } catch (err) {
    return { error: (err as Error).message || 'Connection failed' }
  } finally {
    await pool.end().catch(() => {})
  }
}
