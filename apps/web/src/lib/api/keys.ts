import { client, unwrap } from '$lib/api/eden'
import type { ScanResult, KeyValue, CommandResult, KeyEntry } from '@geto/server'

export type { ScanResult, KeyValue, CommandResult, KeyEntry }

const conn = (id: string) => client.api.connections({ id })

export const keysScanKey = (id: string, match: string) => ['keys', id, match] as const

export const scanKeys = (
  id: string,
  opts: { match?: string; cursor?: string; count?: number },
): Promise<ScanResult> =>
  unwrap(
    conn(id).keys.get({
      query: {
        ...(opts.match ? { match: opts.match } : {}),
        ...(opts.cursor ? { cursor: opts.cursor } : {}),
        ...(opts.count ? { count: String(opts.count) } : {}),
      },
    }),
  ) as Promise<ScanResult>

export const keyValueKey = (id: string, key: string) => ['key', id, key] as const

export const getKeyValue = (id: string, key: string): Promise<KeyValue> =>
  unwrap(conn(id).keys.value.get({ query: { key } })) as Promise<KeyValue>

export const deleteKey = (id: string, key: string): Promise<{ deleted: true }> =>
  unwrap(conn(id).keys.delete(undefined, { query: { key } })) as Promise<{ deleted: true }>

export const runCommand = (id: string, argv: string[]): Promise<CommandResult> =>
  unwrap(conn(id).command.post({ argv })) as Promise<CommandResult>
