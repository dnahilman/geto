<script lang="ts">
  import { toast } from 'svelte-sonner'
  import { Download } from 'lucide-svelte'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import { Button } from '$lib/components/ui/button'
  import { cn } from '$lib/utils'
  import type { DataGridApi } from './data-grid-context'
  import { collectRows, toCSV, toJSON, toMarkdown, downloadFile, timestamp } from '$lib/export'

  let {
    api,
    baseName,
    class: className = '',
  }: { api: DataGridApi; baseName: string; class?: string } = $props()

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
