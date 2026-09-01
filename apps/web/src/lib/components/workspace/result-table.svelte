<script lang="ts">
  import { createMutation, createQuery } from '@tanstack/svelte-query'
  import { toast } from 'svelte-sonner'
  import type { ColumnMeta } from '@geto/server'
  import { getCompletion, completionKey, type ResultSource } from '$lib/api/query'
  import {
    DataGrid,
    DataGridToolbar,
    JsonView,
    createDataGrid,
    variantFor,
    type GridColumn,
    type RelationsConfig,
  } from '$lib/components/data-grid'
  import { buildRelationMap, type RelationTarget } from '$lib/relations'
  import { insertRow, updateRow, deleteRow, type Row } from '$lib/api/mutations'
  import type { TabFilter } from '$lib/stores/workspace.svelte'
  import { collectRows, toCSV, toJSON, toMarkdown, downloadFile, timestamp } from '$lib/export'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import { Button } from '$lib/components/ui/button'
  import { Download, FileSpreadsheet, FileJson, FileText } from 'lucide-svelte'

  interface Props {
    connId: string
    columns: ColumnMeta[]
    rows: unknown[][]
    startIndex?: number
    source?: ResultSource | null
    view?: 'table' | 'json' | 'structure'
    onApplied?: () => void
    onOpenTable?: (schema: string, table: string, filter?: TabFilter) => void
  }

  let {
    connId,
    columns,
    rows,
    startIndex = 0,
    source = null,
    view = 'table',
    onApplied,
    onOpenTable,
  }: Props = $props()

  // FK/relation metadata (cached per connection); only used when the result maps
  // to a known base table (source != null).
  const completion = createQuery(() => ({
    queryKey: completionKey(connId),
    queryFn: () => getCompletion(connId),
    enabled: !!source,
  }))

  const relationMap = $derived(
    source && completion.data
      ? buildRelationMap(
          completion.data,
          source.schema,
          source.table,
          source.columnNames.map((n) => ({ name: n ?? '' })),
          source.primaryKey,
        )
      : null,
  )

  const relations = $derived<RelationsConfig | undefined>(
    source && onOpenTable
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
    columns.map((c, i) => {
      const real = source?.columnNames[i] ?? null
      return {
        name: real ?? c.name,
        typeName: c.typeName,
        variant: variantFor({ type: c.typeName, enumValues: null }),
        options: [],
        sortable: false,
        editable: !!source && real !== null && !source.primaryKey.includes(real),
        relation: relationMap?.[i] ?? null,
      }
    }),
  )

  function buildPk(row: unknown[], src: ResultSource): Row {
    const pk: Row = {}
    for (const name of src.primaryKey) {
      const i = src.columnNames.indexOf(name)
      if (i >= 0) pk[name] = row[i]
    }
    return pk
  }

  const update = createMutation(() => ({
    mutationFn: (v: {
      schema: string
      table: string
      pk: Row
      values: Record<string, string | null>
    }) => updateRow(connId, v.schema, v.table, v.pk, v.values),
    onError: (e: Error) => toast.error(e.message),
  }))
  const insert = createMutation(() => ({
    mutationFn: (v: { schema: string; table: string; values: Record<string, string | null> }) =>
      insertRow(connId, v.schema, v.table, v.values),
    onError: (e: Error) => toast.error(e.message),
  }))
  const remove = createMutation(() => ({
    mutationFn: (v: { schema: string; table: string; pk: Row }) =>
      deleteRow(connId, v.schema, v.table, v.pk),
    onError: (e: Error) => toast.error(e.message),
  }))

  const grid = createDataGrid<unknown[]>({
    getData: () => rows,
    getColumns: () => gridColumns,
    editable: () => !!source,
    onUpdateRow: async (r, values) => {
      if (!source) return
      await update.mutateAsync({
        schema: source.schema,
        table: source.table,
        pk: buildPk(rows[r], source),
        values,
      })
    },
    onInsertRow: async (values) => {
      if (!source) return
      await insert.mutateAsync({ schema: source.schema, table: source.table, values })
    },
    onDeleteRow: async (r) => {
      if (!source) return
      await remove.mutateAsync({
        schema: source.schema,
        table: source.table,
        pk: buildPk(rows[r], source),
      })
    },
    onApplied: (ok) => {
      if (ok) toast.success('Changes applied')
      onApplied?.()
    },
  })

  // A new query result or page replaces `rows`; selection is keyed by page-local
  // index, so drop it to avoid carrying stale highlights onto the new rows.
  $effect(() => {
    void rows
    void startIndex
    grid.ctx.clearSelection()
    grid.clearExpanded()
  })

  function exportData(format: 'csv' | 'json' | 'md') {
    const { columns: colNames, rows: rowData } = collectRows(grid)
    if (rowData.length === 0) {
      toast.warning('No data to export')
      return
    }
    const stamp = timestamp(new Date())
    const base = source ? `${source.schema}.${source.table}` : 'query-result'
    const filename = `${base}-${stamp}.${format === 'md' ? 'md' : format}`
    let content = ''
    let mime = 'text/plain'
    if (format === 'csv') {
      content = toCSV(colNames, rowData)
      mime = 'text/csv'
    } else if (format === 'json') {
      content = toJSON(colNames, rowData)
      mime = 'application/json'
    } else if (format === 'md') {
      content = toMarkdown(colNames, rowData)
      mime = 'text/markdown'
    }
    downloadFile(filename, mime, content)
    toast.success(`Exported ${rowData.length} row(s) to ${format.toUpperCase()}`)
  }
</script>

{#snippet exportDropdown()}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="ghost"
          size="icon"
          class="size-7 text-muted-foreground hover:text-foreground"
          title="Export data"
        >
          <Download class="size-3.5" />
        </Button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" class="w-48 text-xs">
      <DropdownMenu.Group>
        <DropdownMenu.GroupHeading class="text-[10px] uppercase text-muted-foreground">
          Export
        </DropdownMenu.GroupHeading>
        <DropdownMenu.Item onSelect={() => exportData('csv')} class="cursor-pointer gap-2">
          <FileSpreadsheet class="size-3.5 text-emerald-500" />
          <span>CSV</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => exportData('json')} class="cursor-pointer gap-2">
          <FileJson class="size-3.5 text-amber-500" />
          <span>JSON</span>
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => exportData('md')} class="cursor-pointer gap-2">
          <FileText class="size-3.5 text-blue-500" />
          <span>Markdown</span>
        </DropdownMenu.Item>
      </DropdownMenu.Group>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/snippet}

<div class="flex h-full flex-col">
  {#if source}
    <DataGridToolbar api={grid} editable>
      <span class="text-muted-foreground text-xs">editable · {source.schema}.{source.table}</span>
      <div class="ml-auto flex items-center gap-2">
        {#if grid.dirty}
          <span class="text-muted-foreground text-xs">unsaved changes — Apply or Cancel</span>
        {/if}
        {@render exportDropdown()}
      </div>
    </DataGridToolbar>
  {:else}
    <div class="flex items-center justify-end gap-2 border-b px-2 py-1" data-datagrid-toolbar>
      {@render exportDropdown()}
    </div>
  {/if}
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
      <JsonView
        {columns}
        {rows}
        offset={startIndex}
        {relations}
        relationMap={relationMap ?? undefined}
      />
    {:else}
      <DataGrid api={grid} offset={startIndex} emptyText="No rows returned" {relations} />
    {/if}
  </div>
</div>
