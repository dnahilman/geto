<script lang="ts">
  import { toast } from 'svelte-sonner'
  import { Download, Table2, Braces, List } from 'lucide-svelte'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import { Button } from '$lib/components/ui/button'
  import { cn } from '$lib/utils'
  import type { DataGridApi } from '../data-grid-context'
  import { collectRows, toCSV, toJSON, toMarkdown, downloadFile, timestamp } from '$lib/export'
    import { useGridTableContext } from '../hooks/use-data-grid'
  const table = useGridTableContext()

</script>

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
