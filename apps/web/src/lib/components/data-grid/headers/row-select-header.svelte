<script lang="ts">
  import { Checkbox } from '$lib/components/ui/checkbox/index.js'
  import { useGridHeaderContext } from '../hooks/use-data-grid.js'

  const { table } = useGridHeaderContext()
</script>

<div class="flex h-full w-full items-center justify-center px-2.5">
  <Checkbox
    checked={table.getIsAllPageRowsSelected()}
    onCheckedChange={(value: boolean) => table.toggleAllPageRowsSelected(value)}
    indeterminate={table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected()}
    aria-label="Select all"
  />
</div>
