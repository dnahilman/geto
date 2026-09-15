<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { Loader } from 'lucide-svelte'
  import {
    createEditor,
    resolveDialect,
    EditorSession,
    type EditorInstance,
    type EditorMetadata,
    type SQLDialect,
    type SupportedLanguage,
    type StatementRange,
  } from '@geto/editor'
  import type { CompletionSource } from '@codemirror/autocomplete'
  import { setQueryEditorContext } from './context'

  interface Props {
    /** Document value with two-way binding. */
    value?: string
    /** Query language (SQL, MongoDB, Redis, plain). Defaults to 'sql'. */
    language?: SupportedLanguage
    /** SQL dialect provider (e.g. 'postgres', 'mysql', 'sqlite', 'standard'). */
    dialect?: SQLDialect | string
    /** Database schema metadata for context-aware autocompletion and linting. */
    metadata?: EditorMetadata
    /** Optional custom completion source (e.g. Redis commands/keys). */
    completionSource?: CompletionSource
    /** Whether the editor is read-only. */
    readOnly?: boolean
    /** Show line numbers gutter. */
    lineNumbers?: boolean
    /** Show run-statement ▶ gutter marker on statements (SQL only). */
    runGutter?: boolean
    /** Optional existing EditorSession to bind to. If omitted, creates an internal session. */
    session?: EditorSession
    /** Callback when user executes query (Mod-Enter). */
    onrun?: (text: string) => void
    /** Callback when user clicks the gutter ▶ on a single statement. */
    onrunstatement?: (sql: string) => void
    /** Callback when the number of parsed statements changes. */
    onstatementschange?: (count: number) => void
  }

  let {
    value = $bindable(''),
    language = 'sql',
    dialect = 'standard',
    metadata = undefined,
    completionSource = undefined,
    readOnly = false,
    lineNumbers = true,
    runGutter = true,
    session = undefined,
    onrun,
    onrunstatement,
    onstatementschange,
  }: Props = $props()

  let container: HTMLDivElement
  let editor = $state<EditorInstance>()
  let ready = $state(false)

  // Initialize or bind EditorSession
  // svelte-ignore state_referenced_locally
  const activeSession = session ?? new EditorSession({
    language,
    dialect: resolveDialect(dialect),
    onRun: (text) => onrun?.(text),
  })

  // Expose reactive context to child components (e.g. toolbars, status bars)
  setQueryEditorContext(activeSession)

  // --- Public Imperative API ---

  export function getSelectedOrAll(): string {
    return editor ? editor.getSelectedOrAll() : value
  }

  export function getStatementAtCursor(): StatementRange | null {
    return editor ? editor.getStatementAtCursor() : null
  }

  export function insertAtCursor(text: string): void {
    editor?.insertAtCursor(text)
  }

  export function wrapSelection(prefix: string, suffix: string): void {
    editor?.wrapSelection(prefix, suffix)
  }

  export function setValue(newText: string): void {
    if (editor) {
      editor.setValue(newText)
    } else {
      value = newText
    }
  }

  export function getValue(): string {
    return editor ? editor.getValue() : value
  }

  export function format(): void {
    editor?.format()
  }

  export function focus(): void {
    editor?.focus()
  }

  export function undo(): boolean {
    return editor?.undo() ?? false
  }

  export function redo(): boolean {
    return editor?.redo() ?? false
  }

  export function getSession(): EditorSession {
    return activeSession
  }

  // --- Lifecycle & Reactive Synchronization ---

  onMount(() => {
    editor = createEditor(container, {
      value,
      language,
      dialect: resolveDialect(dialect),
      metadata,
      completionSource,
      readOnly,
      lineNumbers,
      runGutter,
      onRun: (text) => onrun?.(text),
      onRunStatement: (sql) => onrunstatement?.(sql),
      onStatementsChange: (count) => onstatementschange?.(count),
      onChange: (newVal) => {
        value = newVal
        activeSession.updateSnapshot()
      },
      onSelectionChange: () => {
        activeSession.updateSnapshot()
      },
    })

    activeSession.attach(editor)
    ready = true
  })

  // Synchronize dynamic metadata updates (without reloading CodeMirror view)
  $effect(() => {
    if (editor && metadata !== undefined) {
      editor.setMetadata(metadata)
      activeSession.updateSnapshot()
    }
  })

  // Synchronize dialect changes
  $effect(() => {
    if (editor) {
      editor.setLanguage(language, resolveDialect(dialect))
      activeSession.updateSnapshot()
    }
  })

  // Synchronize readOnly mode
  $effect(() => {
    editor?.setReadOnly(readOnly)
  })

  // Synchronize run statement click handler
  $effect(() => {
    editor?.setRunStatementHandler(onrunstatement ?? null)
  })

  onDestroy(() => {
    activeSession.detach()
    editor?.destroy()
  })
</script>

<div class="relative h-full w-full">
  <div bind:this={container} class="h-full w-full overflow-hidden"></div>
  {#if !ready}
    <div
      class="text-muted-foreground absolute inset-0 flex items-center justify-center gap-2 bg-[#1e1e1e] text-xs"
    >
      <Loader class="size-4 animate-spin" /> Loading query editor…
    </div>
  {/if}
</div>
