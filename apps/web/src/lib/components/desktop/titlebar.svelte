<script lang="ts">
  import { onMount } from 'svelte'
  import { Minus, Square, Copy, X } from 'lucide-svelte'
  import { isTauri } from '$lib/api/transport'
  import type { Window as TauriWindow } from '@tauri-apps/api/window'

  let appWindow = $state<TauriWindow | null>(null)
  let isMaximized = $state(false)

  onMount(() => {
    if (!isTauri()) return

    import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
      appWindow = getCurrentWindow()
      void appWindow.isMaximized().then((val) => {
        isMaximized = val
      })
      void appWindow.onResized(async () => {
        if (appWindow) {
          isMaximized = await appWindow.isMaximized()
        }
      })
    })
  })

  async function minimize() {
    if (!appWindow) return
    try {
      await appWindow.minimize()
    } catch (err) {
      console.error('Failed to minimize window:', err)
    }
  }

  async function toggleMaximize() {
    if (!appWindow) return
    try {
      await appWindow.toggleMaximize()
      isMaximized = await appWindow.isMaximized()
    } catch (err) {
      console.error('Failed to toggle maximize window:', err)
    }
  }

  async function close() {
    if (!appWindow) return
    try {
      await appWindow.close()
    } catch (err) {
      console.error('Failed to close window:', err)
    }
  }
</script>

{#if isTauri()}
  <header
    class="bg-sidebar text-sidebar-foreground border-border flex h-8 w-full shrink-0 select-none items-center justify-between border-b"
  >
    <!-- Draggable area with logo and title -->
    <div
      data-tauri-drag-region
      class="flex h-full flex-1 items-center gap-2 px-3 cursor-default"
      ondblclick={toggleMaximize}
      role="region"
      aria-label="Window drag region"
    >
      <img src="/favicon.svg" alt="Geto" class="pointer-events-none size-3.5 select-none" />
      <span class="text-foreground/80 pointer-events-none text-xs font-semibold tracking-wide">
        Geto
      </span>
    </div>

    <!-- Window control buttons (minimize, maximize/restore, close) -->
    <div class="flex h-full items-center">
      <button
        type="button"
        onclick={minimize}
        class="text-muted-foreground hover:bg-muted/80 hover:text-foreground flex h-full w-11 cursor-pointer items-center justify-center transition-colors"
        title="Minimize"
        aria-label="Minimize"
      >
        <Minus class="size-3.5" />
      </button>
      <button
        type="button"
        onclick={toggleMaximize}
        class="text-muted-foreground hover:bg-muted/80 hover:text-foreground flex h-full w-11 cursor-pointer items-center justify-center transition-colors"
        title={isMaximized ? 'Restore' : 'Maximize'}
        aria-label={isMaximized ? 'Restore' : 'Maximize'}
      >
        {#if isMaximized}
          <Copy class="size-3" />
        {:else}
          <Square class="size-3" />
        {/if}
      </button>
      <button
        type="button"
        onclick={close}
        class="text-muted-foreground hover:bg-destructive hover:text-destructive-foreground flex h-full w-11 cursor-pointer items-center justify-center transition-colors"
        title="Close"
        aria-label="Close"
      >
        <X class="size-3.5" />
      </button>
    </div>
  </header>
{/if}
