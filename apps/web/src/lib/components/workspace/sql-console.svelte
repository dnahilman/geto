<script lang="ts">
  import { createQuery, createMutation, useQueryClient } from '@tanstack/svelte-query'
  import {
    Play,
    Braces,
    Loader2,
    TriangleAlert,
    CircleCheck,
    CircleX,
    ChevronLeft,
    ChevronRight,
    Trash2,
  } from 'lucide-svelte'
  import { PageSizeSelect } from '$lib/components/ui/data-grid'
  import * as Resizable from '$lib/components/ui/resizable'
  import * as AlertDialog from '$lib/components/ui/alert-dialog'
  import { Button } from '$lib/components/ui/button'
  import SqlEditor from '$lib/editor/sql-editor.svelte'
  import ResultTable from './result-table.svelte'
  import ResultTabs from './result-tabs.svelte'
  import { formatSql } from '$lib/editor/format'
  import type { TabFilter } from '$lib/stores/workspace.svelte'
  import {
    runQuery,
    getCompletion,
    getHistory,
    clearHistory,
    completionKey,
    historyKey,
    type StatementResult,
    type SafetyReport,
  } from '$lib/api/query'

  let {
    connId,
    initialSql,
    onSqlChange,
    onOpenTable,
  }: {
    connId: string
    initialSql: string
    onSqlChange: (sql: string) => void
    onOpenTable?: (schema: string, table: string, filter?: TabFilter) => void
  } = $props()

  const qc = useQueryClient()
  let sql = $state(initialSql)

  $effect(() => {
    onSqlChange(sql)
  })
  let uppercase = $state(true)
  let editorRef = $state<ReturnType<typeof SqlEditor>>()

  // 'history' = history tab; number = index into results array.
  let active = $state<'history' | number>('history')
  let results = $state<StatementResult[]>([])
  // Per-result-tab view toggle (keyed by statement index).
  // svelte-ignore state_referenced_locally
  let views = $state<Record<number, 'table' | 'json' | 'structure'>>({})
  let stmtCount = $state(1)

  let error = $state<string | null>(null)
  let pending = $state<{ sql: string; report: SafetyReport } | null>(null)
  let offset = $state(0)
  let pageSize = $state(500)
  let lastSql = $state('')

  const completion = createQuery(() => ({
    queryKey: completionKey(connId),
    queryFn: () => getCompletion(connId),
  }))

  const history = createQuery(() => ({
    queryKey: historyKey(connId),
    queryFn: () => getHistory(connId),
  }))

  let clearConfirm = $state(false)
  const clear = createMutation(() => ({
    mutationFn: () => clearHistory(connId),
    onSuccess: () => qc.invalidateQueries({ queryKey: historyKey(connId) }),
  }))

  function loadFromHistory(sqlText: string) {
    editorRef?.setValue(sqlText)
  }

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
      qc.invalidateQueries({ queryKey: historyKey(connId) })
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
  function setPageSize(v: number) {
    pageSize = v
    offset = 0
    rerun()
  }
  function prevPage() {
    if (offset > 0) {
      offset = Math.max(0, offset - pageSize)
      rerun()
    }
  }
  function nextPage() {
    offset = offset + pageSize
    rerun()
  }
  function format() {
    editorRef?.setValue(formatSql(sql))
  }

  const activeResult = $derived(
    typeof active === 'number' && results.length > 0 ? (results[active] ?? null) : null,
  )
  const showPagination = $derived(
    typeof active === 'number' && results.length === 1 && (results[0]?.paginated ?? false),
  )
</script>

<Resizable.PaneGroup direction="vertical" class="h-full">
  <!-- ── Editor pane ── -->
  <Resizable.Pane defaultSize={50} minSize={20} class="flex flex-col">
    <div class="flex items-center gap-2 border-b px-2 py-1.5">
      <Button
        size="sm"
        class="h-7"
        disabled={run.isPending}
        onclick={() => doRun(editorRef?.getSelectedOrAll() ?? sql)}
      >
        {#if run.isPending}<Loader2 class="size-4 animate-spin" />{:else}<Play
            class="size-4"
          />{/if}
        Run
      </Button>
      {#if stmtCount > 1}
        <span class="text-muted-foreground rounded border px-1.5 py-0.5 text-xs tabular-nums">
          {stmtCount} statements
        </span>
      {/if}
      <Button size="sm" variant="outline" class="h-7" onclick={format}>
        <Braces class="size-4" /> Format
      </Button>
      <label class="text-muted-foreground ml-1 flex cursor-pointer items-center gap-1.5 text-xs">
        <input type="checkbox" bind:checked={uppercase} class="h-3.5 w-3.5 cursor-pointer" />
        auto-uppercase
      </label>
      <span class="text-muted-foreground ml-auto text-xs">⌘/Ctrl + Enter to run</span>
    </div>
    <div class="min-h-0 flex-1">
      <SqlEditor
        bind:this={editorRef}
        bind:value={sql}
        {uppercase}
        completion={completion.data}
        onrun={doRun}
        onrunstatement={doRun}
        onstatementschange={(n) => (stmtCount = n)}
      />
    </div>
  </Resizable.Pane>

  <Resizable.Handle withHandle />

  <!-- ── Result pane ── -->
  <Resizable.Pane defaultSize={50} class="flex min-h-0 flex-col">
    <!-- Tab strip: History + per-statement results -->
    <ResultTabs {results} {active} onSelect={(t) => (active = t)} />

    <!-- Content area -->
    <div class="min-h-0 flex-1 overflow-hidden">
      {#if active === 'history'}
        <!-- ── History ── -->
        <div class="flex h-full flex-col">
          {#if history.data && history.data.length > 0}
            <div class="flex shrink-0 items-center justify-end border-b px-2 py-1">
              <Button
                variant="ghost"
                size="sm"
                class="text-muted-foreground hover:text-destructive h-6 gap-1.5 text-xs"
                disabled={clear.isPending}
                onclick={() => (clearConfirm = true)}
              >
                <Trash2 class="size-3.5" /> Clear history
              </Button>
            </div>
            <ul class="divide-y overflow-auto text-xs">
              {#each history.data as h (h.id)}
                <li>
                  <button
                    class="hover:bg-accent flex w-full items-start gap-2 px-3 py-1.5 text-left"
                    onclick={() => loadFromHistory(h.sql)}
                    title="Load into editor"
                  >
                    {#if h.status === 'ok'}
                      <CircleCheck class="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                    {:else}
                      <CircleX class="text-destructive mt-0.5 size-3.5 shrink-0" />
                    {/if}
                    <span class="min-w-0 flex-1 truncate font-mono">{h.sql}</span>
                    <span class="text-muted-foreground shrink-0">
                      {h.status === 'ok' ? `${h.rowCount ?? 0} rows` : 'error'} · {h.durationMs ??
                        0}ms
                    </span>
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="text-muted-foreground p-3 text-sm">No queries yet.</p>
          {/if}
        </div>
      {:else if typeof active === 'number'}
        <!-- ── Result ── -->
        {#if run.isPending}
          <p class="text-muted-foreground p-3 text-sm">Running…</p>
        {:else if error && results.length === 0}
          <pre
            class="text-destructive overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">{error}</pre>
        {:else if results.length === 0}
          <p class="text-muted-foreground p-3 text-sm">Run a query to see results.</p>
        {:else if activeResult}
          {#if activeResult.error}
            <pre
              class="text-destructive overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">{activeResult.error}</pre>
          {:else if activeResult.columns.length > 0}
            {@const idx = active}
            <div class="h-full">
              <ResultTable
                {connId}
                columns={activeResult.columns}
                rows={activeResult.rows}
                startIndex={activeResult.offset}
                source={activeResult.source}
                view={views[idx] ?? 'table'}
                onViewChange={(v) => (views[idx] = v)}
                onApplied={rerun}
                {onOpenTable}
              />
            </div>
          {:else}
            <p class="text-muted-foreground p-3 text-sm">
              {activeResult.command ?? 'Command'} completed — {activeResult.rowCount} row{activeResult.rowCount ===
              1
                ? ''
                : 's'} affected.
            </p>
          {/if}
        {/if}
      {/if}
    </div>

    <!-- ── Bottom bar: info (left) · [←] pagesize [→] (right) ── -->
    <div class="flex shrink-0 items-center justify-between border-t px-3 py-1.5 text-xs">
      <!-- Left: range + duration, green when ok -->
      <span
        class={run.isPending || !activeResult || activeResult.error
          ? 'text-muted-foreground'
          : 'text-emerald-500'}
      >
        {#if run.isPending}
          Running…
        {:else if activeResult && !activeResult.error}
          {#if showPagination && results[0]}
            {@const r = results[0]}
            {r.rows.length ? r.offset + 1 : 0}–{r.offset + r.rows.length} · {activeResult.durationMs}ms
          {:else}
            {activeResult.rowCount} rows · {activeResult.durationMs}ms
          {/if}
        {/if}
      </span>
      <!-- Right: [←] page-size [→] -->
      <div class="flex items-center gap-1">
        {#if typeof active === 'number' && activeResult && !activeResult.error && activeResult.columns.length > 0}
          <Button
            variant="ghost"
            size="icon"
            class="size-7"
            disabled={!showPagination || offset === 0 || run.isPending}
            onclick={prevPage}
          >
            <ChevronLeft class="size-4" />
          </Button>
        {/if}
        <PageSizeSelect value={pageSize} onChange={setPageSize} />
        {#if typeof active === 'number' && activeResult && !activeResult.error && activeResult.columns.length > 0}
          <Button
            variant="ghost"
            size="icon"
            class="size-7"
            disabled={!showPagination || (results[0]?.rows.length ?? 0) < pageSize || run.isPending}
            onclick={nextPage}
          >
            <ChevronRight class="size-4" />
          </Button>
        {/if}
      </div>
    </div>
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
        onclick={() => { clear.mutate(); clearConfirm = false }}
      >
        Clear history
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
