<script lang="ts">
  import { toast } from 'svelte-sonner'
  import {
    ArrowLeft,
    Database,
    SquareTerminal,
    Table2,
    KeyRound,
    PanelLeft,
    Users,
  } from 'lucide-svelte'
  import * as Resizable from '$lib/components/ui/resizable'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import SchemaTree from '$lib/components/workspace/schema-tree.svelte'
  import TableView from '$lib/components/workspace/table-view.svelte'
  import SqlConsole from '$lib/components/workspace/sql-console.svelte'
  import DatabaseManager from '$lib/components/workspace/database-manager.svelte'
  import RoleManager from '$lib/components/workspace/role-manager.svelte'
  import WorkspaceTabbar from '$lib/components/workspace/workspace-tabbar.svelte'
  import { Workspace } from '$lib/stores/workspace.svelte'
  import { getConnectionString, type Connection } from '$lib/api/connections'
  import { copyText } from '$lib/clipboard'

  let { connId, conn }: { connId: string; conn: Connection | undefined } = $props()

  const ws = new Workspace(connId, 'relational')

  $effect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 't') return
      const t = e.target as Element | null
      if (t?.closest('input, textarea, .cm-editor')) return
      e.preventDefault()
      ws.openConsole()
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  })
  let dbManagerOpen = $state(false)
  let roleManagerOpen = $state(false)
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
      <Database class="size-4" />
      <span class="text-sm font-medium">{conn?.name ?? connId}</span>
      {#if conn?.database}<span class="text-muted-foreground font-mono text-xs"
          >/ {conn.database}</span
        >{/if}
      {#if conn?.readonly}<Badge variant="outline" class="text-xs">read-only</Badge>{/if}
    </div>
    <div class="ml-auto flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onclick={copyConnString}
        title="Copy connection string (with password)"
      >
        <KeyRound class="size-4" /> Copy connection string
      </Button>
      <Button variant="ghost" size="sm" onclick={() => (dbManagerOpen = true)}>
        <Database class="size-4" /> Databases
      </Button>
      <Button variant="ghost" size="sm" onclick={() => (roleManagerOpen = true)}>
        <Users class="size-4" /> Roles
      </Button>
      <Button variant="outline" size="sm" onclick={() => ws.openConsole()}>
        <SquareTerminal class="size-4" /> New SQL Console
      </Button>
    </div>
  </header>

  <DatabaseManager
    bind:open={dbManagerOpen}
    {connId}
    currentDatabase={conn?.database}
    onSwitched={() => ws.reset()}
  />

  <RoleManager bind:open={roleManagerOpen} {connId} readonly={conn?.readonly ?? false} />

  <Resizable.PaneGroup direction="horizontal" class="min-h-0 flex-1">
    {#if sidebarOpen}
      <Resizable.Pane
        order={1}
        defaultSize={20}
        minSize={12}
        maxSize={40}
        class="bg-sidebar flex flex-col"
      >
        <div class="flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <img src="/logo.svg" alt="geto" class="h-5 w-auto invert" />
          <span class="text-muted-foreground ml-auto font-mono text-xs">v{__APP_VERSION__}</span>
        </div>
        <div class="min-h-0 flex-1">
          <SchemaTree
            {connId}
            onopen={(s, t) => ws.openTable(s, t)}
            readonly={conn?.readonly ?? false}
          />
        </div>
      </Resizable.Pane>
      <Resizable.Handle withHandle />
    {/if}
    <Resizable.Pane order={2} defaultSize={80} class="flex min-w-0 flex-col">
      {#if ws.tabs.length === 0}
        <div class="text-muted-foreground flex h-full flex-col items-center justify-center gap-2">
          <Table2 class="size-8" />
          <p class="text-sm">Select a table from the sidebar, or open the SQL console.</p>
        </div>
      {:else}
        <WorkspaceTabbar {ws} onNew={() => ws.openConsole()} newTitle="New SQL console (Ctrl+T)" />

        <!-- active content (keep tables mounted to preserve grid state) -->
        <div class="min-h-0 flex-1">
          {#each ws.tabs as tab (tab.id)}
            <div class="h-full {ws.activeId === tab.id ? '' : 'hidden'}">
              {#if tab.kind === 'table'}
                <TableView
                  {connId}
                  schema={tab.schema}
                  table={tab.table}
                  filter={tab.filter}
                  onOpenTable={(s, t, f) => ws.openTable(s, t, f)}
                />
              {:else if tab.kind === 'console'}
                <SqlConsole
                  {connId}
                  initialSql={tab.sql}
                  onSqlChange={(s) => ws.updateSql(tab.id, s)}
                  onOpenTable={(s, t, f) => ws.openTable(s, t, f)}
                />
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </Resizable.Pane>
  </Resizable.PaneGroup>
</div>
