export interface AnyGridCell {
  column: { id: string }
  getValue: () => unknown
}

export interface AnyGridRow {
  id?: string
  index: number
  getAllCells: () => AnyGridCell[]
  getIsSelected?: () => boolean
}

export interface CellBounds {
  minRowIndex: number
  maxRowIndex: number
  minColumnIndex: number
  maxColumnIndex: number
}

export interface AnyGridTable {
  getSelectedRowModel: () => { rows: AnyGridRow[] }
  getSelectedCellCount: () => number
  getCellSelectionColumnIds: () => string[]
  getCellSelectionRowIds: () => string[]
  getCellSelectionBounds: () => CellBounds[]
  getRowModel: () => { rows: AnyGridRow[] }
  getAllLeafColumns: () => Array<{ id: string }>
  getVisibleLeafColumns?: () => Array<{ id: string }>
}

export function escapeTsvValue(value: unknown): string {
  if (value == null) return ''
  const text = String(value)
  const isDangerousFormula = typeof value === 'string' && /^[\t\r ]*[=+@-]/.test(value)
  const safeText = isDangerousFormula ? `'${text}` : text
  const needsQuotes = /["\t\n\r]/.test(safeText)

  return needsQuotes ? `"${safeText.replace(/"/g, '""')}"` : safeText
}

export function resolveCellTsv(cell: AnyGridCell, row: AnyGridRow): string {
  const rawValue = cell.column.id === 'select' ? row.index + 1 : cell.getValue()
  return escapeTsvValue(rawValue)
}

export function buildRowsTsv(rows: Array<AnyGridRow>): string {
  return rows
    .map((row) =>
      row
        .getAllCells()
        .filter((cell) => cell.column.id !== 'select')
        .map((cell) => resolveCellTsv(cell, row))
        .join('\t'),
    )
    .join('\n')
}

export function buildCellRangesTsv(table: AnyGridTable): string {
  if (typeof (table as unknown as { getSelectedCellRangesData?: () => unknown[][][] }).getSelectedCellRangesData === 'function') {
    const ranges = (table as unknown as { getSelectedCellRangesData: () => unknown[][][] }).getSelectedCellRangesData()
    if (Array.isArray(ranges) && ranges.length > 0 && ranges.some((r) => r.length > 0)) {
      return ranges
        .map((range) =>
          range
            .map((row) => (Array.isArray(row) ? row.map(escapeTsvValue).join('\t') : escapeTsvValue(row)))
            .join('\n'),
        )
        .join('\n\n')
    }
  }

  const rows = table.getRowModel().rows
  const columns =
    typeof table.getVisibleLeafColumns === 'function'
      ? table.getVisibleLeafColumns()
      : table.getAllLeafColumns()
  const bounds = table.getCellSelectionBounds()

  return bounds
    .map(({ minRowIndex, maxRowIndex, minColumnIndex, maxColumnIndex }) => {
      const selectedRows = rows.slice(minRowIndex, maxRowIndex + 1)
      const selectedCols = columns
        .slice(minColumnIndex, maxColumnIndex + 1)
        .filter((col) => col.id !== 'select')

      return selectedRows
        .map((row) =>
          selectedCols
            .map((col) => {
              const cell = row.getAllCells().find((c) => c.column.id === col.id)
              return cell ? resolveCellTsv(cell, row) : ''
            })
            .join('\t'),
        )
        .join('\n')
    })
    .join('\n\n')
}

export function getClipboardPayload(table: AnyGridTable): { tsv: string; summary: string } | null {
  const selectedRows = table.getSelectedRowModel().rows
  const cellCount = table.getSelectedCellCount()
  const hasSelectedRows = selectedRows.length > 0
  const hasSelectedCells = cellCount > 0

  if (hasSelectedCells) {
    const selectedCols = table.getCellSelectionColumnIds()
    const isOnlySelectCol = selectedCols.length === 1 && selectedCols[0] === 'select'
    const isCheckboxClickFocus = isOnlySelectCol && cellCount === 1 && hasSelectedRows

    if (isCheckboxClickFocus) {
      return {
        tsv: buildRowsTsv(selectedRows),
        summary: `Copied ${selectedRows.length} selected row(s) to clipboard as TSV!`,
      }
    }

    if (isOnlySelectCol) {
      const rowsById = new Map(table.getRowModel().rows.map((r) => [r.id ?? String(r.index), r]))
      const targetRows = table
        .getCellSelectionRowIds()
        .map((id) => rowsById.get(id))
        .filter(Boolean) as Array<AnyGridRow>

      return {
        tsv: buildRowsTsv(targetRows),
        summary: `Copied ${targetRows.length} full row(s) to clipboard as TSV!`,
      }
    }

    return {
      tsv: buildCellRangesTsv(table),
      summary: `Copied ${cellCount} cells to clipboard as TSV!`,
    }
  }

  if (hasSelectedRows) {
    return {
      tsv: buildRowsTsv(selectedRows),
      summary: `Copied ${selectedRows.length} selected row(s) to clipboard as TSV!`,
    }
  }

  return null
}

export async function copyGridToClipboard(
  table: AnyGridTable,
): Promise<{ success: boolean; message: string }> {
  const payload = getClipboardPayload(table)
  if (!payload || !payload.tsv) {
    return {
      success: false,
      message: 'Select rows or cells in the grid to copy as TSV.',
    }
  }

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(payload.tsv)
      return {
        success: true,
        message: payload.summary,
      }
    }
    return {
      success: false,
      message: 'Clipboard API is not supported in this environment.',
    }
  } catch (err) {
    console.error('Failed to copy TSV:', err)
    return {
      success: false,
      message: 'Failed to copy data to clipboard.',
    }
  }
}
