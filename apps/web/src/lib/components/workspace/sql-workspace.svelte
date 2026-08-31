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

  interface Props {
    connId: string
    conn: Connection | undefined
  }

  let { connId, conn }: Props = $props()

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

{#snippet navbar()}
  <header class="flex h-9 shrink-0 items-center gap-1 border-b bg-background px-2.5">
    <Button variant="ghost" size="icon" class="size-7 shrink-0" href="/" title="Connections">
      <ArrowLeft class="size-3.5" />
    </Button>
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
      <Database class="size-3.5 text-muted-foreground" />
      <span class="text-xs font-semibold tracking-tight">{conn?.name ?? connId}</span>
      {#if conn?.database}<span class="text-muted-foreground font-mono text-[10px]"
          >/ {conn.database}</span
        >{/if}
      {#if conn?.readonly}<Badge variant="secondary" class="h-4.5 px-1.5 text-[10px] uppercase font-semibold tracking-wider">read-only</Badge>{/if}
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
      <Button variant="ghost" class="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground" onclick={() => (dbManagerOpen = true)}>
        <Database class="size-3.5" /> Databases
      </Button>
      <Button variant="ghost" class="h-7 px-2 text-xs gap-1.5 text-muted-foreground hover:text-foreground" onclick={() => (roleManagerOpen = true)}>
        <Users class="size-3.5" /> Roles
      </Button>
      <Button variant="outline" class="h-7 px-2.5 text-xs gap-1.5 font-medium ml-1 shadow-2xs" onclick={() => ws.openConsole()}>
        <SquareTerminal class="size-3.5" /> New SQL Console
      </Button>
    </div>
  </header>
{/snippet}

{#snippet dialogs()}
  <DatabaseManager
    bind:open={dbManagerOpen}
    {connId}
    currentDatabase={conn?.database}
    onSwitched={() => ws.reset()}
  />

  <RoleManager bind:open={roleManagerOpen} {connId} readonly={conn?.readonly ?? false} />
{/snippet}

{#snippet sidebar()}
  <Resizable.Pane
    order={1}
    defaultSize={20}
    minSize={12}
    maxSize={40}
    class="bg-sidebar flex flex-col"
  >
    <div class="min-h-0 flex-1">
      <SchemaTree
        {connId}
        onopen={(s, t) => ws.openTable(s, t)}
        readonly={conn?.readonly ?? false}
      />
    </div>
    <div class="flex shrink-0 items-center gap-2 border-t px-3 py-2">
      <img src="/logo.svg" alt="geto" class="h-5 w-auto invert" />
      <span class="text-muted-foreground ml-auto font-mono text-xs">v{__APP_VERSION__}</span>
    </div>
  </Resizable.Pane>
{/snippet}

{#snippet tabbar()}
  <WorkspaceTabbar {ws} />
{/snippet}

{#snippet tableSqlSpace()}
  {#if ws.tabs.length === 0}
    <div class="text-muted-foreground flex h-full flex-col items-center justify-center gap-2">
      <Table2 class="size-8" />
      <p class="text-sm">Select a table from the sidebar, or open the SQL console.</p>
    </div>
  {:else}
    {@render tabbar()}
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
              isActive={ws.activeId === tab.id}
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
{/snippet}

<div class="flex h-screen flex-col">
  {@render navbar()}
  {@render dialogs()}

  <Resizable.PaneGroup direction="horizontal" class="min-h-0 flex-1">
    {#if sidebarOpen}
      {@render sidebar()}
      <Resizable.Handle withHandle />
    {/if}
    <Resizable.Pane order={2} defaultSize={80} class="flex min-w-0 flex-col">
      {@render tableSqlSpace()}
    </Resizable.Pane>
  </Resizable.PaneGroup>
</div>
