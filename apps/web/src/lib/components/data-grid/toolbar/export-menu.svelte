<script lang="ts">
  import { toast } from 'svelte-sonner'
  import { Download, Table2, Braces, List } from 'lucide-svelte'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import { Button } from '$lib/components/ui/button'
  import { cn } from '$lib/utils'
  import type { DataGridApi } from '../data-grid-context'
  import { collectRows, toCSV, toJSON, toMarkdown, downloadFile, timestamp } from '$lib/export'

  interface Props {
    api: DataGridApi
    baseName: string
    class?: string
    view?: 'table' | 'json' | 'structure'
    onViewChange?: (v: 'table' | 'json' | 'structure') => void
  }

  let {
    api,
    baseName,
    class: className = '',
    view,
    onViewChange,
  }: Props = $props()

  // Scope hint shown on each menu item so users know it's page-local, not the whole result set.
  const selectedCount = $derived(Object.keys(api.ctx.selectedRows).length)
  const scopeLabel = $derived(selectedCount ? `${selectedCount} selected rows` : 'current page')

  type Fmt = 'csv' | 'json' | 'md'
  const SERIALIZE: Record<
    Fmt,
    { mime: string; ext: string; run: (columns: string[], rows: unknown[][]) => string }
  > = {
    csv: { mime: 'text/csv', ext: 'csv', run: toCSV },
    json: { mime: 'application/json', ext: 'json', run: toJSON },
    md: { mime: 'text/markdown', ext: 'md', run: toMarkdown },
  }

  function exportAs(fmt: Fmt) {
    const { columns, rows } = collectRows(api)
    if (!rows.length) {
      toast.error('No rows to export')
      return
    }
    const { mime, ext, run } = SERIALIZE[fmt]
    downloadFile(`${baseName}-${timestamp(new Date())}.${ext}`, mime, run(columns, rows))
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'}`)
  }
</script>

{#if onViewChange}
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        <Button
          {...props}
          variant="ghost"
          size="icon"
          class="size-7 text-muted-foreground hover:text-foreground"
          title="Switch view ({(view ?? 'table').toUpperCase()})"
        >
          {#if (view ?? 'table') === 'table'}
            <Table2 class="size-4" />
          {:else if (view ?? 'table') === 'json'}
            <Braces class="size-4" />
          {:else}
            <List class="size-4" />
          {/if}
        </Button>
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" class="w-36 text-xs">
      <DropdownMenu.Item onSelect={() => onViewChange('table')} class="flex items-center gap-2">
        <Table2 class="size-3.5" /> Table View
      </DropdownMenu.Item>
      <DropdownMenu.Item onSelect={() => onViewChange('json')} class="flex items-center gap-2">
        <Braces class="size-3.5" /> JSON View
      </DropdownMenu.Item>
      <DropdownMenu.Item onSelect={() => onViewChange('structure')} class="flex items-center gap-2">
        <List class="size-3.5" /> Structure View
      </DropdownMenu.Item>
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/if}

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="ghost"
        size="icon"
        class={cn('size-7 text-muted-foreground hover:text-foreground', className)}
        title="Export data"
      >
        <Download class="size-4" />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="w-auto text-xs">
    <DropdownMenu.Item onSelect={() => exportAs('csv')}>CSV · {scopeLabel}</DropdownMenu.Item>
    <DropdownMenu.Item onSelect={() => exportAs('json')}>JSON · {scopeLabel}</DropdownMenu.Item>
    <DropdownMenu.Item onSelect={() => exportAs('md')}>Markdown · {scopeLabel}</DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
