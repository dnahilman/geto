<script lang="ts">
  import { useGridTableContext } from '../hooks/use-data-grid.js'
  import { useFormContext } from '../hooks/form-context.js'
  import { Button } from '$lib/components/ui/button'
  import { RefreshCw, RotateCcw, Check, Loader, Funnel, Trash2, Pencil, Lock } from 'lucide-svelte'
  import ExportMenu from './export-menu.svelte'
  import PaginationControls from '../pagination/pagination-controls.svelte'

  interface Props {
    isEditable?: boolean
    onRefresh?: () => void
    onDeleteSelected?: () => void
    isDeleting?: boolean
  }

  let { isEditable = false, onRefresh, onDeleteSelected, isDeleting = false }: Props = $props()

  const table = useGridTableContext()
  const form = useFormContext()

  const selectedRows = $derived(table.getSelectedRowModel().rows)
  const selectedCount = $derived(selectedRows.length)
</script>

<div
  class="flex shrink-0 items-center justify-between border-b bg-background px-2 text-xs gap-2 py-0.5"
  data-datagrid-toolbar
>
  <!-- Left: Filters, Editable Status, Delete Selected & Save / Discard buttons -->
  <div class="flex items-center gap-1.5 ps-1">
    <Button
      type="button"
      variant="ghost"
      size="sm"
      class="h-7 px-2 text-xs text-muted-foreground hover:text-blue-700"
      title="Filters"
    >
      <Funnel class="size-3.5" />
    </Button>

    <!-- Editable / Read-only indicator icon -->
    {#if isEditable}
      <span
        class="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400"
        title="Editable result (Primary Key detected)"
      >
        <Pencil class="size-3" />
        <span class="hidden sm:inline">Editable</span>
      </span>
    {:else}
      <span
        class="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground"
        title="Read-only query result"
      >
        <Lock class="size-3" />
        <span class="hidden sm:inline">Read-only</span>
      </span>
    {/if}

    <!-- Delete Selected Rows Button -->
    {#if isEditable && selectedCount > 0}
      <Button
        type="button"
        variant="outline"
        size="sm"
        class="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 border-destructive/30 gap-1.5"
        title="Delete {selectedCount} selected row{selectedCount > 1 ? 's' : ''}"
        disabled={isDeleting}
        onclick={onDeleteSelected}
      >
        {#if isDeleting}
          <Loader class="size-3.5 animate-spin" />
        {:else}
          <Trash2 class="size-3.5" />
        {/if}
        <span>Delete ({selectedCount})</span>
      </Button>
    {/if}

    <!-- Discard / Save Changes -->
    <form.Subscribe
      selector={(state) => ({ isDirty: state.isDirty, isSubmitting: state.isSubmitting })}
    >
      {#snippet children({ isDirty, isSubmitting })}
        {#if isDirty}
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="h-7 px-2 text-xs text-muted-foreground hover:text-destructive gap-1"
            title="Discard changes"
            disabled={isSubmitting}
            onclick={() => form.reset()}
          >
            <RotateCcw class="size-3.5" /> Discard
          </Button>
          <Button
            type="button"
            size="sm"
            class="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs gap-1"
            title="Save changes"
            disabled={isSubmitting}
            onclick={() => form.handleSubmit()}
          >
            {#if isSubmitting}
              <Loader class="size-3.5 animate-spin" /> Saving...
            {:else}
              <Check class="size-3.5" /> Save Changes
            {/if}
          </Button>
        {/if}
      {/snippet}
    </form.Subscribe>
  </div>

  <!-- Right: Refresh, Export & Pagination -->
  <div class="flex items-center">
    {#if onRefresh}
      <Button
        size="icon"
        variant="ghost"
        class="size-7 text-muted-foreground hover:text-foreground"
        title="Refresh"
        onclick={onRefresh}
      >
        <RefreshCw class="size-3.5" />
      </Button>
    {/if}
    <ExportMenu />
    <PaginationControls />
  </div>
</div>
