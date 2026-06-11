// Friendly messages for common driver/socket error codes (these often arrive as
// an AggregateError with an EMPTY message, so the code is all we have).
const CODE_MESSAGES: Record<string, string> = {
  ECONNREFUSED: 'Connection refused — is PostgreSQL running and reachable at this host/port?',
  ETIMEDOUT: 'Connection timed out — check the host/port and any firewall.',
  ENOTFOUND: 'Host not found — check the hostname.',
  EHOSTUNREACH: 'Host unreachable.',
  ECONNRESET: 'Connection reset by the server.',
  ENETUNREACH: 'Network unreachable.',
  CONNECT_TIMEOUT: 'Connection timed out.',
}

/**
 * Turn any thrown value (PostgresError, AggregateError, socket error, …) into a
 * meaningful single-line string. Never returns "[object Object]" or "".
 */
export function pgErrorMessage(err: unknown): string {
  const e = err as { message?: unknown; code?: unknown; errors?: unknown[] }

  if (typeof e?.message === 'string' && e.message.trim()) return e.message

  // AggregateError (e.g. ECONNREFUSED) — message is empty; dig into inner errors.
  if (Array.isArray(e?.errors)) {
    for (const inner of e.errors) {
      const m = (inner as { message?: unknown })?.message
      if (typeof m === 'string' && m.trim()) return m
      const c = (inner as { code?: unknown })?.code
      if (typeof c === 'string' && CODE_MESSAGES[c]) return CODE_MESSAGES[c]
    }
  }

  if (typeof e?.code === 'string') {
    return CODE_MESSAGES[e.code] ?? `Connection failed (${e.code})`
  }

  const s = String(err)
  return s && s !== '[object Object]' ? s : 'Unknown error'
}
