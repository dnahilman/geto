<script lang="ts">
  import { toast } from 'svelte-sonner'
  import { KeyRound, PanelLeft, SquareTerminal } from 'lucide-svelte'
  import * as Resizable from '$lib/components/ui/resizable'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import ConnectionSwitcher from '$lib/components/workspace/connection-switcher.svelte'
  import RedisKeyTree from '$lib/components/workspace/redis-key-tree.svelte'
  import RedisConsole from '$lib/components/workspace/redis-console.svelte'
  import RedisKeyView from '$lib/components/workspace/redis-key-view.svelte'
  import WorkspaceTabbar from '$lib/components/workspace/workspace-tabbar.svelte'
  import { Workspace } from '$lib/stores/workspace.svelte'
  import { getConnectionString, type Connection } from '$lib/api/connections'
  import { copyText } from '$lib/clipboard'

  interface Props {
    connId: string
    conn: Connection | undefined
  }

  let { connId, conn }: Props = $props()

  // svelte-ignore state_referenced_locally
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

<div class="flex h-full flex-col">
  <header class="flex h-9 shrink-0 items-center gap-1 border-b bg-background px-2.5">
    <Button
      variant="ghost"
      size="icon"
      class="size-7 shrink-0"
      title="Toggle sidebar"
      onclick={() => (sidebarOpen = !sidebarOpen)}
    >
      <PanelLeft class="size-3.5" />
    </Button>
    <div class="flex items-center gap-1.5 ml-1">
      <ConnectionSwitcher {connId} {conn} />
      <Badge variant="secondary" class="h-4.5 px-1.5 text-[10px] font-semibold">Redis</Badge>
      {#if readonly}<Badge
          variant="secondary"
          class="h-4.5 px-1.5 text-[10px] uppercase font-semibold tracking-wider">read-only</Badge
        >{/if}
    </div>
    <div class="ml-auto flex items-center gap-1">
      <Button
        variant="ghost"
        class="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
        onclick={copyConnString}
        title="Copy connection string (with password)"
      >
        <KeyRound class="size-3.5" /> <span class="hidden sm:inline">Copy connection string</span>
      </Button>
      <Button
        variant="outline"
        class="h-7 px-2.5 text-xs gap-1.5 font-medium ml-1 shadow-2xs"
        onclick={() => ws.openRedisConsole()}
      >
        <SquareTerminal class="size-3.5" /> New console
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
      <WorkspaceTabbar {ws} />

      {#if ws.tabs.length === 0}
        <div class="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2">
          <KeyRound class="size-8" />
          <p class="text-sm">Select a key from the sidebar, or open a console.</p>
        </div>
      {:else}
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
