import type { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import type { CompletionSource } from '@codemirror/autocomplete'
import type { SQLDialect } from '@codemirror/lang-sql'

export type SupportedLanguage = 'sql' | 'mongodb' | 'redis' | 'plain'

export interface StatementRange {
  from: number
  to: number
  text: string
}

export type RunHandler = (text: string) => void
export type RunStatementHandler = (sql: string) => void
export type StatementsChangeHandler = (count: number) => void
export type ChangeHandler = (value: string) => void

export interface SQLMetadataTable {
  schema: string
  name: string
  type: 'table' | 'view' | 'matview'
}

export interface SQLMetadataColumn {
  schema: string
  table: string
  name: string
  type: string
}

export interface SQLMetadataFunction {
  schema: string
  name: string
  args: string
  returns: string
  kind: 'function' | 'procedure' | 'aggregate' | 'window'
}

export interface SQLMetadataForeignKey {
  schema: string
  table: string
  columns: string[]
  refSchema: string
  refTable: string
  refColumns: string[]
}

export interface SQLMetadata {
  type?: 'sql'
  tables?: SQLMetadataTable[]
  columns?: SQLMetadataColumn[]
  functions?: SQLMetadataFunction[]
  foreignKeys?: SQLMetadataForeignKey[]
  defaultSchema?: string
}

export interface MongoMetadata {
  type: 'mongodb'
  collections: string[]
  fields?: Record<string, string[]>
}

export interface RedisMetadata {
  type: 'redis'
  commands?: string[]
  keys?: string[]
}

export type EditorMetadata = SQLMetadata | MongoMetadata | RedisMetadata | Record<string, any>

export interface EditorOptions {
  /** Initial text value of the document. Defaults to empty string. */
  value?: string
  /** Active query language. Defaults to 'sql'. */
  language?: SupportedLanguage
  /** SQL dialect (when language is 'sql'). Defaults to StandardSQL. */
  dialect?: SQLDialect
  /** Schema metadata used for context-aware autocompletion and linting. */
  metadata?: EditorMetadata
  /** Whether the editor is read-only. Defaults to false. */
  readOnly?: boolean
  /** Show line numbers gutter. Defaults to true. */
  lineNumbers?: boolean
  /** Show run-statement ▶ gutter marker on top-level statements (SQL only). Defaults to true. */
  runGutter?: boolean
  /** Tab indentation width in spaces. Defaults to 2. */
  tabSize?: number
  /** Custom autocomplete completion source (used in plain/redis or custom modes). */
  completionSource?: CompletionSource
  /** Theme extension or preset. If omitted, built-in VS Code Dark theme is used. */
  theme?: Extension
  /** Callback fired when user runs selected query or whole document (Mod-Enter). */
  onRun?: RunHandler
  /** Callback fired when the gutter ▶ button is clicked for a single statement. */
  onRunStatement?: RunStatementHandler
  /** Callback fired whenever the number of statements changes. */
  onStatementsChange?: StatementsChangeHandler
  /** Callback fired whenever the document content changes. */
  onChange?: ChangeHandler
}

export interface EditorInstance {
  /** The underlying CodeMirror 6 EditorView DOM instance. */
  readonly view: EditorView
  /** Get the current text content of the entire document. */
  getValue(): string
  /** Replace the document text content with a new string. */
  setValue(text: string): void
  /** Return selected text if any; otherwise return the entire document. */
  getSelectedOrAll(): string
  /** Set focus to the editor input. */
  focus(): void
  /** Explicitly format the document according to current language provider. */
  format(): void
  /** Safely destroy the EditorView, remove DOM listeners, and clean up resources. */
  destroy(): void
  /** Dynamically update the active language provider. */
  setLanguage(language: SupportedLanguage, dialect?: SQLDialect): void
  /** Dynamically update the cached schema metadata without reloading the editor. */
  setMetadata(metadata: EditorMetadata): void
  /** Dynamically toggle read-only mode. */
  setReadOnly(readOnly: boolean): void
  /** Dynamically update the run-statement click handler. */
  setRunStatementHandler(handler: RunStatementHandler | null): void
  /** Dispatch transactions to the underlying view. */
  dispatch(...tr: Parameters<EditorView['dispatch']>): void
}
