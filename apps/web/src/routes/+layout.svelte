<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  import { QueryClientProvider } from '@tanstack/svelte-query'
  import { ModeWatcher } from 'mode-watcher'
  import { Toaster } from '$lib/components/ui/sonner'
  import { createQueryClient } from '$lib/api/query-client'
  import { auth } from '$lib/stores/auth.svelte'
  import Login from '$lib/components/login.svelte'

  let { children } = $props()

  const queryClient = createQueryClient()

  onMount(() => {
    void auth.check()
  })
</script>

<ModeWatcher />
<Toaster richColors closeButton />

<QueryClientProvider client={queryClient}>
  {#if !auth.checked}
    <div class="text-muted-foreground flex min-h-screen items-center justify-center text-sm">
      loading…
    </div>
  {:else if !auth.authenticated}
    <Login />
  {:else}
    {@render children?.()}
  {/if}
</QueryClientProvider>
