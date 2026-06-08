<script lang="ts">
  import type { Column } from '@tanstack/table-core'
  import { ArrowUp, ArrowDown, ChevronsUpDown, X } from 'lucide-svelte'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import { cn } from '$lib/utils'

  let {
    column,
    label,
    typeName,
    class: className,
  }: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    column: Column<any, any>
    label: string
    typeName?: string
    class?: string
  } = $props()

  const sorted = $derived(column.getIsSorted())
</script>

{#if !column.getCanSort()}
  <span class={cn('flex items-center gap-1 font-medium whitespace-nowrap', className)}>
    {label}{#if typeName}<span class="text-muted-foreground text-[10px]">{typeName}</span>{/if}
  </span>
{:else}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger
      class={cn(
        'data-[state=open]:bg-accent flex items-center gap-1 rounded px-1 font-medium whitespace-nowrap',
        className,
      )}
    >
      {label}{#if typeName}<span class="text-muted-foreground text-[10px]">{typeName}</span>{/if}
      {#if sorted === 'desc'}
        <ArrowDown class="size-3" />
      {:else if sorted === 'asc'}
        <ArrowUp class="size-3" />
      {:else}
        <ChevronsUpDown class="text-muted-foreground size-3" />
      {/if}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="start" class="w-32">
      <DropdownMenu.Item onclick={() => column.toggleSorting(false)}>
        <ArrowUp class="text-muted-foreground size-3.5" /> Asc
      </DropdownMenu.Item>
      <DropdownMenu.Item onclick={() => column.toggleSorting(true)}>
        <ArrowDown class="text-muted-foreground size-3.5" /> Desc
      </DropdownMenu.Item>
      {#if sorted}
        <DropdownMenu.Separator />
        <DropdownMenu.Item onclick={() => column.clearSorting()}>
          <X class="text-muted-foreground size-3.5" /> Reset
        </DropdownMenu.Item>
      {/if}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/if}
