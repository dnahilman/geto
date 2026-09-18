<script lang="ts">
  import {
    Table2,
    KeyRound,
    SquareTerminal,
    X,
    Pin,
    Braces,
    Layers,
    ChevronDown,
  } from 'lucide-svelte'
  import * as Tabs from '$lib/components/ui/tabs'
  import * as ContextMenu from '$lib/components/ui/context-menu'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
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

  let viewportRef = $state<HTMLElement | null>(null)

  function handleWheel(e: WheelEvent) {
    if (!viewportRef) return
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      viewportRef.scrollLeft += e.deltaY
      e.preventDefault()
    }
  }
</script>

{#snippet tabbar()}
  <!-- Horizontal scrollable tabs using ScrollArea without visible scrollbar -->
  <ScrollArea
    bind:viewportRef
    onwheel={handleWheel}
    orientation="horizontal"
    class="min-w-0 flex-1 h-full"
    scrollbarXClasses="hidden"
  >
    <Tabs.Root
      value={ws.activeId ?? undefined}
      onValueChange={(val) => {
        if (val) ws.activeId = val
      }}
      class="h-full w-fit"
    >
      <Tabs.List
        variant="line"
        class="flex h-full w-fit items-center justify-start gap-1 bg-transparent p-0 px-1 border-0"
      >
        {#each ws.tabs as tab (tab.id)}
          {@const Icon = icon(tab.kind)}
          <ContextMenu.Root>
            <ContextMenu.Trigger>
              {#snippet child({ props })}
                <Tabs.Trigger
                  {...props}
                  value={tab.id}
                  class="group relative flex-none w-fit flex h-full items-center gap-1.5 rounded-none border-t-0 border-x-0 border-b-2 border-transparent px-2.5 py-1 text-xs shrink-0 after:hidden ring-0 outline-none shadow-none focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none focus-visible:ring-offset-0 focus-visible:border-transparent data-[state=active]:border-b-primary data-[state=active]:border-t-transparent data-[state=active]:border-x-transparent data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none dark:data-active:border-transparent dark:data-active:border-b-primary dark:data-[state=active]:border-transparent dark:data-[state=active]:border-b-primary hover:text-foreground text-muted-foreground transition-colors cursor-pointer"
                  ondblclick={() => ws.togglePin(tab.id)}
                >
                  <Icon class="size-3.5 shrink-0" />
                  <span class={tab.pinned ? 'italic' : ''}>{tab.title}</span>
                  {#if tab.pinned}
                    <button
                      type="button"
                      class="hover:bg-muted rounded p-0.5"
                      title="Unpin"
                      onclick={(e) => {
                        e.stopPropagation()
                        ws.togglePin(tab.id)
                      }}
                    >
                      <Pin class="size-3 fill-current" />
                    </button>
                  {:else}
                    <button
                      type="button"
                      class="hover:bg-muted rounded p-0.5 opacity-50 group-hover:opacity-100"
                      title="Close"
                      onpointerdown={(e) => e.stopPropagation()}
                      onmousedown={(e) => e.stopPropagation()}
                      onpointerup={(e) => e.stopPropagation()}
                      onmouseup={(e) => e.stopPropagation()}
                      onclick={(e) => {
                        e.stopPropagation()
                        ws.close(tab.id)
                      }}
                    >
                      <X class="size-3" />
                    </button>
                  {/if}
                </Tabs.Trigger>
              {/snippet}
            </ContextMenu.Trigger>
            <ContextMenu.Content class="w-44">
              <ContextMenu.Item onSelect={() => ws.close(tab.id)}>Close</ContextMenu.Item>
              <ContextMenu.Item onSelect={() => ws.closeOthers(tab.id)}>Close Others</ContextMenu.Item>
              <ContextMenu.Item onSelect={() => ws.closeAll()}>Close All</ContextMenu.Item>
              <ContextMenu.Separator />
              <ContextMenu.Item onSelect={() => ws.togglePin(tab.id)}>
                {tab.pinned ? 'Unpin' : 'Pin'}
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Root>
        {/each}
      </Tabs.List>
    </Tabs.Root>
  </ScrollArea>
{/snippet}

{#snippet tabbarAction()}
  <!-- Action Toolbar at the end: top layer, fully opaque background -->
  <div
    class="relative z-20 flex h-full shrink-0 items-center gap-1 border-l bg-background px-2 text-xs shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.15)] dark:shadow-[-4px_0_6px_-2px_rgba(0,0,0,0.3)]"
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
      title={ws.kind === 'keyvalue' ? 'New Redis console' : 'New SQL console'}
      onclick={() => (ws.kind === 'keyvalue' ? ws.openRedisConsole() : ws.openConsole())}
    >
      <SquareTerminal class="size-3.5" />
    </Button>
  </div>
{/snippet}

<div class="relative flex h-9 w-full items-center justify-between border-b bg-background overflow-hidden">
  {@render tabbar()}
  {@render tabbarAction()}
</div>
