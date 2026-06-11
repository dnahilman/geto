<script lang="ts">
  import {
    createQuery,
    createMutation,
    keepPreviousData,
    useQueryClient,
  } from '@tanstack/svelte-query'
  import type { OnChangeFn, PaginationState, SortingState } from '@tanstack/table-core'
  import { RefreshCw } from 'lucide-svelte'
  import { toast } from 'svelte-sonner'
  import { Button } from '$lib/components/ui/button'
  import { DataTablePagination, colId, parseColId } from '$lib/components/ui/data-table'
  import {
    DataGrid,
    JsonView,
    DataGridToolbar,
    PageSizeSelect,
    ExportMenu,
    createDataGrid,
    variantFor,
    type GridColumn,
    type RelationsConfig,
  } from '$lib/components/ui/data-grid'
  import { X } from 'lucide-svelte'
  import { getTableRows } from '$lib/api/introspect'
  import { getTableDetail, tableDetailKey } from '$lib/api/introspect'
  import { insertRow, updateRow, deleteRow, type Row } from '$lib/api/mutations'
  import { historyKey, getCompletion, completionKey } from '$lib/api/query'
  import { buildRelationMap, type RelationTarget } from '$lib/relations'
  import type { TabFilter } from '$lib/stores/workspace.svelte'

  let {
    connId,
    schema,
    table,
    filter = undefined,
    onOpenTable,
    view = 'table',
  }: {
    connId: string
    schema: string
    table: string
    filter?: TabFilter
    onOpenTable?: (schema: string, table: string, filter?: TabFilter) => void
    view?: 'table' | 'json'
  } = $props()

  let pageSize = $state(500)
  let page = $state(0)
  let orderBy = $state<string | undefined>(undefined)
  let orderDir = $state<'ASC' | 'DESC'>('ASC')
  const qc = useQueryClient()

  const rowsKey = $derived(['table-rows', connId, schema, table, filter ?? null] as const)
  const rows = createQuery(() => ({
    queryKey: [...rowsKey, page, pageSize, orderBy, orderDir],
    queryFn: () =>
      getTableRows(connId, schema, table, {
        limit: pageSize,
        offset: page * pageSize,
        orderBy,
        orderDir,
        filter: filter ? { column: filter.column, value: filter.value } : undefined,
      }),
    placeholderData: keepPreviousData,
  }))
  const detail = createQuery(() => ({
    queryKey: tableDetailKey(connId, schema, table),
    queryFn: () => getTableDetail(connId, schema, table),
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
  const colIndex = (name: string) => cols.findIndex((c) => c.name === name)
  const colInfo = $derived(new Map((detail.data?.columns ?? []).map((c) => [c.name, c])))

  function buildPk(row: RowT): Row {
    const o: Row = {}
    for (const c of pk) o[c] = row[colIndex(c)]
    return o
  }
  function refresh() {
    qc.invalidateQueries({ queryKey: rowsKey })
  }

  // ---- relation viewer wiring ----
  const relationMap = $derived(
    completion.data
      ? buildRelationMap(
          completion.data,
          schema,
          table,
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

  // ---- normalized columns (variant + options + editability per column) ----
  const gridColumns = $derived<GridColumn[]>(
    cols.map((c, i) => {
      const info = colInfo.get(c.name)
      const variant = variantFor(info ?? { type: c.typeName, enumValues: null })
      return {
        name: c.name,
        typeName: c.typeName,
        variant,
        options: info?.enumValues ?? [],
        sortable: true,
        editable: pk.length > 0 && !pk.includes(c.name),
        relation: relationMap?.[i] ?? null,
      }
    }),
  )

  // ---- server-side sorting + pagination adapters (locked while dirty) ----
  const sorting = $derived.by<SortingState>(() => {
    if (!orderBy) return []
    const i = colIndex(orderBy)
    if (i < 0) return []
    return [{ id: colId(i, orderBy), desc: orderDir === 'DESC' }]
  })
  const pagination = $derived<PaginationState>({ pageIndex: page, pageSize })
  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    if (grid.dirty) return
    grid.ctx.clearSelection() // row selection is page/order-local — drop it on re-sort
    grid.clearExpanded()
    const next = typeof updater === 'function' ? updater(sorting) : updater
    if (next.length) {
      orderBy = parseColId(next[0].id).name
      orderDir = next[0].desc ? 'DESC' : 'ASC'
    } else {
      orderBy = undefined
    }
    page = 0
  }
  const onPaginationChange: OnChangeFn<PaginationState> = (updater) => {
    if (grid.dirty) return
    grid.ctx.clearSelection() // selection is page-local — drop it on page change
    grid.clearExpanded()
    const next = typeof updater === 'function' ? updater(pagination) : updater
    page = next.pageIndex
  }

  // ---- mutations ----
  const update = createMutation(() => ({
    mutationFn: ({ row, values }: { row: RowT; values: Record<string, string> }) =>
      updateRow(connId, schema, table, buildPk(row), values),
    onError: (e: Error) => toast.error(e.message),
  }))
  const remove = createMutation(() => ({
    mutationFn: (row: RowT) => deleteRow(connId, schema, table, buildPk(row)),
    onError: (e: Error) => toast.error(e.message),
  }))
  const insert = createMutation(() => ({
    mutationFn: (values: Record<string, string>) => insertRow(connId, schema, table, values),
    onError: (e: Error) => toast.error(e.message),
  }))

  const grid = createDataGrid<RowT>({
    getData: () => data,
    getColumns: () => gridColumns,
    editable: () => pk.length > 0,
    getSorting: () => sorting,
    onSortingChange,
    getPagination: () => pagination,
    onPaginationChange,
    onUpdateRow: (rowIndex, values) =>
      update.mutateAsync({ row: data[rowIndex], values }).then(() => {}),
    onInsertRow: (values) => insert.mutateAsync(values).then(() => {}),
    onDeleteRow: (rowIndex) => remove.mutateAsync(data[rowIndex]).then(() => {}),
    onApplied: (ok) => {
      refresh()
      qc.invalidateQueries({ queryKey: historyKey(connId) })
      if (ok) toast.success('Changes applied')
    },
  })
</script>

<div class="flex h-full flex-col">
  <DataGridToolbar api={grid} editable={pk.length > 0}>
    <Button
      size="icon"
      variant="ghost"
      class="size-7"
      title="Refresh"
      disabled={grid.dirty}
      onclick={refresh}
    >
      <RefreshCw class="size-4" />
    </Button>
    {#if pk.length === 0}
      <span class="text-muted-foreground text-xs">no primary key — read-only grid</span>
    {/if}
    <div class="ml-auto flex items-center gap-2">
      {#if grid.dirty}
        <span class="text-muted-foreground text-xs">unsaved changes — Apply or Cancel</span>
      {/if}
      <ExportMenu api={grid} baseName={`${schema}.${table}`} />
    </div>
  </DataGridToolbar>

  <div class="min-h-0 flex-1 overflow-auto">
    {#if rows.isError}
      <p class="text-destructive p-4 text-sm">{rows.error.message}</p>
    {:else if view === 'json'}
      <JsonView
        columns={cols}
        rows={data}
        offset={page * pageSize}
        {relations}
        relationMap={relationMap ?? undefined}
      />
    {:else}
      <DataGrid api={grid} offset={page * pageSize} loading={rows.isLoading} {relations} />
    {/if}
  </div>

  <div class="text-muted-foreground flex items-center gap-3 border-t px-3 py-1.5 text-xs">
    {#if filter}
      <span
        class="bg-accent text-foreground flex items-center gap-1 rounded px-1.5 py-0.5 font-mono"
        title="Filtered view"
      >
        {filter.label}
        <button
          type="button"
          class="hover:text-destructive"
          title="Remove filter (open the full table)"
          aria-label="Remove filter"
          onclick={() => onOpenTable?.(schema, table)}
        >
          <X class="size-3" />
        </button>
      </span>
    {/if}
    <span class="mr-auto">
      {filter ? '' : '~'}{est.toLocaleString()} rows{pk.length
        ? ' · double-click a cell to edit'
        : ''}
    </span>
    <PageSizeSelect
      value={pageSize}
      onChange={(v) => {
        grid.ctx.clearSelection()
        grid.clearExpanded()
        pageSize = v
        page = 0
      }}
    />
    <DataTablePagination
      table={grid.table}
      canPrevious={page > 0 && !grid.dirty}
      canNext={!atEnd && !grid.dirty}
    />
  </div>
</div>
