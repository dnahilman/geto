<script lang="ts">
  import * as Popover from '$lib/components/ui/popover'
  import { Input } from '$lib/components/ui/input'
  import { Button } from '$lib/components/ui/button'
  import { useGridTableContext } from '../hooks/use-data-grid'
  import { ButtonGroup } from '$lib/components/ui/button-group'
  import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-svelte'

  const table = useGridTableContext()

  const PRESETS = [50, 250, 500, 1000, 5000]
  const pageSize = table.atoms.pagination.get().pageSize
</script>

    
<ButtonGroup>
  <Button
    variant="outline"
    class="size-7 p-0"
    onclick={() => table.previousPage()}
    disabled={!table.getCanPreviousPage()}
  >
    <span class="sr-only">Go to previous page</span>
    <ChevronLeftIcon />
  </Button>
  <Popover.Root>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="outline"
          size="icon"
          class="size-7 w-fit rounded-none px-2"
          aria-label="More Options"
        >
          {table.atoms.pagination.get().pageIndex + 1}
          -
          {pageSize} of
          {table.getPageCount()}
        </Button>
      {/snippet}
    </Popover.Trigger>
    <Popover.Content class="w-28 p-1" align="end">
      {#each PRESETS as p (p)}
        <button
          class="hover:bg-accent flex w-full rounded px-2 py-1 text-left font-mono {p === pageSize
            ? 'bg-accent'
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
          class="h-7 font-mono"
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
    variant="outline"
    class="size-7 p-0"
    onclick={() => table.nextPage()}
    disabled={!table.getCanNextPage()}
  >
    <span class="sr-only">Go to next page</span>
    <ChevronRightIcon />
  </Button>
</ButtonGroup>

