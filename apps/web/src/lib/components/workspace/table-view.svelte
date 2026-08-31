<script lang="ts">
  import type { Snippet } from 'svelte'
  import DataGrid from './data-grid.svelte'
  import type { TabFilter } from '$lib/stores/workspace.svelte'

  interface Props {
    connId: string
    schema: string
    table: string
    filter?: TabFilter
    isActive?: boolean
    onOpenTable?: (schema: string, table: string, filter?: TabFilter) => void
    toolbar?: Snippet | null
  }

  let {
    connId,
    schema,
    table,
    filter = undefined,
    isActive = false,
    onOpenTable,
    toolbar = $bindable(null),
  }: Props = $props()

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
  bind:toolbar
/>
