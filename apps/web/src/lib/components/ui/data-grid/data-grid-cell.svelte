<script lang="ts">
  import { getContext } from 'svelte'
  import { ArrowUpRight, Rows3 } from 'lucide-svelte'
  import EditableCell from './editable-cell.svelte'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import { DATA_GRID_KEY, isDraftRow, type DataGridContext } from './data-grid-context'
  import type { ReverseTarget } from '$lib/relations'

  let {
    rowIndex,
    colIndex,
    value = undefined,
    relationsEnabled = false,
  }: { rowIndex: number; colIndex: number; value?: unknown; relationsEnabled?: boolean } = $props()

  const ctx = getContext<DataGridContext>(DATA_GRID_KEY)
  const col = $derived(ctx.columns[colIndex])
  const isDraft = $derived(isDraftRow(rowIndex))
  const pending = $derived(ctx.cellPending(rowIndex, colIndex))
  const cellValue = $derived(pending ?? (isDraft ? '' : value))
  const editing = $derived(
    !!ctx.editingCell && ctx.editingCell.r === rowIndex && ctx.editingCell.c === colIndex,
  )

  const relation = $derived(col?.relation ?? null)
  const showRelation = $derived(
    relationsEnabled && !editing && !isDraft && cellValue != null && relation != null,
  )

  function expandReverse(t: ReverseTarget) {
    ctx.expandRelation(rowIndex, { target: t, value: cellValue })
  }
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

{#if showRelation && relation}
  <span class="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover/cell:opacity-100">
    {#if relation.dir === 'forward'}
      <button
        type="button"
        class="bg-background/80 text-muted-foreground hover:text-foreground hover:bg-accent flex size-5 items-center justify-center rounded border"
        title={`View ${relation.target.table}`}
        aria-label={`View related ${relation.target.table}`}
        onclick={(e) => {
          e.stopPropagation()
          ctx.expandRelation(rowIndex, { target: relation.target, value: cellValue })
        }}
      >
        <ArrowUpRight class="size-3" />
      </button>
    {:else if relation.targets.length === 1}
      <button
        type="button"
        class="bg-background/80 text-muted-foreground hover:text-foreground hover:bg-accent flex size-5 items-center justify-center rounded border"
        title={`View ${relation.targets[0].table}`}
        aria-label={`View related ${relation.targets[0].table}`}
        onclick={(e) => {
          e.stopPropagation()
          expandReverse(relation.targets[0])
        }}
      >
        <Rows3 class="size-3" />
      </button>
    {:else}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              type="button"
              class="bg-background/80 text-muted-foreground hover:text-foreground hover:bg-accent flex size-5 items-center justify-center rounded border"
              title="View related rows"
              aria-label="View related rows"
              onclick={(e) => e.stopPropagation()}
            >
              <Rows3 class="size-3" />
            </button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="w-auto">
          {#each relation.targets as t (`${t.schema}.${t.table}.${t.column}`)}
            <DropdownMenu.Item onSelect={() => expandReverse(t)}>
              {t.table}.{t.column}{t.virtual ? ' (inferred)' : ''}
            </DropdownMenu.Item>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>
    {/if}
  </span>
{/if}
