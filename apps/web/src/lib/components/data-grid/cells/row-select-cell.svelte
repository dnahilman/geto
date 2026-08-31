<script lang="ts">
  import { Checkbox } from '$lib/components/ui/checkbox/index.js'
  import { useGridTableCellContext } from '../hooks/use-data-grid.js'

  const { row } = useGridTableCellContext()
</script>

<div class="group flex h-full w-full items-center justify-center px-2.5">
  <span
    class="text-muted-foreground select-none group-hover:hidden data-[state=checked]:hidden"
    data-state={row.getIsSelected() ? 'checked' : 'unchecked'}
  >
    {row.index + 1}
  </span>
  <div
    class="hidden group-hover:block data-[state=checked]:block"
    data-state={row.getIsSelected() ? 'checked' : 'unchecked'}
  >
    <Checkbox
      checked={row.getIsSelected()}
      onCheckedChange={(value: boolean) => row.toggleSelected(value)}
      aria-label="Select row"
    />
  </div>
</div>
