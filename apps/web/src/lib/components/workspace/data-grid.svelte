<script lang="ts">
  import type { Snippet } from 'svelte'
  import {
    createGridForm,
    createAppGridColumnHelper,
    createAppGridTable,
    mapSqlRowsToDynamicRows,
    mapDbToDataType,
    copyGridToClipboard,
    getCellClassName,
    type DynamicRow,
  } from '$lib/components/data-grid'
  import * as Table from '$lib/components/ui/table/index.js'
  import { Button } from '$lib/components/ui/button'
  import { toast } from 'svelte-sonner'
  import { ChevronLeft, ChevronRight, X, RefreshCw, RotateCcw, Check, Loader2 } from 'lucide-svelte'
  import {
    createQuery,
    createMutation,
    keepPreviousData,
    useQueryClient,
  } from '@tanstack/svelte-query'
  import {
    renderComponent,
    createTableState,
    type ColumnSizingState,
    type PaginationState,
    type SortingState,
    type RowSelectionState,
    type Updater,
    type OnChangeFn,
  } from '@tanstack/svelte-table'
  import { setContext, untrack } from 'svelte'
  import {
    PageSizeSelect,
    JsonView,
    ExportMenu,
    variantFor,
    type RelationsConfig,
    type GridColumn,
    type DataGridApi,
  } from '$lib/components/ui/data-grid'
  import { getTableRows, getTableDetail, tableDetailKey } from '$lib/api/introspect'
  import { updateRow, type Row } from '$lib/api/mutations'
  import { historyKey, getCompletion, completionKey } from '$lib/api/query'
  import { buildRelationMap, type RelationTarget } from '$lib/relations'
  import type { TabFilter } from '$lib/stores/workspace.svelte'

  let {
    connId,
    schema,
    table: tableName,
    filter = undefined,
    isActive = false,
    onOpenTable,
    view = 'table',
    onViewChange,
    toolbar = $bindable(null),
  }: {
    connId: string
    schema: string
    table: string
    filter?: TabFilter
    isActive?: boolean
    onOpenTable?: (schema: string, table: string, filter?: TabFilter) => void
    view?: 'table' | 'json' | 'structure'
    onViewChange?: (v: 'table' | 'json' | 'structure') => void
    toolbar?: Snippet | null
  } = $props()

  // 1. Pagination & Query States
  let pageSize = $state(500)
  let page = $state(0)
  let orderBy = $state<string | undefined>(undefined)
  let orderDir = $state<'ASC' | 'DESC'>('ASC')
  const qc = useQueryClient()

  const rowsKey = $derived(['table-rows', connId, schema, tableName, filter ?? null] as const)
  const rows = createQuery(() => ({
    queryKey: [...rowsKey, page, pageSize, orderBy, orderDir],
    queryFn: () =>
      getTableRows(connId, schema, tableName, {
        limit: pageSize,
        offset: page * pageSize,
        orderBy,
        orderDir,
        filter: filter ? { column: filter.column, value: filter.value } : undefined,
      }),
    placeholderData: keepPreviousData,
  }))
  const detail = createQuery(() => ({
    queryKey: tableDetailKey(connId, schema, tableName),
    queryFn: () => getTableDetail(connId, schema, tableName),
  }))
  const completion = createQuery(() => ({
    queryKey: completionKey(connId),
    queryFn: () => getCompletion(connId),
  }))

  type RowT = unknown[]
  const cols = $derived(rows.data?.result.columns ?? [])
  const data = $derived<RowT[]>(rows.data?.result.rows ?? [])
  const est = $derived(rows.data?.estimatedRows ?? 0)
  const atEnd = $derived(data.length < pageSize)
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

  // 3. Dynamic Rows & Form with In-Place Save
  const tableData = $derived(mapSqlRowsToDynamicRows(cols, data, pk))

  const updateMutation = createMutation(() => ({
    mutationFn: ({ pkRow, values }: { pkRow: Row; values: Record<string, string | null> }) =>
      updateRow(connId, schema, tableName, pkRow, values),
    onError: (e: Error) => toast.error(e.message),
  }))

  const form = createGridForm(() => ({
    defaultValues: { data: tableData },
    onSubmit: async ({ value }: { value: { data: DynamicRow[] } }) => {
      if (!value.data || value.data.length === 0) return
      try {
        let updatedCount = 0
        const updates: Promise<unknown>[] = []

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
            updates.push(updateMutation.mutateAsync({ pkRow, values: changedValues }))
            updatedCount++
          }
        }

        if (updates.length > 0) {
          await Promise.all(updates)
          refresh()
          qc.invalidateQueries({ queryKey: historyKey(connId) })
          toast.success(`Saved ${updatedCount} modified row(s)`)
        }
        form.reset({ data: value.data })
      } catch (err) {
        console.error('Failed to save table changes:', err)
      }
    },
  }))

  setContext('gridForm', form)

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
        cell: ({ cell }) => renderComponent(cell.GridCell),
      })
    })

    return columnHelper.columns([selectCol, ...dbCols])
  })

  // 5. Table State & Instance
  const [columnSizing, setColumnSizing] = createTableState<ColumnSizingState>({})
  const [rowSelection, setRowSelection] = createTableState<RowSelectionState>({})

  const sorting = $derived.by<SortingState>(() => {
    if (!orderBy) return []
    return [{ id: orderBy, desc: orderDir === 'DESC' }]
  })

  const pagination = $derived<PaginationState>({
    pageIndex: page,
    pageSize,
  })

  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    if (form.state.isDirty) return
    table.resetCellSelection(true)
    const next = typeof updater === 'function' ? updater(sorting) : updater
    if (next.length) {
      orderBy = next[0].id
      orderDir = next[0].desc ? 'DESC' : 'ASC'
    } else {
      orderBy = undefined
    }
    page = 0
  }

  const onPaginationChange: OnChangeFn<PaginationState> = (updater) => {
    if (form.state.isDirty) return
    table.resetCellSelection(true)
    const next = typeof updater === 'function' ? updater(pagination) : updater
    page = next.pageIndex
  }

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
    get pageCount() {
      return Math.ceil(est / pageSize) || 1
    },
    state: {
      get columnSizing() {
        return columnSizing()
      },
      get rowSelection() {
        return rowSelection()
      },
      get sorting() {
        return sorting
      },
      get pagination() {
        return pagination
      },
    },
    onColumnSizingChange: (updater: Updater<ColumnSizingState>) => setColumnSizing(updater),
    onRowSelectionChange: (updater: Updater<RowSelectionState>) => setRowSelection(updater),
    onSortingChange,
    onPaginationChange,
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

  // Export Adapter
  const exportGridColumns = $derived<GridColumn[]>(
    cols.map((c) => ({
      name: c.name,
      typeName: c.typeName,
      variant: variantFor({ type: c.typeName, enumValues: null }),
      options: colInfo.get(c.name)?.enumValues ?? [],
      sortable: true,
      editable: isEditable && !pk.includes(c.name),
      relation: null,
    })),
  )

  const exportApi = $derived<DataGridApi>({
    table: {
      getRowModel: () => {
        const rows = (form.state.values as { data?: DynamicRow[] })?.data ?? tableData
        return {
          rows: rows.map((r, idx) => ({
            index: idx,
            original: cols.map((c) => r[c.name]),
          })),
        }
      },
    } as any,
    ctx: {
      columns: exportGridColumns,
      selectedRows: Object.keys(rowSelection()).reduce<Record<number, true>>((acc, key) => {
        acc[Number(key)] = true
        return acc
      }, {}),
      cellPending: () => undefined,
    } as any,
    dirty: form.state.isDirty,
    addRow: () => {},
    applyChanges: async () => {},
    cancelChanges: () => {},
    clearExpanded: () => {},
  })

  $effect(() => {
    if (isActive) {
      toolbar = toolbarSnippet
      return () => {
        toolbar = null
      }
    }
  })
</script>

<svelte:window onkeydown={handleKeyDown} />

{#snippet toolbarSnippet()}
  <div class="flex items-center gap-1">
    <Button
      size="icon"
      variant="ghost"
      class="size-7 text-muted-foreground hover:text-foreground"
      title="Refresh table"
      disabled={form.state.isDirty}
      onclick={refresh}
    >
      <RefreshCw class="size-3.5" />
    </Button>

    <form.Subscribe
      selector={(state) => ({ isDirty: state.isDirty, isSubmitting: state.isSubmitting })}
    >
      {#snippet children({ isDirty, isSubmitting })}
        {#if isDirty}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            class="size-7 text-muted-foreground hover:text-destructive"
            title="Discard changes"
            disabled={isSubmitting}
            onclick={() => form.reset()}
          >
            <RotateCcw class="size-3.5" />
          </Button>
          <Button
            type="button"
            size="icon"
            class="size-7 bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
            title="Save changes"
            disabled={isSubmitting}
            onclick={() => form.handleSubmit()}
          >
            {#if isSubmitting}
              <Loader2 class="size-3.5 animate-spin" />
            {:else}
              <Check class="size-3.5" />
            {/if}
          </Button>
        {/if}
      {/snippet}
    </form.Subscribe>

    <ExportMenu api={exportApi} baseName={`${schema}.${tableName}`} {view} {onViewChange} />
  </div>
{/snippet}

<div class="flex h-full flex-col">
  <!-- Main View Area -->
  <div class="min-h-0 flex-1 overflow-hidden">
    {#if rows.isError}
      <p class="text-destructive p-4 text-sm">{rows.error.message}</p>
    {:else if view === 'structure'}
      <div class="h-full w-full overflow-auto">
        <div class="space-y-6 p-4 text-sm">
          {#if detail.data}
            <section>
              <h3 class="text-muted-foreground mb-2 text-xs font-semibold uppercase">Columns</h3>
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
              <h3 class="text-muted-foreground mb-2 text-xs font-semibold uppercase">Indexes</h3>
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
            <p class="text-muted-foreground text-xs">Loading…</p>
          {/if}
        </div>
      </div>
    {:else if view === 'json'}
      <div class="h-full w-full overflow-auto">
        <JsonView
          columns={cols}
          rows={data}
          offset={page * pageSize}
          {relations}
          relationMap={relationMap ?? undefined}
        />
      </div>
    {:else}
      <!-- TanStack Table v9 Data Grid -->
      <table.AppTable>
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
            {#if rows.isLoading}
              <Table.Row>
                <Table.Cell colspan={columns.length} class="h-24 text-center text-muted-foreground">
                  Loading data…
                </Table.Cell>
              </Table.Row>
            {:else if tableRows.length === 0}
              <Table.Row>
                <Table.Cell colspan={columns.length} class="h-24 text-center text-muted-foreground">
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
      </table.AppTable>
    {/if}
  </div>

  <!-- Bottom Bar: Status Info & Server Pagination -->
  <div
    class="flex shrink-0 items-center justify-between border-t bg-background px-3 py-1 text-xs w-full"
  >
    <!-- Left: Filter chip + estimated row count + duration -->
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

    <!-- Right: [←] page-size [→] -->
    <div class="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        class="size-7"
        disabled={page === 0 || form.state.isDirty || view === 'structure'}
        onclick={() => table.previousPage()}
      >
        <ChevronLeft class="size-4" />
      </Button>
      <PageSizeSelect
        value={pageSize}
        onChange={(v) => {
          table.resetCellSelection(true)
          pageSize = v
          page = 0
        }}
      />
      <Button
        variant="ghost"
        size="icon"
        class="size-7"
        disabled={atEnd || form.state.isDirty || view === 'structure'}
        onclick={() => table.nextPage()}
      >
        <ChevronRight class="size-4" />
      </Button>
    </div>
  </div>
</div>
