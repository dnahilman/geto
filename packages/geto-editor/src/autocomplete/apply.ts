import type { EditorView } from '@codemirror/view'
import type { Completion } from '@codemirror/autocomplete'

/**
 * DataGrip-style completion application:
 * Automatically appends a trailing space when an autocomplete item is accepted,
 * unless the cursor is already immediately followed by whitespace or delimiters (`,`, `;`, `)`, `.`).
 */
export function applyWithTrailingSpace(
  view: EditorView,
  completion: Completion,
  from: number,
  to: number,
  customInsert?: string,
): void {
  const insertText =
    customInsert ?? (typeof completion.apply === 'string' ? completion.apply : completion.label)
  const nextChar = view.state.doc.sliceString(to, to + 1)
  const needsSpace = !nextChar || !/[\s,();.]/.test(nextChar)
  const textToInsert = needsSpace ? insertText + ' ' : insertText

  view.dispatch({
    changes: { from, to, insert: textToInsert },
    selection: { anchor: from + textToInsert.length },
    userEvent: 'input.complete',
  })
}

/**
 * Higher-order helper to attach DataGrip trailing space behavior to a Completion item.
 */
export function withTrailingSpace(completion: Completion, customInsert?: string): Completion {
  return {
    ...completion,
    apply: (view: EditorView, c: Completion, from: number, to: number) => {
      applyWithTrailingSpace(view, c, from, to, customInsert)
    },
  }
}
