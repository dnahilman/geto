<script lang="ts">
  import { CircleX, History, Pencil, Lock, Trash2 } from 'lucide-svelte'
  import type { StatementResult } from '$lib/api/query'
  import { Button } from '$lib/components/ui/button'

  interface Props {
    results: StatementResult[]
    active: 'history' | number
    onSelect: (tab: 'history' | number) => void
    onClearHistory?: () => void
    hasHistory?: boolean
    isClearing?: boolean
  }

  let {
    results,
    active,
    onSelect,
    onClearHistory,
    hasHistory = false,
    isClearing = false,
  }: Props = $props()
</script>

<div class="flex shrink-0 items-center justify-between border-b text-xs bg-background relative">
  <div
    class="flex min-w-0 flex-1 overflow-x-auto"
    style="scrollbar-width: thin;"
    role="tablist"
    aria-label="Query results"
  >
    <!-- History tab — always first -->
    <button
      type="button"
      role="tab"
      aria-selected={active === 'history'}
      class="-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-1.5 transition-colors
        {active === 'history'
        ? 'border-primary text-foreground'
        : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'}"
      onclick={() => onSelect('history')}
    >
      <History class="size-3" />
      History
    </button>

    <!-- Per-statement result tabs -->
    {#each results as r, i (r.index)}
      <button
        type="button"
        role="tab"
        aria-selected={active === i}
        class="-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-1.5 transition-colors
          {r.error
          ? active === i
            ? 'border-destructive text-destructive'
            : 'border-transparent text-destructive hover:border-destructive/50'
          : active === i
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'}"
        onclick={() => onSelect(i)}
      >
        {#if r.error}
          <CircleX class="size-3 shrink-0" />
        {:else if r.source && r.source.primaryKey.length > 0}
          <span title="Editable table ({r.source.schema}.{r.source.table})">
            <Pencil class="size-3 shrink-0 text-amber-500" />
          </span>
        {:else if r.columns.length > 0}
          <span title="Read-only query">
            <Lock class="size-3 shrink-0 opacity-60" />
          </span>
        {/if}
        <span class="font-mono">Query #{i + 1}</span>
      </button>
    {/each}
  </div>

  <!-- Sticky Right: Clear History (only visible on history tab when history exists) -->
  {#if active === 'history' && onClearHistory && hasHistory}
    <div class="sticky right-0 z-10 flex shrink-0 items-center border-l bg-background px-1 py-0.5">
      <Button
        variant="ghost"
        size="sm"
        class="text-muted-foreground hover:text-destructive h-6 px-1.5 text-xs gap-1"
        title="clear query history"
        disabled={isClearing}
        onclick={onClearHistory}
      >
        <Trash2 class="size-3.5" />
      </Button>
    </div>
  {/if}
</div>
