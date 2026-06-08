<script lang="ts">
  import { createMutation, useQueryClient } from '@tanstack/svelte-query'
  import { toast } from 'svelte-sonner'
  import { Plus, Trash2 } from 'lucide-svelte'
  import * as Dialog from '$lib/components/ui/dialog'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { Switch } from '$lib/components/ui/switch'
  import { createTable, type ColumnSpec } from '$lib/api/mutations'
  import { treeKey } from '$lib/api/introspect'

  let {
    open = $bindable(false),
    connId,
    schema,
  }: { open?: boolean; connId: string; schema: string } = $props()

  const qc = useQueryClient()
  const COMMON_TYPES = ['serial', 'bigserial', 'int', 'bigint', 'text', 'varchar(255)', 'boolean', 'numeric', 'jsonb', 'uuid', 'timestamptz', 'date']

  let name = $state('')
  let columns = $state<ColumnSpec[]>([{ name: 'id', type: 'serial', primaryKey: true, notNull: false }])

  $effect(() => {
    if (open) {
      name = ''
      columns = [{ name: 'id', type: 'serial', primaryKey: true, notNull: false }]
    }
  })

  function addCol() {
    columns.push({ name: '', type: 'text' })
  }
  function removeCol(i: number) {
    columns.splice(i, 1)
  }

  const create = createMutation(() => ({
    mutationFn: () =>
      createTable(connId, schema, name, columns.filter((c) => c.name.trim() && c.type.trim())),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: treeKey(connId) })
      qc.invalidateQueries({ queryKey: ['completion', connId] })
      toast.success(`Table ${schema}.${name} created`)
      open = false
    },
    onError: (e: Error) => toast.error(e.message),
  }))
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
    <Dialog.Header><Dialog.Title>New table in {schema}</Dialog.Title></Dialog.Header>

    <div class="grid gap-1.5">
      <Label for="tbl-name">Table name</Label>
      <Input id="tbl-name" bind:value={name} placeholder="my_table" />
    </div>

    <datalist id="pg-types">
      {#each COMMON_TYPES as t (t)}<option value={t}></option>{/each}
    </datalist>

    <div class="mt-2 space-y-2">
      <div class="text-muted-foreground grid grid-cols-[1fr_1fr_auto_auto_auto] items-center gap-2 text-xs font-medium">
        <span>Name</span><span>Type</span><span>NN</span><span>PK</span><span></span>
      </div>
      {#each columns as col, i (i)}
        <div class="grid grid-cols-[1fr_1fr_auto_auto_auto] items-center gap-2">
          <Input bind:value={col.name} placeholder="column" class="h-8" />
          <Input bind:value={col.type} list="pg-types" placeholder="type" class="h-8 font-mono" />
          <Switch bind:checked={col.notNull} class="scale-90" />
          <Switch bind:checked={col.primaryKey} class="scale-90" />
          <Button variant="ghost" size="icon" class="size-8" onclick={() => removeCol(i)}>
            <Trash2 class="size-4" />
          </Button>
        </div>
      {/each}
      <Button variant="outline" size="sm" onclick={addCol}><Plus class="size-4" /> Add column</Button>
    </div>

    <Dialog.Footer class="mt-2">
      <Button onclick={() => create.mutate()} disabled={create.isPending || !name.trim()}>
        Create table
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
