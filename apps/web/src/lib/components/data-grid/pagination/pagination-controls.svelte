<script lang="ts">
  import { useGridTableContext } from '../hooks/use-data-grid.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as ButtonGroup from '$lib/components/ui/button-group/index.js'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js'
  import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left'
  import ChevronRightIcon from '@lucide/svelte/icons/chevron-right'
  import ChevronsLeftIcon from '@lucide/svelte/icons/chevrons-left'
  import ChevronsRightIcon from '@lucide/svelte/icons/chevrons-right'

  const table = useGridTableContext()
  const pagination = $derived(table.atoms.pagination.get())
  const pageSizes = [10, 50, 200, 300, 500, 1000]
</script>

<div class="flex items-center justify-between py-3 text-xs text-neutral-600 dark:text-neutral-300">
  <div class="flex items-center gap-1.5">
    <ButtonGroup.Root aria-label="Pagination controls">
      <Button
        variant="outline"
        size="icon-sm"
        onclick={() => table.firstPage()}
        disabled={!table.getCanPreviousPage()}
        title="First page"
      >
        <ChevronsLeftIcon class="size-4" />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        onclick={() => table.previousPage()}
        disabled={!table.getCanPreviousPage()}
        title="Previous page"
      >
        <ChevronLeftIcon class="size-4" />
      </Button>

      <!-- Integrated Page Indicator / Page Size Dropdown Trigger -->
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="outline"
              size="icon-sm"
              class="w-fit px-2 font-mono text-xs text-neutral-700 select-none hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
              title="Click to change page size"
            >
              {(pagination.pageIndex + 1).toLocaleString()} - {table
                .getPageCount()
                .toLocaleString()} of {table.getRowCount().toLocaleString()}
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="center" side="top" class="w-36">
          <DropdownMenu.Label class="text-[11px] font-semibold text-neutral-500">
            Rows per page
          </DropdownMenu.Label>
          <DropdownMenu.Separator />
          {#each pageSizes as size (size)}
            <DropdownMenu.CheckboxItem
              checked={pagination.pageSize === size}
              onclick={() => table.setPageSize(size)}
              class="font-mono text-xs"
            >
              {size} rows
            </DropdownMenu.CheckboxItem>
          {/each}
        </DropdownMenu.Content>
      </DropdownMenu.Root>

      <Button
        variant="outline"
        size="icon-sm"
        onclick={() => table.nextPage()}
        disabled={!table.getCanNextPage()}
        title="Next page"
      >
        <ChevronRightIcon class="size-4" />
      </Button>
      <Button
        variant="outline"
        size="icon-sm"
        onclick={() => table.lastPage()}
        disabled={!table.getCanNextPage()}
        title="Last page"
      >
        <ChevronsRightIcon class="size-4" />
      </Button>
    </ButtonGroup.Root>
  </div>
</div>
