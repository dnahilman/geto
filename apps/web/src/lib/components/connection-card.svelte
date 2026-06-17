<script lang="ts">
  import { goto } from '$app/navigation'
  import { createMutation, useQueryClient } from '@tanstack/svelte-query'
  import { toast } from 'svelte-sonner'
  import { Database, EllipsisVertical, Pencil, Copy, KeyRound, Plug, Trash2 } from 'lucide-svelte'
  import * as Card from '$lib/components/ui/card'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import { Badge } from '$lib/components/ui/badge'
  import { Button } from '$lib/components/ui/button'
  import { copyText } from '$lib/clipboard'
  import {
    connectionsKey,
    deleteConnection,
    getConnectionString,
    testSavedConnection,
    type Connection,
  } from '$lib/api/connections'

  let { connection, onedit }: { connection: Connection; onedit: (c: Connection) => void } = $props()

  const qc = useQueryClient()
  let confirmOpen = $state(false)

  const remove = createMutation(() => ({
    mutationFn: () => deleteConnection(connection.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: connectionsKey })
      toast.success('Connection deleted')
    },
    onError: (e: Error) => toast.error(e.message),
  }))

  async function copyString(withPassword: boolean) {
    try {
      const s = await getConnectionString(connection.id, withPassword)
      await copyText(s)
      toast.success(withPassword ? 'Copied (with password)' : 'Copied (masked)')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function test() {
    try {
      const r = await testSavedConnection(connection.id)
      if (!r.error) toast.success(`Connected — ${r.version?.split(',')[0]} (${r.latencyMs}ms)`)
      else toast.error(r.error || 'Connection failed')
    } catch (e) {
      toast.error((e as Error).message || 'Connection failed')
    }
  }
</script>

<Card.Root
  class="hover:border-primary/40 group relative cursor-pointer transition-colors"
  onclick={() => goto(`/c/${connection.id}`)}
>
  <Card.Header class="flex flex-row items-start justify-between gap-2 space-y-0">
    <div class="flex min-w-0 items-center gap-2">
      <Database class="text-muted-foreground size-5 shrink-0" />
      <div class="min-w-0">
        <Card.Title class="truncate text-base">{connection.name}</Card.Title>
        <p class="text-muted-foreground truncate text-xs">
          {connection.username}@{connection.host}:{connection.port}/{connection.database}
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
            class="size-7 shrink-0"
            onclick={(e: MouseEvent) => e.stopPropagation()}
          >
            <EllipsisVertical class="size-4" />
          </Button>
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" onclick={(e) => e.stopPropagation()} class="w-auto">
        <DropdownMenu.Item onSelect={() => onedit(connection)}>
          <Pencil class="size-4" /> Edit
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => test()}>
          <Plug class="size-4" /> Test connection
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item onSelect={() => copyString(false)}>
          <Copy class="size-4" /> Copy connection string
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => copyString(true)}>
          <KeyRound class="size-4" /> Copy with password
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          class="text-destructive data-highlighted:text-destructive"
          onSelect={() => setTimeout(() => (confirmOpen = true), 220)}
        >
          <Trash2 class="size-4" /> Delete
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </Card.Header>

  <Card.Content class="flex gap-1.5">
    <Badge variant="secondary" class="text-xs">ssl: {connection.sslMode}</Badge>
    {#if connection.readonly}
      <Badge variant="outline" class="text-xs">read-only</Badge>
    {/if}
  </Card.Content>
</Card.Root>

<AlertDialog.Root bind:open={confirmOpen}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Delete “{connection.name}”?</AlertDialog.Title>
      <AlertDialog.Description>
        This removes the saved connection and its query history from geto. The database itself is
        not affected.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action
        class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onclick={() => { remove.mutate(); confirmOpen = false }}
      >
        Delete
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
