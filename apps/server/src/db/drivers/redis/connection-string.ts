import type { ConnectionStringParts } from '$src/db/types'

/**
 * Build a `redis://` (or `rediss://` when TLS) URL. When `password` is provided it
 * is included (URL-encoded); when masked the caller passes `'****'`.
 */
export function buildConnectionString(
  parts: ConnectionStringParts,
  password: string | null | undefined,
): string {
  const scheme = parts.sslMode !== 'disable' ? 'rediss' : 'redis'
  const user = parts.username ? encodeURIComponent(parts.username) : ''
  const auth = password ? `${user}:${encodeURIComponent(password)}@` : user ? `${user}@` : ''
  const host = parts.host.includes(':') ? `[${parts.host}]` : parts.host // ipv6
  const db = parts.database || '0'
  return `${scheme}://${auth}${host}:${parts.port}/${db}`
}
