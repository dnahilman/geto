<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query'
  import { toast } from 'svelte-sonner'
  import { Trash2, RefreshCw, Clock } from 'lucide-svelte'
  import { Button } from '$lib/components/ui/button'
  import { Badge } from '$lib/components/ui/badge'
  import ResultTable from './result-table.svelte'
  import { getKeyValue, keyValueKey, deleteKey } from '$lib/api/keys'
  import { keyValueToResult } from '$lib/redis-result'

  let {
    connId,
    redisKey,
    readonly = false,
    onDeleted,
  }: {
    connId: string
    redisKey: string
    readonly?: boolean
    onDeleted?: (key: string) => void
  } = $props()

  const qc = useQueryClient()
  let view = $state<'table' | 'json' | 'structure'>('table')

  const value = createQuery(() => ({
    queryKey: keyValueKey(connId, redisKey),
    queryFn: () => getKeyValue(connId, redisKey),
  }))

  const result = $derived(value.data ? keyValueToResult(value.data) : null)

  const remove = createMutation(() => ({
    mutationFn: () => deleteKey(connId, redisKey),
    onSuccess: () => {
      toast.success('Key deleted')
      onDeleted?.(redisKey)
    },
    onError: (e: Error) => toast.error(e.message),
  }))

  function refresh() {
    qc.invalidateQueries({ queryKey: keyValueKey(connId, redisKey) })
  }
</script>

<div class="flex h-full flex-col">
  <div class="flex shrink-0 items-center gap-2 border-b px-3 py-1.5">
    <span class="truncate font-mono text-sm">{redisKey}</span>
    {#if value.data}
      <Badge variant="secondary" class="text-xs">{value.data.type}</Badge>
      {#if value.data.ttl >= 0}
        <Badge variant="outline" class="gap-1 text-xs"
          ><Clock class="size-3" /> {value.data.ttl}s</Badge
        >
      {/if}
    {/if}
    <Button variant="ghost" size="icon" class="ml-auto size-7" title="Refresh" onclick={refresh}>
      <RefreshCw class="size-4" />
    </Button>
    {#if !readonly}
      <Button
        variant="ghost"
        size="icon"
        class="text-destructive size-7"
        title="Delete key"
        disabled={remove.isPending}
        onclick={() => remove.mutate()}
      >
        <Trash2 class="size-4" />
      </Button>
    {/if}
  </div>

  <div class="min-h-0 flex-1">
    {#if value.isError}
      <p class="text-destructive p-4 text-sm">{value.error.message}</p>
    {:else if value.data?.type === 'none'}
      <p class="text-muted-foreground p-4 text-sm">Key no longer exists.</p>
    {:else if result}
      <ResultTable
        {connId}
        columns={result.columns}
        rows={result.rows}
        source={null}
        {view}
        onViewChange={(v) => (view = v)}
      />
    {:else}
      <p class="text-muted-foreground p-4 text-sm">Loading…</p>
    {/if}
  </div>
</div>
