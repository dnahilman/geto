import type { DbDriver, Capabilities, EditableSource, ScriptRunner } from '$src/db/driver'
import type { ProviderId } from '$src/providers'
import { makeSql, type PgOptions } from '$src/db/drivers/postgres/pool'
import { executeSql } from '$src/db/drivers/postgres/exec'
import {
  listDatabases,
  listSchemas,
  getTree,
  getColumns,
  getIndexes,
  getConstraints,
  getPrimaryKey,
  resolveSource,
  getAllColumns,
  getFunctions,
  getForeignKeys,
  getTableData,
} from '$src/db/drivers/postgres/introspect'
import { buildCreateTable, type ColumnSpec } from '$src/db/drivers/postgres/dml'
import { quoteIdent } from '$src/db/shared/ident'
import { analyzeSql, inspectSelect } from '$src/db/shared/safety'
import type { ColumnMeta } from '$src/db/shared/marshal'

const PG_CAPABILITIES: Capabilities = {
  hasDatabases: true,
  hasSchemas: true,
  hasFunctions: true,
  supportsDatabaseSwitch: true,
  supportsReturning: true,
  connectionShape: 'network',
}

/**
 * PostgreSQL driver. Holds one pooled porsager client and binds the existing
 * `pg`-shaped free functions to it — the function bodies are unchanged, so PG
 * behaviour is identical to the pre-abstraction code.
 */
export class PostgresDriver implements DbDriver {
  readonly id: ProviderId = 'postgresql'
  readonly capabilities = PG_CAPABILITIES
  readonly exec: DbDriver['exec']
  readonly introspect: DbDriver['introspect']
  readonly ddl: DbDriver['ddl']
  readonly safety: DbDriver['safety']
  readonly lifecycle: DbDriver['lifecycle']

  constructor(opts: PgOptions) {
    const sql = makeSql(opts, 5)

    this.exec = {
      query: (text, params = []) => executeSql(sql, text, params),
      reserve: async (): Promise<ScriptRunner> => {
        const reserved = await sql.reserve()
        return {
          query: (text, params = []) => executeSql(reserved, text, params),
          release: () => reserved.release(),
        }
      },
    }

    this.introspect = {
      listDatabases: () => listDatabases(sql),
      listSchemas: () => listSchemas(sql),
      getTree: (search) => getTree(sql, search),
      getColumns: (schema, table) => getColumns(sql, schema ?? '', table),
      getIndexes: (schema, table) => getIndexes(sql, schema ?? '', table),
      getConstraints: (schema, table) => getConstraints(sql, schema ?? '', table),
      getPrimaryKey: (schema, table) => getPrimaryKey(sql, schema ?? '', table),
      getAllColumns: () => getAllColumns(sql),
      getFunctions: () => getFunctions(sql),
      getForeignKeys: () => getForeignKeys(sql),
      getTableData: (schema, table, opts) => getTableData(sql, schema ?? '', table, opts),
      // Editable-result decision, relocated verbatim from the old query route:
      // every column must trace to exactly one base table that has a PK, with all
      // PK columns present in the projection. Returns null otherwise.
      resolveEditableSource: async (columns: ColumnMeta[]): Promise<EditableSource | null> => {
        const oids = new Set(
          columns
            .map((c) => c.sourceTable)
            .filter((o): o is number => typeof o === 'number' && o > 0),
        )
        if (oids.size !== 1) return null
        const st = await resolveSource(sql, [...oids][0])
        if (!st || st.primaryKey.length === 0) return null
        const columnNames = columns.map((c) =>
          c.sourceColumn ? (st.attnumName[c.sourceColumn] ?? null) : null,
        )
        if (!st.primaryKey.every((pkName) => columnNames.includes(pkName))) return null
        return {
          schema: st.schema,
          table: st.table,
          primaryKey: st.primaryKey,
          columnNames,
        }
      },
    }

    this.ddl = {
      // CREATE DATABASE cannot run inside a transaction; unsafe() uses the simple
      // protocol so this executes standalone.
      exec: async (ddl: string) => {
        await sql.unsafe(ddl)
      },
      quoteIdent,
      buildCreateTable: (schema, table, columns: ColumnSpec[]) =>
        buildCreateTable(schema ?? '', table, columns),
    }

    this.safety = { analyze: analyzeSql, inspectSelect }

    this.lifecycle = {
      close: () =>
        sql
          .end({ timeout: 5 })
          .then(() => {})
          .catch(() => {}),
    }
  }
}
