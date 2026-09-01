import type { DbDriver, Capabilities, EditableSource, ScriptRunner } from '$src/db/driver'
import type { ProviderId } from '$src/providers'
import type { ConnectionTarget } from '$src/db/types'
import { makePool } from '$src/db/drivers/mysql/pool'
import { executeSql } from '$src/db/drivers/mysql/exec'
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
} from '$src/db/drivers/mysql/introspect'
import {
  quoteIdent,
  buildCreateTable,
  buildInsert,
  buildUpdate,
  buildDelete,
  inlineParams,
} from '$src/db/drivers/mysql/dml'
import type { ColumnSpec } from '$src/db/types'
import { analyzeSql, inspectSelect } from '$src/db/shared/safety'
import type { ColumnMeta } from '$src/db/shared/marshal'

const MYSQL_CAPABILITIES: Capabilities = {
  kind: 'relational',
  hasDatabases: true,
  hasSchemas: true,
  hasFunctions: true,
  supportsDatabaseSwitch: true,
  supportsReturning: false,
  connectionShape: 'network',
}

export class MysqlDriver implements DbDriver {
  readonly id: ProviderId = 'mysql'
  readonly capabilities = MYSQL_CAPABILITIES
  readonly exec: DbDriver['exec']
  readonly introspect: DbDriver['introspect']
  readonly ddl: DbDriver['ddl']
  readonly dml: DbDriver['dml']
  readonly safety: DbDriver['safety']
  readonly lifecycle: DbDriver['lifecycle']

  constructor(opts: ConnectionTarget) {
    const pool = makePool(opts, 5)

    this.exec = {
      query: (text, params = []) => executeSql(pool, text, params),
      reserve: async (): Promise<ScriptRunner> => {
        const conn = await pool.getConnection()
        return {
          query: (text, params = []) => executeSql(conn, text, params),
          release: () => conn.release(),
        }
      },
    }

    this.introspect = {
      listDatabases: () => listDatabases(pool),
      listSchemas: () => listSchemas(pool),
      getTree: (search) => getTree(pool, search),
      getColumns: (schema, table) => getColumns(pool, schema, table),
      getIndexes: (schema, table) => getIndexes(pool, schema, table),
      getConstraints: (schema, table) => getConstraints(pool, schema, table),
      getPrimaryKey: (schema, table) => getPrimaryKey(pool, schema, table),
      getAllColumns: () => getAllColumns(pool),
      getFunctions: () => getFunctions(pool),
      getForeignKeys: () => getForeignKeys(pool),
      getTableData: (schema, table, queryOpts) => getTableData(pool, schema, table, queryOpts),
      resolveEditableSource: (columns: ColumnMeta[]): Promise<EditableSource | null> =>
        resolveSource(pool, columns),
    }

    this.ddl = {
      exec: async (ddl: string) => {
        await executeSql(pool, ddl)
      },
      quoteIdent,
      buildCreateTable: (schema: string | null, table: string, columns: ColumnSpec[]) =>
        buildCreateTable(schema, table, columns),
    }

    this.dml = {
      buildInsert: (schema: string | null, table: string, values: Record<string, unknown>) =>
        buildInsert(schema, table, values),
      buildUpdate: (
        schema: string | null,
        table: string,
        pk: Record<string, unknown>,
        values: Record<string, unknown>,
      ) => buildUpdate(schema, table, pk, values),
      buildDelete: (schema: string | null, table: string, pk: Record<string, unknown>) =>
        buildDelete(schema, table, pk),
      inlineParams,
    }

    this.safety = {
      analyze: (sql) => analyzeSql(sql),
      inspectSelect: (sql) => inspectSelect(sql),
    }

    this.lifecycle = {
      close: async () => {
        await pool.end().catch(() => {})
      },
    }
  }
}
