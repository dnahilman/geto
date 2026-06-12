<script lang="ts">
  import {
    createQuery,
    createMutation,
    keepPreviousData,
    useQueryClient,
  } from '@tanstack/svelte-query'
  import type { OnChangeFn, PaginationState, SortingState } from '@tanstack/table-core'
  import { RefreshCw, ChevronLeft, ChevronRight, X } from 'lucide-svelte'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import { toast } from 'svelte-sonner'
  import { Button } from '$lib/components/ui/button'
  import { colId, parseColId } from '$lib/components/ui/data-table'
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
    onViewChange,
  }: {
    connId: string
    schema: string
    table: string
    filter?: TabFilter
    onOpenTable?: (schema: string, table: string, filter?: TabFilter) => void
    view?: 'table' | 'json' | 'structure'
    onViewChange?: (v: 'table' | 'json' | 'structure') => void
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

  const sorting = $derived.by<SortingState>(() => {
    if (!orderBy) return []
    const i = colIndex(orderBy)
    if (i < 0) return []
    return [{ id: colId(i, orderBy), desc: orderDir === 'DESC' }]
  })
  const pagination = $derived<PaginationState>({ pageIndex: page, pageSize })
  const onSortingChange: OnChangeFn<SortingState> = (updater) => {
    if (grid.dirty) return
    grid.ctx.clearSelection()
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
    grid.ctx.clearSelection()
    grid.clearExpanded()
    const next = typeof updater === 'function' ? updater(pagination) : updater
    page = next.pageIndex
  }

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
    <span class="text-muted-foreground text-xs"
      >{pk.length > 0 ? 'editable' : 'read-only'} · {schema}.{table}</span
    >
    <div class="ml-auto flex items-center gap-2">
      {#if grid.dirty}
        <span class="text-muted-foreground text-xs">unsaved changes — Apply or Cancel</span>
      {/if}
      <ExportMenu api={grid} baseName={`${schema}.${table}`} {view} {onViewChange} />
    </div>
  </DataGridToolbar>

  <div class="min-h-0 flex-1 overflow-auto">
    {#if rows.isError}
      <p class="text-destructive p-4 text-sm">{rows.error.message}</p>
    {:else if view === 'structure'}
      <ScrollArea class="h-full">
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
              <h3 class="text-muted-foreground mb-2 text-xs font-semibold uppercase">Constraints</h3>
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
      </ScrollArea>
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

  <!-- Bottom bar: info (left) · [←] pagesize [→] (right) -->
  <div class="flex shrink-0 items-center justify-between border-t px-3 py-1.5 text-xs">
    <!-- Left: filter chip + row count + duration -->
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
              onclick={() => onOpenTable?.(schema, table)}
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
        disabled={page === 0 || grid.dirty || view === 'structure'}
        onclick={() => grid.table.previousPage()}
      >
        <ChevronLeft class="size-4" />
      </Button>
      <PageSizeSelect
        value={pageSize}
        onChange={(v) => {
          grid.ctx.clearSelection()
          grid.clearExpanded()
          pageSize = v
          page = 0
        }}
      />
      <Button
        variant="ghost"
        size="icon"
        class="size-7"
        disabled={atEnd || grid.dirty || view === 'structure'}
        onclick={() => grid.table.nextPage()}
      >
        <ChevronRight class="size-4" />
      </Button>
    </div>
  </div>
</div>
