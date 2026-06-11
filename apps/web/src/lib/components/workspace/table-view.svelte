<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query'
  import { Table2, Braces } from 'lucide-svelte'
  import * as Tabs from '$lib/components/ui/tabs'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import DataGrid from './data-grid.svelte'
  import { getTableDetail, tableDetailKey } from '$lib/api/introspect'
  import type { TabFilter } from '$lib/stores/workspace.svelte'

  let {
    connId,
    schema,
    table,
    filter = undefined,
    onOpenTable,
  }: {
    connId: string
    schema: string
    table: string
    filter?: TabFilter
    onOpenTable?: (schema: string, table: string, filter?: TabFilter) => void
  } = $props()

  const detail = createQuery(() => ({
    queryKey: tableDetailKey(connId, schema, table),
    queryFn: () => getTableDetail(connId, schema, table),
  }))

  let tab = $state('data')
  let dataView = $state<'table' | 'json'>('table')
</script>

<Tabs.Root bind:value={tab} class="flex h-full flex-col gap-0">
  <div class="flex items-center gap-3 border-b px-3 py-1.5">
    <span class="font-mono text-sm">{schema}.{table}</span>
    <Tabs.List class="h-8">
      <Tabs.Trigger value="data" class="text-xs">Data</Tabs.Trigger>
      <Tabs.Trigger value="structure" class="text-xs">Structure</Tabs.Trigger>
    </Tabs.List>

    {#if tab === 'data'}
      <div
        class="bg-muted text-muted-foreground ml-auto flex items-center gap-0.5 rounded-md p-0.5 text-xs"
      >
        <button
          type="button"
          class="flex items-center gap-1 rounded px-2 py-1 {dataView === 'table'
            ? 'bg-background text-foreground shadow-sm'
            : 'hover:text-foreground'}"
          onclick={() => (dataView = 'table')}
        >
          <Table2 class="size-3.5" /> Table
        </button>
        <button
          type="button"
          class="flex items-center gap-1 rounded px-2 py-1 {dataView === 'json'
            ? 'bg-background text-foreground shadow-sm'
            : 'hover:text-foreground'}"
          onclick={() => (dataView = 'json')}
        >
          <Braces class="size-3.5" /> JSON
        </button>
      </div>
    {/if}
  </div>

  <Tabs.Content value="data" class="min-h-0 flex-1">
    <DataGrid {connId} {schema} {table} {filter} {onOpenTable} view={dataView} />
  </Tabs.Content>

  <Tabs.Content value="structure" class="min-h-0 flex-1">
    <ScrollArea class="h-full">
      <div class="space-y-6 p-4 text-sm">
        {#if detail.data}
          <section>
            <h3 class="text-muted-foreground mb-2 text-xs font-semibold uppercase">Columns</h3>
            <table class="w-full text-left text-xs">
              <thead class="text-muted-foreground">
                <tr
                  ><th class="py-1 pr-4">Name</th><th class="py-1 pr-4">Type</th><th
                    class="py-1 pr-4">Nullable</th
                  ><th class="py-1 pr-4">Default</th><th class="py-1">Key</th></tr
                >
              </thead>
              <tbody class="font-mono">
                {#each detail.data.columns as c (c.name)}
                  <tr class="border-t">
                    <td class="py-1 pr-4">{c.name}</td>
                    <td class="py-1 pr-4">{c.type}</td>
                    <td class="py-1 pr-4">{c.notNull ? 'NOT NULL' : 'null'}</td>
                    <td class="text-muted-foreground py-1 pr-4">{c.default ?? ''}</td>
                    <td class="py-1">{c.isPrimaryKey ? 'PK' : ''}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </section>

          <section>
            <h3 class="text-muted-foreground mb-2 text-xs font-semibold uppercase">Indexes</h3>
            {#if detail.data.indexes.length}
              <ul class="space-y-1 font-mono text-xs">
                {#each detail.data.indexes as i (i.name)}
                  <li>
                    <span class="font-medium">{i.name}</span>
                    <span class="text-muted-foreground">— {i.definition}</span>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="text-muted-foreground text-xs">none</p>
            {/if}
          </section>

          <section>
            <h3 class="text-muted-foreground mb-2 text-xs font-semibold uppercase">Constraints</h3>
            {#if detail.data.constraints.length}
              <ul class="space-y-1 font-mono text-xs">
                {#each detail.data.constraints as c (c.name)}
                  <li>
                    <span class="font-medium">{c.name}</span>
                    <span class="text-muted-foreground">({c.type}) — {c.definition}</span>
                  </li>
                {/each}
              </ul>
            {:else}
              <p class="text-muted-foreground text-xs">none</p>
            {/if}
          </section>
        {/if}
      </div>
    </ScrollArea>
  </Tabs.Content>
</Tabs.Root>
