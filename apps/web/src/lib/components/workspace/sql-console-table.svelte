<script lang="ts">
  import { untrack } from 'svelte'
  import { toast } from 'svelte-sonner'
  import { createMutation } from '@tanstack/svelte-query'
  import {
    renderComponent,
    type ColumnSizingState,
    type RowSelectionState,
    type PaginationState,
  } from '@tanstack/svelte-table'
  import type { ColumnMeta } from '$lib/types/server'
  import type { ResultSource } from '$lib/api/query'
  import {
    createGridForm,
    createAppGridColumnHelper,
    createAppGridTable,
    mapSqlRowsToDynamicRows,
    mapDbToDataType,
    getCellClassName,
    copyGridToClipboard,
    JsonView,
    type DynamicRow,
  } from '$lib/components/data-grid'
  import * as Table from '$lib/components/ui/table/index.js'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import { updateRow, deleteRow, type Row } from '$lib/api/mutations'
  import type { TabFilter } from '$lib/stores/workspace.svelte'
  import { Loader } from 'lucide-svelte'

  interface Props {
    connId: string
    columns: ColumnMeta[]
    rows: unknown[][]
    startIndex?: number
    source?: ResultSource | null
    view?: 'table' | 'json' | 'structure'
    onRowsChange?: (newRows: unknown[][]) => void
    onRefresh?: () => void
    onOpenTable?: (schema: string, table: string, filter?: TabFilter) => void
  }

  let {
    connId,
    columns,
    rows,
    startIndex = 0,
    source = null,
    view = 'table',
    onRowsChange,
    onRefresh,
    onOpenTable: _onOpenTable,
  }: Props = $props()

  interface RowUpdate {
    pkRow: Row
    values: Record<string, string | null>
    rowIndex: number
    newRow: DynamicRow
  }

  const pk = $derived(source?.primaryKey ?? [])
  const isEditable = $derived(!!source && pk.length > 0)

  let localRows = $state<unknown[][]>(untrack(() => rows))
  const tableData = $derived(mapSqlRowsToDynamicRows(columns, localRows, pk))

  let deleteDialogOpen = $state(false)

  // A. Optimistic Delete Mutation
  const deleteMutation = createMutation(() => ({
    mutationFn: async (rowsToDelete: DynamicRow[]) => {
      if (!source) return []
      const deletes = rowsToDelete.map((r) => {
        const pkObj: Row = {}
        for (const k of pk) pkObj[k] = r[k]
        return deleteRow(connId, source.schema, source.table, pkObj)
      })
      return Promise.all(deletes)
    },
    onMutate: async (rowsToDelete: DynamicRow[]) => {
      const previousRows = localRows
      const previousFormData = (form.state.values as { data?: DynamicRow[] })?.data ?? tableData

      const remainingSqlRows = localRows.filter((sqlRow) => {
        return !rowsToDelete.some((delRow) => {
          if (pk.length > 0) {
            return pk.every((p) => {
              const colIdx = columns.findIndex((c) => c.name === p)
              return delRow[p] === sqlRow[colIdx]
            })
          }
          return columns.every((c, i) => delRow[c.name] === sqlRow[i])
        })
      })

      localRows = remainingSqlRows
      onRowsChange?.(remainingSqlRows)

      const remainingFormData = mapSqlRowsToDynamicRows(columns, remainingSqlRows, pk)
      form.reset({ data: remainingFormData })
      rowSelection = {}
      deleteDialogOpen = false

      return { previousRows, previousFormData }
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previousRows) {
        localRows = context.previousRows
        onRowsChange?.(context.previousRows)
      }
      if (context?.previousFormData) {
        form.reset({ data: context.previousFormData })
      }
      toast.error(err.message)
    },
    onSuccess: (_data, vars) => {
      toast.success(`Deleted ${vars.length} row(s)`)
    },
  }))

  function handleDeleteSelected() {
    const selectedRows = table.getSelectedRowModel().rows
    if (selectedRows.length === 0) return
    deleteDialogOpen = true
  }

  async function confirmDelete() {
    const selectedRows = table.getSelectedRowModel().rows
    if (selectedRows.length === 0) return
    const rowsToDelete = selectedRows.map((r) => r.original)
    await deleteMutation.mutateAsync(rowsToDelete)
  }

  // B. Optimistic Batch Save/Update Mutation
  const saveMutation = createMutation(() => ({
    mutationFn: async (updates: RowUpdate[]) => {
      if (!source) return []
      return Promise.all(
        updates.map((u) => updateRow(connId, source.schema, source.table, u.pkRow, u.values)),
      )
    },
    onMutate: async (updates: RowUpdate[]) => {
      const previousRows = localRows
      const previousFormData = (form.state.values as { data?: DynamicRow[] })?.data ?? tableData

      const updatedSqlRows = localRows.map((sqlRow, idx) => {
        const update = updates.find((u) => u.rowIndex === idx)
        if (!update) return sqlRow

        const newSqlRow = [...sqlRow]
        for (const [colName, val] of Object.entries(update.values)) {
          const colIdx = columns.findIndex((c) => c.name === colName)
          if (colIdx !== -1) {
            newSqlRow[colIdx] = val
          }
        }
        return newSqlRow
      })

      localRows = updatedSqlRows
      onRowsChange?.(updatedSqlRows)

      const newFormData = previousFormData.map((row, idx) => {
        const update = updates.find((u) => u.rowIndex === idx)
        return update ? { ...row, ...update.newRow } : row
      })
      form.reset({ data: newFormData })

      return { previousRows, previousFormData }
    },
    onError: (err: Error, _vars, context) => {
      if (context?.previousRows) {
        localRows = context.previousRows
        onRowsChange?.(context.previousRows)
      }
      if (context?.previousFormData) {
        form.reset({ data: context.previousFormData })
      }
      toast.error(err.message)
    },
    onSuccess: (_data, vars) => {
      toast.success(`Saved ${vars.length} modified row(s)`)
    },
  }))

  const form = createGridForm(() => ({
    defaultValues: { data: tableData },
    onSubmit: async ({ value }: { value: { data: DynamicRow[] } }) => {
      if (!source || !value.data || value.data.length === 0) return
      try {
        const updates: RowUpdate[] = []
        for (let i = 0; i < value.data.length; i++) {
          const newRow = value.data[i]
          const origRow = tableData[i]
          if (!newRow || !origRow) continue

          const changedValues: Record<string, string | null> = {}
          for (const c of columns) {
            const name = c.name
            if (newRow[name] !== origRow[name]) {
              const val = newRow[name]
              changedValues[name] = val === '' ? '' : val == null ? null : String(val)
            }
          }

          if (Object.keys(changedValues).length > 0) {
            const pkRow: Row = {}
            for (const k of pk) {
              pkRow[k] = origRow[k]
            }
            updates.push({ pkRow, values: changedValues, rowIndex: i, newRow })
          }
        }

        if (updates.length > 0) {
          await saveMutation.mutateAsync(updates)
        }
      } catch (err) {
        console.error('Failed to save console table changes:', err)
      }
    },
  }))

  let prevRowsRef: unknown = null
  $effect(() => {
    if (rows && rows !== prevRowsRef) {
      prevRowsRef = rows
      localRows = rows
      untrack(() => {
        form.reset({ data: tableData })
      })
    }
  })

  const columnHelper = createAppGridColumnHelper<DynamicRow>()

  const gridColumns = $derived.by(() => {
    const selectCol = columnHelper.display({
      id: 'select',
      size: 55,
      minSize: 50,
      maxSize: 70,
      enableResizing: false,
      enableCellSelection: false,
      header: ({ header }) => renderComponent(header.RowSelectHeader),
      cell: ({ cell }) => renderComponent(cell.RowSelectCell),
    })

    const dbCols = columns.map((col, i) => {
      const real = source?.columnNames[i] ?? col.name
      const inputType = mapDbToDataType(col.typeName)
      const colEditable = isEditable && !pk.includes(real)

      return columnHelper.accessor((row: DynamicRow) => row[col.name], {
        id: col.name,
        header: ({ header }) => renderComponent(header.ColumnHeader),
        size: 180,
        minSize: 80,
        maxSize: 500,
        meta: {
          inputType,
          options: [],
          typeName: col.typeName,
          colIndex: i,
          editable: colEditable,
          isPrimaryKey: pk.includes(real),
        },
        cell: ({ cell }) => renderComponent(cell.GridCell, { form }),
      })
    })

    if (isEditable) {
      return columnHelper.columns([selectCol, ...dbCols])
    }
    return columnHelper.columns(dbCols)
  })

  let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: 50 })
  let columnSizing = $state<ColumnSizingState>({})
  let rowSelection = $state<RowSelectionState>({})

  const table = createAppGridTable({
    get data() {
      return (form.state.values as { data?: DynamicRow[] })?.data ?? tableData
    },
    get columns() {
      return gridColumns
    },
    get rowCount() {
      return tableData.length
    },
    state: {
      get pagination() {
        return pagination
      },
      get columnSizing() {
        return columnSizing
      },
      get rowSelection() {
        return rowSelection
      },
    },
    onPaginationChange: (updater) => {
      pagination = typeof updater === 'function' ? updater(pagination) : updater
    },
    onColumnSizingChange: (updater) => {
      columnSizing = typeof updater === 'function' ? updater(columnSizing) : updater
    },
    onRowSelectionChange: (updater) => {
      rowSelection = typeof updater === 'function' ? updater(rowSelection) : updater
    },
  })

  const headerGroups = $derived.by(() => table.getHeaderGroups())
  const tableRows = $derived.by(() => table.getRowModel().rows)

  async function handleKeyDown(e: KeyboardEvent) {
    if (view !== 'table') return

    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && !window.getSelection()?.toString()) {
      e.preventDefault()
      const res = await copyGridToClipboard(table)
      if (res.success) toast.success(res.message)
      return
    }

    if (e.key === 'Escape') {
      table.resetCellSelection(true)
      table.resetRowSelection()
      return
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      const activeEl = document.activeElement
      if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
        return
      }
      e.preventDefault()
      table.selectAllCells()
      return
    }

    const directionMap: Record<string, 'up' | 'down' | 'left' | 'right'> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    }

    if (directionMap[e.key]) {
      const activeEl = document.activeElement
      if (activeEl instanceof HTMLInputElement || activeEl instanceof HTMLTextAreaElement) {
        return
      }
      e.preventDefault()
      if (e.shiftKey) {
        table.extendCellSelection(directionMap[e.key])
      } else {
        table.moveCellSelection(directionMap[e.key])
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} />

<table.AppTable>
  <form.AppForm>
    <div class="flex h-full flex-col">
      <!-- Sub-Header Console Toolbar -->
      <table.DataGridConsoleToolbar
        {isEditable}
        {onRefresh}
        onDeleteSelected={handleDeleteSelected}
        isDeleting={deleteMutation.isPending}
      />

      <!-- Main Body Area -->
      <div class="min-h-0 flex-1 overflow-auto">
        {#if view === 'structure'}
          <div class="p-4 text-xs">
            <table class="w-full text-left">
              <thead class="text-muted-foreground">
                <tr>
                  <th class="py-1 pr-4">#</th>
                  <th class="py-1 pr-4">Name</th>
                  <th class="py-1">Type</th>
                </tr>
              </thead>
              <tbody class="font-mono">
                {#each columns as c, i (c.name)}
                  <tr class="border-t">
                    <td class="text-muted-foreground py-1 pr-4">{i + 1}</td>
                    <td class="py-1 pr-4">{c.name}</td>
                    <td class="text-muted-foreground py-1">{c.typeName}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else if view === 'json'}
          <JsonView {columns} rows={localRows} offset={startIndex} />
        {:else}
          <!-- Modern TanStack Table Grid -->
          <Table.Root
            containerClass="h-full w-full overflow-auto"
            class="table-fixed border-collapse border-r border-l border-border text-xs"
            style="width: {table.getTotalSize()}px; min-width: 100%;"
          >
            <Table.Header class="sticky top-0 z-20 bg-muted/95 backdrop-blur-xs border-b shadow-xs">
              {#each headerGroups as headerGroup (headerGroup.id)}
                <Table.Row class="hover:bg-transparent border-b">
                  {#each headerGroup.headers as h (h.id)}
                    <table.AppHeader header={h}>
                      {#snippet children(header)}
                        <Table.Head
                          colspan={header.colSpan}
                          style="width: {header.getSize()}px; position: relative;"
                          class="h-8 border-r p-0 align-middle font-mono font-medium text-foreground last:border-r-0 select-none sticky top-0 bg-muted/95"
                        >
                          {#if !header.isPlaceholder}
                            <header.FlexRender {header} />
                            <header.ColumnResizer />
                          {/if}
                        </Table.Head>
                      {/snippet}
                    </table.AppHeader>
                  {/each}
                </Table.Row>
              {/each}
            </Table.Header>
            <Table.Body class="bg-background">
              {#if tableRows.length === 0}
                <Table.Row>
                  <Table.Cell
                    colspan={columns.length + (isEditable ? 1 : 0)}
                    class="h-24 text-center text-muted-foreground"
                  >
                    No rows returned
                  </Table.Cell>
                </Table.Row>
              {:else}
                {#each tableRows as row (row.id)}
                  <Table.Row
                    class="group transition-colors {row.getIsSelected()
                      ? 'bg-primary/10 hover:bg-primary/15'
                      : 'hover:bg-muted/40'}"
                  >
                    {#each row.getAllCells() as c (c.id)}
                      <table.AppCell cell={c}>
                        {#snippet children(cell)}
                          <Table.Cell
                            style="width: {cell.column.getSize()}px;"
                            class="relative h-8 border-r border-b p-0 align-middle last:border-r-0 {getCellClassName(
                              cell,
                            )}"
                            tabindex={cell.getTabIndex()}
                            onmousedown={cell.column.id !== 'select'
                              ? cell.getSelectionStartHandler()
                              : undefined}
                            onmouseenter={cell.column.id !== 'select'
                              ? cell.getSelectionExtendHandler()
                              : undefined}
                          >
                            <cell.FlexRender {cell} />
                          </Table.Cell>
                        {/snippet}
                      </table.AppCell>
                    {/each}
                  </Table.Row>
                {/each}
              {/if}
            </Table.Body>
          </Table.Root>
        {/if}
      </div>
    </div>
  </form.AppForm>
</table.AppTable>

<!-- Delete Confirmation Dialog -->
<AlertDialog.Root bind:open={deleteDialogOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>
        Delete {table.getSelectedRowModel().rows.length} row{table.getSelectedRowModel().rows
          .length > 1
          ? 's'
          : ''}?
      </AlertDialog.Title>
      <AlertDialog.Description>
        This action cannot be undone. Selected rows will be permanently deleted from <code
          class="font-mono">{source?.schema}.{source?.table}</code
        >.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action
        class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onclick={confirmDelete}
      >
        {#if deleteMutation.isPending}
          <Loader class="size-4 animate-spin" /> Deleting...
        {:else}
          Delete
        {/if}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
