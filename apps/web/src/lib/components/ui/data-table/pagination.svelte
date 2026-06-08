<script lang="ts" generics="TData">
  import type { Table } from '@tanstack/table-core'
  import { ChevronLeft, ChevronRight } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'

  let {
    table,
    canPrevious,
    canNext,
  }: {
    table: Table<TData>
    // Server-side grids know the real bounds (e.g. `data.length < PAGE`) better
    // than an estimated row count, so allow overriding the table's own guess.
    canPrevious?: boolean
    canNext?: boolean
  } = $props()

  const pageIndex = $derived(table.getState().pagination.pageIndex)
  const prevOk = $derived(canPrevious ?? table.getCanPreviousPage())
  const nextOk = $derived(canNext ?? table.getCanNextPage())
</script>

<div class="flex items-center gap-2">
  <span>page {pageIndex + 1}</span>
  <Button
    variant="outline"
    size="icon"
    class="size-7"
    disabled={!prevOk}
    onclick={() => table.previousPage()}
  >
    <ChevronLeft class="size-4" />
  </Button>
  <Button
    variant="outline"
    size="icon"
    class="size-7"
    disabled={!nextOk}
    onclick={() => table.nextPage()}
  >
    <ChevronRight class="size-4" />
  </Button>
</div>
