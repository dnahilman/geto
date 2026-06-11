<script lang="ts">
  import { createQuery, keepPreviousData } from '@tanstack/svelte-query'
  import {
    X,
    RefreshCw,
    ExternalLink,
    ChevronLeft,
    ChevronRight,
    CornerDownRight,
    Table2,
    Braces,
  } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import { getRelatedRows } from '$lib/api/introspect'
  import DataGrid from './data-grid.svelte'
  import JsonView from './json-view.svelte'
  import { createDataGrid } from './create-data-grid.svelte.js'
  import { variantFor } from './cell-variant'
  import type { GridColumn, ExpandedRelation } from './data-grid-context'

  let {
    connId,
    expansion,
    onOpenInTab,
    onCollapse,
    initialView = 'table',
  }: {
    connId: string
    expansion: ExpandedRelation
    onOpenInTab: () => void
    onCollapse: () => void
    initialView?: 'table' | 'json'
  } = $props()

  const target = $derived(expansion.target)
  const valueStr = $derived(String(expansion.value))
  const PAGE = 50
  let page = $state(0)
  // svelte-ignore state_referenced_locally
  let view = $state<'table' | 'json'>(initialView)

  const q = createQuery(() => ({
    queryKey: ['relation-rows', connId, target.schema, target.table, target.column, valueStr, page],
    queryFn: () =>
      getRelatedRows(
        connId,
        target.schema,
        target.table,
        target.column,
        valueStr,
        PAGE,
        page * PAGE,
      ),
    placeholderData: keepPreviousData,
  }))

  const cols = $derived(q.data?.result.columns ?? [])
  const data = $derived<unknown[][]>(q.data?.result.rows ?? [])
  const est = $derived(q.data?.estimatedRows ?? 0)

  // Read-only: no PK threading, every column non-editable.
  const gridColumns = $derived<GridColumn[]>(
    cols.map((c) => ({
      name: c.name,
      typeName: c.typeName,
      variant: variantFor({ type: c.typeName, enumValues: null }),
      options: [],
      sortable: false,
      editable: false,
    })),
  )

  const grid = createDataGrid<unknown[]>({
    getData: () => data,
    getColumns: () => gridColumns,
    editable: () => false,
  })
</script>

<div class="bg-card flex flex-col overflow-hidden rounded-r-md shadow-sm">
  <div
    class="bg-primary/10 border-primary/20 flex items-center gap-2 border-b px-2.5 py-1.5 text-xs"
  >
    <CornerDownRight class="text-primary size-4 shrink-0" />
    <span
      class="bg-primary/15 text-primary rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
    >
      Relation
    </span>
    <span class="font-mono font-medium">{target.table}</span>
    <span class="text-muted-foreground font-mono">{target.column} = {valueStr}</span>
    <span class="text-muted-foreground">
      · {est.toLocaleString()} row{est === 1 ? '' : 's'}{target.virtual ? ' · inferred' : ''}
    </span>
    <div class="ml-auto flex items-center gap-2">
      <div class="bg-muted/60 text-muted-foreground flex items-center rounded-md p-0.5">
        <button
          type="button"
          title="Table view"
          aria-label="Table view"
          class="flex size-6 items-center justify-center rounded {view === 'table'
            ? 'bg-background text-foreground shadow-sm'
            : 'hover:text-foreground'}"
          onclick={() => (view = 'table')}
        >
          <Table2 class="size-3.5" />
        </button>
        <button
          type="button"
          title="JSON view"
          aria-label="JSON view"
          class="flex size-6 items-center justify-center rounded {view === 'json'
            ? 'bg-background text-foreground shadow-sm'
            : 'hover:text-foreground'}"
          onclick={() => (view = 'json')}
        >
          <Braces class="size-3.5" />
        </button>
      </div>
      <Button size="icon-xs" variant="ghost" title="Refresh" onclick={() => q.refetch()}>
        <RefreshCw class="size-3.5" />
      </Button>
      <Button size="xs" variant="outline" onclick={onOpenInTab}>
        <ExternalLink class="size-3.5" /> Open in tab
      </Button>
      <Button size="icon-xs" variant="ghost" title="Collapse" onclick={onCollapse}>
        <X class="size-3.5" />
      </Button>
    </div>
  </div>

  <div class="max-h-72 overflow-auto">
    {#if q.isError}
      <p class="text-destructive p-2 text-xs">{(q.error as Error).message}</p>
    {:else if !q.isLoading && data.length === 0}
      <p class="text-muted-foreground p-2 text-xs">No related rows.</p>
    {:else if view === 'json'}
      <JsonView columns={cols} rows={data} offset={page * PAGE} />
    {:else}
      <DataGrid api={grid} offset={page * PAGE} loading={q.isLoading} emptyText="No related rows" />
    {/if}
  </div>

  {#if est > PAGE}
    <div
      class="text-muted-foreground flex items-center justify-end gap-2 border-t px-2 py-1 text-xs"
    >
      <span>{page * PAGE + 1}–{page * PAGE + data.length} of {est.toLocaleString()}</span>
      <Button
        size="icon-xs"
        variant="ghost"
        disabled={page === 0}
        onclick={() => (page = Math.max(0, page - 1))}
      >
        <ChevronLeft class="size-3.5" />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        disabled={(page + 1) * PAGE >= est}
        onclick={() => (page += 1)}
      >
        <ChevronRight class="size-3.5" />
      </Button>
    </div>
  {/if}
</div>
