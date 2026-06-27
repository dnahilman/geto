<script lang="ts">
  import { createMutation } from '@tanstack/svelte-query'
  import { Play, Loader2, CircleCheck, CircleX } from 'lucide-svelte'
  import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'
  import * as Resizable from '$lib/components/ui/resizable'
  import { Button } from '$lib/components/ui/button'
  import SqlEditor from '$lib/editor/sql-editor.svelte'
  import ResultTable from './result-table.svelte'
  import ResultTabs from './result-tabs.svelte'
  import { runCommand, type CommandResult } from '$lib/api/keys'
  import { commandToResult, tokenize } from '$lib/redis-result'
  import type { StatementResult } from '$lib/api/query'

  let {
    connId,
    initialCmd,
    onCmdChange,
  }: { connId: string; initialCmd: string; onCmdChange: (c: string) => void } = $props()

  let cmd = $state(initialCmd)
  $effect(() => onCmdChange(cmd))
  let editorRef = $state<ReturnType<typeof SqlEditor>>()

  // 'history' = command log; number = index into results.
  let active = $state<'history' | number>('history')
  let results = $state<StatementResult[]>([])
  let views = $state<Record<number, 'table' | 'json' | 'structure'>>({})
  let log = $state<{ cmd: string; ok: boolean; ms: number }[]>([])

  // Redis command IntelliSense (mirrors the SQL editor's completion).
  const REDIS_COMMANDS = [
    'GET',
    'SET',
    'SETEX',
    'SETNX',
    'DEL',
    'EXISTS',
    'EXPIRE',
    'PERSIST',
    'TTL',
    'TYPE',
    'KEYS',
    'SCAN',
    'RENAME',
    'INCR',
    'DECR',
    'INCRBY',
    'APPEND',
    'STRLEN',
    'MGET',
    'MSET',
    'HGET',
    'HSET',
    'HGETALL',
    'HDEL',
    'HKEYS',
    'HVALS',
    'HLEN',
    'HEXISTS',
    'LPUSH',
    'RPUSH',
    'LRANGE',
    'LLEN',
    'LPOP',
    'RPOP',
    'LINDEX',
    'SADD',
    'SREM',
    'SMEMBERS',
    'SCARD',
    'SISMEMBER',
    'ZADD',
    'ZRANGE',
    'ZREM',
    'ZSCORE',
    'ZCARD',
    'ZRANK',
    'PING',
    'DBSIZE',
    'FLUSHDB',
    'INFO',
    'SELECT',
    'DUMP',
    'RESTORE',
  ]
  function redisCompletion(context: CompletionContext): CompletionResult | null {
    const word = context.matchBefore(/\w+/)
    if (!word || (word.from === word.to && !context.explicit)) return null
    return {
      from: word.from,
      options: REDIS_COMMANDS.map((c) => ({ label: c, type: 'keyword' })),
      validFor: /^\w*$/,
    }
  }

  const run = createMutation(() => ({
    mutationFn: async (lines: string[]) => {
      const out: StatementResult[] = []
      const logs: { cmd: string; ok: boolean; ms: number }[] = []
      for (const [i, line] of lines.entries()) {
        const argv = tokenize(line)
        if (argv.length === 0) continue
        const t0 = performance.now()
        let res: CommandResult
        try {
          res = await runCommand(connId, argv)
        } catch (e) {
          res = { error: (e as Error).message }
        }
        const ms = Math.round(performance.now() - t0)
        const r = commandToResult(argv, res)
        out.push({
          index: out.length,
          sql: argv.join(' '),
          command: r.command,
          columns: r.columns,
          rows: r.rows,
          rowCount: r.rowCount,
          durationMs: ms,
          paginated: false,
          limit: 0,
          offset: 0,
          source: null,
          error: r.error,
        })
        logs.push({ cmd: line.trim(), ok: r.error === null, ms })
      }
      return { out, logs }
    },
    onSuccess: ({ out, logs }) => {
      results = out
      views = {}
      active = out.length ? 0 : 'history'
      log = [...logs.reverse(), ...log].slice(0, 100)
    },
  }))

  function doRun(text: string) {
    const lines = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length === 0) return
    active = 0
    run.mutate(lines)
  }

  const activeResult = $derived(
    typeof active === 'number' && results.length > 0 ? (results[active] ?? null) : null,
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
        onclick={() => doRun(editorRef?.getSelectedOrAll() ?? cmd)}
      >
        {#if run.isPending}<Loader2 class="size-4 animate-spin" />{:else}<Play
            class="size-4"
          />{/if}
        Run
      </Button>
      <span class="text-muted-foreground text-xs">one command per line</span>
      <span class="text-muted-foreground ml-auto text-xs">⌘/Ctrl + Enter to run</span>
    </div>
    <div class="min-h-0 flex-1">
      <SqlEditor
        bind:this={editorRef}
        bind:value={cmd}
        language="plain"
        completionSource={redisCompletion}
        onrun={doRun}
      />
    </div>
  </Resizable.Pane>

  <Resizable.Handle withHandle />

  <!-- ── Result pane ── -->
  <Resizable.Pane defaultSize={50} class="flex min-h-0 flex-col">
    <ResultTabs {results} {active} onSelect={(t) => (active = t)} />

    <div class="min-h-0 flex-1 overflow-hidden">
      {#if active === 'history'}
        <div class="flex h-full flex-col">
          {#if log.length > 0}
            <ul class="divide-y overflow-auto text-xs">
              {#each log as h, i (i)}
                <li>
                  <button
                    class="hover:bg-accent flex w-full items-start gap-2 px-3 py-1.5 text-left"
                    onclick={() => editorRef?.setValue(h.cmd)}
                    title="Load into editor"
                  >
                    {#if h.ok}
                      <CircleCheck class="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                    {:else}
                      <CircleX class="text-destructive mt-0.5 size-3.5 shrink-0" />
                    {/if}
                    <span class="min-w-0 flex-1 truncate font-mono">{h.cmd}</span>
                    <span class="text-muted-foreground shrink-0">{h.ms}ms</span>
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="text-muted-foreground p-3 text-sm">No commands yet.</p>
          {/if}
        </div>
      {:else if typeof active === 'number'}
        {#if run.isPending}
          <p class="text-muted-foreground p-3 text-sm">Running…</p>
        {:else if results.length === 0}
          <p class="text-muted-foreground p-3 text-sm">Run a command to see results.</p>
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
                source={null}
                view={views[idx] ?? 'table'}
                onViewChange={(v) => (views[idx] = v)}
              />
            </div>
          {:else}
            <p class="text-muted-foreground p-3 text-sm">
              {activeResult.command} completed — {activeResult.rowCount} item{activeResult.rowCount ===
              1
                ? ''
                : 's'}.
            </p>
          {/if}
        {/if}
      {/if}
    </div>

    <!-- Bottom bar: result info -->
    <div class="flex shrink-0 items-center justify-between border-t px-3 py-1.5 text-xs">
      <span
        class={activeResult && !activeResult.error ? 'text-emerald-500' : 'text-muted-foreground'}
      >
        {#if run.isPending}
          Running…
        {:else if activeResult && !activeResult.error}
          {activeResult.rowCount} rows · {activeResult.durationMs}ms
        {/if}
      </span>
    </div>
  </Resizable.Pane>
</Resizable.PaneGroup>
