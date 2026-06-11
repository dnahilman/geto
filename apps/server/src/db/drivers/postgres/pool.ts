import postgres from 'postgres'
import type { SslMode } from '$src/store/connections'
import { pgErrorMessage } from '$src/db/shared/error'

export type Sql = postgres.Sql<{}>

export interface PgOptions {
  host: string
  port: number
  database: string
  username: string
  password: string | null
  sslMode: SslMode
  /** When true, the whole pool runs read-only at the PG level (safe mode). */
  readonly?: boolean
}

/** Map our ssl mode to porsager/postgres' `ssl` option. */
function sslOption(mode: SslMode): postgres.Options<{}>['ssl'] {
  switch (mode) {
    case 'disable':
      return false
    case 'require':
      return 'require'
    case 'verify-ca':
      return { rejectUnauthorized: true }
    case 'verify-full':
      return 'verify-full'
    case 'allow':
    case 'prefer':
    default:
      return 'prefer'
  }
}

/** Create a pooled porsager client for a connection's options. */
export function makeSql(opts: PgOptions, max: number): Sql {
  return postgres({
    host: opts.host,
    port: opts.port,
    database: opts.database,
    username: opts.username,
    password: opts.password ?? undefined,
    ssl: sslOption(opts.sslMode),
    max,
    idle_timeout: 30,
    connect_timeout: 10,
    // Safe mode: enforce read-only at the PostgreSQL level for every session in
    // this pool. Any write/DDL then fails with a clear PG error.
    connection: opts.readonly ? { default_transaction_read_only: true } : {},
    onnotice: () => {},
  })
}

export interface TestResult {
  version?: string
  latencyMs?: number
  error?: string
}

/** One-shot connectivity test for a (possibly unsaved) connection. */
export async function testConnection(opts: PgOptions): Promise<TestResult> {
  const sql = makeSql(opts, 1)
  const started = Date.now()
  try {
    const rows = await sql`SELECT version() AS version`
    return { version: rows[0]?.version as string, latencyMs: Date.now() - started }
  } catch (err) {
    return { error: pgErrorMessage(err) }
  } finally {
    await sql.end({ timeout: 5 }).catch(() => {})
  }
}
