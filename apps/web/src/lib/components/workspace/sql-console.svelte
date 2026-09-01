<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query'
  import { TriangleAlert } from 'lucide-svelte'
  import * as Resizable from '$lib/components/ui/resizable'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import SqlConsoleEditor from './sql-console-editor.svelte'
  import SqlConsoleHistory from './sql-console-history.svelte'
  import SqlConsoleTable from './sql-console-table.svelte'
  import ResultTabs from './result-tabs.svelte'
  import WorkspaceBottombar from './workspace-bottombar.svelte'
  import WorkspaceSkeletons from './workspace-skeletons.svelte'
  import type { TabFilter } from '$lib/stores/workspace.svelte'
  import { runQuery, clearHistory, type StatementResult, type SafetyReport } from '$lib/api/query'
  import { consoleQueries } from '$lib/queries'

  interface Props {
    connId: string
    initialSql: string
    onSqlChange: (sql: string) => void
    onOpenTable?: (schema: string, table: string, filter?: TabFilter) => void
    onToggleSidebar?: () => void
  }

  let { connId, initialSql, onSqlChange, onOpenTable, onToggleSidebar }: Props = $props()

  const qc = useQueryClient()
  // svelte-ignore state_referenced_locally
  let sql = $state(initialSql)

  $effect(() => {
    onSqlChange(sql)
  })

  let editorRef = $state<ReturnType<typeof SqlConsoleEditor>>()

  // 'history' = history tab; number = index into results array.
  let active = $state<'history' | number>('history')
  let results = $state<StatementResult[]>([])
  // Per-result-tab view toggle (keyed by statement index).
  let views = $state<Record<number, 'table' | 'json' | 'structure'>>({})

  let error = $state<string | null>(null)
  let pending = $state<{ sql: string; report: SafetyReport } | null>(null)
  let offset = $state(0)
  let pageSize = $state(500)
  let lastSql = $state('')

  const completion = createQuery(() => consoleQueries.completion(connId))
  const history = createQuery(() => consoleQueries.history(connId))

  let clearConfirm = $state(false)
  const clear = createMutation(() => ({
    mutationFn: () => clearHistory(connId),
    onSuccess: () => qc.invalidateQueries({ queryKey: consoleQueries.history(connId).queryKey }),
  }))

  const run = createMutation(() => ({
    mutationFn: ({
      text,
      confirm,
      off,
      lim,
    }: {
      text: string
      confirm: boolean
      off: number
      lim: number
    }) => runQuery(connId, text, confirm, { offset: off, limit: lim }),
    onSuccess: (r) => {
      if (r.requiresConfirmation) {
        pending = { sql: pendingSql, report: r.report }
        return
      }
      results = r.results
      active = 0
      views = {}
      error = null
      qc.invalidateQueries({ queryKey: consoleQueries.history(connId).queryKey })
    },
    onError: (e: Error) => {
      error = e.message
      results = []
      active = 0
    },
  }))

  let pendingSql = ''
  function doRun(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    pendingSql = trimmed
    lastSql = trimmed
    offset = 0
    active = 0
    run.mutate({ text: trimmed, confirm: false, off: 0, lim: pageSize })
  }

  function confirmRun() {
    if (pending) {
      lastSql = pending.sql
      run.mutate({ text: pending.sql, confirm: true, off: offset, lim: pageSize })
    }
    pending = null
  }

  function rerun() {
    if (lastSql) run.mutate({ text: lastSql, confirm: false, off: offset, lim: pageSize })
  }

  const activeResult = $derived(
    typeof active === 'number' && results.length > 0 ? (results[active] ?? null) : null,
  )
</script>

{#snippet resultTabbar()}
  <ResultTabs
    {results}
    {active}
    onSelect={(t) => (active = t)}
    onClearHistory={() => (clearConfirm = true)}
    hasHistory={(history.data?.length ?? 0) > 0}
    isClearing={clear.isPending}
  />
{/snippet}

{#snippet historyView()}
  <SqlConsoleHistory {connId} onSelect={(sqlText) => editorRef?.setValue(sqlText)} />
{/snippet}

{#snippet errorView(errorMessage: string)}
  <pre
    class="text-destructive overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">{errorMessage}</pre>
{/snippet}

{#snippet emptyResultsView()}
  <p class="text-muted-foreground p-3 text-sm">Run a query to see results.</p>
{/snippet}

{#snippet commandResultView(result: StatementResult)}
  <p class="text-muted-foreground p-3 text-sm">
    {result.command ?? 'Command'} completed — {result.rowCount} row{result.rowCount === 1
      ? ''
      : 's'} affected.
  </p>
{/snippet}

{#snippet statementResultView(result: StatementResult, index: number)}
  {#if result.error}
    {@render errorView(result.error)}
  {:else if result.columns.length > 0}
    <div class="h-full">
      <SqlConsoleTable
        {connId}
        columns={result.columns}
        rows={result.rows}
        startIndex={result.offset}
        source={result.source}
        view={views[index] ?? 'table'}
        onRowsChange={(newRows) => {
          results[index].rows = newRows
          results[index].rowCount = newRows.length
        }}
        onRefresh={rerun}
        {onOpenTable}
      />
    </div>
  {:else}
    {@render commandResultView(result)}
  {/if}
{/snippet}

{#snippet activeResultView()}
  {#if run.isPending}
    <WorkspaceSkeletons type="console" />
  {:else if error && results.length === 0}
    {@render errorView(error)}
  {:else if !activeResult}
    {@render emptyResultsView()}
  {:else}
    {@render statementResultView(activeResult, active as number)}
  {/if}
{/snippet}

<Resizable.PaneGroup direction="vertical" class="h-full">
  <!-- ── Editor pane ── -->
  <Resizable.Pane defaultSize={50} minSize={20} class="flex flex-col">
    <SqlConsoleEditor
      bind:this={editorRef}
      bind:sql
      running={run.isPending}
      completion={completion.data}
      onRun={doRun}
    />
  </Resizable.Pane>

  <Resizable.Handle withHandle />

  <!-- ── Result pane ── -->
  <Resizable.Pane defaultSize={50} class="flex min-h-0 flex-col">
    <!-- Tab strip: History + per-statement results -->
    {@render resultTabbar()}

    <!-- Content area -->
    <div class="min-h-0 flex-1 overflow-hidden">
      {#if active === 'history'}
        {@render historyView()}
      {:else}
        {@render activeResultView()}
      {/if}
    </div>

    <!-- ── Bottom bar: info (left) & toggle sidebar ── -->
    <WorkspaceBottombar {onToggleSidebar}>
      <span
        class={run.isPending || !activeResult || activeResult.error
          ? 'text-muted-foreground'
          : 'text-emerald-500'}
      >
        {#if run.isPending}
          Running…
        {:else if activeResult && !activeResult.error}
          {activeResult.rowCount} rows · {activeResult.durationMs}ms
        {/if}
      </span>
    </WorkspaceBottombar>
  </Resizable.Pane>
</Resizable.PaneGroup>

<AlertDialog.Root open={pending !== null} onOpenChange={(o) => !o && (pending = null)}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title class="flex items-center gap-2">
        <TriangleAlert class="text-destructive size-5" /> Dangerous query
      </AlertDialog.Title>
      <AlertDialog.Description>This statement was flagged as destructive:</AlertDialog.Description>
    </AlertDialog.Header>
    <ul class="text-destructive list-disc space-y-1 pl-5 text-sm">
      {#each pending?.report.reasons ?? [] as reason (reason)}
        <li>{reason}</li>
      {/each}
    </ul>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action
        class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onclick={confirmRun}
      >
        Run anyway
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>

<AlertDialog.Root bind:open={clearConfirm}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title>Clear query history?</AlertDialog.Title>
      <AlertDialog.Description>
        This permanently removes all recorded queries for this connection.
      </AlertDialog.Description>
    </AlertDialog.Header>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action
        class="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        onclick={() => {
          clear.mutate()
          clearConfirm = false
        }}
      >
        Clear history
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
