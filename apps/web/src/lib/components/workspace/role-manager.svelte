<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query'
  import { toast } from 'svelte-sonner'
  import { Plus, Trash2, Users, Pencil, X, Check } from 'lucide-svelte'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import * as Select from '$lib/components/ui/select'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import {
    listRoles,
    rolesKey,
    createRole,
    alterRole,
    dropRole,
    setRoleMembership,
    type RoleInfo,
    type RoleAttributes,
  } from '$lib/api/roles'

  let {
    open = $bindable(false),
    connId,
    readonly = false,
  }: { open?: boolean; connId: string; readonly?: boolean } = $props()

  const qc = useQueryClient()
  const roles = createQuery(() => ({
    queryKey: rolesKey(connId),
    queryFn: () => listRoles(connId),
    enabled: open,
  }))

  // Attribute config drives both the badges and the editor checkboxes.
  const ATTRS: { key: keyof RoleInfo & keyof RoleAttributes; label: string }[] = [
    { key: 'canLogin', label: 'LOGIN' },
    { key: 'isSuperuser', label: 'SUPERUSER' },
    { key: 'canCreateDb', label: 'CREATEDB' },
    { key: 'canCreateRole', label: 'CREATEROLE' },
    { key: 'isReplication', label: 'REPLICATION' },
    { key: 'bypassRls', label: 'BYPASSRLS' },
  ]

  type EditState = {
    mode: 'create' | 'edit'
    name: string
    attrs: Record<string, boolean>
    password: string
    connectionLimit: string
  }
  let editor = $state<EditState | null>(null)

  function startCreate() {
    editor = {
      mode: 'create',
      name: '',
      attrs: { canLogin: true },
      password: '',
      connectionLimit: '',
    }
  }
  function startEdit(r: RoleInfo) {
    editor = {
      mode: 'edit',
      name: r.name,
      attrs: Object.fromEntries(ATTRS.map((a) => [a.key, r[a.key] as boolean])),
      password: '',
      connectionLimit: r.connectionLimit === -1 ? '' : String(r.connectionLimit),
    }
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: rolesKey(connId) })
  }

  const save = createMutation(() => ({
    mutationFn: async (e: EditState) => {
      const attributes: RoleAttributes = {
        canLogin: !!e.attrs.canLogin,
        isSuperuser: !!e.attrs.isSuperuser,
        canCreateDb: !!e.attrs.canCreateDb,
        canCreateRole: !!e.attrs.canCreateRole,
        isReplication: !!e.attrs.isReplication,
        bypassRls: !!e.attrs.bypassRls,
        connectionLimit: e.connectionLimit.trim() === '' ? -1 : Number(e.connectionLimit),
      }
      if (e.password.trim()) attributes.password = e.password
      if (e.mode === 'create') {
        await createRole(connId, { name: e.name.trim(), ...attributes })
      } else {
        await alterRole(connId, e.name, attributes)
      }
    },
    onSuccess: (_r, e) => {
      refresh()
      editor = null
      toast.success(e.mode === 'create' ? 'Role created' : 'Role updated')
    },
    onError: (err: Error) => toast.error(err.message),
  }))

  let confirmDrop = $state<string | null>(null)
  const drop = createMutation(() => ({
    mutationFn: (name: string) => dropRole(connId, name),
    onSuccess: () => {
      refresh()
      toast.success('Role dropped')
    },
    onError: (e: Error) => toast.error(e.message),
  }))

  const membership = createMutation(() => ({
    mutationFn: (v: { member: string; parentRole: string; grant: boolean }) =>
      setRoleMembership(connId, v.member, v.parentRole, v.grant),
    onSuccess: () => {
      refresh()
      toast.success('Membership updated')
    },
    onError: (e: Error) => toast.error(e.message),
  }))

  // Membership add: which parent role to grant into the currently-edited role.
  let grantParent = $state('')
  const otherRoles = $derived(
    (roles.data ?? []).map((r) => r.name).filter((n) => n !== editor?.name),
  )
  const editedRole = $derived(roles.data?.find((r) => r.name === editor?.name) ?? null)
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2"><Users class="size-5" /> Roles</Dialog.Title>
    </Dialog.Header>

    {#if readonly}
      <p class="text-muted-foreground text-sm">
        This connection is read-only — roles are shown but cannot be changed.
      </p>
    {:else}
      <div class="flex justify-end">
        <Button size="sm" onclick={startCreate} disabled={!!editor && editor.mode === 'create'}>
          <Plus class="size-4" /> New role
        </Button>
      </div>
    {/if}

    <!-- Editor (create or edit) -->
    {#if editor}
      <div class="grid gap-3 rounded-md border p-3">
        <div class="grid gap-1.5">
          <Label for="role-name">Name</Label>
          <Input
            id="role-name"
            bind:value={editor.name}
            disabled={editor.mode === 'edit'}
            placeholder="app_user"
          />
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-2">
          {#each ATTRS as a (a.key)}
            <label class="flex cursor-pointer items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={editor.attrs[a.key]}
                onchange={(e) => (editor!.attrs[a.key] = (e.target as HTMLInputElement).checked)}
                class="h-3.5 w-3.5 cursor-pointer"
              />
              <span class="font-mono">{a.label}</span>
            </label>
          {/each}
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div class="grid gap-1.5">
            <Label for="role-pass"
              >Password {editor.mode === 'edit' ? '(blank = unchanged)' : ''}</Label
            >
            <Input id="role-pass" type="password" bind:value={editor.password} />
          </div>
          <div class="grid gap-1.5">
            <Label for="role-cl">Connection limit (blank = unlimited)</Label>
            <Input id="role-cl" type="number" min="-1" bind:value={editor.connectionLimit} />
          </div>
        </div>

        {#if editor.mode === 'edit' && editedRole}
          <div class="grid gap-1.5">
            <Label>Member of</Label>
            <div class="flex flex-wrap items-center gap-1.5">
              {#each editedRole.memberOf as parent (parent)}
                <Badge variant="secondary" class="gap-1">
                  {parent}
                  <button
                    type="button"
                    class="hover:text-destructive"
                    aria-label="Revoke membership"
                    onclick={() =>
                      membership.mutate({ member: editor!.name, parentRole: parent, grant: false })}
                  >
                    <X class="size-3" />
                  </button>
                </Badge>
              {:else}
                <span class="text-muted-foreground text-xs">none</span>
              {/each}
            </div>
            <div class="flex items-center gap-2">
              <Select.Root type="single" bind:value={grantParent}>
                <Select.Trigger class="h-8 w-48 text-xs">
                  {grantParent || 'Grant membership in…'}
                </Select.Trigger>
                <Select.Content>
                  {#each otherRoles.filter((n) => !editedRole.memberOf.includes(n)) as n (n)}
                    <Select.Item value={n}>{n}</Select.Item>
                  {/each}
                </Select.Content>
              </Select.Root>
              <Button
                size="sm"
                variant="outline"
                class="h-8"
                disabled={!grantParent}
                onclick={() => {
                  membership.mutate({ member: editor!.name, parentRole: grantParent, grant: true })
                  grantParent = ''
                }}
              >
                Grant
              </Button>
            </div>
          </div>
        {/if}

        <div class="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onclick={() => (editor = null)}>Cancel</Button>
          <Button
            size="sm"
            disabled={save.isPending || !editor.name.trim()}
            onclick={() => editor && save.mutate(editor)}
          >
            {editor.mode === 'create' ? 'Create role' : 'Save changes'}
          </Button>
        </div>
      </div>
    {/if}

    <!-- Role list -->
    <div class="max-h-80 divide-y overflow-y-auto rounded-md border">
      {#if roles.data}
        {#each roles.data as r (r.name)}
          <div class="hover:bg-accent/40 flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <div class="flex min-w-0 flex-wrap items-center gap-1.5">
              <span class="font-mono">{r.name}</span>
              {#each ATTRS as a (a.key)}
                {#if r[a.key]}
                  <Badge
                    variant={a.key === 'isSuperuser' ? 'destructive' : 'outline'}
                    class="text-[10px]">{a.label}</Badge
                  >
                {/if}
              {/each}
              {#if r.memberOf.length}
                <span class="text-muted-foreground text-xs">∈ {r.memberOf.join(', ')}</span>
              {/if}
            </div>
            {#if !readonly}
              <div class="flex shrink-0 items-center gap-1">
                <Button variant="ghost" size="icon" class="size-7" onclick={() => startEdit(r)}>
                  <Pencil class="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  class="text-destructive size-7"
                  onclick={() => (confirmDrop = r.name)}
                >
                  <Trash2 class="size-4" />
                </Button>
              </div>
            {/if}
          </div>
        {:else}
          <p class="text-muted-foreground p-3 text-sm">No roles.</p>
        {/each}
      {:else if roles.isError}
        <p class="text-destructive p-3 text-sm">{roles.error.message}</p>
      {:else}
        <p class="text-muted-foreground p-3 text-sm">loading…</p>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>

<AlertDialog.Root open={confirmDrop !== null} onOpenChange={(o) => !o && (confirmDrop = null)}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Drop role “{confirmDrop}”?</AlertDialog.Title>
      <AlertDialog.Description>
        This removes the role from the cluster. It fails if the role still owns objects or has
        privileges granted.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action
        class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onclick={() => {
          if (confirmDrop) {
            drop.mutate(confirmDrop)
            confirmDrop = null
          }
        }}
      >
        Drop role
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
