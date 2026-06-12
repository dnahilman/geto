<script lang="ts">
  import { CircleX, History } from 'lucide-svelte'
  import type { StatementResult } from '$lib/api/query'

  let {
    results,
    active,
    onSelect,
  }: {
    results: StatementResult[]
    active: 'history' | number
    onSelect: (tab: 'history' | number) => void
  } = $props()
</script>

<div
  class="flex overflow-x-auto border-b text-xs"
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
      class="-mb-px flex shrink-0 items-center gap-1 border-b-2 px-3 py-1.5 transition-colors
        {r.error
          ? active === i
            ? 'border-destructive text-destructive'
            : 'border-transparent text-destructive hover:border-destructive/50'
          : active === i
            ? 'border-primary text-foreground'
            : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'}"
      onclick={() => onSelect(i)}
    >
      {#if r.error}<CircleX class="size-3 shrink-0" />{/if}
      <span class="font-mono">Query #{i + 1}</span>
    </button>
  {/each}
</div>
