import {
  getCoreRowModel,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type SortingState,
} from '@tanstack/table-core'
import {
  createSvelteTable,
  renderComponent,
  DataTableColumnHeader,
  colId,
} from '$lib/components/ui/data-table'
import {
  draftIndexOf,
  draftRowIndex,
  isDraftRow,
  type DataGridApi,
  type DataGridContext,
  type GridColumn,
} from './data-grid-context'

export interface CreateDataGridOptions<RowT> {
  getData: () => RowT[]
  getColumns: () => GridColumn[]
  /** Reactive: whether the grid as a whole allows editing (e.g. a PK exists). */
  editable: () => boolean
  getSorting?: () => SortingState
  onSortingChange?: OnChangeFn<SortingState>
  getPagination?: () => PaginationState
  onPaginationChange?: OnChangeFn<PaginationState>
  /** Persist all pending edits of one existing row (rowIndex is page-local). */
  onUpdateRow?: (rowIndex: number, values: Record<string, string>) => Promise<void>
  /** Insert one staged draft row. */
  onInsertRow?: (values: Record<string, string>) => Promise<void>
  /** Delete one existing row (page-local index). */
  onDeleteRow?: (rowIndex: number) => Promise<void>
  /** Called after apply settles: `ok` is false if any change failed. Refetch here. */
  onApplied?: (ok: boolean) => void | Promise<void>
}

/**
 * Svelte 5 analogue of tablecn's `useDataGrid` with a STAGED editing model:
 * cell edits, new rows and deletes accumulate locally (dirty) until `applyChanges`
 * flushes them to the server. Exposes a context object that flows the staged
 * state + handlers down to every cell.
 */
export function createDataGrid<RowT = unknown[]>(
  opts: CreateDataGridOptions<RowT>,
): DataGridApi<RowT> {
  let focusedCell = $state<{ r: number; c: number } | null>(null)
  let editingCell = $state<{ r: number; c: number } | null>(null)
  let edits = $state<Record<number, Record<number, string>>>({})
  let newRows = $state<Array<Record<number, string>>>([])
  let deletes = $state<Record<number, true>>({})

  const dirty = $derived(
    newRows.length > 0 ||
      Object.keys(deletes).length > 0 ||
      Object.values(edits).some((cells) => Object.keys(cells).length > 0),
  )

  const columnDefs = $derived(
    opts.getColumns().map(
      (col, i): ColumnDef<RowT> => ({
        id: colId(i, col.name),
        accessorFn: (row) => (row as unknown[])[i],
        header: ({ column }) =>
          renderComponent(DataTableColumnHeader, { column, label: col.name, typeName: col.typeName }),
        enableSorting: col.sortable,
        meta: { typeName: col.typeName, colIndex: i },
      }),
    ),
  )

  const table = createSvelteTable<RowT>({
    get data() {
      return opts.getData()
    },
    get columns() {
      return columnDefs
    },
    state: {
      get sorting() {
        return opts.getSorting?.() ?? []
      },
      get pagination() {
        return opts.getPagination?.() ?? { pageIndex: 0, pageSize: 1000 }
      },
    },
    manualSorting: !!opts.onSortingChange,
    manualPagination: !!opts.onPaginationChange,
    enableSortingRemoval: false,
    onSortingChange: opts.onSortingChange,
    onPaginationChange: opts.onPaginationChange,
    getCoreRowModel: getCoreRowModel(),
  })

  function firstEditableCol(): number {
    const i = opts.getColumns().findIndex((c) => c.editable)
    return i < 0 ? 0 : i
  }

  // ---- focus / edit ----
  function focusCell(r: number, c: number) {
    focusedCell = { r, c }
    if (editingCell && (editingCell.r !== r || editingCell.c !== c)) editingCell = null
  }
  function startEdit(r: number, c: number) {
    if (!opts.editable()) return
    if (!isDraftRow(r) && !opts.getColumns()[c]?.editable) return
    focusedCell = { r, c }
    editingCell = { r, c }
  }
  function cancelEdit() {
    editingCell = null
  }
  function unfocus() {
    editingCell = null
    focusedCell = null
  }

  // ---- staged mutations ----
  function saveCell(r: number, c: number, wire: string) {
    if (isDraftRow(r)) {
      const i = draftIndexOf(r)
      if (newRows[i]) newRows[i] = { ...newRows[i], [c]: wire }
    } else {
      edits[r] = { ...(edits[r] ?? {}), [c]: wire }
    }
    editingCell = null
    focusedCell = { r, c }
  }

  function addRow() {
    if (!opts.editable()) return
    newRows = [...newRows, {}]
    const r = draftRowIndex(newRows.length - 1)
    const c = firstEditableCol()
    focusedCell = { r, c }
    editingCell = { r, c }
  }

  function toggleDelete(r: number) {
    if (isDraftRow(r)) {
      const i = draftIndexOf(r)
      newRows = newRows.filter((_, idx) => idx !== i)
      if (focusedCell && isDraftRow(focusedCell.r)) unfocus()
      return
    }
    if (deletes[r]) {
      const { [r]: _omit, ...rest } = deletes
      void _omit
      deletes = rest
    } else {
      deletes = { ...deletes, [r]: true }
    }
  }
  function isDeleted(r: number): boolean {
    return deletes[r] === true
  }

  function cellPending(r: number, c: number): string | undefined {
    if (isDraftRow(r)) return newRows[draftIndexOf(r)]?.[c]
    return edits[r]?.[c]
  }

  // ---- apply / cancel ----
  function namedValues(cells: Record<number, string>): Record<string, string> {
    const cols = opts.getColumns()
    const out: Record<string, string> = {}
    for (const [c, v] of Object.entries(cells)) {
      if (v !== '') out[cols[+c].name] = v
    }
    return out
  }

  async function applyChanges() {
    let ok = true
    try {
      // inserts (clear-as-you-go so a later failure never re-inserts)
      while (newRows.length > 0) {
        await opts.onInsertRow?.(namedValues(newRows[0]))
        newRows = newRows.slice(1)
      }
      // updates
      for (const rStr of Object.keys(edits)) {
        const r = +rStr
        const values = namedValues(edits[r])
        if (Object.keys(values).length > 0) await opts.onUpdateRow?.(r, values)
        const { [r]: _omit, ...rest } = edits
        void _omit
        edits = rest
      }
      // deletes
      for (const rStr of Object.keys(deletes)) {
        const r = +rStr
        await opts.onDeleteRow?.(r)
        const { [r]: _omit, ...rest } = deletes
        void _omit
        deletes = rest
      }
    } catch {
      // Consumer toasts the specific error; remaining pending changes are kept.
      ok = false
    }
    unfocus()
    await opts.onApplied?.(ok)
  }

  function cancelChanges() {
    edits = {}
    newRows = []
    deletes = {}
    unfocus()
  }

  const ctx: DataGridContext = {
    get focusedCell() {
      return focusedCell
    },
    get editingCell() {
      return editingCell
    },
    get editable() {
      return opts.editable()
    },
    get columns() {
      return opts.getColumns()
    },
    get newRows() {
      return newRows
    },
    get edits() {
      return edits
    },
    get deletes() {
      return deletes
    },
    focusCell,
    startEdit,
    cancelEdit,
    unfocus,
    saveCell,
    toggleDelete,
    isDeleted,
    cellPending,
  }

  return {
    table,
    ctx,
    get dirty() {
      return dirty
    },
    addRow,
    applyChanges,
    cancelChanges,
  }
}
