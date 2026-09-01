<script lang="ts">
  import type { ColumnMeta } from '@geto/server'
  import type { ResultSource } from '$lib/api/query'
  import type { TabFilter } from '$lib/stores/workspace.svelte'
  import SqlConsoleTable from './sql-console-table.svelte'

  interface Props {
    connId: string
    columns: ColumnMeta[]
    rows: unknown[][]
    startIndex?: number
    source?: ResultSource | null
    view?: 'table' | 'json' | 'structure'
    onApplied?: () => void
    onOpenTable?: (schema: string, table: string, filter?: TabFilter) => void
  }

  let {
    connId,
    columns,
    rows,
    startIndex = 0,
    source = null,
    view = 'table',
    onApplied,
    onOpenTable,
  }: Props = $props()
</script>

<SqlConsoleTable {connId} {columns} {rows} {startIndex} {source} {view} {onApplied} {onOpenTable} />
