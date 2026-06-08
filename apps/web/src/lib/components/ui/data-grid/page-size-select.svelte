<script lang="ts">
  import { ChevronDown } from 'lucide-svelte'
  import * as Popover from '$lib/components/ui/popover'
  import { Input } from '$lib/components/ui/input'

  let { value, onChange }: { value: number; onChange: (v: number) => void } = $props()

  const PRESETS = [500, 1000, 1500, 2000, 5000]
  let open = $state(false)

  function pick(v: number) {
    const n = Math.min(Math.max(Math.floor(v), 1), 10000)
    if (Number.isFinite(n)) onChange(n)
    open = false
  }
  function onCustom(e: Event) {
    const n = Number((e.currentTarget as HTMLInputElement).value)
    if (Number.isFinite(n) && n >= 1) pick(n)
  }
</script>

<div class="flex items-center gap-1">
  <span class="text-muted-foreground">rows</span>
  <Popover.Root bind:open>
    <Popover.Trigger
      class="bg-background hover:bg-muted flex h-7 w-20 items-center justify-between rounded-md border px-2 font-mono"
    >
      {value}
      <ChevronDown class="size-3 opacity-50" />
    </Popover.Trigger>
    <Popover.Content class="w-28 p-1" align="end">
      {#each PRESETS as p (p)}
        <button
          class="hover:bg-accent flex w-full rounded px-2 py-1 text-left font-mono {p === value
            ? 'bg-accent'
            : ''}"
          onclick={() => pick(p)}
        >
          {p}
        </button>
      {/each}
      <div class="mt-1 border-t pt-1">
        <Input
          type="number"
          min="1"
          max="10000"
          value={String(value)}
          class="h-7 font-mono"
          onchange={onCustom}
          onkeydown={(e) => {
            if (e.key === 'Enter') onCustom(e)
          }}
        />
      </div>
    </Popover.Content>
  </Popover.Root>
</div>
