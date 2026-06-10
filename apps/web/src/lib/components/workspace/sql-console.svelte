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
  import * as Tabs from '$lib/components/ui/tabs'
  import { Button } from '$lib/components/ui/button'
  import SqlEditor from '$lib/editor/sql-editor.svelte'
  import ResultTable from './result-table.svelte'
  import { formatSql } from '$lib/editor/format'
  import {
    runQuery,
    getCompletion,
    getHistory,
    clearHistory,
    completionKey,
    historyKey,
    type RunResult,
    type SafetyReport,
  } from '$lib/api/query'

  let {
    connId,
    initialSql,
    onSqlChange,
  }: {
    connId: string
    initialSql: string
    onSqlChange: (sql: string) => void
  } = $props()

  const qc = useQueryClient()
  let sql = $state(initialSql)

  $effect(() => {
    onSqlChange(sql)
  })
  let uppercase = $state(true)
  let editorRef = $state<ReturnType<typeof SqlEditor>>()
  let result = $state<RunResult | null>(null)
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
    mutationFn: ({ text, confirm, off, lim }: { text: string; confirm: boolean; off: number; lim: number }) =>
      runQuery(connId, text, confirm, { offset: off, limit: lim }),
    onSuccess: (r) => {
      if (r.requiresConfirmation) {
        pending = { sql: pendingSql, report: r.report }
        return
      }
      result = r
      error = null
      qc.invalidateQueries({ queryKey: historyKey(connId) })
    },
    onError: (e: Error) => {
      error = e.message
      result = null
    },
  }))

  let pendingSql = ''
  function doRun(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    pendingSql = trimmed
    lastSql = trimmed
    offset = 0
    run.mutate({ text: trimmed, confirm: false, off: 0, lim: pageSize })
  }
  function confirmRun() {
    if (pending) {
      lastSql = pending.sql
      run.mutate({ text: pending.sql, confirm: true, off: offset, lim: pageSize })
    }
    pending = null
  }
  // Re-run the last query (after paging, page-size change, or an applied edit).
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
</script>

<Resizable.PaneGroup direction="vertical" class="h-full">
  <Resizable.Pane defaultSize={50} minSize={20} class="flex flex-col">
    <div class="flex items-center gap-2 border-b px-2 py-1.5">
      <Button
        size="sm"
        class="h-7"
        disabled={run.isPending}
        onclick={() => doRun(editorRef?.getSelectedOrAll() ?? sql)}
      >
        {#if run.isPending}<Loader2 class="size-4 animate-spin" />{:else}<Play class="size-4" />{/if}
        Run
      </Button>
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
      />
    </div>
  </Resizable.Pane>

  <Resizable.Handle withHandle />

  <Resizable.Pane defaultSize={50} class="flex min-h-0 flex-col">
    <Tabs.Root value="result" class="flex h-full min-h-0 flex-col gap-0">
      <div class="flex items-center gap-3 border-b px-2 py-1">
        <Tabs.List class="h-7">
          <Tabs.Trigger value="result" class="text-xs">Result</Tabs.Trigger>
          <Tabs.Trigger value="history" class="text-xs">History</Tabs.Trigger>
        </Tabs.List>
        <div class="text-muted-foreground ml-1 flex items-center gap-2 text-xs">
          {#if run.isPending}
            running…
          {:else if error}
            <span class="text-destructive">error</span>
          {:else if result}
            <span>{result.command ?? 'OK'}</span>
            <span>· {result.rowCount} row{result.rowCount === 1 ? '' : 's'}</span>
            <span>· {result.durationMs}ms</span>
          {/if}
        </div>
      </div>

      <Tabs.Content value="result" class="flex min-h-0 flex-1 flex-col">
        {#if error}
          <pre class="text-destructive overflow-auto p-3 font-mono text-xs whitespace-pre-wrap">{error}</pre>
        {:else if result && result.columns.length > 0}
          <div class="min-h-0 flex-1">
            <ResultTable
              {connId}
              columns={result.columns}
              rows={result.rows}
              startIndex={result.offset}
              source={result.source}
              onApplied={rerun}
            />
          </div>
          {#if result.paginated}
            <div class="text-muted-foreground flex items-center gap-3 border-t px-3 py-1.5 text-xs">
              <span class="mr-auto">
                rows {result.rows.length ? result.offset + 1 : 0}–{result.offset + result.rows.length}
              </span>
              <PageSizeSelect value={pageSize} onChange={setPageSize} />
              <Button
                variant="outline"
                size="icon"
                class="size-7"
                disabled={result.offset === 0 || run.isPending}
                onclick={prevPage}
              >
                <ChevronLeft class="size-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                class="size-7"
                disabled={result.rows.length < pageSize || run.isPending}
                onclick={nextPage}
              >
                <ChevronRight class="size-4" />
              </Button>
            </div>
          {/if}
        {:else if result}
          <p class="text-muted-foreground p-3 text-sm">
            {result.command ?? 'Command'} completed — {result.rowCount} row{result.rowCount === 1
              ? ''
              : 's'} affected.
          </p>
        {:else}
          <p class="text-muted-foreground p-3 text-sm">Run a query to see results.</p>
        {/if}
      </Tabs.Content>

      <Tabs.Content value="history" class="flex min-h-0 flex-1 flex-col">
        {#if history.data && history.data.length > 0}
          <div class="flex items-center justify-end border-b px-2 py-1">
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
                    {h.status === 'ok' ? `${h.rowCount ?? 0} rows` : 'error'} · {h.durationMs ?? 0}ms
                  </span>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-muted-foreground p-3 text-sm">No queries yet.</p>
        {/if}
      </Tabs.Content>
    </Tabs.Root>
  </Resizable.Pane>
</Resizable.PaneGroup>

<AlertDialog.Root open={pending !== null} onOpenChange={(o) => !o && (pending = null)}>
  <AlertDialog.Content>
    <AlertDialog.Header>
      <AlertDialog.Title class="flex items-center gap-2">
        <TriangleAlert class="text-destructive size-5" /> Dangerous query
      </AlertDialog.Title>
      <AlertDialog.Description>
        This statement was flagged as destructive:
      </AlertDialog.Description>
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
        onclick={() => clear.mutate()}
      >
        Clear history
      </AlertDialog.Action>
    </AlertDialog.Footer>
  </AlertDialog.Content>
</AlertDialog.Root>
