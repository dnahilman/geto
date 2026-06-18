// The dialect-agnostic database driver contract. One `DbDriver` per provider
// bundles execution, live-catalog introspection, DDL/quoting, safety analysis and
// lifecycle behind a single rich interface — a "narrow waist" the routes program
// against without ever branching on the dialect.
//
// Only PostgreSQL is implemented today (see drivers/postgres/driver.ts). The shape
// is deliberately ready for SQLite/MySQL: `schema` accepts null (engines without a
// schema concept), introspection methods are capability-gated, and capabilities is
// plain serializable data the frontend can read.
//
// NOTE (Phase 1): the shared domain types still physically live in the postgres
// driver dir + db/shared (minimal-churn relocation). When a second dialect lands,
// these move to a neutral db/types.ts.
import type { ProviderId } from '$src/providers'
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
} from '$src/db/drivers/postgres/introspect'
import type { ColumnSpec } from '$src/db/drivers/postgres/dml'
import type {
  RoleInfo,
  RoleInput,
  RoleAttributes,
  Grant,
  ObjectKind,
  PrivilegeChange,
} from '$src/db/drivers/postgres/roles'

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
}
