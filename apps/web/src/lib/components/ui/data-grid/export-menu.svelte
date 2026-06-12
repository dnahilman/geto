<script lang="ts">
  import { toast } from 'svelte-sonner'
  import { Download, Table2, Braces, List } from 'lucide-svelte'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import { Button } from '$lib/components/ui/button'
  import { cn } from '$lib/utils'
  import type { DataGridApi } from './data-grid-context'
  import { collectRows, toCSV, toJSON, toMarkdown, downloadFile, timestamp } from '$lib/export'

  let {
    api,
    baseName,
    class: className = '',
    view,
    onViewChange,
  }: {
    api: DataGridApi
    baseName: string
    class?: string
    view?: 'table' | 'json' | 'structure'
    onViewChange?: (v: 'table' | 'json' | 'structure') => void
  } = $props()

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
  <div class="flex rounded border">
    <button
      type="button"
      class="flex items-center gap-1 rounded-l px-2 py-0.5 text-xs transition-colors {(view ??
        'table') === 'table'
        ? 'bg-background text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground'}"
      onclick={() => onViewChange('table')}
      aria-pressed={(view ?? 'table') === 'table'}
    >
      <Table2 class="size-3.5" /> Table
    </button>
    <button
      type="button"
      class="flex items-center gap-1 border-l px-2 py-0.5 text-xs transition-colors {(view ??
        'table') === 'json'
        ? 'bg-background text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground'}"
      onclick={() => onViewChange('json')}
      aria-pressed={(view ?? 'table') === 'json'}
    >
      <Braces class="size-3.5" /> JSON
    </button>
    <button
      type="button"
      class="flex items-center gap-1 rounded-r border-l px-2 py-0.5 text-xs transition-colors {(view ??
        'table') === 'structure'
        ? 'bg-background text-foreground shadow-sm'
        : 'text-muted-foreground hover:text-foreground'}"
      onclick={() => onViewChange('structure')}
      aria-pressed={(view ?? 'table') === 'structure'}
    >
      <List class="size-3.5" /> Structure
    </button>
  </div>
{/if}

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="outline" size="sm" class={cn('h-7', className)}>
        <Download class="size-4" /> Export
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="w-auto">
    <DropdownMenu.Item onSelect={() => exportAs('csv')}>CSV · {scopeLabel}</DropdownMenu.Item>
    <DropdownMenu.Item onSelect={() => exportAs('json')}>JSON · {scopeLabel}</DropdownMenu.Item>
    <DropdownMenu.Item onSelect={() => exportAs('md')}>Markdown · {scopeLabel}</DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
