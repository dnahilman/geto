<script lang="ts" generics="RowT">
  import { setContext } from 'svelte'
  import { toast } from 'svelte-sonner'
  import { FlexRender, DataTablePagination, formatCell } from '$lib/components/ui/data-table'
  import DataGridCell from './data-grid-cell.svelte'
  import {
    DATA_GRID_KEY,
    draftRowIndex,
    type DataGridApi,
  } from './data-grid-context'

  let {
    api,
    offset = 0,
    loading = false,
    showPagination = false,
    canPrevious = undefined,
    canNext = undefined,
    emptyText = 'No rows',
  }: {
    api: DataGridApi<RowT>
    offset?: number
    loading?: boolean
    showPagination?: boolean
    canPrevious?: boolean
    canNext?: boolean
    emptyText?: string
  } = $props()

  // api is a stable, single-instance object; ctx exposes live state via getters.
  // svelte-ignore state_referenced_locally
  setContext(DATA_GRID_KEY, api.ctx)

  let rootEl = $state<HTMLElement>()

  const headerGroups = $derived.by(() => api.table.getHeaderGroups())
  const rows = $derived.by(() => api.table.getRowModel().rows)
  const colSpan = $derived.by(() => api.table.getVisibleLeafColumns().length + 1)

  const isFocusedCell = (r: number, c: number) =>
    !!api.ctx.focusedCell && api.ctx.focusedCell.r === r && api.ctx.focusedCell.c === c

  // The displayed text of the focused cell (pending edit, draft, or server value).
  function focusedText(): string | null {
    const f = api.ctx.focusedCell
    if (!f) return null
    const pending = api.ctx.cellPending(f.r, f.c)
    if (pending !== undefined) return pending
    if (f.r < 0) return ''
    const row = rows.find((r) => r.index === f.r)
    return row ? formatCell((row.original as unknown[])[f.c]).text : null
  }

  function copyFocused() {
    const text = focusedText()
    if (text == null) return
    navigator.clipboard
      ?.writeText(text)
      .then(() => toast.success('Copied to clipboard'))
      .catch(() => {})
  }

  // Click outside the grid (and outside portalled editors / the toolbar) unfocuses.
  $effect(() => {
    function onDown(e: PointerEvent) {
      if (api.ctx.editingCell) return
      const t = e.target as Element | null
      if (!t || rootEl?.contains(t)) return
      if (
        t.closest(
          '[data-datagrid-toolbar],[data-slot="popover-content"],[data-slot="select-content"],[role="dialog"],[role="listbox"]',
        )
      )
        return
      api.ctx.unfocus()
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  })

  // Ctrl/Cmd+C copies the focused cell's value (unless editing or text is selected).
  $effect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'c') return
      if (api.ctx.editingCell || !api.ctx.focusedCell) return
      if (window.getSelection()?.toString()) return
      e.preventDefault()
      copyFocused()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
</script>

<div bind:this={rootEl}>
  <table class="w-full border-collapse text-left text-xs">
    <thead class="bg-muted sticky top-0 z-10">
      {#each headerGroups as hg (hg.id)}
        <tr>
          <th class="text-muted-foreground bg-muted sticky top-0 border-b px-2 py-1.5 font-normal">#</th>
          {#each hg.headers as header (header.id)}
            <th class="bg-muted sticky top-0 border-b px-2 py-1.5 font-medium whitespace-nowrap">
              {#if !header.isPlaceholder}
                <FlexRender content={header.column.columnDef.header} context={header.getContext()} />
              {/if}
            </th>
          {/each}
        </tr>
      {/each}
    </thead>
    <tbody>
      {#each api.ctx.newRows as _row, i (i)}
        {@const r = draftRowIndex(i)}
        <tr class="bg-primary/5 border-b">
          <td class="text-primary px-2 py-1">+</td>
          {#each api.ctx.columns as _col, c (c)}
            <td
              class="max-w-md truncate px-2 py-1 font-mono {isFocusedCell(r, c) ? 'bg-accent' : ''}"
              onclick={() => api.ctx.focusCell(r, c)}
              ondblclick={() => api.ctx.startEdit(r, c)}
            >
              <DataGridCell rowIndex={r} colIndex={c} />
            </td>
          {/each}
        </tr>
      {/each}
      {#each rows as row (row.id)}
        {@const deleted = api.ctx.isDeleted(row.index)}
        {@const rowFocused = api.ctx.focusedCell?.r === row.index}
        <tr
          class="hover:bg-accent/40 border-b {rowFocused ? 'bg-accent/40' : ''} {deleted
            ? 'text-muted-foreground line-through opacity-60'
            : ''}"
        >
          <td class="text-muted-foreground px-2 py-1 tabular-nums">{offset + row.index + 1}</td>
          {#each row.getVisibleCells() as c (c.id)}
            {@const colIndex = c.column.columnDef.meta?.colIndex ?? c.column.getIndex()}
            {@const value = c.getValue()}
            {@const dirty = api.ctx.cellPending(row.index, colIndex) !== undefined}
            <td
              class="max-w-md truncate px-2 py-1 font-mono {dirty
                ? 'bg-amber-400/15'
                : isFocusedCell(row.index, colIndex)
                  ? 'bg-accent'
                  : ''}"
              title={formatCell(value).text}
              onclick={() => api.ctx.focusCell(row.index, colIndex)}
              ondblclick={() => api.ctx.startEdit(row.index, colIndex)}
            >
              <DataGridCell rowIndex={row.index} {colIndex} {value} />
            </td>
          {/each}
        </tr>
      {/each}
      {#if !loading && rows.length === 0 && api.ctx.newRows.length === 0}
        <tr>
          <td colspan={colSpan} class="text-muted-foreground p-4 text-center">{emptyText}</td>
        </tr>
      {/if}
    </tbody>
  </table>
</div>

{#if showPagination}
  <div class="text-muted-foreground flex items-center justify-end border-t px-3 py-1.5 text-xs">
    <DataTablePagination table={api.table} {canPrevious} {canNext} />
  </div>
{/if}
