<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query'
  import { ChevronRight, Table2, Eye, Layers, RefreshCw, Trash2, Eraser, Plus, EllipsisVertical } from 'lucide-svelte'
  import { toast } from 'svelte-sonner'
  import { Input } from '$lib/components/ui/input'
  import { Button } from '$lib/components/ui/button'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import CreateTableDialog from './create-table-dialog.svelte'
  import { getTree, treeKey, type SchemaTree } from '$lib/api/introspect'
  import { dropTable, truncateTable } from '$lib/api/mutations'

  let { connId, onopen }: { connId: string; onopen: (schema: string, table: string) => void } =
    $props()

  const qc = useQueryClient()
  const tree = createQuery(() => ({ queryKey: treeKey(connId), queryFn: () => getTree(connId) }))

  let filter = $state('')
  let collapsed = $state<Record<string, boolean>>({})
  let confirm = $state<{ kind: 'drop' | 'truncate'; schema: string; table: string } | null>(null)
  let createState = $state<{ open: boolean; schema: string }>({ open: false, schema: 'public' })

  function refreshTree() {
    qc.invalidateQueries({ queryKey: treeKey(connId) })
    qc.invalidateQueries({ queryKey: ['completion', connId] })
  }

  const act = createMutation(() => ({
    mutationFn: async ({ kind, schema, table }: NonNullable<typeof confirm>) => {
      if (kind === 'drop') await dropTable(connId, schema, table)
      else await truncateTable(connId, schema, table)
    },
    onSuccess: (_d, v) => {
      refreshTree()
      toast.success(v.kind === 'drop' ? 'Table dropped' : 'Table truncated')
    },
    onError: (e: Error) => toast.error(e.message),
  }))

  // Opening a dialog directly from a menu item leaves the menu's dismissable
  // overlay on top of the dialog. Defer until the menu has fully closed.
  function afterMenuClose(fn: () => void) {
    setTimeout(fn, 220)
  }
  function newTable(schema: string) {
    afterMenuClose(() => (createState = { open: true, schema }))
  }

  function toggle(schema: string) {
    collapsed[schema] = !collapsed[schema]
  }
  function visibleRelations(s: SchemaTree) {
    const f = filter.trim().toLowerCase()
    return f ? s.relations.filter((r) => r.name.toLowerCase().includes(f)) : s.relations
  }
</script>

<div class="flex h-full flex-col">
  <div class="flex items-center gap-1 p-2">
    <Input bind:value={filter} placeholder="Filter tables…" class="h-8" />
    <Button variant="ghost" size="icon" class="size-8 shrink-0" title="Refresh" onclick={refreshTree}>
      <RefreshCw class="size-4" />
    </Button>
  </div>

  <ScrollArea class="flex-1">
    <div class="px-2 pb-4 text-sm">
      {#if tree.isLoading}
        <p class="text-muted-foreground p-2 text-xs">loading schema…</p>
      {:else if tree.isError}
        <p class="text-destructive p-2 text-xs">{tree.error.message}</p>
      {:else if tree.data}
        {#each tree.data as s (s.schema)}
          {@const rels = visibleRelations(s)}
          {#if !filter || rels.length > 0}
            <div>
              <div class="group hover:bg-accent flex items-center gap-1 rounded pr-1 font-medium">
                <button
                  class="flex min-w-0 flex-1 items-center gap-1 px-1 py-1"
                  onclick={() => toggle(s.schema)}
                >
                  <ChevronRight class="size-3.5 shrink-0 transition-transform {collapsed[s.schema] ? '' : 'rotate-90'}" />
                  <Layers class="text-muted-foreground size-3.5 shrink-0" />
                  <span class="truncate">{s.schema}</span>
                  <span class="text-muted-foreground ml-auto text-xs">{rels.length}</span>
                </button>
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger>
                    {#snippet child({ props })}
                      <button {...props} class="shrink-0 p-0.5 opacity-0 group-hover:opacity-100" aria-label="Schema actions">
                        <EllipsisVertical class="size-3.5" />
                      </button>
                    {/snippet}
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content align="end" class="w-auto">
                    <DropdownMenu.Item onSelect={() => newTable(s.schema)}>
                      <Plus class="size-4" /> New table
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Root>
              </div>

              {#if !collapsed[s.schema]}
                <div class="ml-3 border-l pl-1">
                  {#each rels as r (r.name)}
                    <div class="group hover:bg-accent flex items-center gap-1 rounded pr-1">
                      <button
                        class="flex min-w-0 flex-1 items-center gap-1.5 px-1.5 py-1 text-left"
                        onclick={() => onopen(s.schema, r.name)}
                      >
                        {#if r.type === 'view' || r.type === 'matview'}
                          <Eye class="text-muted-foreground size-3.5 shrink-0" />
                        {:else}
                          <Table2 class="text-muted-foreground size-3.5 shrink-0" />
                        {/if}
                        <span class="truncate">{r.name}</span>
                      </button>
                      {#if r.type === 'table'}
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger>
                            {#snippet child({ props })}
                              <button {...props} class="shrink-0 p-0.5 opacity-0 group-hover:opacity-100" aria-label="Table actions">
                                <EllipsisVertical class="size-3.5" />
                              </button>
                            {/snippet}
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Content align="end" class="w-auto">
                            <DropdownMenu.Item onSelect={() => onopen(s.schema, r.name)}>Open</DropdownMenu.Item>
                            <DropdownMenu.Separator />
                            <DropdownMenu.Item onSelect={() => afterMenuClose(() => (confirm = { kind: 'truncate', schema: s.schema, table: r.name }))}>
                              <Eraser class="size-4" /> Truncate {r.name}
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              class="text-destructive data-highlighted:text-destructive"
                              onSelect={() => afterMenuClose(() => (confirm = { kind: 'drop', schema: s.schema, table: r.name }))}
                            >
                              <Trash2 class="size-4" /> Drop {r.name}
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Root>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        {/each}
      {/if}
    </div>
  </ScrollArea>
</div>

<AlertDialog.Root open={confirm !== null} onOpenChange={(o) => !o && (confirm = null)}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>
        {confirm?.kind === 'drop' ? 'Drop' : 'Truncate'} {confirm?.schema}.{confirm?.table}?
      </AlertDialog.Title>
      <AlertDialog.Description>
        {#if confirm?.kind === 'drop'}
          This permanently removes the table and all its data.
        {:else}
          This permanently removes all rows from the table.
        {/if}
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action
        class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onclick={() => confirm && act.mutate(confirm)}
      >
        {confirm?.kind === 'drop' ? 'Drop table' : 'Truncate'}
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<CreateTableDialog bind:open={createState.open} {connId} schema={createState.schema} />
