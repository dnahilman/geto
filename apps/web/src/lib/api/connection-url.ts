import type { ConnectionInput, SslMode } from '$lib/api/connections'

const SSL_MODES: SslMode[] = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']

/**
 * Parse a `postgres://user:pass@host:port/db?sslmode=…` connection string into
 * connection fields. Returns null if it isn't a recognizable postgres URL.
 */
export function parseConnectionUrl(raw: string): Partial<ConnectionInput> | null {
  const s = raw.trim()
  if (!s) return null
  let u: URL
  try {
    u = new URL(s)
  } catch {
    return null
  }
  const scheme = u.protocol.replace(/:$/, '')
  if (scheme !== 'postgres' && scheme !== 'postgresql') return null

  const sslmode = u.searchParams.get('sslmode')
  const host = u.hostname.replace(/^\[|\]$/g, '') // unwrap IPv6 brackets

  return {
    provider: 'postgresql',
    host: host ? decodeURIComponent(host) : 'localhost',
    port: u.port ? Number(u.port) : 5432,
    database: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres',
    username: u.username ? decodeURIComponent(u.username) : 'postgres',
    password: u.password ? decodeURIComponent(u.password) : '',
    sslMode: (sslmode && SSL_MODES.includes(sslmode as SslMode) ? sslmode : 'prefer') as SslMode,
  }
}
