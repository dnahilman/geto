<script lang="ts" generics="TData">
  import type { Row, Table } from '@tanstack/table-core'
  import type { Snippet } from 'svelte'
  import FlexRender from './flex-render.svelte'
  import { formatCell } from './format'

  let {
    table,
    offset = 0,
    cell,
    rowActions,
    empty,
    loading = false,
    onCellActivate,
  }: {
    table: Table<TData>
    /** Starting absolute index for the leading `#` column (e.g. page * pageSize). */
    offset?: number
    /** Optional per-cell renderer (e.g. inline editing). Defaults to {@link formatCell}. */
    cell?: Snippet<[{ value: unknown; rowIndex: number; colIndex: number; columnId: string }]>
    /** Optional trailing actions column (e.g. delete). */
    rowActions?: Snippet<[{ row: Row<TData>; rowIndex: number }]>
    /** Empty-state content when there are no rows. */
    empty?: Snippet
    /** Suppress the empty state while data is loading. */
    loading?: boolean
    /** Fired on cell double-click (e.g. to start inline editing). */
    onCellActivate?: (e: {
      value: unknown
      rowIndex: number
      colIndex: number
      columnId: string
    }) => void
  } = $props()

  const headerGroups = $derived(table.getHeaderGroups())
  const rows = $derived(table.getRowModel().rows)
  const colSpan = $derived(table.getVisibleLeafColumns().length + 1 + (rowActions ? 1 : 0))
</script>

<table class="w-full border-collapse text-left text-xs">
  <thead class="bg-muted/60 sticky top-0 z-10">
    {#each headerGroups as hg (hg.id)}
      <tr>
        <th class="text-muted-foreground border-b px-2 py-1.5 font-normal">#</th>
        {#each hg.headers as header (header.id)}
          <th class="border-b px-2 py-1.5 font-medium whitespace-nowrap">
            {#if !header.isPlaceholder}
              <FlexRender content={header.column.columnDef.header} context={header.getContext()} />
            {/if}
          </th>
        {/each}
        {#if rowActions}<th class="w-8 border-b"></th>{/if}
      </tr>
    {/each}
  </thead>
  <tbody>
    {#each rows as row (row.id)}
      <tr class="hover:bg-accent/40 group border-b">
        <td class="text-muted-foreground px-2 py-1 tabular-nums">{offset + row.index + 1}</td>
        {#each row.getVisibleCells() as c (c.id)}
          {@const value = c.getValue()}
          {@const colIndex = c.column.columnDef.meta?.colIndex ?? c.column.getIndex()}
          <td
            class="max-w-md truncate px-2 py-1 font-mono"
            title={formatCell(value).text}
            ondblclick={onCellActivate
              ? () => onCellActivate({ value, rowIndex: row.index, colIndex, columnId: c.column.id })
              : undefined}
          >
            {#if cell}
              {@render cell({ value, rowIndex: row.index, colIndex, columnId: c.column.id })}
            {:else}
              {@const d = formatCell(value)}
              <span class={d.muted ? 'text-muted-foreground italic' : ''}>{d.text}</span>
            {/if}
          </td>
        {/each}
        {#if rowActions}
          <td class="px-1">{@render rowActions({ row, rowIndex: row.index })}</td>
        {/if}
      </tr>
    {/each}
    {#if !loading && rows.length === 0}
      <tr>
        <td colspan={colSpan} class="text-muted-foreground p-4 text-center">
          {#if empty}{@render empty()}{:else}No rows{/if}
        </td>
      </tr>
    {/if}
  </tbody>
</table>
