<script lang="ts">
  import { onDestroy } from 'svelte'
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query'
  import {
    TriangleAlert,
    CircleX,
    Play,
    Loader,
    Braces,
    Undo2,
    Redo2,
    Sparkles,
    Eraser,
    ChevronDown,
  } from 'lucide-svelte'
  import * as Resizable from '$lib/components/ui/resizable'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import { Button } from '$lib/components/ui/button'
  import { QueryEditor } from '$lib/query-editor'
  import {
    EditorSession,
    resolveDialect,
    checkSqlSyntax,
    runClientSideSqlLint,
    type EditorStateSnapshot,
  } from '@geto/editor'
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
    provider?: string
    sql?: string
    isActive?: boolean
    onOpenTable?: (schema: string, table: string, filter?: TabFilter) => void
    onToggleSidebar?: () => void
  }

  let {
    connId,
    provider = undefined,
    sql = $bindable(''),
    isActive = true,
    onOpenTable,
    onToggleSidebar,
  }: Props = $props()

  const qc = useQueryClient()

  let editorRef = $state<ReturnType<typeof QueryEditor>>()

  const SQL_TEMPLATES = [
    {
      label: 'Select with Limit',
      description: 'Retrieve first 50 rows from table',
      sql: 'SELECT * FROM table_name LIMIT 50;',
    },
    {
      label: 'Count Records',
      description: 'Count total rows matching condition',
      sql: 'SELECT COUNT(*) AS total FROM table_name;',
    },
    {
      label: 'Filter & Sort',
      description: 'WHERE condition with ORDER BY and LIMIT',
      sql: 'SELECT * FROM table_name WHERE condition ORDER BY id DESC LIMIT 50;',
    },
    {
      label: 'Group & Aggregate',
      description: 'GROUP BY column with aggregate metric',
      sql: 'SELECT category, COUNT(*) AS count FROM table_name GROUP BY category;',
    },
    {
      label: 'Insert Row',
      description: 'Insert new row template',
      sql: "INSERT INTO table_name (column1, column2)\nVALUES ('value1', 'value2');",
    },
    {
      label: 'Update Rows',
      description: 'Update records with WHERE guard',
      sql: "UPDATE table_name\nSET column1 = 'new_value'\nWHERE id = 1;",
    },
    {
      label: 'Explain Query Plan',
      description: 'Inspect query execution plan and performance',
      sql: 'EXPLAIN ANALYZE\nSELECT * FROM table_name;',
    },
  ]

  function applyTemplate(tplSql: string) {
    if (!sql.trim()) {
      editorRef?.setValue(tplSql)
    } else {
      editorRef?.insertAtCursor('\n\n' + tplSql)
    }
    editorRef?.focus()
  }

  // svelte-ignore state_referenced_locally
  const session = new EditorSession({
    language: 'sql',
    dialect: resolveDialect(provider),
    onRun: (text) => handleRunRequest(text),
  })

  let snapshot = $state<EditorStateSnapshot>(session.getSnapshot())

  $effect(() => {
    return session.subscribe((s) => {
      snapshot = s
    })
  })

  onDestroy(() => {
    results = []
    views = {}
    active = 'history'
    error = null
    pending = null
    clientWarning = null
    session.detach()
  })

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

  const completion = createQuery(() => ({
    ...consoleQueries.completion(connId),
    enabled: isActive,
  }))
  const history = createQuery(() => ({
    ...consoleQueries.history(connId),
    enabled: isActive,
  }))

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
  let clientWarning = $state<{ sql: string; warnings: string[] } | null>(null)

  function handleRunRequest(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return

    // 1. Guard: Block execution if the requested statement/query has fatal syntax errors
    const syntaxErrors = checkSqlSyntax(trimmed)
    if (syntaxErrors.length > 0) return

    // 2. Guard: Prompt confirmation dialog if the requested statement/query has warnings
    const warnings = runClientSideSqlLint(trimmed)
      .filter((d) => d.severity === 'warning')
      .map((d) => d.message)

    if (warnings.length > 0) {
      clientWarning = {
        sql: trimmed,
        warnings,
      }
      return
    }

    // 3. Clean execution
    doRun(trimmed)
  }

  function confirmClientWarning() {
    if (clientWarning) {
      doRun(clientWarning.sql)
    }
    clientWarning = null
  }

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
  <div
    class="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground select-none"
  >
    <div class="rounded-full bg-muted/50 p-3.5 border border-border/50 shadow-xs">
      <Play class="size-5 text-emerald-500/80 fill-current translate-x-0.5" />
    </div>
    <div class="space-y-1.5 max-w-sm">
      <p class="text-sm font-medium text-foreground">No query executed yet</p>
      <p class="text-xs text-muted-foreground/80 leading-relaxed">
        Write a SQL query above and click <span class="text-emerald-500 font-medium">Run</span> or
        press
        <kbd class="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px] text-foreground border border-border/60"
          >⌘ + Enter</kbd
        > to view records, output tables, and execution metrics here.
      </p>
    </div>
  </div>
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

<div class="flex h-full flex-col">
  <!-- ── Main resizable area ── -->
  <div class="min-h-0 flex-1">
    <Resizable.PaneGroup direction="vertical" class="h-full">
      <!-- ── Editor pane ── -->
      <Resizable.Pane defaultSize={50} minSize={20} class="flex flex-col">
        <!-- Editor Toolbar (modern, action-driven, prominent run button & templates) -->
        <div
          class="flex h-8 shrink-0 items-center justify-between border-b bg-background px-2 text-xs gap-2"
        >
          <div class="flex items-center gap-1 ps-0.5">
            <!-- Run Selection or All (Cmd+Enter) -->
            <Button
              size="sm"
              class="h-6.5 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 font-medium text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title={snapshot.hasError
                ? 'Cannot run query: syntax errors detected'
                : snapshot.hasWarning
                  ? 'Run query (warning detected - click to confirm)'
                  : 'Run selection or query (⌘/Ctrl + Enter)'}
              disabled={run.isPending || snapshot.hasError}
              onclick={() => session.run('selection')}
            >
              {#if run.isPending}
                <Loader class="size-3 animate-spin" />
              {:else if snapshot.hasError}
                <CircleX class="size-3 text-red-300" />
              {:else if snapshot.hasWarning}
                <TriangleAlert class="size-3 text-amber-300" />
              {:else}
                <Play class="size-3 fill-current" />
              {/if}
            </Button>

            <!-- Templates dropdown -->
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    size="sm"
                    variant="ghost"
                    class="h-6.5 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground font-normal cursor-pointer"
                    title="Query templates & snippets"
                  >
                    <Sparkles class="size-3 text-amber-400" />
                    <span class="hidden sm:inline">Templates</span>
                    <ChevronDown class="size-3 opacity-60" />
                  </Button>
                {/snippet}
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="start" class="w-60 text-xs">
                <DropdownMenu.Group>
                  <DropdownMenu.GroupHeading
                    class="text-[10px] uppercase text-muted-foreground font-semibold px-2 py-1"
                  >
                    SQL Starter Templates
                  </DropdownMenu.GroupHeading>
                  {#each SQL_TEMPLATES as tpl (tpl.label)}
                    <DropdownMenu.Item
                      class="cursor-pointer flex flex-col items-start gap-0.5 py-1.5 px-2"
                      onSelect={() => applyTemplate(tpl.sql)}
                    >
                      <span class="font-medium text-foreground">{tpl.label}</span>
                      <span class="text-[10px] text-muted-foreground">{tpl.description}</span>
                    </DropdownMenu.Item>
                  {/each}
                </DropdownMenu.Group>
              </DropdownMenu.Content>
            </DropdownMenu.Root>

            <div class="mx-0.5 h-3.5 w-px bg-border/60"></div>

            <!-- Format SQL -->
            <Button
              size="icon"
              variant="ghost"
              class="size-7 text-muted-foreground hover:text-foreground"
              title="Format SQL (Shift+Alt+F / Ctrl+Alt+L)"
              onclick={() => session.format()}
            >
              <Braces class="size-3.5" />
            </Button>

            <!-- Undo & Redo -->
            <Button
              size="icon"
              variant="ghost"
              class="size-7 text-muted-foreground hover:text-foreground"
              title="Undo (⌘/Ctrl + Z)"
              onclick={() => session.undo()}
            >
              <Undo2 class="size-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              class="size-7 text-muted-foreground hover:text-foreground"
              title="Redo (⌘/Ctrl + Shift + Z)"
              onclick={() => session.redo()}
            >
              <Redo2 class="size-3.5" />
            </Button>

            <!-- Clear Editor -->
            <Button
              size="icon"
              variant="ghost"
              class="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Clear editor text"
              onclick={() => {
                editorRef?.setValue('')
                editorRef?.focus()
              }}
              disabled={!sql.trim()}
            >
              <Eraser class="size-3.5" />
            </Button>
          </div>

          <div class="flex items-center gap-2 pe-1">
            <span
              class="rounded-full border border-border/80 bg-muted/40 px-2 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground uppercase tracking-wider select-none"
              title={`Database Dialect: ${provider ?? 'standard'}`}
            >
              {provider ?? 'standard'}
            </span>
            <span class="text-muted-foreground text-xs">⌘/Ctrl + Enter</span>
          </div>
        </div>

        <!-- CodeMirror Editor -->
        <div class="min-h-0 flex-1">
          <QueryEditor
            {session}
            bind:this={editorRef}
            bind:value={sql}
            language="sql"
            dialect={provider ?? 'standard'}
            metadata={completion.data}
            onrun={handleRunRequest}
            onrunstatement={handleRunRequest}
          />
        </div>
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
      </Resizable.Pane>
    </Resizable.PaneGroup>
  </div>

  {#snippet bottombarLeft()}
    <!-- Cursor line & col -->
    <span class="text-muted-foreground font-mono text-[11px] select-none">
      Ln {snapshot.cursor.line}, Col {snapshot.cursor.col}
    </span>

    <!-- Selection count if any -->
    {#if !snapshot.selection.isEmpty}
      <span class="text-muted-foreground/80 font-mono text-[10px] select-none">
        ({snapshot.selection.length} selected)
      </span>
    {/if}

    <!-- Active Statement snippet preview -->
    {#if snapshot.activeStatement}
      <div class="h-3 w-px bg-border/60"></div>
      <span
        class="max-w-[240px] truncate font-mono text-[11px] text-muted-foreground/70"
        title={`Active Statement:\n${snapshot.activeStatement.text}`}
      >
        {snapshot.activeStatement.text.replace(/\s+/g, ' ')}
      </span>
    {/if}
  {/snippet}

  <!-- ── Fixed Bottom bar: info (left) & toggle sidebar ── -->
  <WorkspaceBottombar {onToggleSidebar} leftContent={bottombarLeft}>
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
</div>

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

<AlertDialog.Root open={clientWarning !== null} onOpenChange={(o) => !o && (clientWarning = null)}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title class="flex items-center gap-2">
        <TriangleAlert class="text-amber-500 size-5" /> Risky query detected
      </AlertDialog.Title>
      <AlertDialog.Description>
        The editor detected potential risks in this query before execution:
      </AlertDialog.Description>
    </AlertDialog.Header>
    <ul class="text-amber-500/90 list-disc space-y-1 pl-5 text-sm">
      {#each clientWarning?.warnings ?? [] as warning (warning)}
        <li>{warning}</li>
      {/each}
    </ul>
    <AlertDialog.Footer>
      <AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
      <AlertDialog.Action
        class="bg-amber-600 text-white hover:bg-amber-700"
        onclick={confirmClientWarning}
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
