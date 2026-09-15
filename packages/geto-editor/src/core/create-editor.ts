import { EditorView } from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import type { SQLDialect } from '@codemirror/lang-sql'
import { createBaseExtensions } from './extensions'
import { createCompartments, runStatementHandlerFacet, statementSplitterFacet } from './state'
import type { EditorInstance, EditorMetadata, EditorOptions, SQLMetadata, StatementRange, SupportedLanguage } from './types'

import { createSqlLanguageExtension } from '../languages/sql/language'
import { formatSql } from '../languages/sql/formatter'
import { createRedisLanguageExtension } from '../languages/redis/language'
import { formatRedisCommands } from '../languages/redis/formatter'
import { createMongoLanguageExtension } from '../languages/mongodb/language'
import { formatMongoQuery } from '../languages/mongodb/formatter'
import { createSqlCompletionExtension } from '../autocomplete/completion'
import { createSqlLinter } from '../lint/lint'
import { createShortcutsKeymap } from '../plugins/shortcuts'

export type LanguageExtensionFactory = (
  language: SupportedLanguage,
  dialect?: SQLDialect,
  metadata?: EditorMetadata,
  completionSource?: EditorOptions['completionSource'],
) => Extension

export type FormatterFunction = (text: string, dialect?: SQLDialect, language?: SupportedLanguage) => string

export interface EditorProviderRegistry {
  createLanguageExtension?: LanguageExtensionFactory
  formatDocument?: FormatterFunction
}

let providerRegistry: EditorProviderRegistry = {}

export function registerEditorProviders(providers: EditorProviderRegistry): void {
  providerRegistry = { ...providerRegistry, ...providers }
}

export function createEditor(container: HTMLElement, options: EditorOptions = {}): EditorInstance {
  const compartments = createCompartments()
  let currentLanguage: SupportedLanguage = options.language ?? 'sql'
  let currentDialect: SQLDialect | undefined = options.dialect
  let currentMetadata: EditorMetadata = options.metadata ?? {}

  const resolveLanguageExtension = (): Extension => {
    if (providerRegistry.createLanguageExtension) {
      return providerRegistry.createLanguageExtension(
        currentLanguage,
        currentDialect,
        currentMetadata,
        options.completionSource,
      )
    }

    switch (currentLanguage) {
      case 'sql':
        return createSqlLanguageExtension({
          dialect: currentDialect,
          runGutter: options.runGutter,
        })
      case 'redis':
      case 'plain':
        return createRedisLanguageExtension({
          completionSource: options.completionSource,
        })
      case 'mongodb':
        return createMongoLanguageExtension()
      default:
        return []
    }
  }

  const resolveMetadataExtension = (): Extension => {
    if (currentLanguage === 'sql') {
      return createSqlCompletionExtension(currentMetadata as SQLMetadata, currentDialect)
    }
    return []
  }

  const shortcuts = createShortcutsKeymap({
    onRun: () => {
      if (!options.onRun) return false
      const sel = view.state.selection.main
      const text = !sel.empty ? view.state.sliceDoc(sel.from, sel.to) : view.state.doc.toString()
      options.onRun(text)
      return true
    },
    onFormat: () => {
      instance.format()
      return true
    },
  })

  const initialExtensions: Extension[] = [
    shortcuts,
    ...createBaseExtensions(options),
    compartments.lang.of(resolveLanguageExtension()),
    compartments.meta.of(resolveMetadataExtension()),
    createSqlLinter(),
    compartments.readOnly.of(options.readOnly ? EditorState.readOnly.of(true) : []),
  ]

  const state = EditorState.create({
    doc: options.value ?? '',
    extensions: initialExtensions,
  })

  const view = new EditorView({
    parent: container,
    state,
  })

  // Emit initial statement count if handler is registered
  if (options.onStatementsChange) {
    options.onStatementsChange(1)
  }

  const instance: EditorInstance = {
    get view() {
      return view
    },

    getValue(): string {
      return view.state.doc.toString()
    },

    setValue(text: string): void {
      if (view.state.doc.toString() !== text) {
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: text },
        })
      }
    },

    getSelectedOrAll(): string {
      const sel = view.state.selection.main
      if (!sel.empty) {
        return view.state.sliceDoc(sel.from, sel.to)
      }
      return view.state.doc.toString()
    },

    focus(): void {
      view.focus()
    },

    format(): void {
      const current = view.state.doc.toString()
      let formatted: string | undefined

      if (providerRegistry.formatDocument) {
        formatted = providerRegistry.formatDocument(current, currentDialect, currentLanguage)
      } else if (currentLanguage === 'sql') {
        formatted = formatSql(current, currentDialect)
      } else if (currentLanguage === 'redis' || currentLanguage === 'plain') {
        formatted = formatRedisCommands(current)
      } else if (currentLanguage === 'mongodb') {
        formatted = formatMongoQuery(current)
      }

      if (formatted && formatted !== current) {
        instance.setValue(formatted)
      }
    },

    destroy(): void {
      view.destroy()
    },

    setLanguage(language: SupportedLanguage, dialect?: SQLDialect): void {
      currentLanguage = language
      if (dialect) currentDialect = dialect
      view.dispatch({
        effects: [
          compartments.lang.reconfigure(resolveLanguageExtension()),
          compartments.meta.reconfigure(resolveMetadataExtension()),
        ],
      })
    },

    setMetadata(metadata: EditorMetadata): void {
      currentMetadata = metadata
      view.dispatch({
        effects: compartments.meta.reconfigure(resolveMetadataExtension()),
      })
    },

    setReadOnly(readOnly: boolean): void {
      view.dispatch({
        effects: compartments.readOnly.reconfigure(
          readOnly ? EditorState.readOnly.of(true) : [],
        ),
      })
    },

    setRunStatementHandler(handler: ((sql: string) => void) | null): void {
      // In-place reconfiguration without destroying extensions
      view.dispatch({
        effects: compartments.runGutter.reconfigure(
          runStatementHandlerFacet.of(handler),
        ),
      })
    },

    getCursorPosition(): { line: number; col: number; offset: number } {
      const pos = view.state.selection.main.head
      const line = view.state.doc.lineAt(pos)
      return {
        line: line.number,
        col: pos - line.from + 1,
        offset: pos,
      }
    },

    getStatementAtCursor(): StatementRange | null {
      const pos = view.state.selection.main.head
      const splitter = view.state.facet(statementSplitterFacet)
      const ranges = splitter ? splitter(view.state) : []
      for (const r of ranges) {
        if (pos >= r.from && pos <= r.to) {
          return r
        }
      }
      return ranges.length > 0 ? ranges[0] : null
    },

    insertAtCursor(text: string): void {
      const sel = view.state.selection.main
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: text },
        selection: { anchor: sel.from + text.length },
        userEvent: 'input.insert',
      })
      view.focus()
    },

    wrapSelection(prefix: string, suffix: string): void {
      const sel = view.state.selection.main
      const selected = view.state.sliceDoc(sel.from, sel.to)
      const wrapped = `${prefix}${selected}${suffix}`
      view.dispatch({
        changes: { from: sel.from, to: sel.to, insert: wrapped },
        selection: {
          anchor: sel.from + prefix.length,
          head: sel.from + prefix.length + selected.length,
        },
        userEvent: 'input.wrap',
      })
      view.focus()
    },

    dispatch(...tr: Parameters<EditorView['dispatch']>): void {
      view.dispatch(...tr)
    },
  }

  return instance
}
