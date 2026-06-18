<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query'
  import { toast } from 'svelte-sonner'
  import { KeyRound } from 'lucide-svelte'
  import * as Dialog from '$lib/components/ui/dialog'
  import { listRoles, rolesKey } from '$lib/api/roles'
  import {
    getObjectGrants,
    setObjectPrivilege,
    privilegesKey,
    type ObjectKind,
  } from '$lib/api/roles'

  let {
    open = $bindable(false),
    connId,
    schema,
    name,
    kind,
    readonly = false,
  }: {
    open?: boolean
    connId: string
    schema: string
    name: string
    kind: ObjectKind
    readonly?: boolean
  } = $props()

  const TABLE_PRIVS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
  const SCHEMA_PRIVS = ['USAGE', 'CREATE']
  const privs = $derived(kind === 'schema' ? SCHEMA_PRIVS : TABLE_PRIVS)
  const label = $derived(kind === 'schema' ? schema : `${schema}.${name}`)

  const qc = useQueryClient()
  const roles = createQuery(() => ({
    queryKey: rolesKey(connId),
    queryFn: () => listRoles(connId),
    enabled: open,
  }))
  const grants = createQuery(() => ({
    queryKey: privilegesKey(connId, schema, name, kind),
    queryFn: () => getObjectGrants(connId, schema, name, kind),
    enabled: open,
  }))

  // grantee -> set of privileges currently held
  const held = $derived.by(() => {
    const m = new Map<string, Set<string>>()
    for (const g of grants.data ?? []) {
      if (!m.has(g.grantee)) m.set(g.grantee, new Set())
      m.get(g.grantee)!.add(g.privilege)
    }
    return m
  })

  const toggle = createMutation(() => ({
    mutationFn: (v: { role: string; privilege: string; grant: boolean }) =>
      setObjectPrivilege(connId, {
        kind,
        schema,
        name: kind === 'schema' ? '' : name,
        role: v.role,
        privileges: [v.privilege],
        grant: v.grant,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: privilegesKey(connId, schema, name, kind) }),
    onError: (e: Error) => toast.error(e.message),
  }))
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <KeyRound class="size-5" /> Privileges — <span class="font-mono text-base">{label}</span>
      </Dialog.Title>
    </Dialog.Header>

    {#if readonly}
      <p class="text-muted-foreground text-sm">
        This connection is read-only — privileges are shown but cannot be changed.
      </p>
    {/if}

    <div class="max-h-96 overflow-auto rounded-md border">
      {#if roles.data}
        <table class="w-full text-xs">
          <thead class="bg-muted/50 sticky top-0">
            <tr>
              <th class="px-3 py-2 text-left font-medium">Role</th>
              {#each privs as p (p)}
                <th class="px-2 py-2 text-center font-mono font-normal">{p}</th>
              {/each}
            </tr>
          </thead>
          <tbody class="divide-y">
            {#each roles.data as r (r.name)}
              {@const set = held.get(r.name)}
              <tr class="hover:bg-accent/40">
                <td class="px-3 py-1.5 font-mono">{r.name}</td>
                {#each privs as p (p)}
                  {@const on = set?.has(p) ?? false}
                  <td class="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={readonly || toggle.isPending}
                      class="h-3.5 w-3.5 cursor-pointer disabled:cursor-not-allowed"
                      onchange={(e) =>
                        toggle.mutate({
                          role: r.name,
                          privilege: p,
                          grant: (e.target as HTMLInputElement).checked,
                        })}
                    />
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      {:else if roles.isError}
        <p class="text-destructive p-3 text-sm">{roles.error.message}</p>
      {:else}
        <p class="text-muted-foreground p-3 text-sm">loading…</p>
      {/if}
    </div>
    <p class="text-muted-foreground text-xs">
      Empty rows mean the object's owner holds default privileges; only explicit GRANTs are shown.
    </p>
  </Dialog.Content>
</Dialog.Root>
