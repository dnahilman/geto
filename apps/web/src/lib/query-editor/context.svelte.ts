import { getContext, setContext } from 'svelte'
import { EditorSession, type EditorStateSnapshot, type StatementRange } from '@geto/editor'

const QUERY_EDITOR_CONTEXT_KEY = Symbol('QUERY_EDITOR_CONTEXT')

export interface QueryEditorContextValue {
  /** Reactive state snapshot of the active query editor. */
  readonly state: EditorStateSnapshot
  /** Underlying framework-agnostic session instance. */
  readonly session: EditorSession
  /** Execute query: 'current' statement under caret, 'selection', or 'all'. */
  run: (mode?: 'all' | 'selection' | 'current') => void
  /** Format document according to active language provider. */
  format: () => void
  /** Insert text at the current cursor position. */
  insertAtCursor: (text: string) => void
  /** Wrap current selection with prefix and suffix strings. */
  wrapSelection: (prefix: string, suffix: string) => void
  /** Get statement under caret. */
  getStatementAtCursor: () => StatementRange | null
  /** Set full document text. */
  setValue: (text: string) => void
  /** Focus the editor. */
  focus: () => void
  /** Undo the last edit action. */
  undo: () => boolean
  /** Redo the last undone edit action. */
  redo: () => boolean
}

/**
 * Initialize and provide a reactive Svelte 5 QueryEditor context to child components.
 */
export function setQueryEditorContext(session: EditorSession): QueryEditorContextValue {
  let snapshot = $state<EditorStateSnapshot>(session.getSnapshot())

  session.subscribe((updated) => {
    snapshot = updated
  })

  const context: QueryEditorContextValue = {
    get state() {
      return snapshot
    },
    session,
    run: (mode) => session.run(mode),
    format: () => session.format(),
    insertAtCursor: (text) => session.insertAtCursor(text),
    wrapSelection: (prefix, suffix) => session.wrapSelection(prefix, suffix),
    getStatementAtCursor: () => session.getSnapshot().activeStatement,
    setValue: (text) => session.setValue(text),
    focus: () => session.focus(),
    undo: () => session.undo(),
    redo: () => session.redo(),
  }

  setContext(QUERY_EDITOR_CONTEXT_KEY, context)
  return context
}

/**
 * Retrieve the active QueryEditor context in any descendant Svelte component.
 */
export function getQueryEditorContext(): QueryEditorContextValue | undefined {
  return getContext<QueryEditorContextValue>(QUERY_EDITOR_CONTEXT_KEY)
}
