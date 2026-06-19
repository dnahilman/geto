// The dialect-agnostic database driver contract. One `DbDriver` per provider
// bundles execution, live-catalog introspection, DDL/DML building, safety analysis
// and lifecycle behind a single rich interface — a "narrow waist" the routes
// program against without ever branching on the dialect. `ProviderAdapter` is the
// connection-level sibling (create/test/connection-string), used before a driver
// instance exists (e.g. testing an unsaved connection).
//
// Only PostgreSQL is implemented today (see drivers/postgres/). The shape is
// deliberately ready for SQLite/MySQL: `schema` accepts null (engines without a
// schema concept), introspection methods are capability-gated, and capabilities is
// plain serializable data the frontend can read. All domain types live in the
// neutral $src/db/types — this file imports no engine code.
import type { ProviderId, ProviderKind } from '$src/providers'
import type { ColumnMeta, QueryResult } from '$src/db/shared/marshal'
import type { SafetyReport } from '$src/db/shared/safety'
import type {
  DatabaseInfo,
  SchemaTree,
  ColumnInfo,
  IndexInfo,
  ConstraintInfo,
  CompletionColumn,
  CompletionFunction,
  CompletionForeignKey,
  TableDataOptions,
  ColumnSpec,
  BuiltStatement,
  RoleInfo,
  RoleInput,
  RoleAttributes,
  Grant,
  ObjectKind,
  PrivilegeChange,
  ConnectionTarget,
  ConnectionStringParts,
  TestResult,
  ScanOptions,
  ScanResult,
  KeyValue,
  CommandResult,
} from '$src/db/types'

/** The verdict on whether a query result maps to one editable base table. */
export interface EditableSource {
  schema: string
  table: string
  primaryKey: string[]
  /** Result-column index → base column name (null for computed columns). */
  columnNames: (string | null)[]
}

/** Static, serializable description of what a dialect supports. Drives both the
 *  route layer (skip unsupported endpoints) and the frontend (form + tree gating). */
export interface Capabilities {
  /** Data model — relational (SQL) vs key-value. Drives which workspace renders. */
  kind: ProviderKind
  hasDatabases: boolean
  hasSchemas: boolean
  hasFunctions: boolean
  supportsDatabaseSwitch: boolean
  supportsReturning: boolean
  /** Whether a connection is described by host/port/user/pass/ssl or a file path. */
  connectionShape: 'network' | 'file'
}

/** A dedicated connection borrowed from the pool for sequential batch execution.
 *  Preserves session state (SET, temp tables, transactions) across statements.
 *  Always call `release()` in a finally block. */
export interface ScriptRunner {
  query(text: string, params?: unknown[]): Promise<QueryResult>
  release(): void
}

export interface DbDriver {
  readonly id: ProviderId
  readonly capabilities: Capabilities

  readonly exec: {
    /** Run already-built SQL text + positional params, return marshalled rows. */
    query(text: string, params?: unknown[]): Promise<QueryResult>
    /** Borrow a dedicated connection for sequential multi-statement execution. */
    reserve(): Promise<ScriptRunner>
  }

  readonly introspect: {
    listDatabases(): Promise<DatabaseInfo[]> // gated by capabilities.hasDatabases
    listSchemas(): Promise<string[]> // gated by capabilities.hasSchemas
    getTree(search?: string): Promise<SchemaTree[]>
    getColumns(schema: string | null, table: string): Promise<ColumnInfo[]>
    getIndexes(schema: string | null, table: string): Promise<IndexInfo[]>
    getConstraints(schema: string | null, table: string): Promise<ConstraintInfo[]>
    getPrimaryKey(schema: string | null, table: string): Promise<string[]>
    getAllColumns(): Promise<CompletionColumn[]>
    getFunctions(): Promise<CompletionFunction[]> // gated by capabilities.hasFunctions
    getForeignKeys(): Promise<CompletionForeignKey[]>
    getTableData(
      schema: string | null,
      table: string,
      opts: TableDataOptions,
    ): Promise<{ result: QueryResult; estimatedRows: number }>
    /** Decide whether a result maps to one editable base table (hides OIDs etc.). */
    resolveEditableSource(columns: ColumnMeta[]): Promise<EditableSource | null>
  }

  readonly ddl: {
    /** Run a DDL statement with no result rows (simple protocol — no txn wrap). */
    exec(ddl: string): Promise<void>
    quoteIdent(name: string): string
    buildCreateTable(schema: string | null, table: string, columns: ColumnSpec[]): string
  }

  readonly dml: {
    /** Build a parameterized row write. The route logs + runs it via `exec`. */
    buildInsert(
      schema: string | null,
      table: string,
      values: Record<string, unknown>,
    ): BuiltStatement
    buildUpdate(
      schema: string | null,
      table: string,
      pk: Record<string, unknown>,
      values: Record<string, unknown>,
    ): BuiltStatement
    buildDelete(schema: string | null, table: string, pk: Record<string, unknown>): BuiltStatement
    /** Inline `$N` params into SQL text for human-readable history display only. */
    inlineParams(text: string, params: unknown[]): string
  }

  readonly safety: {
    analyze(sql: string): Promise<SafetyReport>
    inspectSelect(sql: string): Promise<{ singleSelect: boolean; hasLimit: boolean }>
  }

  readonly lifecycle: {
    /** Close the underlying pool/handle. */
    close(): Promise<void>
  }

  /** Cluster role administration + object privileges. Optional: a dialect without
   *  this concept omits it, and routes return 501. Independent role vs privilege
   *  operations so either can be used alone. */
  readonly admin?: {
    listRoles(): Promise<RoleInfo[]>
    createRole(input: RoleInput): Promise<void>
    alterRole(name: string, changes: RoleAttributes): Promise<void>
    dropRole(name: string): Promise<void>
    setMembership(parentRole: string, member: string, grant: boolean): Promise<void>
    getObjectGrants(schema: string, name: string, kind: ObjectKind): Promise<Grant[]>
    setObjectPrivilege(change: PrivilegeChange): Promise<void>
  }

  /** Key-value browsing (Redis-style). Present only when capabilities.kind is
   *  'keyvalue'; relational drivers omit it (and key-value drivers omit the SQL
   *  namespaces). The keys route 501s when this is absent. */
  readonly keyv?: {
    scan(opts: ScanOptions): Promise<ScanResult>
    get(key: string): Promise<KeyValue>
    delete(key: string): Promise<void>
    command(argv: string[]): Promise<CommandResult>
  }
}

/**
 * Connection-level provider operations that exist *before* a driver instance —
 * opening one, testing an unsaved connection, and rendering its connection string.
 * One `ProviderAdapter` per engine; the registry maps `ProviderId → adapter`, so
 * adding an engine = implement this + a `DbDriver` and register it, nothing else.
 * Takes the neutral `ConnectionTarget` (a saved connection's secret satisfies it),
 * so this contract names no store/engine specifics.
 */
export interface ProviderAdapter {
  createDriver(target: ConnectionTarget): DbDriver
  testConnection(target: ConnectionTarget): Promise<TestResult>
  buildConnectionString(parts: ConnectionStringParts, password: string | null): string
}
