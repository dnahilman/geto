<script lang="ts">
  import { Button } from '$lib/components/ui/button'
  import { PanelLeft } from 'lucide-svelte'
  import type { Snippet } from 'svelte'

  interface Props {
    onToggleSidebar?: () => void
    children?: Snippet
  }

  let { onToggleSidebar, children }: Props = $props()
</script>

<div
  class="flex shrink-0 items-center justify-between border-t bg-background px-1 py-1 text-xs w-full"
>
  <!-- Left: Sidebar toggle button + optional left status -->
  <div class="flex items-center gap-1.5">
    {#if onToggleSidebar}
      <Button
        variant="ghost"
        size="icon"
        class="size-6 text-muted-foreground hover:text-foreground"
        title="Toggle sidebar"
        onclick={onToggleSidebar}
      >
        <PanelLeft class="size-3.5" />
      </Button>
    {/if}
  </div>

  <!-- Right: Status info / Pagination / Contextual actions -->
  <div class="flex items-center gap-2">
    {@render children?.()}
  </div>
</div>
