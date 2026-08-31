<script lang="ts">
  import * as Popover from '$lib/components/ui/popover'
  import { Input } from '$lib/components/ui/input'
  import { Button } from '$lib/components/ui/button'
  import { useGridTableContext } from '../hooks/use-data-grid'

  const table = useGridTableContext()

  const PRESETS = [500, 1000, 1500, 2000, 5000]
  const pageSize = table.atoms.pagination.get().pageSize
</script>

<div class="flex items-center gap-1">
  <Popover.Root>
    <Popover.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="outline"
          size="icon"
          class="size-7 w-full rounded-none px-2"
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
            if (e.key === 'Enter') table.setPageSize(Number((e.currentTarget as HTMLInputElement).value))
          }}
        />
      </div>
    </Popover.Content>
  </Popover.Root>
</div>
