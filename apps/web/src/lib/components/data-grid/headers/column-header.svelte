<script lang="ts">
  import { useGridHeaderContext } from '../hooks/use-data-grid.js'
  import { Key, ArrowUp, ArrowDown } from 'lucide-svelte'
  import { cn } from '$lib/utils.js'

  let {
    title,
    typeName,
    isPrimaryKey,
    class: className,
  }: {
    title?: string
    typeName?: string
    isPrimaryKey?: boolean
    class?: string
  } = $props()

  const header = useGridHeaderContext()
  const column = $derived(header.column)
  const meta = $derived(
    column.columnDef.meta as
      | {
          typeName?: string
          isPrimaryKey?: boolean
          inputType?: string
        }
      | undefined,
  )

  const resolvedTitle = $derived(
    title ?? (typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id),
  )
  const resolvedType = $derived(typeName ?? meta?.typeName ?? '')
  const resolvedIsPk = $derived(isPrimaryKey ?? meta?.isPrimaryKey ?? false)
  const isSorted = $derived(column.getIsSorted())
  const canSort = $derived(column.getCanSort())
</script>

<div
  class={cn(
    'relative flex h-full w-full items-center justify-between text-left px-2 select-none',
    className,
  )}
>
  {#if canSort}
    <button
      type="button"
      class="flex h-full w-full min-w-0 items-center justify-between gap-1.5 px-1 text-left hover:text-foreground focus-visible:outline-hidden"
      onclick={column.getToggleSortingHandler()}
    >
      <div class="flex min-w-0 items-center gap-1.5 overflow-hidden text-left">
        {#if resolvedIsPk}
          <Key class="size-3 shrink-0 text-amber-500 dark:text-amber-400" />
        {/if}
        <span class="truncate font-mono text-xs font-bold text-foreground">{resolvedTitle}</span>
        {#if resolvedType}
          <span class="truncate font-mono text-xs font-normal text-muted-foreground/70 lowercase">{resolvedType}</span>
        {/if}
      </div>
      {#if isSorted}
        <div class="flex shrink-0 items-center text-muted-foreground">
          {#if isSorted === 'asc'}
            <ArrowUp class="size-3 text-foreground" />
          {:else if isSorted === 'desc'}
            <ArrowDown class="size-3 text-foreground" />
          {/if}
        </div>
      {/if}
    </button>
  {:else}
    <div class="flex min-w-0 items-center gap-1.5 overflow-hidden text-left px-1">
      {#if resolvedIsPk}
        <Key class="size-3 shrink-0 text-amber-500 dark:text-amber-400" />
      {/if}
      <span class="truncate font-mono text-xs font-bold text-foreground">{resolvedTitle}</span>
      {#if resolvedType}
        <span class="truncate font-mono text-xs font-normal text-muted-foreground/70 lowercase">{resolvedType}</span>
      {/if}
    </div>
  {/if}
</div>
