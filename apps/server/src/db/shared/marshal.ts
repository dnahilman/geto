/** Common PostgreSQL type OIDs → readable names (covers the vast majority).
 *  OIDs are PG-specific; kept here while PostgreSQL is the only dialect. A future
 *  dialect maps its own native types onto the same neutral `typeName` string. */
const TYPE_NAMES: Record<number, string> = {
  16: 'bool',
  17: 'bytea',
  18: 'char',
  20: 'int8',
  21: 'int2',
  23: 'int4',
  25: 'text',
  26: 'oid',
  114: 'json',
  700: 'float4',
  701: 'float8',
  1042: 'bpchar',
  1043: 'varchar',
  1082: 'date',
  1083: 'time',
  1114: 'timestamp',
  1184: 'timestamptz',
  1186: 'interval',
  1700: 'numeric',
  2950: 'uuid',
  3802: 'jsonb',
  1000: 'bool[]',
  1005: 'int2[]',
  1007: 'int4[]',
  1016: 'int8[]',
  1009: 'text[]',
  1015: 'varchar[]',
  3807: 'jsonb[]',
}

export function typeName(oid: number): string {
  return TYPE_NAMES[oid] ?? `oid:${oid}`
}

/**
 * Convert a value from porsager into a JSON-safe form for the wire.
 * porsager already returns int8/numeric/uuid as strings and json/jsonb as
 * objects; only Date and bytea (Buffer/Uint8Array) need conversion. Arrays are
 * walked recursively (e.g. timestamptz[]).
 */
export function marshalValue(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (typeof v === 'bigint') return v.toString()
  if (v instanceof Date) return v.toISOString()
  if (v instanceof Uint8Array) return '\\x' + Buffer.from(v).toString('hex')
  if (Array.isArray(v)) return v.map(marshalValue)
  return v
}

export interface ColumnMeta {
  name: string
  dataTypeID: number
  typeName: string
  /** OID of the base table this column came from (0/undefined for computed columns). */
  sourceTable?: number
  /** attnum of the source column within its base table. */
  sourceColumn?: number
}

export interface QueryResult {
  columns: ColumnMeta[]
  rows: unknown[][]
  rowCount: number
  command: string | null
}
