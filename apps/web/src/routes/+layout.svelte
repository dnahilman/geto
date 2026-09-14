<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  import { QueryClientProvider } from '@tanstack/svelte-query'
  import { ModeWatcher, setMode } from 'mode-watcher'
  import { Toaster } from '$lib/components/ui/sonner'
  import { createQueryClient } from '$lib/api/query-client'
  import { auth } from '$lib/stores/auth.svelte'
  import Titlebar from '$lib/components/desktop/titlebar.svelte'
  import Login from '$lib/components/login.svelte'

  let { children } = $props()

  const queryClient = createQueryClient()

  onMount(() => {
    try {
      localStorage.setItem('mode-watcher-mode', 'dark')
      setMode('dark')
      document.documentElement.classList.add('dark')
      document.documentElement.style.colorScheme = 'dark'
    } catch (err) {
      console.error('Failed to initialize dark mode:', err)
    }
    void auth.check()
  })
</script>

<ModeWatcher defaultMode="dark" track={false} />
<Toaster richColors closeButton theme="dark" />

<div class="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
  <Titlebar />
  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    <QueryClientProvider client={queryClient}>
      {#if !auth.checked}
        <div class="text-muted-foreground flex flex-1 items-center justify-center text-sm">
          loading…
        </div>
      {:else if !auth.authenticated}
        <Login />
      {:else}
        {@render children?.()}
      {/if}
    </QueryClientProvider>
  </div>
</div>
