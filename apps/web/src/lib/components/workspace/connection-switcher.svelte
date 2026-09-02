<script lang="ts">
  import { goto } from '$app/navigation'
  import { createQuery } from '@tanstack/svelte-query'
  import { toast } from 'svelte-sonner'
  import { ChevronDown, Check, Pencil, Plus, Copy, LayoutGrid } from 'lucide-svelte'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import { ProviderIcon } from '$lib/components/icons'
  import ConnectionForm from '$lib/components/connection-form.svelte'
  import {
    connectionsKey,
    listConnections,
    getConnectionString,
    type Connection,
  } from '$lib/api/connections'
  import { copyText } from '$lib/clipboard'

  interface Props {
    connId: string
    conn?: Connection
  }

  let { connId, conn }: Props = $props()

  const connections = createQuery(() => ({
    queryKey: connectionsKey,
    queryFn: listConnections,
  }))

  let formOpen = $state(false)
  let editing = $state<Connection | null>(null)

  function openEdit() {
    editing = conn ?? null
    formOpen = true
  }

  function openAdd() {
    editing = null
    formOpen = true
  }

  async function copyConnString() {
    try {
      await copyText(await getConnectionString(connId, true))
      toast.success('Connection string copied (with password)')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <button
        {...props}
        type="button"
        class="flex max-w-[200px] items-center gap-1.5 rounded px-1.5 py-1 text-xs font-semibold hover:bg-accent transition-colors cursor-pointer text-left"
        title="Connections menu"
      >
        <ProviderIcon provider={conn?.provider ?? ''} class="size-3.5 shrink-0" />
        <span class="truncate">{conn?.name ?? connId}</span>
        <ChevronDown class="size-3 opacity-60 shrink-0 ml-0.5" />
      </button>
    {/snippet}
  </DropdownMenu.Trigger>

  <DropdownMenu.Content align="start" class="w-64 text-xs">
    <DropdownMenu.Group>
      <DropdownMenu.GroupHeading
        class="text-[10px] uppercase text-muted-foreground font-semibold px-2 py-1"
      >
        Connections ({connections.data?.length ?? 0})
      </DropdownMenu.GroupHeading>

      {#if connections.data}
        <div class="max-h-56 overflow-y-auto py-0.5">
          {#each connections.data as c (c.id)}
            <DropdownMenu.Item
              onSelect={() => goto(`/c/${c.id}`)}
              class="flex items-center gap-2 cursor-pointer py-1.5 px-2"
            >
              <ProviderIcon provider={c.provider} class="size-3.5 shrink-0" />
              <div class="flex flex-col min-w-0 flex-1">
                <span
                  class="truncate font-medium {c.id === connId
                    ? 'text-foreground font-semibold'
                    : 'text-muted-foreground'}"
                >
                  {c.name}
                </span>
                <span class="truncate text-[10px] text-muted-foreground/70">
                  {c.host}:{c.port}
                  {c.database ? `(${c.database})` : ''}
                </span>
              </div>
              {#if c.id === connId}
                <Check class="size-3.5 text-primary shrink-0" />
              {/if}
            </DropdownMenu.Item>
          {/each}
        </div>
      {/if}
    </DropdownMenu.Group>

    <DropdownMenu.Separator />

    <DropdownMenu.Group>
      {#if conn}
        <DropdownMenu.Item onSelect={openEdit} class="gap-2 cursor-pointer">
          <Pencil class="size-3.5 text-muted-foreground" /> Edit this connection
        </DropdownMenu.Item>
      {/if}
      <DropdownMenu.Item onSelect={openAdd} class="gap-2 cursor-pointer">
        <Plus class="size-3.5 text-muted-foreground" /> New connection
      </DropdownMenu.Item>
      {#if conn}
        <DropdownMenu.Item onSelect={copyConnString} class="gap-2 cursor-pointer">
          <Copy class="size-3.5 text-muted-foreground" /> Copy connection string
        </DropdownMenu.Item>
      {/if}
      <DropdownMenu.Separator />
      <DropdownMenu.Item onSelect={() => goto('/')} class="gap-2 cursor-pointer">
        <LayoutGrid class="size-3.5 text-muted-foreground" /> All connections dashboard
      </DropdownMenu.Item>
    </DropdownMenu.Group>
  </DropdownMenu.Content>
</DropdownMenu.Root>

<ConnectionForm
  bind:open={formOpen}
  connection={editing}
  onsaved={(newConn) => {
    if (!editing || editing.id !== newConn.id) {
      goto(`/c/${newConn.id}`)
    }
  }}
/>
