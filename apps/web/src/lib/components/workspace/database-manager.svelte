<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query'
  import { toast } from 'svelte-sonner'
  import { Plus, Trash2, Database, LogIn, Check } from 'lucide-svelte'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import { Input } from '$lib/components/ui/input'
  import { getDatabases, databasesKey } from '$lib/api/introspect'
  import { createDatabase, dropDatabase } from '$lib/api/mutations'
  import { switchDatabase } from '$lib/api/connections'

  let {
    open = $bindable(false),
    connId,
    currentDatabase,
    onSwitched,
  }: {
    open?: boolean
    connId: string
    currentDatabase?: string
    onSwitched?: () => void
  } = $props()

  const qc = useQueryClient()
  const dbs = createQuery(() => ({
    queryKey: databasesKey(connId),
    queryFn: () => getDatabases(connId),
    enabled: open,
  }))

  let newName = $state('')
  let confirmDrop = $state<string | null>(null)

  function refresh() {
    qc.invalidateQueries({ queryKey: databasesKey(connId) })
  }

  const create = createMutation(() => ({
    mutationFn: () => createDatabase(connId, newName.trim()),
    onSuccess: () => {
      refresh()
      newName = ''
      toast.success('Database created')
    },
    onError: (e: Error) => toast.error(e.message),
  }))

  const drop = createMutation(() => ({
    mutationFn: (name: string) => dropDatabase(connId, name),
    onSuccess: () => {
      refresh()
      toast.success('Database dropped')
    },
    onError: (e: Error) => toast.error(e.message),
  }))

  const switchDb = createMutation(() => ({
    mutationFn: (name: string) => switchDatabase(connId, name),
    onSuccess: (_c, name) => {
      // The pool now points at the new database — refetch everything (tree,
      // connection header, completion, …) and clear the old database's tabs.
      qc.invalidateQueries()
      open = false
      onSwitched?.()
      toast.success(`Switched to ${name}`)
    },
    onError: (e: Error) => toast.error(e.message),
  }))
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-lg">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2"><Database class="size-5" /> Databases</Dialog.Title>
    </Dialog.Header>

    <div class="flex gap-2">
      <Input bind:value={newName} placeholder="new_database" class="h-9" />
      <Button onclick={() => create.mutate()} disabled={!newName.trim() || create.isPending}>
        <Plus class="size-4" /> Create
      </Button>
    </div>

    <div class="mt-2 max-h-80 divide-y overflow-y-auto rounded-md border">
      {#if dbs.data}
        {#each dbs.data as db (db.name)}
          {@const isCurrent = db.name === currentDatabase}
          <div class="hover:bg-accent/40 flex items-center justify-between px-3 py-2 text-sm">
            <div class="flex items-center gap-2">
              <span class="font-mono">{db.name}</span>
              {#if isCurrent}<Badge variant="secondary" class="gap-1 text-xs"><Check class="size-3" /> current</Badge>{/if}
              <span class="text-muted-foreground text-xs">{db.size} · {db.owner}</span>
            </div>
            <div class="flex items-center gap-1">
              {#if !isCurrent}
                <Button
                  variant="outline"
                  size="sm"
                  class="h-7"
                  disabled={switchDb.isPending}
                  onclick={() => switchDb.mutate(db.name)}
                >
                  <LogIn class="size-4" /> Switch
                </Button>
              {/if}
              <Button
                variant="ghost"
                size="icon"
                class="text-destructive size-7"
                disabled={isCurrent}
                title={isCurrent ? 'Cannot drop the database you are connected to' : 'Drop database'}
                onclick={() => (confirmDrop = db.name)}
              >
                <Trash2 class="size-4" />
              </Button>
            </div>
          </div>
        {/each}
      {:else}
        <p class="text-muted-foreground p-3 text-sm">loading…</p>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>

<AlertDialog.Root open={confirmDrop !== null} onOpenChange={(o) => !o && (confirmDrop = null)}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Drop database “{confirmDrop}”?</AlertDialog.Title>
      <AlertDialog.Description>
        This permanently deletes the entire database and everything in it. This cannot be undone.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action
        class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onclick={() => confirmDrop && drop.mutate(confirmDrop)}
      >
        Drop database
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
