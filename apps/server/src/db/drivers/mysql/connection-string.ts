import type { ConnectionStringParts } from '$src/db/types'

/**
 * Build a `mysql://` URL. When `password` is provided it is included
 * (URL-encoded); when masked the caller passes `'****'`.
 */
export function buildConnectionString(
  parts: ConnectionStringParts,
  password: string | null | undefined,
): string {
  const user = encodeURIComponent(parts.username)
  const auth = password ? `${user}:${encodeURIComponent(password)}` : user
  const host = parts.host.includes(':') ? `[${parts.host}]` : parts.host // ipv6
  const db = parts.database ? `/${encodeURIComponent(parts.database)}` : ''
  return `mysql://${auth}@${host}:${parts.port}${db}?sslmode=${parts.sslMode}`
}
