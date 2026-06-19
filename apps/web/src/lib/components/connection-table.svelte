<script lang="ts">
  import { goto } from '$app/navigation'
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query'
  import {
    getCoreRowModel,
    getFilteredRowModel,
    getSortedRowModel,
    type ColumnDef,
    type SortingState,
    type ColumnFiltersState,
  } from '@tanstack/table-core'
  import { toast } from 'svelte-sonner'
  import {
    Database,
    Pencil,
    Copy,
    KeyRound,
    Trash2,
    Plug,
    ChevronsUpDown,
    Search,
  } from 'lucide-svelte'
  import * as ContextMenu from '$lib/components/ui/context-menu'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import * as Select from '$lib/components/ui/select'
  import { Input } from '$lib/components/ui/input'
  import { Badge } from '$lib/components/ui/badge'
  import { createSvelteTable } from '$lib/components/ui/data-table'
  import { copyText } from '$lib/clipboard'
  import {
    connectionsKey,
    deleteConnection,
    getConnectionString,
    testSavedConnection,
    getProviders,
    providersKey,
    type Connection,
  } from '$lib/api/connections'

  let { connections, onedit }: { connections: Connection[]; onedit: (c: Connection) => void } =
    $props()

  const qc = useQueryClient()
  const providers = createQuery(() => ({ queryKey: providersKey, queryFn: getProviders }))
  const providerLabel = (id: string) => providers.data?.find((p) => p.id === id)?.label ?? id

  let search = $state('')
  let providerFilter = $state('all')
  let sorting = $state<SortingState>([{ id: 'name', desc: false }])

  const columnFilters = $derived<ColumnFiltersState>(
    providerFilter === 'all' ? [] : [{ id: 'provider', value: providerFilter }],
  )

  const columns: ColumnDef<Connection>[] = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'provider', header: 'Type', filterFn: 'equalsString' },
    { id: 'endpoint', header: 'Host', accessorFn: (c) => `${c.host}:${c.port}` },
    { accessorKey: 'database', header: 'Database' },
    { accessorKey: 'sslMode', header: 'SSL/TLS' },
  ]

  const table = createSvelteTable<Connection>({
    get data() {
      return connections
    },
    columns,
    state: {
      get sorting() {
        return sorting
      },
      get globalFilter() {
        return search
      },
      get columnFilters() {
        return columnFilters
      },
    },
    globalFilterFn: 'includesString',
    onSortingChange: (u) => (sorting = typeof u === 'function' ? u(sorting) : u),
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const rows = $derived(table.getRowModel().rows)
  const headers = $derived(table.getHeaderGroups()[0]?.headers ?? [])

  // ── actions ──
  const remove = createMutation(() => ({
    mutationFn: (id: string) => deleteConnection(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: connectionsKey })
      toast.success('Connection deleted')
    },
    onError: (e: Error) => toast.error(e.message),
  }))
  let confirmDelete = $state<Connection | null>(null)

  async function copyString(c: Connection, withPassword: boolean) {
    try {
      await copyText(await getConnectionString(c.id, withPassword))
      toast.success(withPassword ? 'Copied (with password)' : 'Copied (masked)')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
  async function test(c: Connection) {
    try {
      const r = await testSavedConnection(c.id)
      if (!r.error) toast.success(`Connected — ${r.version?.split(',')[0]} (${r.latencyMs}ms)`)
      else toast.error(r.error)
    } catch (e) {
      toast.error((e as Error).message || 'Connection failed')
    }
  }
</script>

<div class="flex flex-col gap-3">
  <!-- toolbar: search + type filter -->
  <div class="flex items-center gap-2">
    <div class="relative max-w-xs flex-1">
      <Search
        class="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2"
      />
      <Input bind:value={search} placeholder="Search connections…" class="h-9 pl-8" />
    </div>
    <Select.Root type="single" bind:value={providerFilter}>
      <Select.Trigger class="h-9 w-40">
        {providerFilter === 'all' ? 'All types' : providerLabel(providerFilter)}
      </Select.Trigger>
      <Select.Content>
        <Select.Item value="all">All types</Select.Item>
        {#each providers.data ?? [] as p (p.id)}
          <Select.Item value={p.id}>{p.label}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
  </div>

  <div class="overflow-hidden rounded-md border">
    <table class="w-full text-left text-sm">
      <thead class="bg-muted/60 border-b">
        <tr>
          {#each headers as header (header.id)}
            <th class="px-3 py-2 font-medium">
              <button
                class="hover:text-foreground inline-flex items-center gap-1"
                onclick={() => header.column.toggleSorting()}
              >
                {header.column.columnDef.header}
                <ChevronsUpDown class="size-3 opacity-50" />
              </button>
            </th>
          {/each}
          <th class="px-3 py-2 font-medium">Mode</th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.original.id)}
          {@const c = row.original}
          <ContextMenu.Root>
            <ContextMenu.Trigger>
              {#snippet child({ props })}
                <tr
                  {...props}
                  class="hover:bg-accent/50 cursor-pointer border-b last:border-0"
                  onclick={() => goto(`/c/${c.id}`)}
                >
                  <td class="px-3 py-2">
                    <div class="flex items-center gap-2">
                      <span
                        class="size-2 shrink-0 rounded-full"
                        style="background:{c.color ?? 'var(--color-muted-foreground)'}"
                      ></span>
                      <span class="font-medium">{c.name}</span>
                    </div>
                  </td>
                  <td class="px-3 py-2">
                    <Badge variant="secondary" class="gap-1 font-normal">
                      <Database class="size-3" />
                      {providerLabel(c.provider)}
                    </Badge>
                  </td>
                  <td class="text-muted-foreground px-3 py-2 font-mono text-xs"
                    >{c.host}:{c.port}</td
                  >
                  <td class="px-3 py-2 font-mono text-xs">{c.database}</td>
                  <td class="text-muted-foreground px-3 py-2 text-xs">{c.sslMode}</td>
                  <td class="px-3 py-2">
                    {#if c.readonly}<Badge variant="outline" class="text-xs">read-only</Badge>{/if}
                  </td>
                </tr>
              {/snippet}
            </ContextMenu.Trigger>
            <ContextMenu.Content class="w-52">
              <ContextMenu.Item onSelect={() => goto(`/c/${c.id}`)}>
                <Plug class="size-4" /> Open
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => onedit(c)}>
                <Pencil class="size-4" /> Edit
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => test(c)}>
                <Plug class="size-4" /> Test connection
              </ContextMenu.Item>
              <ContextMenu.Separator />
              <ContextMenu.Item onSelect={() => copyString(c, false)}>
                <Copy class="size-4" /> Copy connection string
              </ContextMenu.Item>
              <ContextMenu.Item onSelect={() => copyString(c, true)}>
                <KeyRound class="size-4" /> Copy with password
              </ContextMenu.Item>
              <ContextMenu.Separator />
              <ContextMenu.Item
                class="text-destructive data-highlighted:text-destructive"
                onSelect={() => setTimeout(() => (confirmDelete = c), 220)}
              >
                <Trash2 class="size-4" /> Delete
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Root>
        {:else}
          <tr
            ><td colspan="6" class="text-muted-foreground p-6 text-center">No connections match.</td
            ></tr
          >
        {/each}
      </tbody>
    </table>
  </div>
</div>

<AlertDialog.Root open={confirmDelete !== null} onOpenChange={(o) => !o && (confirmDelete = null)}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Delete “{confirmDelete?.name}”?</AlertDialog.Title>
      <AlertDialog.Description>
        This removes the saved connection and its query history from geto. The database itself is
        not affected.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action
        class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onclick={() => {
          if (confirmDelete) {
            remove.mutate(confirmDelete.id)
            confirmDelete = null
          }
        }}
      >
        Delete
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
