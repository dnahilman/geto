<script lang="ts">
  import {
    Table2,
    KeyRound,
    SquareTerminal,
    X,
    Pin,
    PinOff,
    Braces,
    Layers,
    ChevronDown,
  } from 'lucide-svelte'
  import * as ContextMenu from '$lib/components/ui/context-menu'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import type { Workspace, Tab, TableViewMode } from '$lib/stores/workspace.svelte'
  import { Button } from '../ui/button'

  interface Props {
    ws: Workspace
  }

  let { ws }: Props = $props()

  const activeTableTab = $derived(ws.active?.kind === 'table' ? ws.active : null)
  const currentView = $derived(activeTableTab?.view ?? 'table')

  const viewOptions: { id: TableViewMode; label: string; icon: typeof Table2 }[] = [
    { id: 'table', label: 'Table View', icon: Table2 },
    { id: 'json', label: 'JSON View', icon: Braces },
    { id: 'structure', label: 'Structure View', icon: Layers },
  ]
  const currentOption = $derived(viewOptions.find((o) => o.id === currentView) ?? viewOptions[0])

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
  <div
    class="sticky right-0 z-10 flex shrink-0 items-center gap-1 border-l bg-background px-2 py-1 text-xs"
  >
    {#if activeTableTab}
      {@const ActiveIcon = currentOption.icon}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              size="sm"
              class="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground font-normal"
              title="Change view ({currentOption.label})"
            >
              <ActiveIcon class="size-3.5 text-foreground" />
              <span class="capitalize hidden sm:inline text-[11px]">{currentView}</span>
              <ChevronDown class="size-3 opacity-60" />
            </Button>
          {/snippet}
        </DropdownMenu.Trigger>
        <DropdownMenu.Content align="end" class="w-36 text-xs">
          <DropdownMenu.Group>
            <DropdownMenu.GroupHeading class="text-[10px] uppercase text-muted-foreground">
              Table View
            </DropdownMenu.GroupHeading>
            {#each viewOptions as opt (opt.id)}
              {@const OptIcon = opt.icon}
              <DropdownMenu.Item
                class="cursor-pointer gap-2 {currentView === opt.id ? 'bg-accent font-medium' : ''}"
                onSelect={() => ws.setView(activeTableTab.id, opt.id)}
              >
                <OptIcon class="size-3.5" />
                <span>{opt.label}</span>
              </DropdownMenu.Item>
            {/each}
          </DropdownMenu.Group>
        </DropdownMenu.Content>
      </DropdownMenu.Root>
      <div class="h-4 w-px bg-border my-auto mx-0.5"></div>
    {/if}
    <Button
      variant="ghost"
      size="icon"
      class="size-7 text-muted-foreground hover:text-foreground"
      title="New SQL console"
      onclick={() => ws.openConsole()}
    >
      <SquareTerminal class="size-3.5" />
    </Button>
  </div>
</div>
