<script lang="ts">
  import {
    Table2,
    KeyRound,
    SquareTerminal,
    X,
    Pin,
    PinOff,
    RefreshCw,
    RotateCcw,
    Check,
    Loader,
  } from 'lucide-svelte'
  import * as ContextMenu from '$lib/components/ui/context-menu'
  import type { Workspace, Tab } from '$lib/stores/workspace.svelte'
  import { Button } from '../ui/button'
  import { useQueryClient } from '@tanstack/svelte-query'
  import { useFormContext } from '../data-grid'

  interface Props {
    ws: Workspace
  }

  let { ws }: Props = $props()
  const qc = useQueryClient()
  const form = useFormContext()

  function refresh() {
    const active = ws.active
    if (active?.kind === 'table') {
      qc.invalidateQueries({
        queryKey: ['table-rows', ws.connId, active.schema, active.table, active.filter ?? null],
      })
    }
  }

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
  {#if ws.active?.kind === 'table'}
    <div
      class="sticky right-0 z-10 flex shrink-0 items-center gap-2 border-l bg-background px-3 py-1 text-xs"
    >
      <div class="flex items-center gap-1">
        <form.Subscribe
          selector={(state) => ({ isDirty: state.isDirty, isSubmitting: state.isSubmitting })}
        >
          {#snippet children({ isDirty, isSubmitting })}
            {#if isDirty}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="size-7 text-muted-foreground hover:text-destructive"
                title="Discard changes"
                disabled={isSubmitting}
                onclick={() => form.reset()}
              >
                <RotateCcw class="size-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                class="size-7 bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs"
                title="Save changes"
                disabled={isSubmitting}
                onclick={() => form.handleSubmit()}
              >
                {#if isSubmitting}
                  <Loader class="size-3.5 animate-spin" />
                {:else}
                  <Check class="size-3.5" />
                {/if}
              </Button>
            {/if}
          {/snippet}
        </form.Subscribe>
        <Button
          size="icon"
          variant="ghost"
          class="size-7 text-muted-foreground hover:text-foreground"
          title="Refresh table"
          onclick={refresh}
        >
          <RefreshCw class="size-3.5" />
        </Button>
      </div>
    </div>
  {/if}
</div>
