// The single, dialect-neutral type surface for the database core. Every domain
// type the routes / driver interface / web client speak in lives here — NOT in a
// specific engine's folder. A new engine (MySQL, SQLite…) implements the driver
// against these types and adds nothing here.
//
// Runtime engine code (drivers/<engine>/*) imports FROM this file; this file
// imports no engine code, so the dependency direction stays one-way.
import type { SslMode } from '$src/store/connections'

// ── Introspection / catalog ──
export interface DatabaseInfo {
  name: string
  owner: string
  size: string
}

export type RelationType = 'table' | 'view' | 'matview'

export interface SchemaTree {
  schema: string
  relations: { name: string; type: RelationType }[]
}

export interface ColumnInfo {
  name: string
  type: string
  notNull: boolean
  default: string | null
  ordinal: number
  isPrimaryKey: boolean
  /** Allowed labels when the column is an enum type, else null. */
  enumValues: string[] | null
}

export interface IndexInfo {
  name: string
  definition: string
  isUnique: boolean
  isPrimary: boolean
}

export interface ConstraintInfo {
  name: string
  type: string
  definition: string
}

export interface CompletionColumn {
  schema: string
  table: string
  name: string
  type: string
}

export interface CompletionFunction {
  schema: string
  name: string
  args: string
  returns: string
  kind: 'function' | 'procedure' | 'aggregate' | 'window'
}

export interface CompletionForeignKey {
  schema: string
  table: string
  columns: string[]
  refSchema: string
  refTable: string
  refColumns: string[]
}

export interface TableDataOptions {
  limit: number
  offset: number
  orderBy?: string
  orderDir?: 'ASC' | 'DESC'
  /** Optional single-column equality filter; the value is bound as a parameter
   *  and matched against the column's type by the engine (e.g. text '5' = int 5). */
  filterColumn?: string
  filterValue?: string
}

// ── DDL / DML building ──
export interface ColumnSpec {
  name: string
  type: string
  notNull?: boolean
  default?: string | null
  primaryKey?: boolean
}

/** A parameterized statement: SQL text with `$N` placeholders + ordered params. */
export interface BuiltStatement {
  text: string
  params: unknown[]
}

// ── Role & privilege administration ──
export interface RoleInfo {
  name: string
  isSuperuser: boolean
  canLogin: boolean
  canCreateDb: boolean
  canCreateRole: boolean
  isReplication: boolean
  bypassRls: boolean
  connectionLimit: number
  validUntil: string | null
  memberOf: string[]
}

/** Boolean attributes (undefined = leave unchanged on ALTER). */
export interface RoleAttributes {
  canLogin?: boolean
  isSuperuser?: boolean
  canCreateDb?: boolean
  canCreateRole?: boolean
  isReplication?: boolean
  bypassRls?: boolean
  connectionLimit?: number | null
  validUntil?: string | null
  /** undefined = keep; null = remove password; string = set password. */
  password?: string | null
}

export interface RoleInput extends RoleAttributes {
  name: string
}

export type ObjectKind = 'table' | 'schema'

export interface Grant {
  grantee: string
  privilege: string
  grantable: boolean
}

export interface PrivilegeChange {
  kind: ObjectKind
  schema: string
  /** Table name for kind='table'; ignored for kind='schema' (uses `schema`). */
  name: string
  role: string
  privileges: string[]
  /** true = GRANT, false = REVOKE. */
  grant: boolean
  withGrantOption?: boolean
}

// ── Connection-level (provider adapter) ──
/** A concrete endpoint to connect to. The engine-neutral shape the adapter's
 *  createDriver / testConnection consume (postgres' PgOptions is an alias). */
export interface ConnectionTarget {
  host: string
  port: number
  database: string
  username: string
  password: string | null
  sslMode: SslMode
  /** When true, the whole pool runs read-only (safe mode). */
  readonly?: boolean
}

export interface ConnectionStringParts {
  host: string
  port: number
  database: string
  username: string
  password?: string | null
  sslMode: SslMode
}

export interface TestResult {
  version?: string
  latencyMs?: number
  error?: string
}

// ── Key-value (Redis-style) ──
/** One key surfaced by a SCAN: its name, value type, and TTL in seconds (-1 = none). */
export interface KeyEntry {
  key: string
  type: string
  ttl: number
}

/** A fetched key's value. `value` shape depends on `type`:
 *  string→string, list/set→string[], hash→[field,value][], zset→[member,score][]. */
export interface KeyValue {
  key: string
  type: string
  ttl: number
  value: unknown
}

export interface ScanOptions {
  match?: string
  cursor?: string
  count?: number
}

export interface ScanResult {
  /** Opaque cursor to pass back for the next page; '0' means iteration complete. */
  cursor: string
  keys: KeyEntry[]
}

/** Result of a raw key-value command. Exactly one of result/error is meaningful. */
export interface CommandResult {
  result?: unknown
  error?: string
}
