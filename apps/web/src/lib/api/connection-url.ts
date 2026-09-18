import type { ConnectionInput, SslMode } from '$lib/api/connections'

const SSL_MODES: SslMode[] = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']

/**
 * Parse a `postgres://…` or `redis(s)://…` connection string into connection
 * fields, inferring the provider from the scheme. Returns null if unrecognizable.
 */
export function parseConnectionUrl(raw: string): Partial<ConnectionInput> | null {
  const s = raw.trim()
  if (!s) return null

  if (s.startsWith('sqlite://') || s.startsWith('sqlite3://') || s.startsWith('sqlite:')) {
    const dbPath = s.replace(/^sqlite3?:(?:\/\/)?/, '')
    return {
      provider: 'sqlite',
      host: '',
      port: 0,
      database: dbPath || ':memory:',
      username: '',
      password: '',
      sslMode: 'disable',
    }
  }

  let u: URL
  try {
    u = new URL(s)
  } catch {
    return null
  }
  const scheme = u.protocol.replace(/:$/, '')
  const host = u.hostname.replace(/^\[|\]$/g, '') // unwrap IPv6 brackets
  const password = u.password ? decodeURIComponent(u.password) : ''

  if (scheme === 'redis' || scheme === 'rediss') {
    return {
      provider: 'redis',
      host: host ? decodeURIComponent(host) : 'localhost',
      port: u.port ? Number(u.port) : 6379,
      database: decodeURIComponent(u.pathname.replace(/^\//, '')) || '0',
      username: u.username ? decodeURIComponent(u.username) : '',
      password,
      sslMode: scheme === 'rediss' ? 'require' : 'disable',
    }
  }

  if (scheme === 'mysql' || scheme === 'mysql2') {
    const sslmode = u.searchParams.get('sslmode') || u.searchParams.get('ssl-mode')
    return {
      provider: 'mysql',
      host: host ? decodeURIComponent(host) : 'localhost',
      port: u.port ? Number(u.port) : 3306,
      database: decodeURIComponent(u.pathname.replace(/^\//, '')) || '',
      username: u.username ? decodeURIComponent(u.username) : 'root',
      password,
      sslMode: (sslmode && SSL_MODES.includes(sslmode as SslMode) ? sslmode : 'prefer') as SslMode,
    }
  }

  if (scheme === 'oracle' || scheme === 'orcl') {
    const sslmode = u.searchParams.get('sslmode') || u.searchParams.get('ssl-mode')
    return {
      provider: 'oracle',
      host: host ? decodeURIComponent(host) : 'localhost',
      port: u.port ? Number(u.port) : 1521,
      database: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'FREEPDB1',
      username: u.username ? decodeURIComponent(u.username) : 'system',
      password,
      sslMode: (sslmode && SSL_MODES.includes(sslmode as SslMode) ? sslmode : 'disable') as SslMode,
    }
  }

  if (scheme !== 'postgres' && scheme !== 'postgresql') return null

  const sslmode = u.searchParams.get('sslmode')
  return {
    provider: 'postgresql',
    host: host ? decodeURIComponent(host) : 'localhost',
    port: u.port ? Number(u.port) : 5432,
    database: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres',
    username: u.username ? decodeURIComponent(u.username) : 'postgres',
    password,
    sslMode: (sslmode && SSL_MODES.includes(sslmode as SslMode) ? sslmode : 'prefer') as SslMode,
  }
}
