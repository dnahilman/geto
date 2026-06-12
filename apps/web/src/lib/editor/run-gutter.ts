import { GutterMarker, gutter } from '@codemirror/view'
import { StateField } from '@codemirror/state'
import type { EditorState, Transaction } from '@codemirror/state'
import { statementRanges } from './statements'

let _handler: ((sql: string) => void) | null = null

export function setRunStatementHandler(fn: ((sql: string) => void) | null) {
  _handler = fn
}

interface GutterState {
  byLine: Map<number, string>
}

const runGutterState = StateField.define<GutterState>({
  create(state) {
    return compute(state)
  },
  update(value, tr: Transaction) {
    if (!tr.docChanged) return value
    return compute(tr.state)
  },
})

function compute(state: EditorState): GutterState {
  const byLine = new Map<number, string>()
  for (const range of statementRanges(state)) {
    const line = state.doc.lineAt(range.from)
    byLine.set(line.number, range.text)
  }
  return { byLine }
}

export { runGutterState }

// Lucide Play icon — stroke only, no fill (matches lucide-svelte's Play component exactly).
const ICON_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"' +
  ' fill="none" stroke="currentColor" stroke-width="2"' +
  ' stroke-linecap="round" stroke-linejoin="round">' +
  '<polygon points="6 3 20 12 6 21 6 3"/>' +
  '</svg>'

class RunMarker extends GutterMarker {
  constructor(private readonly sql: string) {
    super()
  }

  toDOM(): HTMLElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'cm-run-marker'
    btn.title = 'Run this statement'
    btn.setAttribute('aria-label', 'Run this statement')
    btn.innerHTML = ICON_SVG
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault()
      _handler?.(this.sql)
    })
    return btn
  }

  eq(other: GutterMarker): boolean {
    return other instanceof RunMarker && other.sql === this.sql
  }
}

export const runGutter = [
  runGutterState,
  gutter({
    class: 'cm-run-gutter',
    lineMarker(view, line) {
      const s = view.state.field(runGutterState)
      const lineNum = view.state.doc.lineAt(line.from).number
      const sql = s.byLine.get(lineNum)
      return sql !== undefined ? new RunMarker(sql) : null
    },
    initialSpacer() {
      // Fixed-width invisible spacer keeps the gutter column stable.
      const s = document.createElement('span')
      s.className = 'cm-run-marker'
      s.style.visibility = 'hidden'
      s.innerHTML = ICON_SVG
      return new (class extends GutterMarker {
        toDOM() {
          return s
        }
      })()
    },
  }),
]
