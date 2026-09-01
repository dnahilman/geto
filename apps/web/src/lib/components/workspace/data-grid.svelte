<script lang="ts">
  import {
    createGridForm,
    createAppGridColumnHelper,
    createAppGridTable,
    mapSqlRowsToDynamicRows,
    mapDbToDataType,
    copyGridToClipboard,
    getCellClassName,
    JsonView,
    type DynamicRow,
    type RelationsConfig,
  } from '$lib/components/data-grid'
  import * as Table from '$lib/components/ui/table/index.js'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import { toast } from 'svelte-sonner'
  import { X, PanelLeft, Trash2, Loader } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query'
  import {
    renderComponent,
    type ColumnSizingState,
    type PaginationState,
    type SortingState,
    type RowSelectionState,
  } from '@tanstack/svelte-table'
  import { untrack } from 'svelte'
  import { type TableData } from '$lib/api/introspect'
  import { updateRow, deleteRow, type Row } from '$lib/api/mutations'
  import { historyKey } from '$lib/api/query'
  import { tableQueries } from '$lib/queries'
  import { buildRelationMap, type RelationTarget } from '$lib/relations'
  import WorkspaceSkeletons from './workspace-skeletons.svelte'
  import type { TabFilter } from '$lib/stores/workspace.svelte'

  interface Props {
    connId: string
    schema: string
    tableName: string
    filter?: TabFilter
    onOpenTable?: (schema: string, table: string, filter?: TabFilter) => void
    view?: 'table' | 'json' | 'structure'
    onToggleSidebar?: () => void
  }

  let {
    connId,
    schema,
    tableName,
    filter = undefined,
    onOpenTable,
    view = $bindable('table'),
    onToggleSidebar,
  }: Props = $props()

  // 1. Pagination & Query States
  let pagination = $state<PaginationState>({
    pageIndex: 0,
    pageSize: 50,
  })
  let sorting = $state<SortingState>([])
  let rowSelection = $state<RowSelectionState>({})
  let columnSizing = $state<ColumnSizingState>({})
  const qc = useQueryClient()

  const currentQueryOpts = $derived(
    tableQueries.rows(connId, schema, tableName, {
      limit: pagination.pageSize,
      offset: pagination.pageIndex * pagination.pageSize,
      orderBy: sorting[0]?.id,
      orderDir: sorting[0]?.desc ? 'DESC' : 'ASC',
      filter: filter ? { column: filter.column, value: filter.value } : undefined,
    }),
  )
  const rowsKey = $derived(
    tableQueries.rowsRootKey(
      connId,
      schema,
      tableName,
      filter ? { column: filter.column, value: filter.value } : null,
    ),
  )

  const rows = createQuery(() => currentQueryOpts)
  const detail = createQuery(() => tableQueries.detail(connId, schema, tableName))
  const completion = createQuery(() => tableQueries.completion(connId))

  type RowT = unknown[]
  const cols = $derived(rows.data?.result.columns ?? [])
  const data = $derived<RowT[]>(rows.data?.result.rows ?? [])
  const est = $derived(rows.data?.estimatedRows ?? 0)
  const pk = $derived(detail.data?.primaryKey ?? [])
  const colInfo = $derived(new Map((detail.data?.columns ?? []).map((c) => [c.name, c])))
  const isEditable = $derived(pk.length > 0)

  function refresh() {
    qc.invalidateQueries({ queryKey: rowsKey })
  }

  // 2. Relations Configuration
  const relationMap = $derived(
    completion.data
      ? buildRelationMap(
          completion.data,
          schema,
          tableName,
          cols.map((c) => ({ name: c.name })),
          pk,
        )
      : null,
  )
  const relations = $derived<RelationsConfig | undefined>(
    onOpenTable
      ? {
          connId,
          openInTab: (t: RelationTarget, v: unknown) =>
            onOpenTable(t.schema, t.table, {
              column: t.column,
              value: String(v),
              label: `${t.column} = ${v}`,
            }),
        }
      : undefined,
  )

  // 3. Dynamic Rows & Optimistic Mutations
  const tableData = $derived(mapSqlRowsToDynamicRows(cols, data, pk))

  let deleteDialogOpen = $state(false)

  // A. Optimistic Delete Mutation
  const deleteMutation = createMutation(() => ({
    mutationFn: async (rowsToDelete: DynamicRow[]) => {
      const deletes = rowsToDelete.map((r) => {
        const pkObj: Row = {}
        if (pk.length > 0) {
          for (const k of pk) pkObj[k] = r[k]
        } else {
          for (const c of cols) pkObj[c.name] = r[c.name]
        }
        return deleteRow(connId, schema, tableName, pkObj)
      })
      return Promise.all(deletes)
    },
    onMutate: async (rowsToDelete: DynamicRow[]) => {
      // 1. Cancel outgoing queries
      await qc.cancelQueries({ queryKey: currentQueryOpts.queryKey })

      // 2. Snapshot previous data
      const previousData = qc.getQueryData<TableData>(currentQueryOpts.queryKey)
      const previousFormData = (form.state.values as { data?: DynamicRow[] })?.data ?? tableData

      // 3. Optimistically update query cache
      if (previousData) {
        const remainingSqlRows = previousData.result.rows.filter((sqlRow) => {
          return !rowsToDelete.some((delRow) => {
            if (pk.length > 0) {
              return pk.every((p) => delRow[p] === sqlRow[cols.findIndex((c) => c.name === p)])
            }
            return cols.every((c, i) => delRow[c.name] === sqlRow[i])
          })
        })

        qc.setQueryData<TableData>(currentQueryOpts.queryKey, {
          ...previousData,
          result: {
            ...previousData.result,
            rows: remainingSqlRows,
          },
          estimatedRows: Math.max(0, previousData.estimatedRows - rowsToDelete.length),
        })
      }

      // 4. Optimistically update Form state and reset selection
      const remainingFormData = previousFormData.filter((r) => !rowsToDelete.includes(r))
      form.reset({ data: remainingFormData })
      rowSelection = {}
      deleteDialogOpen = false

      return { previousData, previousFormData }
    },
    onError: (e: Error, _vars, context) => {
      if (context?.previousData) {
        qc.setQueryData(currentQueryOpts.queryKey, context.previousData)
      }
      if (context?.previousFormData) {
        form.reset({ data: context.previousFormData })
      }
      toast.error(e.message)
    },
    onSuccess: (_data, vars) => {
      toast.success(`Deleted ${vars.length} row(s)`)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: rowsKey })
      qc.invalidateQueries({ queryKey: historyKey(connId) })
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
  interface RowUpdate {
    pkRow: Row
    values: Record<string, string | null>
    rowIndex: number
    newRow: DynamicRow
  }

  const saveMutation = createMutation(() => ({
    mutationFn: async (updates: RowUpdate[]) => {
      return Promise.all(
        updates.map((u) => updateRow(connId, schema, tableName, u.pkRow, u.values)),
      )
    },
    onMutate: async (updates: RowUpdate[]) => {
      // 1. Cancel outgoing queries
      await qc.cancelQueries({ queryKey: currentQueryOpts.queryKey })

      // 2. Snapshot previous data
      const previousData = qc.getQueryData<TableData>(currentQueryOpts.queryKey)
      const previousFormData = (form.state.values as { data?: DynamicRow[] })?.data ?? tableData

      // 3. Optimistically update Query Cache
      if (previousData) {
        const updatedSqlRows = previousData.result.rows.map((sqlRow, idx) => {
          const update = updates.find((u) => u.rowIndex === idx)
          if (!update) return sqlRow

          const newSqlRow = [...sqlRow]
          for (const [colName, val] of Object.entries(update.values)) {
            const colIdx = cols.findIndex((c) => c.name === colName)
            if (colIdx !== -1) {
              newSqlRow[colIdx] = val
            }
          }
          return newSqlRow
        })

        qc.setQueryData<TableData>(currentQueryOpts.queryKey, {
          ...previousData,
          result: {
            ...previousData.result,
            rows: updatedSqlRows,
          },
        })
      }

      // 4. Mark form as pristine with new values
      const newFormData = previousFormData.map((row, idx) => {
        const update = updates.find((u) => u.rowIndex === idx)
        return update ? { ...row, ...update.newRow } : row
      })
      form.reset({ data: newFormData })

      return { previousData, previousFormData }
    },
    onError: (e: Error, _vars, context) => {
      if (context?.previousData) {
        qc.setQueryData(currentQueryOpts.queryKey, context.previousData)
      }
      if (context?.previousFormData) {
        form.reset({ data: context.previousFormData })
      }
      toast.error(e.message)
    },
    onSuccess: (_data, vars) => {
      toast.success(`Saved ${vars.length} modified row(s)`)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: rowsKey })
      qc.invalidateQueries({ queryKey: historyKey(connId) })
    },
  }))

  const form = createGridForm(() => ({
    defaultValues: { data: tableData },
    onSubmit: async ({ value }: { value: { data: DynamicRow[] } }) => {
      if (!value.data || value.data.length === 0) return
      try {
        const updates: RowUpdate[] = []

        for (let i = 0; i < value.data.length; i++) {
          const newRow = value.data[i]
          const origRow = tableData[i]
          if (!newRow || !origRow) continue

          const changedValues: Record<string, string | null> = {}
          for (const c of cols) {
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
        console.error('Failed to save table changes:', err)
      }
    },
  }))

  let prevRowsRef: unknown = null

  $effect(() => {
    const currentRows = rows.data?.result.rows
    if (currentRows && currentRows !== prevRowsRef) {
      prevRowsRef = currentRows
      untrack(() => {
        form.reset({ data: tableData })
      })
    }
  })

  // 4. Dynamic Column Definitions via columnHelper.columns()
  const columnHelper = createAppGridColumnHelper<DynamicRow>()

  const columns = $derived.by(() => {
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

    const dbCols = cols.map((col, i) => {
      const info = colInfo.get(col.name)
      const inputType = mapDbToDataType(col.typeName, info?.enumValues)
      const colEditable = isEditable && !pk.includes(col.name)

      return columnHelper.accessor((row: DynamicRow) => row[col.name], {
        id: col.name,
        header: ({ header }) => renderComponent(header.ColumnHeader),
        size: 180,
        minSize: 80,
        maxSize: 500,
        meta: {
          inputType,
          options: info?.enumValues ?? [],
          typeName: col.typeName,
          colIndex: i,
          editable: colEditable,
          isPrimaryKey: pk.includes(col.name) || (info?.isPrimaryKey ?? false),
        },
        cell: ({ cell }) => renderComponent(cell.GridCell, { form }),
      })
    })

    return columnHelper.columns([selectCol, ...dbCols])
  })

  // 5. Table Instance
  const table = createAppGridTable({
    get data() {
      return (form.state.values as { data?: DynamicRow[] })?.data ?? tableData
    },
    get columns() {
      return columns
    },
    manualPagination: true,
    manualSorting: true,
    get rowCount() {
      return est
    },
    state: {
      get columnSizing() {
        return columnSizing
      },
      get rowSelection() {
        return rowSelection
      },
      get sorting() {
        return sorting
      },
      get pagination() {
        return pagination
      },
    },
    onColumnSizingChange: (updater) => {
      columnSizing = typeof updater === 'function' ? updater(columnSizing) : updater
    },
    onRowSelectionChange: (updater) => {
      rowSelection = typeof updater === 'function' ? updater(rowSelection) : updater
    },
    onSortingChange: (updater) => {
      if (form.state.isDirty) return
      table.resetCellSelection(true)
      sorting = typeof updater === 'function' ? updater(sorting) : updater
      pagination.pageIndex = 0
    },
    onPaginationChange: (updater) => {
      if (form.state.isDirty) return
      table.resetCellSelection(true)
      pagination = typeof updater === 'function' ? updater(pagination) : updater
    },
  })

  const headerGroups = $derived(table.getHeaderGroups())
  const tableRows = $derived(table.getRowModel().rows)

  // 8. Keyboard Navigation & Cell Selection
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
      <!-- Sub-Header DataGrid Toolbar -->
      <table.Toolbar
        onRefresh={refresh}
        onDeleteSelected={handleDeleteSelected}
        isDeleting={deleteMutation.isPending}
      />

      <!-- Main View Area -->
      <div class="min-h-0 flex-1 overflow-hidden">
        {#if rows.isError}
          <p class="text-destructive p-4 text-sm">{rows.error.message}</p>
        {:else if view === 'structure'}
          <div class="h-full w-full overflow-auto">
            <div class="space-y-6 p-4 text-sm">
              {#if detail.data}
                <section>
                  <h3 class="text-muted-foreground mb-2 text-xs font-semibold uppercase">
                    Columns
                  </h3>
                  <table class="w-full text-left text-xs">
                    <thead class="text-muted-foreground">
                      <tr>
                        <th class="py-1 pr-4">Name</th>
                        <th class="py-1 pr-4">Type</th>
                        <th class="py-1 pr-4">Nullable</th>
                        <th class="py-1 pr-4">Default</th>
                        <th class="py-1">Key</th>
                      </tr>
                    </thead>
                    <tbody class="font-mono">
                      {#each detail.data.columns as c (c.name)}
                        <tr class="border-t">
                          <td class="py-1 pr-4">{c.name}</td>
                          <td class="py-1 pr-4">{c.type}</td>
                          <td class="py-1 pr-4">{c.notNull ? 'NOT NULL' : 'null'}</td>
                          <td class="text-muted-foreground py-1 pr-4">{c.default ?? ''}</td>
                          <td class="py-1">{c.isPrimaryKey ? 'PK' : ''}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </section>

                <section>
                  <h3 class="text-muted-foreground mb-2 text-xs font-semibold uppercase">
                    Indexes
                  </h3>
                  {#if detail.data.indexes.length}
                    <ul class="space-y-1 font-mono text-xs">
                      {#each detail.data.indexes as idx (idx.name)}
                        <li>
                          <span class="font-medium">{idx.name}</span>
                          <span class="text-muted-foreground"> — {idx.definition}</span>
                        </li>
                      {/each}
                    </ul>
                  {:else}
                    <p class="text-muted-foreground text-xs">none</p>
                  {/if}
                </section>

                <section>
                  <h3 class="text-muted-foreground mb-2 text-xs font-semibold uppercase">
                    Constraints
                  </h3>
                  {#if detail.data.constraints.length}
                    <ul class="space-y-1 font-mono text-xs">
                      {#each detail.data.constraints as c (c.name)}
                        <li>
                          <span class="font-medium">{c.name}</span>
                          <span class="text-muted-foreground"> ({c.type}) — {c.definition}</span>
                        </li>
                      {/each}
                    </ul>
                  {:else}
                    <p class="text-muted-foreground text-xs">none</p>
                  {/if}
                </section>
              {:else}
                <WorkspaceSkeletons type="structure" />
              {/if}
            </div>
          </div>
        {:else if view === 'json'}
          <div class="h-full w-full overflow-auto">
            <JsonView
              columns={cols}
              rows={data}
              offset={pagination.pageIndex * pagination.pageSize}
              {relations}
              relationMap={relationMap ?? undefined}
            />
          </div>
        {:else if rows.isLoading}
          <div class="h-full w-full overflow-hidden">
            <WorkspaceSkeletons type="table" cols={6} rows={14} />
          </div>
        {:else}
          <!-- TanStack Table v9 Data Grid -->
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
                    colspan={columns.length}
                    class="h-24 text-center text-muted-foreground"
                  >
                    No results found
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

      <!-- Bottom Bar: Status Info & Sidebar Toggle -->
      <div
        class="flex shrink-0 items-center justify-between border-t bg-background px-2 py-1 text-xs w-full"
      >
        <!-- Left: Sidebar toggle button -->
        <div class="flex items-center gap-1">
          {#if onToggleSidebar}
            <Button
              variant="ghost"
              size="icon"
              class="size-6 text-muted-foreground hover:text-foreground"
              title="Toggle sidebar"
              onclick={onToggleSidebar}
            >
              <PanelLeft class="size-3.5" />
            </Button>
          {/if}
        </div>

        <!-- Right: Filter chip + estimated row count + duration -->
        <div class="flex items-center gap-2">
          {#if view !== 'structure'}
            {#if filter}
              <span
                class="bg-accent text-foreground flex items-center gap-1 rounded px-1.5 py-0.5 font-mono"
                title="Filtered view"
              >
                {filter.label}
                <button
                  type="button"
                  class="hover:text-destructive"
                  title="Remove filter"
                  aria-label="Remove filter"
                  onclick={() => onOpenTable?.(schema, tableName)}
                >
                  <X class="size-3" />
                </button>
              </span>
            {/if}
            <span class={rows.isSuccess ? 'text-emerald-500' : 'text-muted-foreground'}>
              {#if rows.isLoading}
                Loading…
              {:else}
                {filter ? '' : '~'}{est.toLocaleString()} rows · {rows.data?.durationMs ?? 0}ms
              {/if}
            </span>
          {/if}
        </div>
      </div>
    </div>
  </form.AppForm>
</table.AppTable>

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
        This will permanently delete the selected record{table.getSelectedRowModel().rows.length > 1
          ? 's'
          : ''} from
        <span class="font-mono font-medium text-foreground">{schema}.{tableName}</span>. This action
        cannot be undone.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel disabled={deleteMutation.isPending}>Cancel</AlertDialog.Cancel>
      <Button
        variant="destructive"
        disabled={deleteMutation.isPending}
        onclick={confirmDelete}
        class="gap-1.5"
      >
        {#if deleteMutation.isPending}
          <Loader class="size-3.5 animate-spin" /> Deleting...
        {:else}
          <Trash2 class="size-3.5" /> Delete
        {/if}
      </Button>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
