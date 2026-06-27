// Map Redis command output / key values into the same {columns, rows} shape the
// SQL result-table renders — so the Redis console + key view reuse the exact same
// result components (Table / JSON view) as Postgres.
import type { ColumnMeta, KeyValue, CommandResult } from '@geto/server'

export interface RedisResult {
  columns: ColumnMeta[]
  rows: unknown[][]
  command: string
  rowCount: number
  error: string | null
}

const col = (name: string): ColumnMeta => ({ name, dataTypeID: 0, typeName: 'text' })

function isPairArray(v: unknown): v is [unknown, unknown][] {
  return Array.isArray(v) && v.every((e) => Array.isArray(e) && e.length === 2)
}

/** A typed Redis key value → precise columns/rows per its type. */
export function keyValueToResult(kv: KeyValue): RedisResult {
  const base = { command: kv.type.toUpperCase(), error: null }
  switch (kv.type) {
    case 'string':
      return { ...base, columns: [col('value')], rows: [[kv.value]], rowCount: 1 }
    case 'list':
    case 'set': {
      const arr = (kv.value as string[]) ?? []
      return { ...base, columns: [col('value')], rows: arr.map((v) => [v]), rowCount: arr.length }
    }
    case 'hash': {
      const pairs = (kv.value as [string, string][]) ?? []
      return {
        ...base,
        columns: [col('field'), col('value')],
        rows: pairs.map(([f, v]) => [f, v]),
        rowCount: pairs.length,
      }
    }
    case 'zset': {
      const pairs = (kv.value as [string, string][]) ?? []
      return {
        ...base,
        columns: [col('member'), col('score')],
        rows: pairs.map(([m, s]) => [m, s]),
        rowCount: pairs.length,
      }
    }
    default:
      return { ...base, columns: [col('value')], rows: [], rowCount: 0 }
  }
}

/** A raw command result → best-effort columns/rows (the redis-cli console). */
export function commandToResult(argv: string[], res: CommandResult): RedisResult {
  const command = (argv[0] ?? '').toUpperCase()
  if (res.error !== undefined) {
    return { columns: [], rows: [], command, rowCount: 0, error: res.error }
  }
  const v = res.result
  if (v === null || v === undefined) {
    return { columns: [col('value')], rows: [], command, rowCount: 0, error: null }
  }
  if (isPairArray(v)) {
    return {
      columns: [col('field'), col('value')],
      rows: v.map(([a, b]) => [a, b]),
      command,
      rowCount: v.length,
      error: null,
    }
  }
  if (Array.isArray(v)) {
    return {
      columns: [col('value')],
      rows: v.map((e) => [e]),
      command,
      rowCount: v.length,
      error: null,
    }
  }
  if (typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>)
    return {
      columns: [col('field'), col('value')],
      rows: entries.map(([f, val]) => [f, val]),
      command,
      rowCount: entries.length,
      error: null,
    }
  }
  return { columns: [col('value')], rows: [[v]], command, rowCount: 1, error: null }
}

/** Split a redis-cli command line into argv, honoring single/double quotes. */
export function tokenize(line: string): string[] {
  const out: string[] = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) out.push(m[1] ?? m[2] ?? m[3] ?? '')
  return out
}
