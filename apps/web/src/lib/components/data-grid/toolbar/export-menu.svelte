<script lang="ts">
  import { toast } from 'svelte-sonner'
  import { Download, FileSpreadsheet, FileJson, FileText } from 'lucide-svelte'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import { Button } from '$lib/components/ui/button'
  import { toCSV, toJSON, toMarkdown, downloadFile, timestamp } from '$lib/export'
  import { useGridTableContext } from '../hooks/use-data-grid.js'

  const table = useGridTableContext()

  const selectedRows = $derived(table.getSelectedRowModel().rows)
  const allRows = $derived(table.getRowModel().rows)
  const isRowSelected = $derived(selectedRows.length > 0)
  const activeRows = $derived(isRowSelected ? selectedRows : allRows)
  const scopeLabel = $derived(
    isRowSelected ? `${selectedRows.length} selected` : `${allRows.length} rows`,
  )

  const columns = $derived(
    table
      .getAllLeafColumns()
      .filter((col) => col.id !== 'select')
      .map((col) => col.id),
  )

  function exportData(format: 'csv' | 'json' | 'md') {
    if (activeRows.length === 0) {
      toast.warning('No data to export')
      return
    }

    const rowData = activeRows.map((r) => {
      const orig = (r.original ?? {}) as Record<string, unknown>
      return columns.map((colId) => orig[colId])
    })

    const stamp = timestamp(new Date())
    const filename = `export-${stamp}.${format === 'md' ? 'md' : format}`

    let content = ''
    let mime = 'text/plain'

    if (format === 'csv') {
      content = toCSV(columns, rowData)
      mime = 'text/csv'
    } else if (format === 'json') {
      content = toJSON(columns, rowData)
      mime = 'application/json'
    } else if (format === 'md') {
      content = toMarkdown(columns, rowData)
      mime = 'text/markdown'
    }

    downloadFile(filename, mime, content)
    toast.success(`Exported ${activeRows.length} row(s) to ${format.toUpperCase()}`)
  }
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button
        {...props}
        variant="ghost"
        size="icon"
        class="size-7 text-muted-foreground hover:text-foreground"
        title="Export data"
      >
        <Download class="size-3.5" />
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="w-48 text-xs">
    <DropdownMenu.Group>
      <DropdownMenu.GroupHeading class="text-[10px] uppercase text-muted-foreground">
        Export ({scopeLabel})
      </DropdownMenu.GroupHeading>
      <DropdownMenu.Item onSelect={() => exportData('csv')} class="cursor-pointer gap-2">
        <FileSpreadsheet class="size-3.5 text-emerald-500" />
        <span>CSV</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item onSelect={() => exportData('json')} class="cursor-pointer gap-2">
        <FileJson class="size-3.5 text-amber-500" />
        <span>JSON</span>
      </DropdownMenu.Item>
      <DropdownMenu.Item onSelect={() => exportData('md')} class="cursor-pointer gap-2">
        <FileText class="size-3.5 text-blue-500" />
        <span>Markdown</span>
      </DropdownMenu.Item>
    </DropdownMenu.Group>
  </DropdownMenu.Content>
</DropdownMenu.Root>
