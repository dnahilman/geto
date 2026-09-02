<script lang="ts">
  import { page } from '$app/state'
  import { createQuery } from '@tanstack/svelte-query'
  import { connectionsKey, listConnections, getProviders, providersKey } from '$lib/api/connections'
  import SqlWorkspace from '$lib/components/workspace/sql-workspace.svelte'
  import RedisWorkspace from '$lib/components/workspace/redis-workspace.svelte'
  import ConnectionNotFound from '$lib/components/workspace/connection-not-found.svelte'
  import WorkspaceSkeletons from '$lib/components/workspace/workspace-skeletons.svelte'
  import * as Resizable from '$lib/components/ui/resizable'

  const connId = $derived(page.params.connId!)

  const connections = createQuery(() => ({ queryKey: connectionsKey, queryFn: listConnections }))
  const providers = createQuery(() => ({ queryKey: providersKey, queryFn: getProviders }))

  const conn = $derived(connections.data?.find((c) => c.id === connId))
  // Resolve the data model from the connection's provider — never hardcode a name.
  const kind = $derived(providers.data?.find((p) => p.id === conn?.provider)?.kind)
</script>

{#key connId}
  {#if connections.isLoading}
    <div class="flex h-screen flex-col bg-background">
      <Resizable.PaneGroup direction="horizontal" class="min-h-0 flex-1">
        <Resizable.Pane
          order={1}
          defaultSize={20}
          minSize={12}
          maxSize={40}
          class="bg-sidebar flex flex-col border-r"
        >
          <WorkspaceSkeletons type="tree" />
        </Resizable.Pane>
        <Resizable.Pane order={2} defaultSize={80} class="flex min-w-0 flex-col">
          <WorkspaceSkeletons type="table" />
        </Resizable.Pane>
      </Resizable.PaneGroup>
    </div>
  {:else if connections.isSuccess && !conn}
    <ConnectionNotFound {connId} />
  {:else if conn && kind === 'keyvalue'}
    <RedisWorkspace {connId} {conn} />
  {:else if conn}
    <SqlWorkspace {connId} {conn} />
  {/if}
{/key}
