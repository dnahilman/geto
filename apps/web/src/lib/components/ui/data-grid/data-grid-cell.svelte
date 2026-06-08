<script lang="ts">
  import { getContext } from 'svelte'
  import EditableCell from './editable-cell.svelte'
  import { DATA_GRID_KEY, isDraftRow, type DataGridContext } from './data-grid-context'

  let {
    rowIndex,
    colIndex,
    value = undefined,
  }: { rowIndex: number; colIndex: number; value?: unknown } = $props()

  const ctx = getContext<DataGridContext>(DATA_GRID_KEY)
  const col = $derived(ctx.columns[colIndex])
  const isDraft = $derived(isDraftRow(rowIndex))
  const pending = $derived(ctx.cellPending(rowIndex, colIndex))
  const cellValue = $derived(pending ?? (isDraft ? '' : value))
  const editing = $derived(
    !!ctx.editingCell && ctx.editingCell.r === rowIndex && ctx.editingCell.c === colIndex,
  )
</script>

<EditableCell
  value={cellValue}
  variant={col?.variant ?? 'text'}
  options={col?.options ?? []}
  typeName={col?.typeName ?? ''}
  {editing}
  onsave={(wire) => ctx.saveCell(rowIndex, colIndex, wire)}
  oncancel={() => ctx.cancelEdit()}
/>
