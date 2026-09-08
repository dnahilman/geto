import { client, unwrap } from '$lib/api/client'
import type { ScanResult, KeyValue, CommandResult, KeyEntry } from '$lib/types/server'

export type { ScanResult, KeyValue, CommandResult, KeyEntry }

export const keysScanKey = (id: string, match: string) => ['keys', id, match] as const

export const scanKeys = (
  id: string,
  opts: { match?: string; cursor?: string; count?: number },
): Promise<ScanResult> =>
  unwrap(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).GET(`/api/connections/${id}/keys`, {
      params: {
        query: {
          ...(opts.match ? { match: opts.match } : {}),
          ...(opts.cursor ? { cursor: opts.cursor } : {}),
          ...(opts.count ? { count: String(opts.count) } : {}),
        },
      },
    }),
  ) as Promise<ScanResult>

export const keyValueKey = (id: string, key: string) => ['key', id, key] as const

export const getKeyValue = (id: string, key: string): Promise<KeyValue> =>
  unwrap(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).GET(`/api/connections/${id}/keys/value`, {
      params: { query: { key } },
    }),
  ) as Promise<KeyValue>

export const deleteKey = (id: string, key: string): Promise<{ deleted: true }> =>
  unwrap(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).DELETE(`/api/connections/${id}/keys`, {
      params: { query: { key } },
    }),
  ) as Promise<{ deleted: true }>

export const runCommand = (id: string, argv: string[]): Promise<CommandResult> =>
  unwrap(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).POST(`/api/connections/${id}/command`, { body: { argv } }),
  ) as Promise<CommandResult>
