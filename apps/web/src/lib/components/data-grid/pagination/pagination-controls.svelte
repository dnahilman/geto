<script lang="ts">
  import * as Popover from '$lib/components/ui/popover'
  import { Input } from '$lib/components/ui/input'
  import { Button } from '$lib/components/ui/button'
  import { useGridTableContext } from '../hooks/use-data-grid.js'
  import { ButtonGroup } from '$lib/components/ui/button-group'
  import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-svelte'

  const table = useGridTableContext()

  const PRESETS = [50, 250, 500, 1000, 5000]
  const pagination = $derived(table.atoms.pagination.get())
  const pageIndex = $derived(pagination.pageIndex)
  const pageSize = $derived(pagination.pageSize)
  const pageCount = $derived(table.getPageCount())
</script>

<ButtonGroup>
  <Button
    variant="ghost"
    class="size-7 p-0"
    onclick={() => table.previousPage()}
    disabled={!table.getCanPreviousPage()}
  >
    <span class="sr-only">Go to previous page</span>
    <ChevronLeftIcon class="size-4" />
  </Button>
  <Popover.Root>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="ghost"
          size="sm"
          class="h-7 w-fit rounded-none px-2 font-mono text-xs"
          aria-label="More Options"
        >
          {pageIndex + 1} - {pageSize} of {pageCount}
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-28 p-1" align="end">
      {#each PRESETS as p (p)}
        <button
          type="button"
          class="hover:bg-accent flex w-full rounded px-2 py-1 text-left font-mono text-xs {p ===
          pageSize
            ? 'bg-accent font-semibold'
            : ''}"
          onclick={() => table.setPageSize(Number(p))}
        >
          {p}
        </button>
      {/each}
      <div class="mt-1 border-t pt-1">
        <Input
          type="number"
          min="1"
          max="10_000"
          value={pageSize}
          class="h-7 font-mono text-xs"
          onchange={(e) => table.setPageSize(Number((e.currentTarget as HTMLInputElement).value))}
          onkeydown={(e) => {
            if (e.key === 'Enter')
              table.setPageSize(Number((e.currentTarget as HTMLInputElement).value))
          }}
        />
      </div>
    </Popover.Content>
  </Popover.Root>
  <Button
    variant="ghost"
    class="size-7 p-0"
    onclick={() => table.nextPage()}
    disabled={!table.getCanNextPage()}
  >
    <span class="sr-only">Go to next page</span>
    <ChevronRightIcon class="size-4" />
  </Button>
</ButtonGroup>
