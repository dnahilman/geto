import createClient from 'openapi-fetch'
import type { paths } from '$lib/types/api'
import { browser } from '$app/environment'

// In the browser the SPA is same-origin with the API (Rust in prod, Vite proxy in dev)
const baseUrl = browser ? window.location.origin : 'http://localhost:7020'

export const client = createClient<paths>({
  baseUrl,
  credentials: 'include',
})

/** Extract a clean, human-readable message from an API error value. */
export function apiErrorMessage(error: unknown): string {
  if (!error) return 'Request failed'
  if (typeof error === 'string' && error.trim()) return error
  if (typeof error === 'object') {
    const o = error as Record<string, unknown>
    if (typeof o.error === 'string' && o.error.trim()) return o.error
    if (typeof o.message === 'string' && o.message.trim()) return o.message
    try {
      const j = JSON.stringify(error)
      if (j && j !== '{}') return j
    } catch {
      // ignore
    }
  }
  return error instanceof Error ? error.message : 'Request failed'
}

/** Unwrap an openapi-fetch promise `{ data, error }`, throwing clean Error on failure. */
export async function unwrap<T>(promise: Promise<{ data?: T; error?: unknown }>): Promise<T> {
  const { data, error } = await promise
  if (error) {
    throw new Error(apiErrorMessage(error))
  }
  return data as T
}
