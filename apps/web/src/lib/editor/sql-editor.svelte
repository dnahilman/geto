<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { Loader2 } from 'lucide-svelte'
  import {
    EditorView,
    keymap,
    lineNumbers,
    highlightActiveLine,
    highlightActiveLineGutter,
    drawSelection,
  } from '@codemirror/view'
  import { EditorState, Compartment } from '@codemirror/state'
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
  import {
    indentOnInput,
    indentUnit,
    bracketMatching,
    syntaxHighlighting,
  } from '@codemirror/language'
  import {
    autocompletion,
    closeBrackets,
    closeBracketsKeymap,
    completionKeymap,
    type CompletionSource,
  } from '@codemirror/autocomplete'
  import { sqlExtensions, uppercaseKeywords, PostgreSQL, type SQLDialect } from './completion'
  import { setCompletionEntities, type CompletionEntities } from './entities'
  import { vscodeDark, vscodeHighlight } from './theme'
  import { runGutter, setRunStatementHandler, runGutterState } from './run-gutter'
  import { statementRanges } from './statements'

  let {
    value = $bindable(''),
    uppercase = true,
    onrun,
    onrunstatement,
    onstatementschange,
    completion,
    dialect = PostgreSQL,
    language = 'sql',
    completionSource,
  }: {
    value?: string
    uppercase?: boolean
    onrun?: (sql: string) => void
    /** Called when the gutter ▶ is clicked for a single statement. */
    onrunstatement?: (sql: string) => void
    /** Called whenever the statement count changes (for the count badge). */
    onstatementschange?: (count: number) => void
    /** Schema entities for IntelliSense (tables/columns/functions/FKs). */
    completion?: CompletionEntities
    /** SQL dialect — swap for MySQL/etc. as more providers land. */
    dialect?: SQLDialect
    /** 'sql' = full SQL language; 'plain' = no SQL syntax/uppercase/gutter (e.g.
     *  Redis commands). The editor still looks/runs identically (Ctrl-Enter run). */
    language?: 'sql' | 'plain'
    /** Optional autocomplete source used in 'plain' mode (e.g. Redis commands/keys). */
    completionSource?: CompletionSource
  } = $props()

  const isSql = language === 'sql'
  // Language extension for 'plain' mode: just optional autocomplete, no syntax.
  const plainLang = () => (completionSource ? autocompletion({ override: [completionSource] }) : [])

  let container: HTMLDivElement
  let view: EditorView | undefined
  let ready = $state(false)

  // Compartments let us hot-swap the language/completion (when schema data loads)
  // and the auto-uppercase extension (when the toggle flips) without rebuilding.
  const langComp = new Compartment()
  const upperComp = new Compartment()

  export function getSelectedOrAll(): string {
    if (!view) return value
    const sel = view.state.selection.main
    if (!sel.empty) return view.state.sliceDoc(sel.from, sel.to)
    return view.state.doc.toString()
  }

  export function setValue(v: string) {
    if (view && view.state.doc.toString() !== v) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: v } })
    }
  }

  onMount(() => {
    // Seed entities before the first build so initial completion has the schema.
    if (completion) setCompletionEntities(completion)
    // Register the gutter click handler (module-level ref, swapped without
    // rebuilding the extension when the prop changes via the $effect below).
    setRunStatementHandler(onrunstatement ?? null)
    view = new EditorView({
      parent: container,
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        drawSelection(),
        history(),
        indentOnInput(),
        indentUnit.of('  '),
        EditorState.tabSize.of(2),
        bracketMatching(),
        closeBrackets(),
        keymap.of([
          // Must be first — completionKeymap also binds Mod-Enter (trigger completion).
          {
            key: 'Mod-Enter',
            preventDefault: true,
            run: () => {
              onrun?.(getSelectedOrAll())
              return true
            },
          },
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...completionKeymap,
          indentWithTab,
        ]),
        langComp.of(isSql ? sqlExtensions(dialect) : plainLang()),
        upperComp.of(isSql && uppercase ? [uppercaseKeywords] : []),
        vscodeDark,
        syntaxHighlighting(vscodeHighlight),
        // Run-statement gutter (▶ markers) — SQL only.
        ...(isSql ? runGutter : []),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) {
            value = u.state.doc.toString()
            // Emit statement count whenever the doc changes (SQL gutter only).
            const count = isSql ? u.state.field(runGutterState).byLine.size || 1 : 1
            onstatementschange?.(count)
          }
        }),
      ],
    })
    // Emit initial count.
    onstatementschange?.(isSql ? statementRanges(view.state).length || 1 : 1)
    ready = true
  })

  // Keep the run-statement handler in sync when the prop changes.
  $effect(() => {
    setRunStatementHandler(onrunstatement ?? null)
  })

  // Reload schema entities + rebuild the SQL language source when data arrives.
  // Guard: never call setCompletionEntities with null — the module-level store is shared
  // across all editor instances, so clearing it would break completion in other open tabs.
  $effect(() => {
    const data = completion
    const d = dialect
    if (!view || !isSql) return
    if (data != null) setCompletionEntities(data)
    view.dispatch({ effects: langComp.reconfigure(sqlExtensions(d)) })
  })

  // Toggle auto-uppercase (SQL only).
  $effect(() => {
    const on = uppercase
    if (!view || !isSql) return
    view.dispatch({ effects: upperComp.reconfigure(on ? [uppercaseKeywords] : []) })
  })

  onDestroy(() => view?.destroy())
</script>

<div class="relative h-full w-full">
  <div bind:this={container} class="h-full w-full overflow-hidden"></div>
  {#if !ready}
    <div
      class="text-muted-foreground absolute inset-0 flex items-center justify-center gap-2 bg-[#1e1e1e] text-xs"
    >
      <Loader2 class="size-4 animate-spin" /> Loading editor…
    </div>
  {/if}
</div>
