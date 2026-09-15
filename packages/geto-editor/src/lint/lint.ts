import { linter, lintGutter, type Diagnostic } from '@codemirror/lint'
import type { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'

export type { Diagnostic }

export type ExternalLinterFn = (
  code: string,
  view: EditorView,
) => Promise<Diagnostic[]> | Diagnostic[]

export interface SqlLinterOptions {
  /** Delay in milliseconds before triggering the linter. Defaults to 300ms. */
  delay?: number
  /** Whether to show the lint gutter with error/warning icons. Defaults to true. */
  gutter?: boolean
  /** Optional external linter (e.g. database EXPLAIN validation from Rust backend). */
  externalLinter?: ExternalLinterFn
}

/**
 * Fast, local, client-side SQL syntax linter.
 * Detects unclosed single quotes, double quotes, unclosed block comments,
 * and unbalanced parentheses without querying the database.
 */
export function checkSqlSyntax(code: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const len = code.length
  let i = 0

  const parenStack: { pos: number }[] = []

  while (i < len) {
    const ch = code[i]

    // Line comment -- skip to line end
    if (ch === '-' && code[i + 1] === '-') {
      while (i < len && code[i] !== '\n') i++
      continue
    }

    // Block comment
    if (ch === '/' && code[i + 1] === '*') {
      const commentStart = i
      i += 2
      let closed = false
      while (i < len - 1) {
        if (code[i] === '*' && code[i + 1] === '/') {
          closed = true
          i += 2
          break
        }
        i++
      }
      if (!closed) {
        diagnostics.push({
          from: commentStart,
          to: len,
          severity: 'error',
          message: 'Unclosed block comment (/* ... */)',
        })
      }
      continue
    }

    // Single-quoted string literal
    if (ch === "'") {
      const strStart = i
      i++
      let closed = false
      while (i < len) {
        if (code[i] === "'") {
          if (code[i + 1] === "'") {
            i += 2 // Escaped quote
          } else {
            closed = true
            i++
            break
          }
        } else {
          i++
        }
      }
      if (!closed) {
        diagnostics.push({
          from: strStart,
          to: len,
          severity: 'error',
          message: 'Unclosed string literal',
        })
      }
      continue
    }

    // Double-quoted identifier
    if (ch === '"') {
      const identStart = i
      i++
      let closed = false
      while (i < len) {
        if (code[i] === '"') {
          closed = true
          i++
          break
        }
        i++
      }
      if (!closed) {
        diagnostics.push({
          from: identStart,
          to: len,
          severity: 'error',
          message: 'Unclosed quoted identifier',
        })
      }
      continue
    }

    // Parentheses matching
    if (ch === '(') {
      parenStack.push({ pos: i })
    } else if (ch === ')') {
      if (parenStack.length === 0) {
        diagnostics.push({
          from: i,
          to: i + 1,
          severity: 'error',
          message: 'Unexpected closing parenthesis ")"',
        })
      } else {
        parenStack.pop()
      }
    }

    i++
  }

  // Any unclosed open parentheses
  for (const unclosed of parenStack) {
    diagnostics.push({
      from: unclosed.pos,
      to: unclosed.pos + 1,
      severity: 'error',
      message: 'Unclosed parenthesis "("',
    })
  }

  return diagnostics
}

/**
 * Create a debounced SQL linter extension combining local parser checks
 * with optional asynchronous external database validation.
 */
export function createSqlLinter(options: SqlLinterOptions = {}): Extension[] {
  const lintExtension = linter(
    async (view) => {
      const code = view.state.doc.toString()
      if (!code.trim()) return []

      const localDiagnostics = checkSqlSyntax(code)

      // If local syntax already has severe errors, skip external query to save DB resources
      if (localDiagnostics.length > 0 || !options.externalLinter) {
        return localDiagnostics
      }

      try {
        const externalDiagnostics = await options.externalLinter(code, view)
        return [...localDiagnostics, ...externalDiagnostics]
      } catch {
        return localDiagnostics
      }
    },
    { delay: options.delay ?? 300 },
  )

  const extensions: Extension[] = [lintExtension]
  if (options.gutter !== false) {
    extensions.push(lintGutter())
  }

  return extensions
}
