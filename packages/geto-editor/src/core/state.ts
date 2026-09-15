import { Compartment, Facet, StateField } from '@codemirror/state'
import type { EditorState, Transaction } from '@codemirror/state'
import type { RunStatementHandler, StatementRange } from './types'

/**
 * Compartments allow dynamically reconfiguring parts of the editor state
 * (language, metadata completion, auto-uppercase, theme, read-only)
 * without destroying or rebuilding the EditorView.
 */
export interface EditorCompartments {
  lang: Compartment
  meta: Compartment
  theme: Compartment
  readOnly: Compartment
  runGutter: Compartment
}

export function createCompartments(): EditorCompartments {
  return {
    lang: new Compartment(),
    meta: new Compartment(),
    theme: new Compartment(),
    readOnly: new Compartment(),
    runGutter: new Compartment(),
  }
}

/**
 * Instance-scoped Facet for the run-statement click handler.
 * Avoids module-level globals so multiple editor tabs never conflict.
 */
export const runStatementHandlerFacet = Facet.define<RunStatementHandler | null, RunStatementHandler | null>({
  combine: (values) => values[values.length - 1] ?? null,
})

/**
 * State field tracking parsed SQL statements per line number for gutter execution markers (▶).
 */
export interface RunGutterState {
  byLine: Map<number, string>
  ranges: StatementRange[]
}

export type StatementSplitterFn = (state: EditorState) => StatementRange[]

export const statementSplitterFacet = Facet.define<StatementSplitterFn | null, StatementSplitterFn | null>({
  combine: (values) => values[values.length - 1] ?? null,
})

export const runGutterState = StateField.define<RunGutterState>({
  create(state) {
    return computeGutterState(state)
  },
  update(value, tr: Transaction) {
    if (!tr.docChanged) return value
    return computeGutterState(tr.state)
  },
})

function computeGutterState(state: EditorState): RunGutterState {
  const splitter = state.facet(statementSplitterFacet)
  const byLine = new Map<number, string>()
  if (!splitter) {
    return { byLine, ranges: [] }
  }

  const ranges = splitter(state)
  for (const range of ranges) {
    const line = state.doc.lineAt(range.from)
    byLine.set(line.number, range.text)
  }

  return { byLine, ranges }
}
