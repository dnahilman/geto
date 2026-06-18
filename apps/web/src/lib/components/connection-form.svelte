<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query'
  import { toast } from 'svelte-sonner'
  import * as Dialog from '$lib/components/ui/dialog'
  import * as Select from '$lib/components/ui/select'
  import * as Tabs from '$lib/components/ui/tabs'
  import { Button } from '$lib/components/ui/button'
  import { Input } from '$lib/components/ui/input'
  import { Label } from '$lib/components/ui/label'
  import { Textarea } from '$lib/components/ui/textarea'
  import {
    connectionsKey,
    createConnection,
    updateConnection,
    testNewConnection,
    getProviders,
    providersKey,
    type Connection,
    type ConnectionInput,
    type SslMode,
  } from '$lib/api/connections'
  import { parseConnectionUrl } from '$lib/api/connection-url'

  let {
    open = $bindable(false),
    connection = null,
  }: { open?: boolean; connection?: Connection | null } = $props()

  const sslModes: SslMode[] = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full']
  const qc = useQueryClient()

  const providers = createQuery(() => ({ queryKey: providersKey, queryFn: getProviders }))

  type SshState = {
    enabled: boolean
    host: string
    port: number
    username: string
    authMethod: 'password' | 'key'
    password?: string
    privateKey?: string
    passphrase?: string
  }
  const blankSsh = (): SshState => ({
    enabled: false,
    host: '',
    port: 22,
    username: '',
    authMethod: 'key',
    password: '',
    privateKey: '',
    passphrase: '',
  })

  const blank = (): ConnectionInput => ({
    name: '',
    provider: 'postgresql',
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    username: 'postgres',
    password: '',
    sslMode: 'prefer',
    readonly: false,
  })

  let form = $state<ConnectionInput>(blank())
  let ssh = $state<SshState>(blankSsh())
  let testing = $state(false)
  let mode = $state<'fields' | 'url'>('fields')
  let url = $state('')
  let urlError = $state(false)

  // Manual toggle: when geto runs in a container, a DB on the host must be
  // reached via `host.docker.internal` instead of `localhost`. The user decides.
  const useHostGateway = $derived(form.host.trim() === 'host.docker.internal')
  function setHostGateway(on: boolean) {
    const next = on ? 'host.docker.internal' : 'localhost'
    form.host = next
    if (mode === 'url' && url) {
      url = url.replace(/(@)([^:/?]+)/, `$1${next}`)
    }
  }

  // re-seed whenever the dialog opens
  $effect(() => {
    if (open) {
      mode = 'fields'
      url = ''
      urlError = false
      form = connection
        ? {
            name: connection.name,
            provider: connection.provider,
            host: connection.host,
            port: connection.port,
            database: connection.database,
            username: connection.username,
            password: undefined, // keep existing unless user types one
            sslMode: connection.sslMode,
            color: connection.color,
            readonly: connection.readonly,
          }
        : blank()
      ssh = connection?.ssh
        ? {
            enabled: connection.ssh.enabled,
            host: connection.ssh.host,
            port: connection.ssh.port,
            username: connection.ssh.username,
            authMethod: connection.ssh.authMethod,
            password: undefined, // keep existing unless re-entered
            privateKey: undefined,
            passphrase: undefined,
          }
        : blankSsh()
    }
  })

  function applyUrl() {
    const parsed = parseConnectionUrl(url)
    if (!parsed) {
      urlError = url.trim().length > 0
      return
    }
    urlError = false
    form = { ...form, ...parsed }
  }

  // Merge the separate ssh state into the connection input. Omit ssh entirely
  // when disabled so a direct connection stays untouched.
  function withSsh(input: ConnectionInput): ConnectionInput {
    return { ...input, ssh: ssh.enabled ? { ...ssh } : { ...ssh, enabled: false } }
  }

  const save = createMutation(() => ({
    mutationFn: (input: ConnectionInput) =>
      connection ? updateConnection(connection.id, withSsh(input)) : createConnection(withSsh(input)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: connectionsKey })
      toast.success(connection ? 'Connection updated' : 'Connection created')
      open = false
    },
    onError: (e: Error) => toast.error(e.message),
  }))

  async function test() {
    testing = true
    try {
      const r = await testNewConnection(withSsh({ ...form, password: form.password ?? '' }))
      if (r.error) toast.error(r.error)
      else toast.success(`Connected — ${r.version?.split(',')[0]} (${r.latencyMs}ms)`)
    } catch (e) {
      toast.error((e as Error).message || 'Connection failed')
    } finally {
      testing = false
    }
  }

  const providerLabel = $derived(
    providers.data?.find((p) => p.id === form.provider)?.label ?? 'PostgreSQL',
  )
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title>{connection ? 'Edit connection' : 'New connection'}</Dialog.Title>
    </Dialog.Header>

    <div class="grid gap-3 py-1">
      <div class="grid gap-1.5">
        <Label for="cn-name">Name</Label>
        <Input id="cn-name" bind:value={form.name} placeholder="My database" />
      </div>

      <div class="grid gap-1.5">
        <Label>Provider</Label>
        <Select.Root type="single" bind:value={form.provider}>
          <Select.Trigger class="w-full">{providerLabel}</Select.Trigger>
          <Select.Content>
            {#each providers.data ?? [{ id: 'postgresql', label: 'PostgreSQL' }] as p (p.id)}
              <Select.Item value={p.id}>{p.label}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <Tabs.Root bind:value={mode}>
        <Tabs.List class="grid w-full grid-cols-2">
          <Tabs.Trigger value="fields">Fields</Tabs.Trigger>
          <Tabs.Trigger value="url">Connection URL</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="fields" class="mt-3 grid gap-3">
          <div class="grid grid-cols-3 gap-2">
            <div class="col-span-2 grid gap-1.5">
              <Label for="cn-host">Host</Label>
              <Input id="cn-host" bind:value={form.host} />
            </div>
            <div class="grid gap-1.5">
              <Label for="cn-port">Port</Label>
              <Input id="cn-port" type="number" bind:value={form.port} />
            </div>
          </div>
          <div class="grid gap-1.5">
            <Label for="cn-db">Database</Label>
            <Input id="cn-db" bind:value={form.database} />
          </div>
          <div class="grid grid-cols-2 gap-2">
            <div class="grid gap-1.5">
              <Label for="cn-user">User</Label>
              <Input id="cn-user" bind:value={form.username} />
            </div>
            <div class="grid gap-1.5">
              <Label for="cn-pass">Password</Label>
              <Input
                id="cn-pass"
                type="password"
                bind:value={form.password}
                placeholder={connection ? '•••• (unchanged)' : ''}
              />
            </div>
          </div>
          <div class="grid gap-1.5">
            <Label>SSL mode</Label>
            <Select.Root type="single" bind:value={form.sslMode}>
              <Select.Trigger class="w-full">{form.sslMode}</Select.Trigger>
              <Select.Content>
                {#each sslModes as m (m)}
                  <Select.Item value={m}>{m}</Select.Item>
                {/each}
              </Select.Content>
            </Select.Root>
          </div>
        </Tabs.Content>

        <Tabs.Content value="url" class="mt-3 grid gap-2">
          <Label for="cn-url">Connection string</Label>
          <Textarea
            id="cn-url"
            bind:value={url}
            oninput={applyUrl}
            rows={3}
            class="font-mono text-xs"
            placeholder="postgres://user:password@host:5432/database?sslmode=disable"
          />
          {#if urlError}
            <p class="text-destructive text-xs">Not a valid postgres:// URL.</p>
          {:else if url.trim()}
            <p class="text-muted-foreground text-xs">
              Parsed → {form.username}@{form.host}:{form.port}/{form.database} (ssl: {form.sslMode})
            </p>
          {/if}
        </Tabs.Content>
      </Tabs.Root>

      <!-- SSH tunnel (optional). Off by default; the section stays collapsed
           until enabled, and a disabled connection is a plain direct connection. -->
      <div class="rounded-md border">
        <label class="flex cursor-pointer items-center gap-2 px-3 py-2">
          <input
            type="checkbox"
            checked={ssh.enabled}
            onchange={(e) => (ssh.enabled = (e.target as HTMLInputElement).checked)}
            class="h-4 w-4 cursor-pointer"
          />
          <span class="text-sm font-medium">SSH tunnel</span>
          <span class="text-muted-foreground ml-auto text-xs">
            connect via an SSH server
          </span>
        </label>

        {#if ssh.enabled}
          <div class="grid gap-3 border-t px-3 py-3">
            <div class="grid grid-cols-3 gap-2">
              <div class="col-span-2 grid gap-1.5">
                <Label for="ssh-host">SSH host</Label>
                <Input id="ssh-host" bind:value={ssh.host} placeholder="bastion.example.com" />
              </div>
              <div class="grid gap-1.5">
                <Label for="ssh-port">Port</Label>
                <Input id="ssh-port" type="number" bind:value={ssh.port} />
              </div>
            </div>
            <div class="grid gap-1.5">
              <Label for="ssh-user">SSH user</Label>
              <Input id="ssh-user" bind:value={ssh.username} placeholder="ubuntu" />
            </div>
            <div class="grid gap-1.5">
              <Label>Auth method</Label>
              <Select.Root type="single" bind:value={ssh.authMethod}>
                <Select.Trigger class="w-full">
                  {ssh.authMethod === 'password' ? 'Password' : 'Private key'}
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="key">Private key</Select.Item>
                  <Select.Item value="password">Password</Select.Item>
                </Select.Content>
              </Select.Root>
            </div>

            {#if ssh.authMethod === 'password'}
              <div class="grid gap-1.5">
                <Label for="ssh-pass">SSH password</Label>
                <Input
                  id="ssh-pass"
                  type="password"
                  bind:value={ssh.password}
                  placeholder={connection?.ssh?.hasPassword ? '•••• (unchanged)' : ''}
                />
              </div>
            {:else}
              <div class="grid gap-1.5">
                <Label for="ssh-key">Private key (PEM)</Label>
                <Textarea
                  id="ssh-key"
                  bind:value={ssh.privateKey}
                  rows={4}
                  class="font-mono text-xs"
                  placeholder={connection?.ssh?.hasPrivateKey
                    ? '•••• (unchanged) — paste a new key to replace'
                    : '-----BEGIN OPENSSH PRIVATE KEY-----'}
                />
              </div>
              <div class="grid gap-1.5">
                <Label for="ssh-passphrase">Key passphrase (optional)</Label>
                <Input
                  id="ssh-passphrase"
                  type="password"
                  bind:value={ssh.passphrase}
                  placeholder={connection?.ssh?.hasPassphrase ? '•••• (unchanged)' : ''}
                />
              </div>
            {/if}
            <p class="text-muted-foreground text-xs">
              The Host/Port above are resolved <em>from the SSH server</em> — e.g. use
              <code class="font-mono">localhost</code> for a DB that only listens on the server's loopback.
            </p>
          </div>
        {/if}
      </div>

      <div class="flex gap-4 pt-1">
        <div class="flex items-center gap-2">
          <input
            id="cn-hostgw"
            type="checkbox"
            checked={useHostGateway}
            onchange={(e) => setHostGateway((e.target as HTMLInputElement).checked)}
            class="h-4 w-4 cursor-pointer"
          />
          <Label for="cn-hostgw" class="cursor-pointer text-sm font-normal">
            <code class="font-mono text-xs">Use host.docker.internal</code>
          </Label>
        </div>
        <div class="flex items-center gap-2">
          <input
            id="cn-ro"
            type="checkbox"
            checked={form.readonly}
            onchange={(e) => (form.readonly = (e.target as HTMLInputElement).checked)}
            class="h-4 w-4 cursor-pointer"
          />
          <Label for="cn-ro" class="cursor-pointer text-sm font-normal">
            <code class="font-mono text-xs">Read-only (safe mode)</code>
          </Label>
        </div>
      </div>
    </div>

    <Dialog.Footer class="gap-2 sm:justify-between">
      <Button variant="outline" onclick={test} disabled={testing}>
        {testing ? 'Testing…' : 'Test'}
      </Button>
      <Button onclick={() => save.mutate(form)} disabled={save.isPending || !form.name}>
        {save.isPending ? 'Saving…' : 'Save'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
