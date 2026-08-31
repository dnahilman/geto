<script lang="ts">
  import type { Snippet } from 'svelte'
  import { Table2, KeyRound, SquareTerminal, X, Pin, PinOff } from 'lucide-svelte'
  import * as ContextMenu from '$lib/components/ui/context-menu'
  import type { Workspace, Tab } from '$lib/stores/workspace.svelte'

  let {
    ws,
    actions,
  }: {
    ws: Workspace
    actions?: Snippet
  } = $props()

  function icon(kind: Tab['kind']) {
    if (kind === 'table') return Table2
    if (kind === 'rkey') return KeyRound
    return SquareTerminal
  }
</script>

<div class="relative flex items-center justify-between border-b bg-background">
  <!-- Horizontal scrollable tabs -->
  <div class="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1">
    {#each ws.tabs as tab (tab.id)}
      {@const Icon = icon(tab.kind)}
      <ContextMenu.Root>
        <ContextMenu.Trigger>
          {#snippet child({ props })}
            <div
              {...props}
              class="group flex items-center gap-1 border-b-2 px-2 py-1.5 text-xs shrink-0
                {ws.activeId === tab.id ? 'border-primary' : 'hover:bg-accent border-transparent'}"
              ondblclick={() => ws.togglePin(tab.id)}
            >
              <button class="flex items-center gap-1.5" onclick={() => (ws.activeId = tab.id)}>
                <Icon class="size-3.5 shrink-0" />
                <span class={tab.pinned ? 'italic' : ''}>{tab.title}</span>
              </button>
              {#if tab.pinned}
                <button
                  class="hover:bg-muted rounded p-0.5"
                  title="Unpin"
                  onclick={() => ws.togglePin(tab.id)}
                >
                  <Pin class="size-3 fill-current" />
                </button>
              {:else}
                <button
                  class="hover:bg-muted rounded p-0.5 opacity-50 group-hover:opacity-100"
                  title="Close"
                  onclick={() => ws.close(tab.id)}
                >
                  <X class="size-3" />
                </button>
              {/if}
            </div>
          {/snippet}
        </ContextMenu.Trigger>
        <ContextMenu.Content class="w-44">
          <ContextMenu.Item onSelect={() => ws.close(tab.id)}>
            <X class="size-4" /> Close
          </ContextMenu.Item>
          <ContextMenu.Item onSelect={() => ws.closeOthers(tab.id)}>Close Others</ContextMenu.Item>
          <ContextMenu.Item onSelect={() => ws.closeAll()}>Close All</ContextMenu.Item>
          <ContextMenu.Separator />
          <ContextMenu.Item onSelect={() => ws.togglePin(tab.id)}>
            {#if tab.pinned}
              <PinOff class="size-4" /> Unpin
            {:else}
              <Pin class="size-4" /> Pin
            {/if}
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Root>
    {/each}
  </div>

  <!-- Sticky Toolbar at the end -->
  {#if actions}
    <div
      class="sticky right-0 z-10 flex shrink-0 items-center gap-2 border-l bg-background px-3 py-1 text-xs"
    >
      {@render actions()}
    </div>
  {/if}
</div>
