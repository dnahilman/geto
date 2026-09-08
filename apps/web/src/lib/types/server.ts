// Re-exports domain types generated from the Rust backend OpenAPI schema.
// Single source of truth: apps/server -> openapi.json -> api.d.ts

import type { components } from './api'

export type Schemas = components['schemas']

export type ColumnInfo = Schemas['ColumnInfo']
export type ColumnMeta = Schemas['ColumnMeta']
export type ColumnSpec = Schemas['ColumnSpec']
export type CompletionColumn = Schemas['CompletionColumn']
export type CompletionForeignKey = Schemas['CompletionForeignKey']
export type CompletionFunction = Schemas['CompletionFunction']
export type CompletionResponse = Schemas['CompletionResponse']
export type CompletionTable = Schemas['CompletionTable']
export type Connection = Schemas['Connection']
export type ConnectionInput = Schemas['ConnectionInput']
export type ConstraintInfo = Schemas['ConstraintInfo']
export type DatabaseInfo = Schemas['DatabaseInfo']
export type HistoryEntry = Schemas['HistoryEntry']
export type IndexInfo = Schemas['IndexInfo']
export type ProviderMeta = Schemas['ProviderMeta']
export type QueryResult = Omit<Schemas['QueryResult'], 'rows'> & { rows: unknown[][] }
export type RelationEntry = Schemas['RelationEntry']
export type RelationType = Schemas['RelationType']
export type SafetyReport = Schemas['SafetyReport']
export type SchemaTree = Schemas['SchemaTree']
export type SshAuthMethod = Schemas['SshAuthMethod']
export type SshConfig = Schemas['SshConfig']
export type SshInput = Schemas['SshInput']
export type SslMode = Schemas['SslMode']
export type StatementRisk = Schemas['StatementRisk']
export type TableDataOptions = Schemas['TableDataOptions']
export type TableDetailResponse = Schemas['TableDetailResponse']
export type TestResult = Schemas['TestResult']

export type ProviderId = 'postgresql' | 'mysql' | 'redis'
export type ProviderKind = 'relational' | 'keyvalue'

// Key-value & role administration interfaces (client-side)
export interface KeyEntry {
  key: string
  type: string
  ttl: number
}

export interface KeyValue {
  key: string
  type: string
  ttl: number
  value: unknown
}

export interface ScanResult {
  cursor: string
  keys: KeyEntry[]
}

export interface CommandResult {
  result?: unknown
  error?: string
}

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

export interface RoleAttributes {
  canLogin?: boolean
  isSuperuser?: boolean
  canCreateDb?: boolean
  canCreateRole?: boolean
  isReplication?: boolean
  bypassRls?: boolean
  connectionLimit?: number | null
  validUntil?: string | null
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
  name: string
  role: string
  privileges: string[]
  grant: boolean
  withGrantOption?: boolean
}

