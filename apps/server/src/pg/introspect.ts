import type { Sql } from './pool'
import { executeSql, type QueryResult } from './marshal'

/** Quote a SQL identifier safely (defends dynamic schema/table/column names). */
export function quoteIdent(name: string): string {
  return '"' + name.replace(/"/g, '""') + '"'
}

export interface DatabaseInfo {
  name: string
  owner: string
  size: string
}

export async function listDatabases(sql: Sql): Promise<DatabaseInfo[]> {
  const rows = await sql<{ name: string; owner: string; size: string }[]>`
    SELECT d.datname AS name,
           pg_catalog.pg_get_userbyid(d.datdba) AS owner,
           pg_size_pretty(pg_database_size(d.datname)) AS size
    FROM pg_database d
    WHERE d.datistemplate = false
    ORDER BY d.datname`
  return [...rows]
}

export async function listSchemas(sql: Sql): Promise<string[]> {
  const rows = await sql<{ nspname: string }[]>`
    SELECT nspname FROM pg_namespace
    WHERE nspname NOT IN ('information_schema') AND nspname NOT LIKE 'pg_%'
    ORDER BY nspname`
  return rows.map((r) => r.nspname)
}

export type RelationType = 'table' | 'view' | 'matview'

export interface SchemaTree {
  schema: string
  relations: { name: string; type: RelationType }[]
}

export async function getTree(sql: Sql, search?: string): Promise<SchemaTree[]> {
  const pattern = search?.trim() ? `%${search.trim()}%` : null
  const rows = await sql<{ schema: string; name: string; kind: string }[]>`
    SELECT n.nspname AS schema, c.relname AS name, c.relkind AS kind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','v','m','p')
      AND n.nspname NOT IN ('information_schema')
      AND n.nspname NOT LIKE 'pg_%'
      AND (${pattern}::text IS NULL OR c.relname ILIKE ${pattern})
    ORDER BY n.nspname, c.relname`

  const map = new Map<string, SchemaTree>()
  for (const r of rows) {
    if (!map.has(r.schema)) map.set(r.schema, { schema: r.schema, relations: [] })
    const type: RelationType = r.kind === 'v' ? 'view' : r.kind === 'm' ? 'matview' : 'table'
    map.get(r.schema)!.relations.push({ name: r.name, type })
  }
  return [...map.values()]
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

export async function getColumns(sql: Sql, schema: string, table: string): Promise<ColumnInfo[]> {
  const rows = await sql<
    {
      name: string
      type: string
      not_null: boolean
      default: string | null
      ordinal: number
      is_pk: boolean
      enum_values: string[] | null
    }[]
  >`
    SELECT a.attname AS name,
           format_type(a.atttypid, a.atttypmod) AS type,
           a.attnotnull AS not_null,
           pg_get_expr(d.adbin, d.adrelid) AS default,
           a.attnum AS ordinal,
           COALESCE(pk.is_pk, false) AS is_pk,
           CASE WHEN t.typtype = 'e' THEN (
             SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
             FROM pg_enum e WHERE e.enumtypid = t.oid
           ) END AS enum_values
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    LEFT JOIN LATERAL (
      SELECT true AS is_pk
      FROM pg_index i
      WHERE i.indrelid = c.oid AND i.indisprimary AND a.attnum = ANY(i.indkey)
    ) pk ON true
    WHERE n.nspname = ${schema} AND c.relname = ${table}
      AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY a.attnum`
  return rows.map((r) => ({
    name: r.name,
    type: r.type,
    notNull: r.not_null,
    default: r.default,
    ordinal: r.ordinal,
    isPrimaryKey: r.is_pk,
    enumValues: r.enum_values ?? null,
  }))
}

export interface IndexInfo {
  name: string
  definition: string
  isUnique: boolean
  isPrimary: boolean
}

export async function getIndexes(sql: Sql, schema: string, table: string): Promise<IndexInfo[]> {
  const rows = await sql<
    { name: string; definition: string; is_unique: boolean; is_primary: boolean }[]
  >`
    SELECT i.relname AS name,
           pg_get_indexdef(ix.indexrelid) AS definition,
           ix.indisunique AS is_unique,
           ix.indisprimary AS is_primary
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = ${schema} AND t.relname = ${table}
    ORDER BY i.relname`
  return rows.map((r) => ({
    name: r.name,
    definition: r.definition,
    isUnique: r.is_unique,
    isPrimary: r.is_primary,
  }))
}

export interface ConstraintInfo {
  name: string
  type: string
  definition: string
}

const CONSTRAINT_TYPE: Record<string, string> = {
  p: 'PRIMARY KEY',
  f: 'FOREIGN KEY',
  u: 'UNIQUE',
  c: 'CHECK',
  x: 'EXCLUDE',
}

export async function getConstraints(
  sql: Sql,
  schema: string,
  table: string,
): Promise<ConstraintInfo[]> {
  const rows = await sql<{ name: string; contype: string; definition: string }[]>`
    SELECT con.conname AS name, con.contype AS contype,
           pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ${schema} AND c.relname = ${table}
    ORDER BY con.conname`
  return rows.map((r) => ({
    name: r.name,
    type: CONSTRAINT_TYPE[r.contype] ?? r.contype,
    definition: r.definition,
  }))
}

export interface SourceTable {
  schema: string
  table: string
  primaryKey: string[]
  /** attnum → real column name, to map a result column back to its base column. */
  attnumName: Record<number, string>
}

/**
 * Resolve a base-table OID (from a result column's source) to its schema-qualified
 * name, primary key, and attnum→name map. Used to make single-table SQL results
 * editable. Returns null if the OID is not a base relation.
 */
export async function resolveSource(sql: Sql, oid: number): Promise<SourceTable | null> {
  const rows = await sql<
    { schema: string; table: string; pk: string[]; attnum_name: Record<string, string> }[]
  >`
    SELECT n.nspname AS schema,
           c.relname AS table,
           COALESCE(
             array_agg(a.attname ORDER BY pk.ord) FILTER (WHERE pk.ord IS NOT NULL),
             ARRAY[]::text[]
           ) AS pk,
           COALESCE(
             json_object_agg(a.attnum::text, a.attname)
               FILTER (WHERE a.attnum > 0 AND NOT a.attisdropped),
             '{}'::json
           ) AS attnum_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    LEFT JOIN pg_index i ON i.indrelid = c.oid AND i.indisprimary
    LEFT JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS pk(attnum, ord) ON pk.attnum = a.attnum
    WHERE c.oid = ${oid} AND c.relkind IN ('r', 'p')
    GROUP BY c.oid, n.nspname, c.relname`
  const r = rows[0]
  if (!r) return null
  const attnumName: Record<number, string> = {}
  for (const [k, v] of Object.entries(r.attnum_name)) attnumName[+k] = v
  return { schema: r.schema, table: r.table, primaryKey: r.pk, attnumName }
}

export async function getPrimaryKey(sql: Sql, schema: string, table: string): Promise<string[]> {
  const rows = await sql<{ attname: string }[]>`
    SELECT a.attname
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
    WHERE n.nspname = ${schema} AND c.relname = ${table} AND i.indisprimary
    ORDER BY k.ord`
  return rows.map((r) => r.attname)
}

export interface CompletionColumn {
  schema: string
  table: string
  name: string
  type: string
}

/** All columns across user relations — feeds the Monaco completion service. */
export async function getAllColumns(sql: Sql): Promise<CompletionColumn[]> {
  const rows = await sql<{ schema: string; table: string; name: string; type: string }[]>`
    SELECT n.nspname AS schema, c.relname AS table, a.attname AS name,
           format_type(a.atttypid, a.atttypmod) AS type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','v','m','p')
      AND n.nspname NOT IN ('information_schema') AND n.nspname NOT LIKE 'pg_%'
      AND a.attnum > 0 AND NOT a.attisdropped
    ORDER BY n.nspname, c.relname, a.attnum`
  return [...rows]
}

export interface CompletionFunction {
  schema: string
  name: string
  args: string
  returns: string
  kind: 'function' | 'procedure' | 'aggregate' | 'window'
}

const FUNC_KIND: Record<string, CompletionFunction['kind']> = {
  f: 'function',
  p: 'procedure',
  a: 'aggregate',
  w: 'window',
}

/** User-defined functions/procedures across user schemas — feeds completion. */
export async function getFunctions(sql: Sql): Promise<CompletionFunction[]> {
  const rows = await sql<
    { schema: string; name: string; args: string; returns: string; kind: string }[]
  >`
    SELECT n.nspname AS schema,
           p.proname AS name,
           pg_get_function_arguments(p.oid) AS args,
           pg_get_function_result(p.oid) AS returns,
           p.prokind AS kind
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN ('information_schema') AND n.nspname NOT LIKE 'pg_%'
      AND p.prokind IN ('f','p','a','w')
    ORDER BY n.nspname, p.proname`
  return rows.map((r) => ({
    schema: r.schema,
    name: r.name,
    args: r.args,
    returns: r.returns,
    kind: FUNC_KIND[r.kind] ?? 'function',
  }))
}

export interface CompletionForeignKey {
  schema: string
  table: string
  columns: string[]
  refSchema: string
  refTable: string
  refColumns: string[]
}

/** Foreign keys across user relations — powers FK-aware JOIN suggestions. */
export async function getForeignKeys(sql: Sql): Promise<CompletionForeignKey[]> {
  const rows = await sql<
    {
      schema: string
      table: string
      columns: string[]
      ref_schema: string
      ref_table: string
      ref_columns: string[]
    }[]
  >`
    SELECT n.nspname AS schema,
           c.relname AS table,
           ARRAY(
             SELECT a.attname FROM unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord)
             JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum
             ORDER BY k.ord
           ) AS columns,
           fn.nspname AS ref_schema,
           fc.relname AS ref_table,
           ARRAY(
             SELECT a.attname FROM unnest(con.confkey) WITH ORDINALITY AS k(attnum, ord)
             JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum
             ORDER BY k.ord
           ) AS ref_columns
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class fc ON fc.oid = con.confrelid
    JOIN pg_namespace fn ON fn.oid = fc.relnamespace
    WHERE con.contype = 'f'
      AND n.nspname NOT IN ('information_schema') AND n.nspname NOT LIKE 'pg_%'
    ORDER BY n.nspname, c.relname`
  return rows.map((r) => ({
    schema: r.schema,
    table: r.table,
    columns: r.columns,
    refSchema: r.ref_schema,
    refTable: r.ref_table,
    refColumns: r.ref_columns,
  }))
}

export interface TableDataOptions {
  limit: number
  offset: number
  orderBy?: string
  orderDir?: 'ASC' | 'DESC'
}

/** Read a page of rows from a table. Identifiers are quoted; paging is params. */
export async function getTableData(
  sql: Sql,
  schema: string,
  table: string,
  opts: TableDataOptions,
): Promise<{ result: QueryResult; estimatedRows: number }> {
  const rel = `${quoteIdent(schema)}.${quoteIdent(table)}`
  const order = opts.orderBy
    ? ` ORDER BY ${quoteIdent(opts.orderBy)} ${opts.orderDir === 'DESC' ? 'DESC' : 'ASC'}`
    : ''
  const text = `SELECT * FROM ${rel}${order} LIMIT $1 OFFSET $2`
  const result = await executeSql(sql, text, [opts.limit, opts.offset])

  const est = await sql<{ n: number }[]>`
    SELECT GREATEST(c.reltuples, 0)::bigint AS n
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = ${schema} AND c.relname = ${table}`
  return { result, estimatedRows: Number(est[0]?.n ?? 0) }
}
