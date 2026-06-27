<script lang="ts">
  import { SquareTerminal, Table2, KeyRound, X, Plus, Pin, PinOff } from 'lucide-svelte'
  import * as ContextMenu from '$lib/components/ui/context-menu'
  import type { Workspace, Tab } from '$lib/stores/workspace.svelte'

  // Shared VS Code-style tab strip used by both the SQL and Redis workspaces:
  // active underline, close/pin, right-click Close/Close Others/Close All/Pin.
  let {
    ws,
    onNew,
    newTitle = 'New tab',
  }: { ws: Workspace; onNew: () => void; newTitle?: string } = $props()

  function icon(kind: Tab['kind']) {
    if (kind === 'table') return Table2
    if (kind === 'rkey') return KeyRound
    return SquareTerminal // console / rconsole
  }
</script>

<div class="flex items-center gap-1 overflow-x-auto border-b px-1">
  {#each ws.tabs as tab (tab.id)}
    {@const Icon = icon(tab.kind)}
    <ContextMenu.Root>
      <ContextMenu.Trigger>
        {#snippet child({ props })}
          <div
            {...props}
            class="group flex items-center gap-1 border-b-2 px-2 py-1.5 text-xs
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
  <button
    type="button"
    class="hover:bg-accent text-muted-foreground rounded p-1"
    title={newTitle}
    onclick={onNew}
  >
    <Plus class="size-3.5" />
  </button>
</div>
