<script lang="ts">
  import { goto } from '$app/navigation'
  import { createQuery, useQueryClient } from '@tanstack/svelte-query'
  import {
    Plus,
    LogOut,
    Database,
    KeyRound,
    MoreVertical,
    Pencil,
    Copy,
    Trash2,
    ArrowRight,
  } from 'lucide-svelte'
  import { toast } from 'svelte-sonner'
  import { Button } from '$lib/components/ui/button'
  import { Skeleton } from '$lib/components/ui/skeleton'
  import { Badge } from '$lib/components/ui/badge'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import ConnectionForm from '$lib/components/connection-form.svelte'
  import { auth } from '$lib/stores/auth.svelte'
  import { copyText } from '$lib/clipboard'
  import {
    connectionsKey,
    listConnections,
    deleteConnection,
    getConnectionString,
    getProviders,
    providersKey,
    type Connection,
  } from '$lib/api/connections'

  const qc = useQueryClient()
  const connections = createQuery(() => ({
    queryKey: connectionsKey,
    queryFn: listConnections,
  }))

  const providers = createQuery(() => ({
    queryKey: providersKey,
    queryFn: getProviders,
  }))

  const providerLabel = (id: string) => providers.data?.find((p) => p.id === id)?.label ?? id

  let formOpen = $state(false)
  let editing = $state<Connection | null>(null)

  function add() {
    editing = null
    formOpen = true
  }

  function edit(c: Connection) {
    editing = c
    formOpen = true
  }

  async function remove(c: Connection) {
    if (!confirm(`Are you sure you want to delete "${c.name}"?`)) return
    try {
      await deleteConnection(c.id)
      await qc.invalidateQueries({ queryKey: connectionsKey })
      toast.success(`Connection "${c.name}" deleted`)
    } catch (err) {
      toast.error((err as Error).message)
    }
  }

  async function copyConnString(id: string) {
    try {
      const str = await getConnectionString(id, true)
      await copyText(str)
      toast.success('Connection string copied (with password)')
    } catch (err) {
      toast.error((err as Error).message)
    }
  }
</script>

<div class="mx-auto w-full max-w-5xl flex-1 overflow-y-auto p-6">
  <header class="mb-8 flex items-center justify-between">
    <div class="flex items-center gap-2.5">
      <img src="/logo.svg" alt="geto" class="h-7 w-auto invert" />
      <span class="text-muted-foreground font-mono text-xs">v{__APP_VERSION__}</span>
    </div>
    <div class="flex items-center gap-2">
      <Button onclick={add}><Plus class="size-4" /> New connection</Button>
      <Button variant="ghost" size="icon" title="Sign out" onclick={() => auth.logout()}>
        <LogOut class="size-4" />
      </Button>
    </div>
  </header>

  {#if connections.isLoading}
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each Array(3) as _, i (i)}
        <Skeleton class="h-32 w-full rounded-lg" />
      {/each}
    </div>
  {:else if connections.isError}
    <p class="text-destructive">Failed to load connections: {connections.error.message}</p>
  {:else if connections.data && connections.data.length > 0}
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each connections.data as c (c.id)}
        {@const isRedis = c.provider === 'redis'}
        <div
          class="group bg-card text-card-foreground hover:border-primary/50 relative flex flex-col justify-between rounded-lg border p-4 transition-all hover:shadow-xs"
        >
          <div>
            <div class="flex items-start justify-between gap-2">
              <div class="flex items-center gap-2 min-w-0">
                <div class="bg-muted flex size-8 shrink-0 items-center justify-center rounded-md">
                  {#if isRedis}
                    <KeyRound class="size-4 text-rose-500" />
                  {:else}
                    <Database class="size-4 text-primary" />
                  {/if}
                </div>
                <div class="min-w-0">
                  <h3 class="font-medium text-sm truncate" title={c.name}>{c.name}</h3>
                  <p class="text-muted-foreground font-mono text-xs truncate">
                    {c.host}:{c.port}
                  </p>
                </div>
              </div>

              <DropdownMenu.Root>
                <DropdownMenu.Trigger>
                  {#snippet child({ props })}
                    <Button
                      {...props}
                      variant="ghost"
                      size="icon"
                      class="size-7 text-muted-foreground hover:text-foreground"
                    >
                      <MoreVertical class="size-4" />
                    </Button>
                  {/snippet}
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end" class="w-44 text-xs">
                  <DropdownMenu.Item onSelect={() => edit(c)} class="gap-2 cursor-pointer">
                    <Pencil class="size-3.5" /> Edit
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => copyConnString(c.id)}
                    class="gap-2 cursor-pointer"
                  >
                    <Copy class="size-3.5" /> Copy string
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item
                    onSelect={() => remove(c)}
                    class="text-destructive focus:text-destructive gap-2 cursor-pointer"
                  >
                    <Trash2 class="size-3.5" /> Delete
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Root>
            </div>

            <div class="mt-4 flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" class="text-[10px] font-normal">
                {providerLabel(c.provider)}
              </Badge>
              {#if c.database}
                <Badge variant="outline" class="font-mono text-[10px]">
                  {c.database}
                </Badge>
              {/if}
              {#if c.readonly}
                <Badge variant="outline" class="text-[10px] text-amber-500 border-amber-500/30">
                  read-only
                </Badge>
              {/if}
            </div>
          </div>

          <div class="mt-4 pt-3 border-t flex items-center justify-between">
            <span class="text-muted-foreground text-xs font-mono">
              {c.username || 'default'}
            </span>
            <Button
              size="sm"
              variant="ghost"
              class="h-7 text-xs gap-1 group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
              onclick={() => goto(`/c/${c.id}`)}
            >
              Connect <ArrowRight class="size-3" />
            </Button>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <div
      class="border-border flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-20 text-center"
    >
      <img src="/logo.svg" alt="geto" class="size-10 invert opacity-30" />
      <div>
        <p class="font-medium">No connections yet</p>
        <p class="text-muted-foreground text-sm">
          Add a PostgreSQL or MySQL connection to get started.
        </p>
      </div>
      <Button onclick={add}><Plus class="size-4" /> New connection</Button>
    </div>
  {/if}
</div>

<ConnectionForm bind:open={formOpen} connection={editing} />
