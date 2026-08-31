export type DynamicRow = Record<string, unknown> & { __id: string }
export type GridInputType = 'text' | 'number' | 'select' | 'datetime' | 'date' | 'json' | 'bool'

/**
 * Maps raw SQL 2D row arrays into an array of DynamicRow objects with key-value pairs
 * based on column names, assigning a stable `__id` based on primary key columns or row index.
 */
export function mapSqlRowsToDynamicRows(
  columns: Array<{ name: string }>,
  rows: unknown[][],
  pkNames?: string[],
): DynamicRow[] {
  return rows.map((row, rowIndex) => {
    const rowObj: DynamicRow = { __id: '' }
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i]
      if (col && col.name) {
        rowObj[col.name] = row[i]
      }
    }
    if (pkNames && pkNames.length > 0) {
      const pkVals = pkNames.map((pk) => rowObj[pk])
      if (pkVals.every((v) => v !== undefined && v !== null && v !== '')) {
        rowObj.__id = pkVals.map(String).join('::')
      } else {
        rowObj.__id = `row_${rowIndex}`
      }
    } else {
      rowObj.__id = `row_${rowIndex}`
    }
    return rowObj
  })
}

/**
 * Maps a database column type (and optional enum values) to a grid input editor type.
 */
export function mapDbToDataType(typeName: string, enumValues?: string[] | null): GridInputType {
  if (enumValues && enumValues.length > 0) {
    return 'select'
  }
  const t = (typeName || '').toLowerCase().trim()
  if (t === 'boolean' || t === 'bool') {
    return 'bool'
  }
  if (t === 'date') {
    return 'date'
  }
  if (
    t.startsWith('timestamp') ||
    t === 'timestamptz' ||
    t.startsWith('time') ||
    t.startsWith('interval')
  ) {
    return 'datetime'
  }
  if (t.includes('json')) {
    return 'json'
  }
  if (/int|serial|numeric|decimal|real|double|float|money/.test(t)) {
    return 'number'
  }
  return 'text'
}
