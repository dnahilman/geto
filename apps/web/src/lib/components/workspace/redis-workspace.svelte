<script lang="ts">
  import { toast } from 'svelte-sonner'
  import { ArrowLeft, KeyRound, PanelLeft, SquareTerminal } from 'lucide-svelte'
  import * as Resizable from '$lib/components/ui/resizable'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import RedisKeyTree from '$lib/components/workspace/redis-key-tree.svelte'
  import RedisConsole from '$lib/components/workspace/redis-console.svelte'
  import RedisKeyView from '$lib/components/workspace/redis-key-view.svelte'
  import WorkspaceTabbar from '$lib/components/workspace/workspace-tabbar.svelte'
  import { Workspace } from '$lib/stores/workspace.svelte'
  import { getConnectionString, type Connection } from '$lib/api/connections'
  import { copyText } from '$lib/clipboard'

  let { connId, conn }: { connId: string; conn: Connection | undefined } = $props()

  const ws = new Workspace(connId, 'keyvalue')
  const readonly = $derived(conn?.readonly ?? false)

  $effect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 't') return
      const t = e.target as Element | null
      if (t?.closest('input, textarea, .cm-editor')) return
      e.preventDefault()
      ws.openRedisConsole()
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  })
  let sidebarOpen = $state(true)

  async function copyConnString() {
    try {
      await copyText(await getConnectionString(connId, true))
      toast.success('Connection string copied (with password)')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
</script>

<div class="flex h-screen flex-col">
  <header class="flex items-center gap-2 border-b px-3 py-2">
    <Button variant="ghost" size="icon" class="size-8" href="/" title="Connections">
      <ArrowLeft class="size-4" />
    </Button>
    <Button
      variant="ghost"
      size="icon"
      class="size-8"
      title="Toggle sidebar"
      onclick={() => (sidebarOpen = !sidebarOpen)}
    >
      <PanelLeft class="size-4" />
    </Button>
    <div class="flex items-center gap-2">
      <KeyRound class="size-4" />
      <span class="text-sm font-medium">{conn?.name ?? connId}</span>
      <Badge variant="secondary" class="text-xs">Redis</Badge>
      {#if readonly}<Badge variant="outline" class="text-xs">read-only</Badge>{/if}
    </div>
    <div class="ml-auto flex items-center gap-2">
      <Button variant="ghost" size="sm" onclick={copyConnString}>
        <KeyRound class="size-4" /> Copy connection string
      </Button>
      <Button variant="outline" size="sm" onclick={() => ws.openRedisConsole()}>
        <SquareTerminal class="size-4" /> New console
      </Button>
    </div>
  </header>

  <Resizable.PaneGroup direction="horizontal" class="min-h-0 flex-1">
    {#if sidebarOpen}
      <Resizable.Pane
        order={1}
        defaultSize={22}
        minSize={14}
        maxSize={45}
        class="bg-sidebar flex flex-col"
      >
        <div class="flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <img src="/logo.svg" alt="geto" class="h-5 w-auto invert" />
          <span class="text-muted-foreground ml-auto font-mono text-xs">v{__APP_VERSION__}</span>
        </div>
        <div class="min-h-0 flex-1">
          <RedisKeyTree {connId} {readonly} onopen={(key) => ws.openKey(key)} />
        </div>
      </Resizable.Pane>
      <Resizable.Handle withHandle />
    {/if}
    <Resizable.Pane order={2} defaultSize={78} class="flex min-w-0 flex-col">
      {#if ws.tabs.length === 0}
        <div class="text-muted-foreground flex h-full flex-col items-center justify-center gap-2">
          <KeyRound class="size-8" />
          <p class="text-sm">Select a key from the sidebar, or open a console.</p>
        </div>
      {:else}
        <WorkspaceTabbar {ws} />

        <div class="min-h-0 flex-1">
          {#each ws.tabs as tab (tab.id)}
            <div class="h-full {ws.activeId === tab.id ? '' : 'hidden'}">
              {#if tab.kind === 'rkey'}
                <RedisKeyView
                  {connId}
                  redisKey={tab.key}
                  {readonly}
                  onDeleted={() => ws.close(tab.id)}
                />
              {:else if tab.kind === 'rconsole'}
                <RedisConsole
                  {connId}
                  initialCmd={tab.cmd}
                  onCmdChange={(c) => ws.updateCmd(tab.id, c)}
                />
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </Resizable.Pane>
  </Resizable.PaneGroup>
</div>
