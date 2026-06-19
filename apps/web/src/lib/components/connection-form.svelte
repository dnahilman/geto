<script lang="ts">
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query'
  import { toast } from 'svelte-sonner'
  import { Database, KeyRound, ArrowLeft } from 'lucide-svelte'
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
    type ProviderMeta,
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

  // Provider-specific field defaults (port comes from provider metadata).
  function defaultsFor(provider: ConnectionInput['provider']) {
    return provider === 'redis'
      ? { database: '0', username: '', sslMode: 'disable' as SslMode }
      : { database: 'postgres', username: 'postgres', sslMode: 'prefer' as SslMode }
  }
  function blankFor(provider: ConnectionInput['provider'], port: number): ConnectionInput {
    return {
      name: '',
      provider,
      host: 'localhost',
      port,
      password: '',
      readonly: false,
      ...defaultsFor(provider),
    }
  }

  // 'pick' = choose a database type (create only); 'form' = the 3-tab form.
  let step = $state<'pick' | 'form'>('pick')
  let tab = $state<'connection' | 'options' | 'ssh'>('connection')
  let mode = $state<'fields' | 'url'>('fields')
  let form = $state<ConnectionInput>(blankFor('postgresql', 5432))
  let ssh = $state<SshState>(blankSsh())
  let testing = $state(false)
  let url = $state('')
  let urlError = $state(false)

  const isRedis = $derived(form.provider === 'redis')
  const providerLabel = $derived(
    providers.data?.find((p) => p.id === form.provider)?.label ?? form.provider,
  )

  function chooseProvider(p: ProviderMeta) {
    form = blankFor(p.id, p.defaultPort)
    step = 'form'
    tab = 'connection'
    mode = 'fields'
  }

  // re-seed whenever the dialog opens
  $effect(() => {
    if (open) {
      tab = 'connection'
      mode = 'fields'
      url = ''
      urlError = false
      if (connection) {
        step = 'form'
        form = {
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
        ssh = connection.ssh
          ? {
              enabled: connection.ssh.enabled,
              host: connection.ssh.host,
              port: connection.ssh.port,
              username: connection.ssh.username,
              authMethod: connection.ssh.authMethod,
              password: undefined,
              privateKey: undefined,
              passphrase: undefined,
            }
          : blankSsh()
      } else {
        step = 'pick'
        form = blankFor('postgresql', 5432)
        ssh = blankSsh()
      }
    }
  })

  const useHostGateway = $derived(form.host.trim() === 'host.docker.internal')
  function setHostGateway(on: boolean) {
    const next = on ? 'host.docker.internal' : 'localhost'
    form.host = next
    if (mode === 'url' && url) url = url.replace(/(@)([^:/?]+)/, `$1${next}`)
  }

  function applyUrl() {
    const parsed = parseConnectionUrl(url)
    if (!parsed) {
      urlError = url.trim().length > 0
      return
    }
    urlError = false
    form = { ...form, ...parsed }
  }

  function withSsh(input: ConnectionInput): ConnectionInput {
    return { ...input, ssh: ssh.enabled ? { ...ssh } : { ...ssh, enabled: false } }
  }

  const save = createMutation(() => ({
    mutationFn: (input: ConnectionInput) =>
      connection
        ? updateConnection(connection.id, withSsh(input))
        : createConnection(withSsh(input)),
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
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="sm:max-w-md">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        {#if step === 'form' && !connection}
          <button
            class="hover:text-foreground text-muted-foreground"
            onclick={() => (step = 'pick')}
            aria-label="Back"
          >
            <ArrowLeft class="size-4" />
          </button>
        {/if}
        {connection
          ? 'Edit connection'
          : step === 'pick'
            ? 'Choose a database'
            : `New ${providerLabel}`}
      </Dialog.Title>
    </Dialog.Header>

    {#if step === 'pick'}
      <!-- ── Step 1: pick database type ── -->
      <div class="grid grid-cols-2 gap-3 py-2">
        {#each providers.data ?? [] as p (p.id)}
          <button
            class="hover:border-primary hover:bg-accent/40 flex flex-col items-center gap-2 rounded-lg border p-4 transition-colors"
            onclick={() => chooseProvider(p)}
          >
            {#if p.kind === 'keyvalue'}
              <KeyRound class="size-7" />
            {:else}
              <Database class="size-7" />
            {/if}
            <span class="text-sm font-medium">{p.label}</span>
            <span class="text-muted-foreground text-xs">
              {p.kind === 'keyvalue' ? 'Key-value' : 'Relational'}
            </span>
          </button>
        {/each}
      </div>
    {:else}
      <!-- ── Step 2: 3-tab form ── -->
      <div class="grid gap-3 py-1">
        <div class="grid gap-1.5">
          <Label for="cn-name">Name</Label>
          <Input id="cn-name" bind:value={form.name} placeholder="My database" />
        </div>

        <Tabs.Root bind:value={tab}>
          <Tabs.List class="grid w-full grid-cols-3">
            <Tabs.Trigger value="connection">Connection</Tabs.Trigger>
            <Tabs.Trigger value="options">Options</Tabs.Trigger>
            <Tabs.Trigger value="ssh">SSH</Tabs.Trigger>
          </Tabs.List>

          <!-- Tab 1: Connection (fields ⇄ URL) -->
          <Tabs.Content value="connection" class="mt-3 grid gap-3">
            <div class="bg-muted flex w-fit rounded-md p-0.5 text-xs">
              <button
                class="rounded px-2 py-1 {mode === 'fields'
                  ? 'bg-background shadow-sm'
                  : 'text-muted-foreground'}"
                onclick={() => (mode = 'fields')}
              >
                Fields
              </button>
              <button
                class="rounded px-2 py-1 {mode === 'url'
                  ? 'bg-background shadow-sm'
                  : 'text-muted-foreground'}"
                onclick={() => (mode = 'url')}
              >
                Connection URL
              </button>
            </div>

            {#if mode === 'fields'}
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
                <Label for="cn-db">{isRedis ? 'DB index' : 'Database'}</Label>
                <Input id="cn-db" bind:value={form.database} placeholder={isRedis ? '0' : ''} />
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div class="grid gap-1.5">
                  <Label for="cn-user">{isRedis ? 'Username (optional)' : 'User'}</Label>
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
              {#if isRedis}
                <label class="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.sslMode !== 'disable'}
                    onchange={(e) =>
                      (form.sslMode = (e.target as HTMLInputElement).checked
                        ? 'require'
                        : 'disable')}
                    class="h-4 w-4 cursor-pointer"
                  />
                  Use TLS (rediss://)
                </label>
              {:else}
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
              {/if}
            {:else}
              <Label for="cn-url">Connection string</Label>
              <Textarea
                id="cn-url"
                bind:value={url}
                oninput={applyUrl}
                rows={3}
                class="font-mono text-xs"
                placeholder={isRedis
                  ? 'redis://:password@host:6379/0'
                  : 'postgres://user:password@host:5432/database?sslmode=disable'}
              />
              {#if urlError}
                <p class="text-destructive text-xs">Not a valid connection URL.</p>
              {:else if url.trim()}
                <p class="text-muted-foreground text-xs">
                  Parsed → {form.username}@{form.host}:{form.port}/{form.database}
                </p>
              {/if}
            {/if}
          </Tabs.Content>

          <!-- Tab 2: Options -->
          <Tabs.Content value="options" class="mt-3 grid gap-3">
            <label class="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.readonly}
                onchange={(e) => (form.readonly = (e.target as HTMLInputElement).checked)}
                class="mt-0.5 h-4 w-4 cursor-pointer"
              />
              <span>
                Read-only (safe mode)
                <span class="text-muted-foreground block text-xs"
                  >Blocks writes/DDL at the connection level.</span
                >
              </span>
            </label>
            <label class="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={useHostGateway}
                onchange={(e) => setHostGateway((e.target as HTMLInputElement).checked)}
                class="mt-0.5 h-4 w-4 cursor-pointer"
              />
              <span>
                Use Docker network
                <span class="text-muted-foreground block text-xs">
                  Reach a host DB from the geto container via <code class="font-mono"
                    >host.docker.internal</code
                  >.
                </span>
              </span>
            </label>
          </Tabs.Content>

          <!-- Tab 3: SSH -->
          <Tabs.Content value="ssh" class="mt-3 grid gap-3">
            <label class="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={ssh.enabled}
                onchange={(e) => (ssh.enabled = (e.target as HTMLInputElement).checked)}
                class="h-4 w-4 cursor-pointer"
              />
              <span class="font-medium">Use SSH tunnel</span>
            </label>

            {#if ssh.enabled}
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
                <code class="font-mono">localhost</code> for a DB that only listens on its loopback.
              </p>
            {/if}
          </Tabs.Content>
        </Tabs.Root>
      </div>

      <Dialog.Footer class="gap-2 sm:justify-between">
        <Button variant="outline" onclick={test} disabled={testing}>
          {testing ? 'Testing…' : 'Test'}
        </Button>
        <Button onclick={() => save.mutate(form)} disabled={save.isPending || !form.name}>
          {save.isPending ? 'Saving…' : 'Save'}
        </Button>
      </Dialog.Footer>
    {/if}
  </Dialog.Content>
</Dialog.Root>
