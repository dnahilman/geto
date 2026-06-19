<script lang="ts">
  import { page } from '$app/state'
  import { createQuery } from '@tanstack/svelte-query'
  import { connectionsKey, listConnections, getProviders, providersKey } from '$lib/api/connections'
  import SqlWorkspace from '$lib/components/workspace/sql-workspace.svelte'
  import RedisWorkspace from '$lib/components/workspace/redis-workspace.svelte'

  const connId = $derived(page.params.connId!)

  const connections = createQuery(() => ({ queryKey: connectionsKey, queryFn: listConnections }))
  const providers = createQuery(() => ({ queryKey: providersKey, queryFn: getProviders }))

  const conn = $derived(connections.data?.find((c) => c.id === connId))
  // Resolve the data model from the connection's provider — never hardcode a name.
  const kind = $derived(providers.data?.find((p) => p.id === conn?.provider)?.kind)
</script>

{#if conn && kind === 'keyvalue'}
  <RedisWorkspace {connId} {conn} />
{:else}
  <!-- relational (default) — also the render while metadata loads -->
  <SqlWorkspace {connId} {conn} />
{/if}
