<script lang="ts" generics="RowT">
  import { setContext } from 'svelte'
  import { toast } from 'svelte-sonner'
  import { FlexRender, DataTablePagination, formatCell } from '$lib/components/ui/data-table'
  import { copyText } from '$lib/clipboard'
  import { collectRows } from '$lib/export'
  import DataGridCell from './data-grid-cell.svelte'
  import RelationPanel from './relation-panel.svelte'
  import {
    DATA_GRID_KEY,
    draftRowIndex,
    type DataGridApi,
    type RelationsConfig,
  } from './data-grid-context'

  let {
    api,
    offset = 0,
    loading = false,
    showPagination = false,
    canPrevious = undefined,
    canNext = undefined,
    emptyText = 'No rows',
    relations = undefined,
  }: {
    api: DataGridApi<RowT>
    offset?: number
    loading?: boolean
    showPagination?: boolean
    canPrevious?: boolean
    canNext?: boolean
    emptyText?: string
    relations?: RelationsConfig
  } = $props()

  // api is a stable, single-instance object; ctx exposes live state via getters.
  // svelte-ignore state_referenced_locally
  setContext(DATA_GRID_KEY, api.ctx)

  let rootEl = $state<HTMLElement>()

  // Width of the nearest horizontally-scrolling ancestor (the grid's viewport).
  // Expanded relation panels are sized to this so they stay pinned to the left
  // and own their horizontal scroll instead of riding the parent table's width.
  let viewportWidth = $state(0)
  $effect(() => {
    if (!rootEl) return
    let el: HTMLElement | null = rootEl.parentElement
    while (el) {
      const ox = getComputedStyle(el).overflowX
      if (ox === 'auto' || ox === 'scroll') break
      el = el.parentElement
    }
    if (!el) return
    const scroller = el
    const update = () => (viewportWidth = scroller.clientWidth)
    const ro = new ResizeObserver(update)
    ro.observe(scroller)
    update()
    return () => ro.disconnect()
  })

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
    copyText(text)
      .then(() => toast.success('Copied to clipboard'))
      .catch((e) => toast.error((e as Error).message))
  }

  // Copy the selected rows as TSV with a leading header row (pastes into spreadsheets).
  // Shares `collectRows` with file export so the two never diverge.
  function copyRows() {
    const { columns, rows: picked } = collectRows(api)
    if (!picked.length) return
    const header = columns.join('\t')
    const body = picked.map((r) => r.map((v) => formatCell(v).text).join('\t'))
    copyText([header, ...body].join('\n'))
      .then(() => toast.success(`Copied ${picked.length} row${picked.length === 1 ? '' : 's'}`))
      .catch((e) => toast.error((e as Error).message))
  }

  // Click outside the grid (and outside portalled editors / the toolbar) unfocuses.
  $effect(() => {
    function onDown(e: PointerEvent) {
      if (api.ctx.editingCell) return
      const t = e.target as Element | null
      if (!t || rootEl?.contains(t)) return
      if (
        t.closest(
          '[data-datagrid-toolbar],[data-slot="popover-content"],[data-slot="select-content"],[data-slot="dropdown-menu-content"],[role="dialog"],[role="listbox"]',
        )
      )
        return
      api.ctx.unfocus()
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  })

  // Ctrl/Cmd+C copies the selected rows (with header) if any, else the focused cell.
  $effect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 'c') return
      if (api.ctx.editingCell) return
      if (window.getSelection()?.toString()) return // let native text copy win
      const hasRows = Object.keys(api.ctx.selectedRows).length > 0
      if (!hasRows && !api.ctx.focusedCell) return
      e.preventDefault()
      if (hasRows) copyRows()
      else copyFocused()
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
          <th class="text-muted-foreground bg-muted sticky top-0 border-b px-2 py-1.5 font-normal"
            >#</th
          >
          {#each hg.headers as header (header.id)}
            <th class="bg-muted sticky top-0 border-b px-2 py-1.5 font-medium whitespace-nowrap">
              {#if !header.isPlaceholder}
                <FlexRender
                  content={header.column.columnDef.header}
                  context={header.getContext()}
                />
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
        {@const rowSelected = api.ctx.isRowSelected(row.index)}
        <tr
          class="hover:bg-accent/40 border-b {rowFocused ? 'bg-accent/40' : ''} {rowSelected
            ? 'bg-primary/15'
            : ''} {deleted ? 'text-muted-foreground line-through opacity-60' : ''}"
        >
          <td
            class="cursor-pointer px-2 py-1 text-right tabular-nums select-none {rowSelected
              ? 'bg-primary/20 text-foreground'
              : 'text-muted-foreground hover:bg-accent/60'}"
            onclick={(e) =>
              api.ctx.selectRow(
                row.index,
                e.shiftKey ? 'range' : e.ctrlKey || e.metaKey ? 'toggle' : 'replace',
              )}
          >
            {offset + row.index + 1}
          </td>
          {#each row.getVisibleCells() as c (c.id)}
            {@const colIndex = c.column.columnDef.meta?.colIndex ?? c.column.getIndex()}
            {@const value = c.getValue()}
            {@const dirty = api.ctx.cellPending(row.index, colIndex) !== undefined}
            <td
              class="group/cell relative max-w-md truncate px-2 py-1 font-mono {dirty
                ? 'bg-amber-400/15'
                : isFocusedCell(row.index, colIndex)
                  ? 'bg-accent'
                  : ''}"
              title={formatCell(value).text}
              onclick={(e) => {
                // Modifier-click selects the row (spreadsheet behavior); a plain
                // click focuses the cell. The row-number column does the same.
                if (e.shiftKey) api.ctx.selectRow(row.index, 'range')
                else if (e.ctrlKey || e.metaKey) api.ctx.selectRow(row.index, 'toggle')
                else api.ctx.focusCell(row.index, colIndex)
              }}
              ondblclick={() => api.ctx.startEdit(row.index, colIndex)}
            >
              <DataGridCell
                rowIndex={row.index}
                {colIndex}
                {value}
                relationsEnabled={!!relations}
              />
            </td>
          {/each}
        </tr>
        {#if relations}
          {@const exp = api.ctx.expandedFor(row.index)}
          {#if exp}
            <tr class="bg-muted/40 border-b">
              <td colspan={colSpan} class="p-0">
                <div
                  class="sticky left-0 py-2 pr-2 pl-6"
                  style={viewportWidth ? `width:${viewportWidth}px` : ''}
                >
                  <RelationPanel
                    connId={relations.connId}
                    expansion={exp}
                    onOpenInTab={() => relations.openInTab(exp.target, exp.value)}
                    onCollapse={() => api.ctx.collapseRelation(row.index)}
                  />
                </div>
              </td>
            </tr>
          {/if}
        {/if}
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
