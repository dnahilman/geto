import type { SQLDialect } from '@codemirror/lang-sql'
import type { EditorInstance, EditorMetadata, StatementRange, SupportedLanguage } from './types'

export interface EditorStateSnapshot {
  /** Full text of the document. */
  value: string
  /** 1-indexed line and column of the primary cursor position. */
  cursor: { line: number; col: number; offset: number }
  /** Active selection details. */
  selection: { text: string; length: number; isEmpty: boolean }
  /** Total count of detected top-level statements. */
  statementCount: number
  /** Statement currently active under the cursor. */
  activeStatement: StatementRange | null
  /** Active query language. */
  language: SupportedLanguage
  /** Active SQL dialect. */
  dialect?: SQLDialect
  /** Whether the editor instance is mounted and ready. */
  isReady: boolean
  /** Whether the document is currently in read-only mode. */
  readOnly: boolean
}

export type SessionListener = (snapshot: EditorStateSnapshot) => void

/**
 * Pure TypeScript, framework-agnostic editor session and state observer.
 * Enables UI components (toolbars, sidebars, status bars) to subscribe
 * to editor state updates and dispatch actions without prop drilling.
 */
export class EditorSession {
  private instance: EditorInstance | null = null
  private listeners = new Set<SessionListener>()
  private onRunHandler?: (text: string) => void
  private snapshot: EditorStateSnapshot = {
    value: '',
    cursor: { line: 1, col: 1, offset: 0 },
    selection: { text: '', length: 0, isEmpty: true },
    statementCount: 1,
    activeStatement: null,
    language: 'sql',
    isReady: false,
    readOnly: false,
  }

  constructor(options?: {
    language?: SupportedLanguage
    dialect?: SQLDialect
    onRun?: (text: string) => void
  }) {
    if (options?.language) this.snapshot.language = options.language
    if (options?.dialect) this.snapshot.dialect = options.dialect
    this.onRunHandler = options?.onRun
  }

  /**
   * Subscribe to reactive snapshot updates.
   * Returns an unsubscribe cleanup function.
   */
  subscribe = (listener: SessionListener): (() => void) => {
    this.listeners.add(listener)
    listener(this.snapshot)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /**
   * Get the latest synchronous state snapshot.
   */
  getSnapshot = (): EditorStateSnapshot => {
    return this.snapshot
  }

  /**
   * Attach an instantiated EditorInstance to this session.
   */
  attach = (instance: EditorInstance): void => {
    this.instance = instance
    this.updateSnapshot()
  }

  /**
   * Detach the current editor instance.
   */
  detach = (): void => {
    this.instance = null
    this.snapshot = { ...this.snapshot, isReady: false }
    this.notify()
  }

  /**
   * Sync and notify all subscribers with current editor state.
   */
  updateSnapshot = (): void => {
    if (!this.instance) return

    const cursor = this.instance.getCursorPosition()
    const selected = this.instance.getSelectedOrAll()
    const isSelEmpty = this.instance.view.state.selection.main.empty
    const activeStmt = this.instance.getStatementAtCursor()

    this.snapshot = {
      ...this.snapshot,
      value: this.instance.getValue(),
      cursor,
      selection: {
        text: isSelEmpty ? '' : selected,
        length: isSelEmpty ? 0 : selected.length,
        isEmpty: isSelEmpty,
      },
      activeStatement: activeStmt,
      isReady: true,
    }

    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.snapshot)
    }
  }

  // --- High-Level Actions ---

  /**
   * Execute query with mode:
   *  - 'current': Run statement under caret (DataGrip behavior)
   *  - 'selection': Run selected query if any, else whole document
   *  - 'all': Run entire document
   */
  run = (mode: 'all' | 'selection' | 'current' = 'selection'): void => {
    if (!this.instance) return

    const textToRun =
      mode === 'current'
        ? (this.instance.getStatementAtCursor()?.text ?? this.instance.getSelectedOrAll())
        : mode === 'all'
          ? this.instance.getValue()
          : this.instance.getSelectedOrAll()

    const trimmed = textToRun.trim()
    if (trimmed && this.onRunHandler) {
      this.onRunHandler(trimmed)
    }
  }

  format = (): void => {
    this.instance?.format()
    this.updateSnapshot()
  }

  insertAtCursor = (text: string): void => {
    this.instance?.insertAtCursor(text)
    this.updateSnapshot()
  }

  wrapSelection = (prefix: string, suffix: string): void => {
    this.instance?.wrapSelection(prefix, suffix)
    this.updateSnapshot()
  }

  undo = (): boolean => {
    const res = this.instance?.undo() ?? false
    this.updateSnapshot()
    return res
  }

  redo = (): boolean => {
    const res = this.instance?.redo() ?? false
    this.updateSnapshot()
    return res
  }

  setValue = (text: string): void => {
    this.instance?.setValue(text)
    this.updateSnapshot()
  }

  getValue = (): string => {
    return this.instance?.getValue() ?? this.snapshot.value
  }

  focus = (): void => {
    this.instance?.focus()
  }

  setMetadata = (metadata: EditorMetadata): void => {
    this.instance?.setMetadata(metadata)
    this.updateSnapshot()
  }

  destroy = (): void => {
    this.instance?.destroy()
    this.detach()
  }
}

/**
 * Factory helper to create a new EditorSession.
 */
export function createEditorSession(options?: {
  language?: SupportedLanguage
  dialect?: SQLDialect
  onRun?: (text: string) => void
}): EditorSession {
  return new EditorSession(options)
}
