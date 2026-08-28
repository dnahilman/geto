<script lang="ts">
  import DataGrid from './data-grid.svelte'
  import type { TabFilter } from '$lib/stores/workspace.svelte'

  let {
    connId,
    schema,
    table,
    filter = undefined,
    isActive = false,
    onOpenTable,
  }: {
    connId: string
    schema: string
    table: string
    filter?: TabFilter
    isActive?: boolean
    onOpenTable?: (schema: string, table: string, filter?: TabFilter) => void
  } = $props()

  let dataView = $state<'table' | 'json' | 'structure'>('table')
</script>

<DataGrid
  {connId}
  {schema}
  {table}
  {filter}
  {isActive}
  {onOpenTable}
  view={dataView}
  onViewChange={(v) => (dataView = v)}
/>
