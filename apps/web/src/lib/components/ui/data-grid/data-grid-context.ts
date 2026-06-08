import type { Table } from '@tanstack/table-core'
import type { CellVariant } from './cell-variant'

/** Draft (not-yet-inserted) rows use negative row indices: draft i → -(i+1). */
export const isDraftRow = (r: number): boolean => r < 0
export const draftIndexOf = (r: number): number => -r - 1
export const draftRowIndex = (i: number): number => -(i + 1)

export type CellPos = { r: number; c: number }

/** Normalized, index-aligned column descriptor consumed by the grid. */
export interface GridColumn {
  name: string
  typeName: string
  variant: CellVariant
  options: string[]
  sortable: boolean
  /** Whether THIS column's cells may be edited (false for PK cols / no-PK / readonly). */
  editable: boolean
}

/** Shared state + handlers passed to every cell through Svelte context. */
export interface DataGridContext {
  readonly focusedCell: CellPos | null
  readonly editingCell: CellPos | null
  readonly editable: boolean
  readonly columns: GridColumn[]
  readonly newRows: Array<Record<number, string>>
  readonly edits: Record<number, Record<number, string>>
  readonly deletes: Record<number, true>
  focusCell(r: number, c: number): void
  startEdit(r: number, c: number): void
  cancelEdit(): void
  unfocus(): void
  saveCell(r: number, c: number, wire: string): void
  toggleDelete(r: number): void
  isDeleted(r: number): boolean
  /** Pending (unsaved) value for a cell, or undefined if none. */
  cellPending(r: number, c: number): string | undefined
}

/** What `createDataGrid` returns; consumed by the `<DataGrid>` root + toolbars. */
export interface DataGridApi<RowT = unknown[]> {
  table: Table<RowT>
  ctx: DataGridContext
  readonly dirty: boolean
  addRow(): void
  applyChanges(): Promise<void>
  cancelChanges(): void
}

export const DATA_GRID_KEY = Symbol('data-grid')
