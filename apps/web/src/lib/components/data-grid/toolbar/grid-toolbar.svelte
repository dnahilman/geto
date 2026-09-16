<script lang="ts">
  import { useGridTableContext } from '../hooks/use-data-grid.js'
  import { useFormContext } from '../hooks/form-context.js'
  import { Button } from '$lib/components/ui/button'
  import { RefreshCw, RotateCcw, Check, Loader, Funnel, Trash2, Plus } from 'lucide-svelte'
  import { Separator } from '$lib/components/ui/separator'
  import ExportMenu from './export-menu.svelte'
  import PaginationControls from '../pagination/pagination-controls.svelte'
  import GridFilterBuilder from './grid-filter-builder.svelte'
  import { isRuleActive, type TableFilterGroup } from '../types/filter.js'

  interface Props {
    onRefresh?: () => void
    onDeleteSelected?: () => void
    isDeleting?: boolean
    columns?: { name: string; typeName?: string; isPrimaryKey?: boolean }[]
    filterGroup?: TableFilterGroup
    appliedFilterGroup?: TableFilterGroup
    onFilterChange?: (group: TableFilterGroup) => void
  }

  let {
    onRefresh,
    onDeleteSelected,
    isDeleting = false,
    columns = [],
    filterGroup = $bindable({ conjunction: 'AND', rules: [] }),
    appliedFilterGroup = { conjunction: 'AND', rules: [] },
    onFilterChange,
  }: Props = $props()

  const table = useGridTableContext()
  const form = useFormContext()

  let isFilterOpen = $state(false)

  function toggleFilter() {
    isFilterOpen = !isFilterOpen
    if (isFilterOpen && filterGroup.rules.length === 0) {
      filterGroup = {
        conjunction: filterGroup.conjunction || 'AND',
        rules: [
          {
            id: crypto.randomUUID(),
            column: columns[0]?.name ?? '',
            operator: 'equals',
            value: '',
          },
        ],
      }
    }
  }

  function addCondition() {
    filterGroup = {
      conjunction: filterGroup.conjunction || 'AND',
      rules: [
        ...filterGroup.rules,
        {
          id: crypto.randomUUID(),
          column: columns[0]?.name ?? '',
          operator: 'equals',
          value: '',
        },
      ],
    }
  }

  function applyFilters() {
    onFilterChange?.(filterGroup)
  }

  function clearFilters() {
    filterGroup = {
      conjunction: 'AND',
      rules: [],
    }
    onFilterChange?.(filterGroup)
  }

  const selectedRows = $derived(table.getSelectedRowModel().rows)
  const selectedCount = $derived(selectedRows.length)
  const activeFiltersCount = $derived(
    appliedFilterGroup?.rules ? appliedFilterGroup.rules.filter(isRuleActive).length : 0,
  )
</script>

<div class="flex flex-col border-b bg-background shrink-0">
  <div class="flex shrink-0 items-center justify-between px-2 text-xs gap-2 py-0.5">
    <!-- Left: Actions & Save / Discard buttons -->
    <div class="flex items-center gap-1.5 ps-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-7 px-2 text-xs gap-1.5 {isFilterOpen
          ? 'bg-muted text-foreground'
          : activeFiltersCount > 0
            ? 'text-primary font-medium'
            : 'text-muted-foreground hover:text-foreground'}"
        title="Filters"
        onclick={toggleFilter}
      >
        <Funnel class="size-3.5" />
        {#if activeFiltersCount > 0}
          <span
            class="flex items-center justify-center rounded-full bg-primary/20 text-primary px-1.5 text-[10px] font-semibold h-4 min-w-4"
          >
            {activeFiltersCount}
          </span>
        {/if}
      </Button>

      {#if isFilterOpen}
        <Separator orientation="vertical" class="h-4 mx-0.5" />

        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
          title="Add another filter condition"
          onclick={addCondition}
        >
          <Plus class="size-3.5" />
          <span>Add condition</span>
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          class="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
          title="Apply filter to query"
          onclick={applyFilters}
        >
          <Check class="size-3.5" />
          <span>Apply</span>
        </Button>

        {#if activeFiltersCount > 0 || filterGroup.rules.length > 0}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
            title="Clear all filters"
            onclick={clearFilters}
          >
            Clear
          </Button>
        {/if}

        <Separator orientation="vertical" class="h-4 mx-0.5" />
      {/if}

      {#if selectedCount > 0}
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

  {#if isFilterOpen}
    <GridFilterBuilder {columns} bind:filterGroup onApply={applyFilters} onReset={clearFilters} />
  {/if}
</div>
