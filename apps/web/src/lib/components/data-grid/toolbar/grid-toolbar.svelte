<script lang="ts">
  import { useGridTableContext } from '../hooks/use-data-grid.js'
  import { useFormContext } from '../hooks/form-context.js'
  import { Button } from '$lib/components/ui/button'
  import { RefreshCw, RotateCcw, Check, Loader, Funnel } from 'lucide-svelte'
  import ExportMenu from './export-menu.svelte'
  import PaginationControls from '../pagination/pagination-controls.svelte'

  interface Props {
    onRefresh?: () => void
  }

  let { onRefresh }: Props = $props()

  const table = useGridTableContext()
  const form = useFormContext()
</script>

<div
  class="flex shrink-0 items-center justify-between border-b bg-background px-2 text-xs gap-2"
>
  <!-- Left: Save / Discard buttons via form context -->
  <div class="flex items-center gap-1.5 ps-1">
      <!-- todo create filters -->
    <Button
      type="button"
      variant="ghost"
      size="sm"
      class="h-7 px-2 text-xs text-muted-foreground hover:text-blue-700"
      title="Filters"
    >
      <Funnel class="size-3.5" />
    </Button>
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
        title="Refresh table"
        onclick={onRefresh}
      >
        <RefreshCw class="size-3.5" />
      </Button>
    {/if}
    <ExportMenu />
    <PaginationControls />
  </div>
</div>
