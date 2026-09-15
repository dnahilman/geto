<script lang="ts">
  import { CircleCheck, CircleX, History } from 'lucide-svelte'
  import { createQuery } from '@tanstack/svelte-query'
  import { consoleQueries } from '$lib/queries'

  interface Props {
    connId: string
    onSelect: (sqlText: string) => void
  }

  let { connId, onSelect }: Props = $props()

  const history = createQuery(() => consoleQueries.history(connId))
</script>

<div class="flex h-full flex-col">
  {#if history.data && history.data.length > 0}
    <ul class="divide-y overflow-auto text-xs">
      {#each history.data as h (h.id)}
        <li>
          <button
            class="hover:bg-accent flex w-full items-start gap-2 px-3 py-1.5 text-left"
            onclick={() => onSelect(h.sql)}
            title="Load into editor"
          >
            {#if h.status === 'ok'}
              <CircleCheck class="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
            {:else}
              <CircleX class="text-destructive mt-0.5 size-3.5 shrink-0" />
            {/if}
            <span class="min-w-0 flex-1 truncate font-mono">{h.sql}</span>
            <span class="text-muted-foreground shrink-0">
              {h.status === 'ok' ? `${h.rowCount ?? 0} rows` : 'error'} · {h.durationMs ?? 0}ms
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <div
      class="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-muted-foreground select-none"
    >
      <div class="rounded-full bg-muted/50 p-3 border border-border/50 shadow-xs">
        <History class="size-4 opacity-70" />
      </div>
      <div class="space-y-0.5">
        <p class="text-xs font-medium text-foreground">No query history</p>
        <p class="text-[11px] text-muted-foreground/80">
          Queries you execute in this console will be recorded here.
        </p>
      </div>
    </div>
  {/if}
</div>
