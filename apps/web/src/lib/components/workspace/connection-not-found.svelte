<script lang="ts">
  import { goto } from '$app/navigation'
  import { createQuery } from '@tanstack/svelte-query'
  import { Plus, LayoutGrid, ArrowRight, AlertCircle } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import { ProviderIcon } from '$lib/components/icons'
  import ConnectionForm from '$lib/components/connection-form.svelte'
  import { connectionsKey, listConnections } from '$lib/api/connections'

  interface Props {
    connId: string
  }

  let { connId }: Props = $props()

  const connections = createQuery(() => ({
    queryKey: connectionsKey,
    queryFn: listConnections,
  }))

  let formOpen = $state(false)
</script>

<div
  class="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-background p-6"
>
  <!-- Watermark background logo -->
  <img
    src="/logo.svg"
    alt="geto background"
    class="pointer-events-none absolute -z-10 size-[450px] select-none opacity-[0.035] invert transition-opacity"
  />

  <div class="z-10 flex w-full max-w-2xl flex-col items-center text-center">
    <!-- Status Tag -->
    <div
      class="mb-4 inline-flex items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive"
    >
      <AlertCircle class="size-3.5" />
      <span>Connection Not Found</span>
    </div>

    <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">Workspace Unavailable</h1>
    <p class="text-muted-foreground mt-2 max-w-md text-sm">
      The connection <code
        class="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground font-semibold"
        >{connId}</code
      > could not be found or has been deleted.
    </p>

    <!-- Main Actions -->
    <div class="mt-8 flex flex-wrap items-center justify-center gap-3">
      <Button onclick={() => (formOpen = true)} class="gap-2 shadow-sm">
        <Plus class="size-4" /> Create New Connection
      </Button>
      <Button variant="outline" onclick={() => goto('/')} class="gap-2">
        <LayoutGrid class="size-4" /> Browse All Connections
      </Button>
    </div>

    <!-- Available Connections Quick Jump -->
    {#if connections.data && connections.data.length > 0}
      <div
        class="mt-12 w-full max-w-lg rounded-xl border bg-card/60 p-4 text-left backdrop-blur-xs shadow-xs"
      >
        <div class="mb-3 flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Available Connections ({connections.data.length})
          </span>
          <span class="text-[11px] text-muted-foreground">Quick Switch</span>
        </div>

        <div class="divide-y divide-border/50 overflow-hidden rounded-lg border bg-background/50">
          {#each connections.data as c (c.id)}
            <button
              type="button"
              onclick={() => goto(`/c/${c.id}`)}
              class="group flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-accent/70 cursor-pointer"
            >
              <ProviderIcon provider={c.provider} class="size-4 shrink-0" />
              <div class="flex min-w-0 flex-1 flex-col">
                <span
                  class="truncate text-xs font-medium text-foreground group-hover:text-primary transition-colors"
                >
                  {c.name}
                </span>
                <span class="truncate text-[10px] text-muted-foreground">
                  {c.host}:{c.port}
                  {c.database ? `• ${c.database}` : ''}
                </span>
              </div>
              <ArrowRight
                class="size-3.5 text-muted-foreground opacity-0 transition-all group-hover:opacity-100 group-hover:translate-x-0.5"
              />
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>

  <!-- Bottom Brand -->
  <div class="absolute bottom-4 flex items-center gap-2 text-muted-foreground">
    <img src="/logo.svg" alt="geto" class="h-4 w-auto invert opacity-40" />
    <span class="font-mono text-[11px] opacity-40">v{__APP_VERSION__}</span>
  </div>
</div>

<ConnectionForm bind:open={formOpen} onsaved={(newConn) => goto(`/c/${newConn.id}`)} />
