import { GutterMarker, gutter } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import {
  runGutterState,
  runStatementHandlerFacet,
  statementSplitterFacet,
} from '../../core/state'
import { statementRanges } from './statements'
import { checkSqlSyntax } from '../../lint/lint'

const PLAY_ICON_SVG =
  '<svg width="10" height="10" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">' +
  '<polygon points="6 3 20 12 6 21 6 3"/>' +
  '</svg>'

class RunMarker extends GutterMarker {
  constructor(private readonly sql: string) {
    super()
  }

  toDOM(view: EditorView): HTMLElement {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'cm-run-marker'

    // If this statement has fatal syntax errors, hide/disable the run button
    const hasSyntaxError = checkSqlSyntax(this.sql).length > 0
    if (hasSyntaxError) {
      btn.disabled = true
      btn.style.visibility = 'hidden'
      btn.style.pointerEvents = 'none'
      btn.setAttribute('aria-hidden', 'true')
    } else {
      btn.title = 'Run this statement'
      btn.setAttribute('aria-label', 'Run this statement')
      btn.innerHTML = PLAY_ICON_SVG
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        const handler = view.state.facet(runStatementHandlerFacet)
        handler?.(this.sql)
      })
    }
    return btn
  }

  eq(other: GutterMarker): boolean {
    return other instanceof RunMarker && other.sql === this.sql
  }
}

class SpacerMarker extends GutterMarker {
  toDOM(): HTMLElement {
    const s = document.createElement('span')
    s.className = 'cm-run-marker'
    s.style.visibility = 'hidden'
    s.innerHTML = PLAY_ICON_SVG
    return s
  }
}

const spacerInstance = new SpacerMarker()

export function createRunGutter(): Extension[] {
  return [
    statementSplitterFacet.of(statementRanges),
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
        return spacerInstance
      },
    }),
  ]
}
