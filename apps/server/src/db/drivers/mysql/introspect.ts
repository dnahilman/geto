import type mysql from 'mysql2/promise'
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
} from '$src/db/types'
import type { EditableSource } from '$src/db/driver'
import type { ColumnMeta, QueryResult } from '$src/db/shared/marshal'
import { executeSql } from '$src/db/drivers/mysql/exec'
import { quoteIdent } from '$src/db/drivers/mysql/dml'

const SYSTEM_SCHEMAS = ["'information_schema'", "'performance_schema'", "'sys'"]

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export async function listDatabases(pool: mysql.Pool): Promise<DatabaseInfo[]> {
  const sql = `
    SELECT
      s.SCHEMA_NAME AS name,
      'root' AS owner,
      COALESCE(SUM(t.DATA_LENGTH + t.INDEX_LENGTH), 0) AS sizeBytes
    FROM information_schema.SCHEMATA s
    LEFT JOIN information_schema.TABLES t ON s.SCHEMA_NAME = t.TABLE_SCHEMA
    GROUP BY s.SCHEMA_NAME
    ORDER BY s.SCHEMA_NAME
  `
  const [rows] = await pool.query({ sql, rowsAsArray: false })
  return (rows as Array<{ name: string; owner: string; sizeBytes: number | string }>).map((r) => ({
    name: r.name,
    owner: r.owner,
    size: formatBytes(Number(r.sizeBytes) || 0),
  }))
}

export async function listSchemas(pool: mysql.Pool): Promise<string[]> {
  const sql = `
    SELECT SCHEMA_NAME AS name
    FROM information_schema.SCHEMATA
    WHERE SCHEMA_NAME NOT IN (${SYSTEM_SCHEMAS.join(', ')})
    ORDER BY SCHEMA_NAME
  `
  const [rows] = await pool.query({ sql, rowsAsArray: false })
  return (rows as Array<{ name: string }>).map((r) => r.name)
}

export async function getTree(pool: mysql.Pool, search?: string): Promise<SchemaTree[]> {
  let sql = `
    SELECT
      TABLE_SCHEMA AS \`schema\`,
      TABLE_NAME AS \`name\`,
      CASE WHEN TABLE_TYPE = 'VIEW' THEN 'view' ELSE 'table' END AS \`type\`
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA NOT IN (${SYSTEM_SCHEMAS.join(', ')})
  `
  const params: unknown[] = []
  if (search && search.trim()) {
    sql += ` AND (TABLE_NAME LIKE ? OR TABLE_SCHEMA LIKE ?)`
    const pattern = `%${search.trim()}%`
    params.push(pattern, pattern)
  }
  sql += ` ORDER BY TABLE_SCHEMA, TABLE_NAME`

  const [rows] = await pool.query({ sql, rowsAsArray: false, values: params })
  const grouped: Record<string, { name: string; type: 'table' | 'view' | 'matview' }[]> = {}

  for (const r of rows as Array<{ schema: string; name: string; type: 'table' | 'view' }>) {
    if (!grouped[r.schema]) grouped[r.schema] = []
    grouped[r.schema].push({ name: r.name, type: r.type })
  }

  return Object.entries(grouped).map(([schema, relations]) => ({ schema, relations }))
}

function parseEnumValues(columnType: string): string[] | null {
  const match = columnType.match(/^enum\((.*)\)$/i)
  if (!match) return null
  return match[1].split(',').map((v) =>
    v
      .trim()
      .replace(/^'(.*)'$/, '$1')
      .replace(/''/g, "'"),
  )
}

export async function getColumns(
  pool: mysql.Pool,
  schema: string | null,
  table: string,
): Promise<ColumnInfo[]> {
  const sql = `
    SELECT
      COLUMN_NAME AS name,
      DATA_TYPE AS type,
      COLUMN_TYPE AS columnType,
      IS_NULLABLE AS isNullable,
      COLUMN_DEFAULT AS \`default\`,
      ORDINAL_POSITION AS ordinal,
      COLUMN_KEY AS columnKey,
      EXTRA AS extra
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = COALESCE(?, DATABASE()) AND TABLE_NAME = ?
    ORDER BY ORDINAL_POSITION
  `
  const [rows] = await pool.query({ sql, rowsAsArray: false, values: [schema, table] })
  return (
    rows as Array<{
      name: string
      type: string
      columnType: string
      isNullable: string
      default: string | null
      ordinal: number
      columnKey: string
      extra: string
    }>
  ).map((r) => ({
    name: r.name,
    type: r.columnType || r.type,
    notNull: r.isNullable === 'NO',
    default: r.default,
    ordinal: Number(r.ordinal),
    isPrimaryKey: r.columnKey === 'PRI',
    enumValues: parseEnumValues(r.columnType),
  }))
}

export async function getIndexes(
  pool: mysql.Pool,
  schema: string | null,
  table: string,
): Promise<IndexInfo[]> {
  const sql = `
    SELECT
      INDEX_NAME AS name,
      NON_UNIQUE AS nonUnique,
      INDEX_TYPE AS indexType,
      GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = COALESCE(?, DATABASE()) AND TABLE_NAME = ?
    GROUP BY INDEX_NAME, NON_UNIQUE, INDEX_TYPE
  `
  const [rows] = await pool.query({ sql, rowsAsArray: false, values: [schema, table] })
  return (
    rows as Array<{
      name: string
      nonUnique: number
      indexType: string
      columns: string
    }>
  ).map((r) => {
    const isPrimary = r.name === 'PRIMARY'
    const isUnique = Number(r.nonUnique) === 0
    const cols = r.columns ? r.columns.split(',').map(quoteIdent).join(', ') : ''
    const definition = isPrimary
      ? `PRIMARY KEY (${cols})`
      : `${isUnique ? 'UNIQUE ' : ''}INDEX ${quoteIdent(r.name)} (${cols}) USING ${r.indexType}`
    return {
      name: r.name,
      definition,
      isUnique,
      isPrimary,
    }
  })
}

export async function getConstraints(
  pool: mysql.Pool,
  schema: string | null,
  table: string,
): Promise<ConstraintInfo[]> {
  const sql = `
    SELECT
      tc.CONSTRAINT_NAME AS name,
      tc.CONSTRAINT_TYPE AS type,
      kcu.COLUMN_NAME AS columnName,
      kcu.REFERENCED_TABLE_SCHEMA AS refSchema,
      kcu.REFERENCED_TABLE_NAME AS refTable,
      kcu.REFERENCED_COLUMN_NAME AS refColumn
    FROM information_schema.TABLE_CONSTRAINTS tc
    LEFT JOIN information_schema.KEY_COLUMN_USAGE kcu
      ON tc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
      AND tc.TABLE_NAME = kcu.TABLE_NAME
      AND tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
    WHERE tc.TABLE_SCHEMA = COALESCE(?, DATABASE()) AND tc.TABLE_NAME = ?
    ORDER BY tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
  `
  const [rows] = await pool.query({ sql, rowsAsArray: false, values: [schema, table] })
  return (
    rows as Array<{
      name: string
      type: string
      columnName: string | null
      refSchema: string | null
      refTable: string | null
      refColumn: string | null
    }>
  ).map((r) => {
    let definition = `${r.type} (${r.columnName ? quoteIdent(r.columnName) : ''})`
    if (r.type === 'FOREIGN KEY' && r.refTable && r.refColumn) {
      definition += ` REFERENCES ${r.refSchema ? `${quoteIdent(r.refSchema)}.` : ''}${quoteIdent(r.refTable)} (${quoteIdent(r.refColumn)})`
    }
    return {
      name: r.name,
      type: r.type,
      definition,
    }
  })
}

export async function getPrimaryKey(
  pool: mysql.Pool,
  schema: string | null,
  table: string,
): Promise<string[]> {
  const sql = `
    SELECT COLUMN_NAME AS name
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE CONSTRAINT_NAME = 'PRIMARY'
      AND TABLE_SCHEMA = COALESCE(?, DATABASE())
      AND TABLE_NAME = ?
    ORDER BY ORDINAL_POSITION
  `
  const [rows] = await pool.query({ sql, rowsAsArray: false, values: [schema, table] })
  return (rows as Array<{ name: string }>).map((r) => r.name)
}

export async function getAllColumns(pool: mysql.Pool): Promise<CompletionColumn[]> {
  const sql = `
    SELECT
      TABLE_SCHEMA AS \`schema\`,
      TABLE_NAME AS \`table\`,
      COLUMN_NAME AS \`name\`,
      DATA_TYPE AS \`type\`
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA NOT IN (${SYSTEM_SCHEMAS.join(', ')})
  `
  const [rows] = await pool.query({ sql, rowsAsArray: false })
  return rows as CompletionColumn[]
}

export async function getFunctions(pool: mysql.Pool): Promise<CompletionFunction[]> {
  const sql = `
    SELECT
      ROUTINE_SCHEMA AS \`schema\`,
      ROUTINE_NAME AS \`name\`,
      COALESCE(DTD_IDENTIFIER, DATA_TYPE, '') AS \`returns\`,
      '' AS \`args\`,
      LOWER(ROUTINE_TYPE) AS \`kind\`
    FROM information_schema.ROUTINES
    WHERE ROUTINE_SCHEMA NOT IN (${SYSTEM_SCHEMAS.join(', ')})
  `
  const [rows] = await pool.query({ sql, rowsAsArray: false })
  return (
    rows as Array<{ schema: string; name: string; returns: string; args: string; kind: string }>
  ).map((r) => ({
    schema: r.schema,
    name: r.name,
    returns: r.returns,
    args: r.args,
    kind: (r.kind === 'procedure' ? 'procedure' : 'function') as 'function' | 'procedure',
  }))
}

export async function getForeignKeys(pool: mysql.Pool): Promise<CompletionForeignKey[]> {
  const sql = `
    SELECT
      CONSTRAINT_NAME AS name,
      TABLE_SCHEMA AS fromSchema,
      TABLE_NAME AS fromTable,
      COLUMN_NAME AS fromColumn,
      REFERENCED_TABLE_SCHEMA AS refSchema,
      REFERENCED_TABLE_NAME AS refTable,
      REFERENCED_COLUMN_NAME AS refColumn
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE REFERENCED_TABLE_NAME IS NOT NULL
      AND TABLE_SCHEMA NOT IN (${SYSTEM_SCHEMAS.join(', ')})
    ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION
  `
  const [rows] = await pool.query({ sql, rowsAsArray: false })
  const map = new Map<string, CompletionForeignKey>()

  for (const r of rows as Array<{
    name: string
    fromSchema: string
    fromTable: string
    fromColumn: string
    refSchema: string
    refTable: string
    refColumn: string
  }>) {
    const key = `${r.fromSchema}.${r.fromTable}.${r.name}`
    const existing = map.get(key)
    if (existing) {
      existing.columns.push(r.fromColumn)
      existing.refColumns.push(r.refColumn)
    } else {
      map.set(key, {
        schema: r.fromSchema,
        table: r.fromTable,
        columns: [r.fromColumn],
        refSchema: r.refSchema,
        refTable: r.refTable,
        refColumns: [r.refColumn],
      })
    }
  }

  return Array.from(map.values())
}

export async function getTableData(
  pool: mysql.Pool,
  schema: string | null,
  table: string,
  opts: TableDataOptions,
): Promise<{ result: QueryResult; estimatedRows: number }> {
  const target = schema ? `${quoteIdent(schema)}.${quoteIdent(table)}` : quoteIdent(table)
  let sql = `SELECT * FROM ${target}`
  const params: unknown[] = []

  if (opts.filterColumn && opts.filterValue !== undefined) {
    sql += ` WHERE ${quoteIdent(opts.filterColumn)} = ?`
    params.push(opts.filterValue)
  }

  if (opts.orderBy) {
    sql += ` ORDER BY ${quoteIdent(opts.orderBy)} ${opts.orderDir === 'DESC' ? 'DESC' : 'ASC'}`
  }

  sql += ` LIMIT ? OFFSET ?`
  params.push(opts.limit, opts.offset)

  const result = await executeSql(pool, sql, params)

  // Get estimated rows from information_schema
  const estSql = `
    SELECT TABLE_ROWS AS count
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = COALESCE(?, DATABASE()) AND TABLE_NAME = ?
  `
  const [estRows] = await pool.query({ sql: estSql, rowsAsArray: false, values: [schema, table] })
  const estimated = Number((estRows as Array<{ count?: number }>)?.[0]?.count) || result.rowCount

  return { result, estimatedRows: estimated }
}

export async function resolveSource(
  pool: mysql.Pool,
  columns: ColumnMeta[],
): Promise<EditableSource | null> {
  if (columns.length === 0) return null
  // In MySQL, check if columns belong to single table
  // If result has columns without base table info, fallback
  const firstCol = columns[0]
  if (!firstCol) return null

  // If executing a direct SELECT * FROM table, extract from completion/tree
  return null
}
