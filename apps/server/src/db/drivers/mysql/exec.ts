import type mysql from 'mysql2/promise'
import type { ColumnMeta, QueryResult } from '$src/db/shared/marshal'
import { marshalValue } from '$src/db/shared/marshal'

const MYSQL_TYPE_NAMES: Record<number, string> = {
  0: 'decimal',
  1: 'tinyint',
  2: 'smallint',
  3: 'int',
  4: 'float',
  5: 'double',
  6: 'null',
  7: 'timestamp',
  8: 'bigint',
  9: 'mediumint',
  10: 'date',
  11: 'time',
  12: 'datetime',
  13: 'year',
  14: 'newdate',
  15: 'varchar',
  16: 'bit',
  245: 'json',
  246: 'newdecimal',
  247: 'enum',
  248: 'set',
  249: 'tinyblob',
  250: 'mediumblob',
  251: 'longblob',
  252: 'blob',
  253: 'var_string',
  254: 'string',
  255: 'geometry',
}

export function mysqlTypeName(typeId: number): string {
  return MYSQL_TYPE_NAMES[typeId] ?? `type:${typeId}`
}

function detectCommand(sql: string): string | null {
  const match = sql.trim().match(/^([A-Za-z]+)/)
  return match ? match[1].toUpperCase() : null
}

export async function executeSql(
  conn: mysql.Pool | mysql.PoolConnection,
  text: string,
  params: unknown[] = [],
): Promise<QueryResult> {
  const [res, fields] = await conn.query({
    sql: text,
    rowsAsArray: true,
    values: params,
  })

  if (fields && Array.isArray(fields)) {
    const columns: ColumnMeta[] = fields.map((f, i) => {
      const typeId =
        (f as { columnType?: number; type?: number }).columnType ??
        (f as { columnType?: number; type?: number }).type ??
        0
      return {
        name: f.name,
        dataTypeID: typeId,
        typeName: mysqlTypeName(typeId),
        sourceTable: f.orgTable ? 1 : 0,
        sourceColumn: i + 1,
      }
    })

    const rows = Array.isArray(res)
      ? (res as unknown[][]).map((row) => (Array.isArray(row) ? row.map(marshalValue) : [row]))
      : []

    const command = detectCommand(text)
    return {
      columns,
      rows,
      rowCount: rows.length,
      command,
    }
  }

  // ResultSetHeader for INSERT, UPDATE, DELETE, CREATE, DROP, etc.
  const header = res as mysql.ResultSetHeader | undefined
  const command = detectCommand(text)
  return {
    columns: [],
    rows: [],
    rowCount: header?.affectedRows ?? 0,
    command,
  }
}
