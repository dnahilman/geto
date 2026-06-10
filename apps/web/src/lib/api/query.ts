import { client, unwrap } from '$lib/api/eden'
import type { QueryResult, HistoryEntry, SafetyReport } from '@geto/server'

export type { QueryResult, HistoryEntry, SafetyReport }

/** Set when a single-table SELECT result is editable (maps to one base table + PK). */
export interface ResultSource {
  schema: string
  table: string
  primaryKey: string[]
  /** Per result-column real base-column name (null for computed/aliased columns). */
  columnNames: (string | null)[]
}
export interface RunResult extends QueryResult {
  requiresConfirmation: false
  durationMs: number
  paginated: boolean
  limit: number
  offset: number
  source: ResultSource | null
}
export type RunResponse = RunResult | { requiresConfirmation: true; report: SafetyReport }

export interface CompletionData {
  tables: { schema: string; name: string; type: 'table' | 'view' | 'matview' }[]
  columns: { schema: string; table: string; name: string; type: string }[]
  functions: {
    schema: string
    name: string
    args: string
    returns: string
    kind: 'function' | 'procedure' | 'aggregate' | 'window'
  }[]
  foreignKeys: {
    schema: string
    table: string
    columns: string[]
    refSchema: string
    refTable: string
    refColumns: string[]
  }[]
}

const conn = (id: string) => client.api.connections({ id })

export const runQuery = (
  id: string,
  sql: string,
  confirmDangerous = false,
  opts: { limit?: number; offset?: number } = {},
): Promise<RunResponse> =>
  unwrap(
    conn(id).query.post({ sql, confirmDangerous, limit: opts.limit, offset: opts.offset }),
  ) as Promise<RunResponse>

export const analyzeQuery = (id: string, sql: string): Promise<SafetyReport> =>
  unwrap(conn(id).query.analyze.post({ sql })) as Promise<SafetyReport>

export const completionKey = (id: string) => ['completion', id] as const
export const getCompletion = (id: string): Promise<CompletionData> =>
  unwrap(conn(id).completion.get()) as Promise<CompletionData>

export const historyKey = (id: string) => ['history', id] as const
export const getHistory = (id: string): Promise<HistoryEntry[]> =>
  unwrap(conn(id).history.get()) as Promise<HistoryEntry[]>

export const clearHistory = (id: string): Promise<{ deleted: number }> =>
  unwrap(conn(id).history.delete()) as Promise<{ deleted: number }>
