import {
  EditorView,
  keymap,
  lineNumbers as cmLineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
} from '@codemirror/view'
import { EditorState, type Extension } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import {
  indentOnInput,
  indentUnit,
  bracketMatching,
  syntaxHighlighting,
} from '@codemirror/language'
import {
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from '@codemirror/autocomplete'
import { vscodeDarkTheme, vscodeHighlight } from './theme'
import { runGutterState, runStatementHandlerFacet } from './state'
import type { EditorOptions } from './types'

export function createBaseExtensions(options: EditorOptions): Extension[] {
  const extensions: Extension[] = [
    highlightActiveLine(),
    drawSelection(),
    history(),
    indentOnInput(),
    indentUnit.of('  '),
    EditorState.tabSize.of(options.tabSize ?? 2),
    bracketMatching(),
    closeBrackets(),
    keymap.of([
      ...closeBracketsKeymap,
      ...defaultKeymap,
      ...historyKeymap,
      ...completionKeymap,
      indentWithTab,
    ]),
    options.theme ?? vscodeDarkTheme,
    syntaxHighlighting(vscodeHighlight),
  ]

  if (options.lineNumbers !== false) {
    extensions.unshift(cmLineNumbers(), highlightActiveLineGutter())
  }

  // Bind the run-statement handler facet
  extensions.push(runStatementHandlerFacet.of(options.onRunStatement ?? null))

  // Update listener for tracking document and statement changes
  extensions.push(
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        const text = update.state.doc.toString()
        options.onChange?.(text)

        if (options.onStatementsChange) {
          const gutter = update.state.field(runGutterState, false)
          const count = gutter ? gutter.byLine.size || 1 : 1
          options.onStatementsChange(count)
        }
      }
    }),
  )

  return extensions
}
