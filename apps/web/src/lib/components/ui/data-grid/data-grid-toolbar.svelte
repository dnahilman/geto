<script lang="ts" generics="RowT">
  import type { Snippet } from 'svelte'
  import { Plus, Check, X, Trash2 } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import type { DataGridApi } from './data-grid-context'

  let {
    api,
    editable,
    children,
  }: { api: DataGridApi<RowT>; editable: boolean; children?: Snippet } = $props()
</script>

<div class="flex items-center gap-2 border-b px-2 py-1" data-datagrid-toolbar>
  {#if editable}
    <Button size="sm" variant="outline" class="h-7" onclick={() => api.addRow()}>
      <Plus class="size-4" /> Add row
    </Button>
  {/if}

  {#if api.dirty}
    <Button size="sm" class="h-7" onclick={() => api.applyChanges()}>
      <Check class="size-4" /> Apply
    </Button>
    <Button size="sm" variant="ghost" class="h-7" onclick={() => api.cancelChanges()}>
      <X class="size-4" /> Cancel
    </Button>
  {/if}

  {#if api.ctx.focusedCell}
    <Button
      size="sm"
      variant="ghost"
      class="text-destructive hover:text-destructive h-7"
      onclick={() => api.ctx.focusedCell && api.ctx.toggleDelete(api.ctx.focusedCell.r)}
    >
      <Trash2 class="size-4" /> Delete
    </Button>
  {/if}

  {@render children?.()}
</div>
