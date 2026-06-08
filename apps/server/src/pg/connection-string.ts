import type { SslMode } from '../store/connections'

interface Parts {
  host: string
  port: number
  database: string
  username: string
  password?: string | null
  sslMode: SslMode
}

/**
 * Build a `postgresql://` URL. When `password` is provided it is included
 * (URL-encoded); when masked the caller passes `'****'`.
 */
export function buildConnectionString(parts: Parts, password: string | null | undefined): string {
  const user = encodeURIComponent(parts.username)
  const auth = password ? `${user}:${encodeURIComponent(password)}` : user
  const host = parts.host.includes(':') ? `[${parts.host}]` : parts.host // ipv6
  const db = encodeURIComponent(parts.database)
  return `postgresql://${auth}@${host}:${parts.port}/${db}?sslmode=${parts.sslMode}`
}
