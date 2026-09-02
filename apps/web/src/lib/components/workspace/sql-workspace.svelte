<script lang="ts">
  import { toast } from 'svelte-sonner'
  import { Database, Table2, Users, ChevronDown, Copy } from 'lucide-svelte'
  import * as Resizable from '$lib/components/ui/resizable'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import { Badge } from '$lib/components/ui/badge'
  import ConnectionSwitcher from '$lib/components/workspace/connection-switcher.svelte'
  import SchemaTree from '$lib/components/workspace/schema-tree.svelte'
  import TableView from './table-view.svelte'
  import SQLConsole from '$lib/components/workspace/sql-console.svelte'
  import DatabaseManager from '$lib/components/workspace/database-manager.svelte'
  import RoleManager from '$lib/components/workspace/role-manager.svelte'
  import WorkspaceTabbar from '$lib/components/workspace/workspace-tabbar.svelte'
  import WorkspaceBottombar from '$lib/components/workspace/workspace-bottombar.svelte'
  import { Workspace } from '$lib/stores/workspace.svelte'
  import { getConnectionString, type Connection } from '$lib/api/connections'
  import { copyText } from '$lib/clipboard'

  interface Props {
    connId: string
    conn: Connection | undefined
  }

  let { connId, conn }: Props = $props()

  // svelte-ignore state_referenced_locally
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

{#snippet dialogs()}
  <DatabaseManager
    bind:open={dbManagerOpen}
    {connId}
    currentDatabase={conn?.database}
    onSwitched={() => ws.reset()}
  />

  <RoleManager bind:open={roleManagerOpen} {connId} readonly={conn?.readonly ?? false} />
{/snippet}

{#snippet sidebarFooter()}
  <div class="flex shrink-0 items-center gap-2 border-t px-3 py-1.5">
    <img src="/logo.svg" alt="geto" class="h-5 w-auto invert" />
    <span class="text-muted-foreground ml-auto font-mono text-xs">v{__APP_VERSION__}</span>
  </div>
{/snippet}

{#snippet sidebarHeader()}
  <div class="flex shrink-0 items-center justify-between gap-1 border-b px-2 py-1.5 min-w-0">
    <div class="flex items-center gap-1 min-w-0 flex-1">
      <ConnectionSwitcher {connId} {conn} />
      {#if conn?.database}
        <div class="h-3.5 w-px bg-border my-auto shrink-0"></div>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                type="button"
                class="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-mono font-medium hover:bg-accent transition-colors cursor-pointer shrink-0"
                title="Database actions ({conn.database})"
              >
                <span class="max-w-[85px] truncate">{conn.database}</span>
                <ChevronDown class="size-3 opacity-60" />
              </button>
            {/snippet}
          </DropdownMenu.Trigger>
          <DropdownMenu.Content align="start" class="w-48 text-xs">
            <DropdownMenu.Group>
              <DropdownMenu.GroupHeading class="text-[10px] uppercase text-muted-foreground">
                Database Actions
              </DropdownMenu.GroupHeading>
              <DropdownMenu.Item
                onSelect={() => (dbManagerOpen = true)}
                class="gap-2 cursor-pointer"
              >
                <Database class="size-3.5" /> Switch database
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => (roleManagerOpen = true)}
                class="gap-2 cursor-pointer"
              >
                <Users class="size-3.5" /> Roles & permissions
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item onSelect={copyConnString} class="gap-2 cursor-pointer">
                <Copy class="size-3.5" /> Copy connection string
              </DropdownMenu.Item>
            </DropdownMenu.Group>
          </DropdownMenu.Content>
        </DropdownMenu.Root>
      {/if}
    </div>
    {#if conn?.readonly}
      <Badge
        variant="secondary"
        class="h-4 px-1 text-[9px] uppercase font-semibold tracking-wider shrink-0"
      >
        ro
      </Badge>
    {/if}
  </div>
{/snippet}

{#snippet sidebar()}
  <Resizable.Pane
    order={1}
    defaultSize={20}
    minSize={12}
    maxSize={40}
    class="bg-sidebar flex flex-col"
  >
    {@render sidebarHeader()}
    <div class="min-h-0 flex-1">
      <SchemaTree
        {connId}
        onopen={(s, t) => ws.openTable(s, t)}
        readonly={conn?.readonly ?? false}
      />
    </div>
    {@render sidebarFooter()}
  </Resizable.Pane>
{/snippet}

{#snippet tabbar()}
  <WorkspaceTabbar {ws} />
{/snippet}

{#snippet workspaces()}
  <div class="flex h-full flex-col">
    {@render tabbar()}
    {#if ws.tabs.length === 0}
      <div class="text-muted-foreground flex flex-1 flex-col items-center justify-center gap-2">
        <Table2 class="size-8" />
        <p class="text-sm">Select a table from the sidebar, or open the SQL console.</p>
      </div>
      <WorkspaceBottombar onToggleSidebar={() => (sidebarOpen = !sidebarOpen)} />
    {:else}
      <!-- active content (keep tables mounted to preserve grid state) -->
      <div class="min-h-0 flex-1">
        {#each ws.tabs as tab (tab.id)}
          <div class="h-full {ws.activeId === tab.id ? '' : 'hidden'}">
            {#if tab.kind === 'table'}
              <TableView
                {connId}
                schema={tab.schema}
                tableName={tab.table}
                filter={tab.filter}
                view={tab.view ?? 'table'}
                onToggleSidebar={() => (sidebarOpen = !sidebarOpen)}
                onOpenTable={(s, t, f) => ws.openTable(s, t, f)}
              />
            {:else if tab.kind === 'console'}
              <SQLConsole
                {connId}
                initialSql={tab.sql}
                onSqlChange={(s) => ws.updateSql(tab.id, s)}
                onOpenTable={(s, t, f) => ws.openTable(s, t, f)}
                onToggleSidebar={() => (sidebarOpen = !sidebarOpen)}
              />
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/snippet}

<div class="flex h-screen flex-col">
  {@render dialogs()}

  <Resizable.PaneGroup direction="horizontal" class="min-h-0 flex-1">
    {#if sidebarOpen}
      {@render sidebar()}
      <Resizable.Handle withHandle />
    {/if}
    <Resizable.Pane order={2} defaultSize={80} class="flex min-w-0 flex-col">
      {@render workspaces()}
    </Resizable.Pane>
  </Resizable.PaneGroup>
</div>
