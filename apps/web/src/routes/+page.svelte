<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query'
  import { Plus, Database, LogOut } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import ConnectionForm from '$lib/components/connection-form.svelte'
  import ConnectionCard from '$lib/components/connection-card.svelte'
  import { auth } from '$lib/stores/auth.svelte'
  import { connectionsKey, listConnections, type Connection } from '$lib/api/connections'

  const connections = createQuery(() => ({
    queryKey: connectionsKey,
    queryFn: listConnections,
  }))

  let formOpen = $state(false)
  let editing = $state<Connection | null>(null)

  function add() {
    editing = null
    formOpen = true
  }
  function edit(c: Connection) {
    editing = c
    formOpen = true
  }
</script>

<div class="mx-auto max-w-5xl p-6">
  <header class="mb-8 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <Database class="size-6" />
      <h1 class="text-xl font-semibold tracking-tight">geto</h1>
    </div>
    <div class="flex items-center gap-2">
      <Button onclick={add}><Plus class="size-4" /> New connection</Button>
      <Button variant="ghost" size="icon" title="Sign out" onclick={() => auth.logout()}>
        <LogOut class="size-4" />
      </Button>
    </div>
  </header>

  {#if connections.isLoading}
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each Array(3) as _, i (i)}
        <Skeleton class="h-32 w-full" />
      {/each}
    </div>
  {:else if connections.isError}
    <p class="text-destructive">Failed to load connections: {connections.error.message}</p>
  {:else if connections.data && connections.data.length > 0}
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each connections.data as c (c.id)}
        <ConnectionCard connection={c} onedit={edit} />
      {/each}
    </div>
  {:else}
    <div
      class="border-border flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-center"
    >
      <Database class="text-muted-foreground size-10" />
      <div>
        <p class="font-medium">No connections yet</p>
        <p class="text-muted-foreground text-sm">Add a PostgreSQL connection to get started.</p>
      </div>
      <Button onclick={add}><Plus class="size-4" /> New connection</Button>
    </div>
  {/if}
</div>

<ConnectionForm bind:open={formOpen} connection={editing} />
