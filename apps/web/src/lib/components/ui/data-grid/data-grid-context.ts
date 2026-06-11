import type { Table } from '@tanstack/table-core'
import type { CellVariant } from './cell-variant'
import type { RelationDescriptor, RelationTarget } from '$lib/relations'

/** Enables the relation viewer in `<DataGrid>`: which connection to query related
 *  rows from, and how to open a filtered tab for a relation target. */
export interface RelationsConfig {
  connId: string
  openInTab: (target: RelationTarget, value: unknown) => void
}

/** Draft (not-yet-inserted) rows use negative row indices: draft i → -(i+1). */
export const isDraftRow = (r: number): boolean => r < 0
export const draftIndexOf = (r: number): number => -r - 1
export const draftRowIndex = (i: number): number => -(i + 1)

export type CellPos = { r: number; c: number }

/** An open relation panel beneath a row: which target, filtered by which value. */
export interface ExpandedRelation {
  target: RelationTarget
  value: unknown
}

/** Normalized, index-aligned column descriptor consumed by the grid. */
export interface GridColumn {
  name: string
  typeName: string
  variant: CellVariant
  options: string[]
  sortable: boolean
  /** Whether THIS column's cells may be edited (false for PK cols / no-PK / readonly). */
  editable: boolean
  /** Forward/reverse relation for this column, if any (drives the cell action button). */
  relation?: RelationDescriptor | null
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
  /** Selected (full) rows by page-local index — for row-copy. Drafts excluded. */
  readonly selectedRows: Record<number, true>
  selectRow(r: number, mode: 'replace' | 'toggle' | 'range'): void
  isRowSelected(r: number): boolean
  clearSelection(): void
  focusCell(r: number, c: number): void
  startEdit(r: number, c: number): void
  cancelEdit(): void
  unfocus(): void
  saveCell(r: number, c: number, wire: string): void
  toggleDelete(r: number): void
  isDeleted(r: number): boolean
  /** Pending (unsaved) value for a cell, or undefined if none. */
  cellPending(r: number, c: number): string | undefined
  /** The relation panel open beneath row `r`, or null. */
  expandedFor(r: number): ExpandedRelation | null
  /** Open a relation panel beneath row `r` (replaces any already open there). */
  expandRelation(r: number, rel: ExpandedRelation): void
  /** Close the relation panel beneath row `r`. */
  collapseRelation(r: number): void
}

/** What `createDataGrid` returns; consumed by the `<DataGrid>` root + toolbars. */
export interface DataGridApi<RowT = unknown[]> {
  table: Table<RowT>
  ctx: DataGridContext
  readonly dirty: boolean
  addRow(): void
  applyChanges(): Promise<void>
  cancelChanges(): void
  /** Collapse all open relation panels (call when the row set changes). */
  clearExpanded(): void
}

export const DATA_GRID_KEY = Symbol('data-grid')
