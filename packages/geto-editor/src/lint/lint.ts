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
  /** Callback fired whenever diagnostics are updated. */
  onDiagnosticsChange?: (diagnostics: Diagnostic[]) => void
}

/**
 * Mask comments, string literals, and quoted identifiers with spaces
 * so regex matching preserves exact 1:1 character indices without
 * accidentally matching SQL keywords inside strings or comments.
 */
export function maskStringsAndComments(code: string): string {
  const len = code.length
  let i = 0
  let out = ''

  while (i < len) {
    const ch = code[i]

    // Line comment -- skip to line end
    if (ch === '-' && code[i + 1] === '-') {
      out += '  '
      i += 2
      while (i < len && code[i] !== '\n') {
        out += ' '
        i++
      }
      continue
    }

    // Block comment
    if (ch === '/' && code[i + 1] === '*') {
      out += '  '
      i += 2
      while (i < len - 1) {
        if (code[i] === '*' && code[i + 1] === '/') {
          out += '  '
          i += 2
          break
        }
        out += code[i] === '\n' ? '\n' : ' '
        i++
      }
      continue
    }

    // Single-quoted string literal
    if (ch === "'") {
      out += "'"
      i++
      while (i < len) {
        if (code[i] === "'") {
          if (code[i + 1] === "'") {
            out += '  '
            i += 2
          } else {
            out += "'"
            i++
            break
          }
        } else {
          out += code[i] === '\n' ? '\n' : ' '
          i++
        }
      }
      continue
    }

    // Double-quoted identifier
    if (ch === '"') {
      out += '"'
      i++
      while (i < len) {
        if (code[i] === '"') {
          out += '"'
          i++
          break
        } else {
          out += code[i] === '\n' ? '\n' : ' '
          i++
        }
      }
      continue
    }

    out += ch
    i++
  }

  return out
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
 * Check for high-risk / dangerous SQL operations that warrant a warning.
 * - UPDATE without WHERE
 * - DELETE without WHERE
 * - DROP TABLE without IF EXISTS
 * - TRUNCATE TABLE
 */
export function checkSqlWarnings(code: string, masked: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  // Split statements by semicolon while retaining position offsets
  const stmts = splitMaskedStatements(masked)

  for (const stmt of stmts) {
    const text = stmt.text
    const trimmed = text.trim()
    if (!trimmed) continue

    // 1. UPDATE without WHERE
    const updateMatch = text.match(/\b(UPDATE)\s+[\w$."]+/i)
    if (updateMatch && !/\bWHERE\b/i.test(text)) {
      const idx = stmt.from + text.indexOf(updateMatch[1])
      diagnostics.push({
        from: idx,
        to: idx + updateMatch[1].length,
        severity: 'warning',
        message: 'UPDATE statement without WHERE clause will modify all rows in table',
      })
    }

    // 2. DELETE without WHERE
    const deleteMatch = text.match(/\b(DELETE)\s+FROM\s+[\w$."]+/i)
    if (deleteMatch && !/\bWHERE\b/i.test(text)) {
      const idx = stmt.from + text.indexOf(deleteMatch[1])
      diagnostics.push({
        from: idx,
        to: idx + deleteMatch[1].length,
        severity: 'warning',
        message: 'DELETE statement without WHERE clause will remove all rows in table',
      })
    }

    // 3. DROP TABLE without IF EXISTS
    const dropMatch = text.match(/\b(DROP\s+TABLE)\s+(?!IF\s+EXISTS\b)[\w$."]+/i)
    if (dropMatch) {
      const idx = stmt.from + dropMatch.index!
      diagnostics.push({
        from: idx,
        to: idx + dropMatch[1].length,
        severity: 'warning',
        message: 'DROP TABLE without IF EXISTS will fail if the table does not exist',
      })
    }

    // 4. TRUNCATE
    const truncateMatch = text.match(/\b(TRUNCATE)\b/i)
    if (truncateMatch) {
      const idx = stmt.from + truncateMatch.index!
      diagnostics.push({
        from: idx,
        to: idx + truncateMatch[1].length,
        severity: 'warning',
        message: 'TRUNCATE will permanently empty the entire table',
      })
    }
  }

  return diagnostics
}

/**
 * Check for best practice recommendations and general advice (Info).
 * - SELECT * without LIMIT
 * - Inconsistent SQL keyword casing
 */
export function checkSqlInfo(code: string, masked: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const stmts = splitMaskedStatements(masked)

  for (const stmt of stmts) {
    const text = stmt.text
    if (!text.trim()) continue

    // 1. SELECT * without LIMIT
    const selectStarMatch = text.match(/\bSELECT\s+(?:[\w$."]+\.)?(\*)(?=\s|,|$)/i)
    if (selectStarMatch && !/\b(LIMIT|FETCH\s+FIRST)\b/i.test(text)) {
      const starIdx = stmt.from + selectStarMatch.index! + selectStarMatch[0].lastIndexOf('*')
      diagnostics.push({
        from: starIdx,
        to: starIdx + 1,
        severity: 'info',
        message: 'Consider adding a LIMIT clause to SELECT * to prevent large data fetches',
      })
    }
  }

  // 2. Inconsistent keyword casing check across the whole document
  const KEYWORDS = [
    'SELECT',
    'FROM',
    'WHERE',
    'JOIN',
    'LEFT',
    'RIGHT',
    'INNER',
    'GROUP BY',
    'ORDER BY',
    'LIMIT',
    'INSERT',
    'UPDATE',
    'DELETE',
  ]
  const pattern = new RegExp(`\\b(${KEYWORDS.join('|')})\\b`, 'gi')
  let m: RegExpExecArray | null
  let hasUpper = false
  let firstLower: { pos: number; word: string } | null = null

  while ((m = pattern.exec(masked)) !== null) {
    const word = m[0]
    if (word === word.toUpperCase()) {
      hasUpper = true
    } else if (word === word.toLowerCase() && !firstLower) {
      firstLower = { pos: m.index, word }
    }
  }

  if (hasUpper && firstLower) {
    diagnostics.push({
      from: firstLower.pos,
      to: firstLower.pos + firstLower.word.length,
      severity: 'info',
      message: 'Inconsistent SQL keyword casing; consider formatting with ⇧⌥F',
    })
  }

  return diagnostics
}

/**
 * Check for syntax simplification hints (Hint).
 * - Redundant INNER JOIN (JOIN is equivalent)
 * - Redundant ASC in ORDER BY (ASC is default)
 */
export function checkSqlHints(code: string, masked: string): Diagnostic[] {
  const diagnostics: Diagnostic[] = []

  // 1. Redundant INNER JOIN
  const innerJoinPattern = /\b(INNER)\s+JOIN\b/gi
  let m: RegExpExecArray | null
  while ((m = innerJoinPattern.exec(masked)) !== null) {
    diagnostics.push({
      from: m.index,
      to: m.index + m[1].length,
      severity: 'hint',
      message: 'Redundant "INNER" keyword; "JOIN" is equivalent',
    })
  }

  // 2. Redundant ASC in ORDER BY
  const ascPattern = /\bORDER\s+BY\b[^;]*?\b(ASC)\b/gi
  while ((m = ascPattern.exec(masked)) !== null) {
    const ascOffset = m[0].lastIndexOf(m[1])
    const pos = m.index + ascOffset
    diagnostics.push({
      from: pos,
      to: pos + m[1].length,
      severity: 'hint',
      message: 'Redundant "ASC"; ascending sort is default in ORDER BY',
    })
  }

  return diagnostics
}

/**
 * Helper to split masked SQL text into statement chunks with position offsets.
 */
function splitMaskedStatements(masked: string): { from: number; to: number; text: string }[] {
  const results: { from: number; to: number; text: string }[] = []
  const len = masked.length
  let start = 0

  for (let i = 0; i < len; i++) {
    if (masked[i] === ';') {
      results.push({ from: start, to: i, text: masked.slice(start, i) })
      start = i + 1
    }
  }

  if (start < len) {
    results.push({ from: start, to: len, text: masked.slice(start) })
  }

  return results
}

/**
 * Run comprehensive client-side SQL analysis:
 * 1. Checks fatal syntax errors (Fail-fast rule).
 * 2. If valid syntax, checks warnings, info, and hints.
 */
export function runClientSideSqlLint(code: string): Diagnostic[] {
  if (!code.trim()) return []

  // 1. Fail-fast on fatal syntax errors
  const syntaxErrors = checkSqlSyntax(code)
  if (syntaxErrors.length > 0) {
    return syntaxErrors
  }

  // 2. Mask comments and strings for semantic checks
  const masked = maskStringsAndComments(code)

  const warnings = checkSqlWarnings(code, masked)
  const info = checkSqlInfo(code, masked)
  const hints = checkSqlHints(code, masked)

  return [...warnings, ...info, ...hints].sort((a, b) => a.from - b.from)
}

/**
 * Create a debounced SQL linter extension combining local multi-severity checks
 * with optional asynchronous external database validation.
 */
export function createSqlLinter(options: SqlLinterOptions = {}): Extension[] {
  const lintExtension = linter(
    async (view) => {
      const code = view.state.doc.toString()
      if (!code.trim()) {
        options.onDiagnosticsChange?.([])
        return []
      }

      const localDiagnostics = runClientSideSqlLint(code)

      // If local syntax already has severe errors, skip external query to save DB resources
      if (localDiagnostics.some((d) => d.severity === 'error') || !options.externalLinter) {
        options.onDiagnosticsChange?.(localDiagnostics)
        return localDiagnostics
      }

      try {
        const externalDiagnostics = await options.externalLinter(code, view)
        const combined = [...localDiagnostics, ...externalDiagnostics].sort(
          (a, b) => a.from - b.from,
        )
        options.onDiagnosticsChange?.(combined)
        return combined
      } catch {
        options.onDiagnosticsChange?.(localDiagnostics)
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
