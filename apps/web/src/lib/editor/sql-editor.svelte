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
  import { indentOnInput, indentUnit, bracketMatching, syntaxHighlighting } from '@codemirror/language'
  import { closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete'
  import { sqlExtensions, uppercaseKeywords, PostgreSQL, type SQLDialect } from './completion'
  import { setCompletionEntities, type CompletionEntities } from './entities'
  import { vscodeDark, vscodeHighlight } from './theme'

  let {
    value = $bindable(''),
    uppercase = true,
    onrun,
    completion,
    dialect = PostgreSQL,
  }: {
    value?: string
    uppercase?: boolean
    onrun?: (sql: string) => void
    /** Schema entities for IntelliSense (tables/columns/functions/FKs). */
    completion?: CompletionEntities
    /** SQL dialect — swap for MySQL/etc. as more providers land. */
    dialect?: SQLDialect
  } = $props()

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
        langComp.of(sqlExtensions(dialect)),
        upperComp.of(uppercase ? [uppercaseKeywords] : []),
        vscodeDark,
        syntaxHighlighting(vscodeHighlight),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) value = u.state.doc.toString()
        }),
      ],
    })
    ready = true
  })

  // Reload schema entities + rebuild the SQL language source when data arrives.
  $effect(() => {
    const data = completion
    const d = dialect
    if (!view) return
    setCompletionEntities(data ?? { tables: [], columns: [], functions: [], foreignKeys: [] })
    view.dispatch({ effects: langComp.reconfigure(sqlExtensions(d)) })
  })

  // Toggle auto-uppercase.
  $effect(() => {
    const on = uppercase
    if (!view) return
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
