<script lang="ts">
  import { createMutation, useQueryClient } from '@tanstack/svelte-query'
  import { toast } from 'svelte-sonner'
  import { ChevronRight, Folder, KeyRound, RefreshCw, Trash2, Plug } from 'lucide-svelte'
  import { Input } from '$lib/components/ui/input'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import { ScrollArea } from '$lib/components/ui/scroll-area'
  import * as ContextMenu from '$lib/components/ui/context-menu'
  import { scanKeys, deleteKey, type KeyEntry } from '$lib/api/keys'

  let {
    connId,
    onopen,
    readonly = false,
  }: { connId: string; onopen: (key: string) => void; readonly?: boolean } = $props()

  const qc = useQueryClient()
  let match = $state('')
  let keys = $state<KeyEntry[]>([])
  let cursor = $state('0')
  let scanning = $state(false)
  const done = $derived(cursor === '0')
  let collapsed = $state<Record<string, boolean>>({})

  async function load(reset: boolean) {
    if (scanning) return
    scanning = true
    try {
      // A bare term is treated as a substring match (*term*); '*' passes through.
      const m = match.trim()
      const pattern = m === '' ? '*' : m.includes('*') ? m : `*${m}*`
      const res = await scanKeys(connId, {
        match: pattern,
        cursor: reset ? '0' : cursor,
        count: 500,
      })
      keys = reset ? res.keys : [...keys, ...res.keys]
      cursor = res.cursor
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      scanning = false
    }
  }

  // Debounced (re)scan when the filter settles; also runs once on mount.
  $effect(() => {
    const m = match
    const t = setTimeout(() => {
      void m
      load(true)
    }, 300)
    return () => clearTimeout(t)
  })

  // Group keys by their first ':' segment (folders); the rest stay at the root.
  const groups = $derived.by(() => {
    const folders = new Map<string, KeyEntry[]>()
    const roots: KeyEntry[] = []
    for (const k of keys) {
      const idx = k.key.indexOf(':')
      if (idx > 0) {
        const prefix = k.key.slice(0, idx)
        ;(folders.get(prefix) ?? folders.set(prefix, []).get(prefix)!).push(k)
      } else roots.push(k)
    }
    return {
      folders: [...folders.entries()].sort((a, b) => a[0].localeCompare(b[0])),
      roots: roots.sort((a, b) => a.key.localeCompare(b.key)),
    }
  })

  const remove = createMutation(() => ({
    mutationFn: (key: string) => deleteKey(connId, key),
    onSuccess: (_r, key) => {
      keys = keys.filter((k) => k.key !== key)
      qc.invalidateQueries({ queryKey: ['key', connId, key] })
      toast.success('Key deleted')
    },
    onError: (e: Error) => toast.error(e.message),
  }))

  const toggle = (p: string) => (collapsed[p] = !collapsed[p])
</script>

<div class="flex h-full flex-col">
  <div class="flex shrink-0 items-center gap-1 border-b px-2 py-1.5">
    <Input bind:value={match} placeholder="Search keys…" class="h-7 text-xs" />
    <Button variant="ghost" size="icon" class="size-7" title="Rescan" onclick={() => load(true)}>
      <RefreshCw class="size-3.5 {scanning ? 'animate-spin' : ''}" />
    </Button>
  </div>

  <ScrollArea class="min-h-0 flex-1">
    <div class="p-1 text-xs">
      {#snippet keyRow(k: KeyEntry, label: string, indent: string)}
        <ContextMenu.Root>
          <ContextMenu.Trigger>
            {#snippet child({ props })}
              <button
                {...props}
                class="hover:bg-accent flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left {indent}"
                onclick={() => onopen(k.key)}
              >
                <KeyRound class="text-muted-foreground size-3.5 shrink-0" />
                <span class="truncate font-mono">{label}</span>
                <Badge variant="outline" class="ml-auto shrink-0 text-[10px]">{k.type}</Badge>
              </button>
            {/snippet}
          </ContextMenu.Trigger>
          <ContextMenu.Content class="w-40">
            <ContextMenu.Item onSelect={() => onopen(k.key)}>
              <Plug class="size-4" /> Open
            </ContextMenu.Item>
            {#if !readonly}
              <ContextMenu.Item
                class="text-destructive data-highlighted:text-destructive"
                onSelect={() => setTimeout(() => remove.mutate(k.key), 0)}
              >
                <Trash2 class="size-4" /> Delete
              </ContextMenu.Item>
            {/if}
          </ContextMenu.Content>
        </ContextMenu.Root>
      {/snippet}

      {#each groups.folders as [prefix, items] (prefix)}
        {@const open = !collapsed[prefix]}
        <div>
          <button
            class="hover:bg-accent flex w-full items-center gap-1 rounded px-1 py-1 font-medium"
            onclick={() => toggle(prefix)}
          >
            <ChevronRight
              class="size-3.5 shrink-0 transition-transform {open ? 'rotate-90' : ''}"
            />
            <Folder class="text-muted-foreground size-3.5 shrink-0" />
            <span class="truncate">{prefix}</span>
            <span class="text-muted-foreground ml-auto">{items.length}</span>
          </button>
          {#if open}
            <div class="border-l pl-1">
              {#each items as k (k.key)}
                {@render keyRow(k, k.key.slice(prefix.length + 1), 'ml-3')}
              {/each}
            </div>
          {/if}
        </div>
      {/each}

      {#each groups.roots as k (k.key)}
        {@render keyRow(k, k.key, '')}
      {/each}

      {#if keys.length === 0}
        <p class="text-muted-foreground p-2">{scanning ? 'Scanning…' : 'No keys.'}</p>
      {/if}

      {#if !done}
        <div class="p-1">
          <Button
            variant="outline"
            size="sm"
            class="w-full"
            disabled={scanning}
            onclick={() => load(false)}
          >
            Load more
          </Button>
        </div>
      {/if}
    </div>
  </ScrollArea>
</div>
