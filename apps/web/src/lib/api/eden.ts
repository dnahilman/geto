import { treaty } from '@elysiajs/eden'
import type { App } from '@geto/server'
import { browser } from '$app/environment'

// In the browser the SPA is same-origin with the API (Elysia in prod, Vite proxy
// in dev). During the static build there is no window, so fall back to a constant.
const origin = browser ? window.location.origin : 'http://localhost:7020'

/**
 * Type-safe API client. Calls map to Elysia routes, e.g.
 *   client.api.health.get()  ->  GET /api/health
 * Cookies are sent for the auth session gate.
 */
export const client = treaty<App>(origin, {
  fetch: { credentials: 'include' },
})

/** Extract a clean, human-readable message from an Eden error value. */
export function edenErrorMessage(error: unknown): string {
  // Eden's error class extends Error but sets message = `value + ""`,
  // so for object response bodies message is "[object Object]".
  // Always prefer .value (the parsed response body) when it exists.
  const e = error as { status?: number; value?: unknown; message?: unknown }
  const v = e?.value ?? (error instanceof Error ? null : error)
  if (typeof v === 'string' && v.trim()) return v
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    if (typeof o.error === 'string' && o.error.trim()) return o.error
    if (typeof o.message === 'string' && o.message.trim()) return o.message
    try {
      const j = JSON.stringify(v)
      if (j && j !== '{}') return j
    } catch {
      console.warn('Failed to stringify Eden error value', v)
    }
  }
  // Fallback: use Error.message only when it's a real message (not "[object Object]")
  if (error instanceof Error && error.message && error.message !== '[object Object]')
    return error.message
  return e?.status ? `Request failed (${e.status})` : 'Request failed'
}

/** Unwrap an Eden `{ data, error }` response, throwing a clean Error on failure. */
export async function unwrap<T>(promise: Promise<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await promise
  if (error) throw new Error(edenErrorMessage(error))
  return data as T
}
