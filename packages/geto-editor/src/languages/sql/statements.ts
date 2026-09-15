import type { EditorState } from '@codemirror/state'
import type { StatementRange } from '../../core/types'

// Top-level keywords that can start a new statement on their own line.
const STMT_START =
  /^(SELECT|WITH|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|SET|SHOW|EXPLAIN|VACUUM|COPY|CALL|BEGIN|COMMIT|ROLLBACK)$/i

// Tokens that, when the last real token is one of these, mean the next
// line-starting keyword is a continuation, not a new statement.
const CONTINUATION = /^(UNION|INTERSECT|EXCEPT|ALL|AS)$/i

/** Return true if `ch` starts or is part of an identifier char. */
function isIdentStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch)
}
function isIdentPart(ch: string): boolean {
  return /[\w$]/.test(ch)
}

/**
 * Tokenize `state.doc` into individual SQL statement ranges, respecting:
 *  - single-quoted strings `'...'` (with `''` escapes)
 *  - double-quoted identifiers `"..."`
 *  - dollar-quoting `$tag$...$tag$`
 *  - line comments `-- ...`
 *  - block comments `/* ... *‌/`
 *  - parenthesis depth `(...)`
 *
 * Splits on `;` at depth 0 AND on line-starting top-level keywords.
 */
export function statementRanges(state: EditorState): StatementRange[] {
  const text = state.doc.toString()
  if (!text.trim()) return []

  const len = text.length
  let i = 0
  let stmtStart = 0
  let depth = 0 // paren depth

  // Last non-whitespace, non-comment token text (upper-cased for comparisons).
  let lastToken = ''
  // Position where the current line started.
  let lineStart = 0

  const ranges: StatementRange[] = []

  function flush(end: number) {
    const chunk = text.slice(stmtStart, end)
    const trimmed = chunk.trim()
    if (trimmed) {
      ranges.push({ from: stmtStart, to: end, text: trimmed })
    }
    stmtStart = end
    lastToken = ''
  }

  while (i < len) {
    const ch = text[i]

    // --- Track line starts ---
    if (ch === '\n') {
      lineStart = i + 1
      i++
      continue
    }

    // --- Single-line comment ---
    if (ch === '-' && text[i + 1] === '-') {
      while (i < len && text[i] !== '\n') i++
      continue
    }

    // --- Block comment ---
    if (ch === '/' && text[i + 1] === '*') {
      i += 2
      while (i < len - 1 && !(text[i] === '*' && text[i + 1] === '/')) i++
      i += 2
      continue
    }

    // --- Single-quoted string ---
    if (ch === "'") {
      i++
      while (i < len) {
        if (text[i] === "'") {
          if (text[i + 1] === "'") {
            i += 2 // escaped quote
          } else {
            i++
            break
          }
        } else {
          i++
        }
      }
      lastToken = "''"
      continue
    }

    // --- Double-quoted identifier ---
    if (ch === '"') {
      i++
      while (i < len && text[i] !== '"') i++
      i++
      lastToken = '""'
      continue
    }

    // --- Dollar-quoting: $tag$...$tag$ ---
    if (ch === '$') {
      let tagEnd = i + 1
      while (tagEnd < len && text[tagEnd] !== '$' && text[tagEnd] !== '\n') tagEnd++
      if (tagEnd < len && text[tagEnd] === '$') {
        const tag = text.slice(i, tagEnd + 1)
        i = tagEnd + 1
        const closingTag = tag
        const closeIdx = text.indexOf(closingTag, i)
        if (closeIdx >= 0) {
          i = closeIdx + closingTag.length
        } else {
          i = len
        }
        lastToken = '$$'
        continue
      }
    }

    // --- Paren depth ---
    if (ch === '(') {
      depth++
      lastToken = '('
      i++
      continue
    }
    if (ch === ')') {
      if (depth > 0) depth--
      lastToken = ')'
      i++
      continue
    }
    if (ch === ',') {
      lastToken = ','
      i++
      continue
    }

    // --- Semicolon at depth 0: explicit statement boundary ---
    if (ch === ';' && depth === 0) {
      flush(i + 1)
      i++
      lineStart = i
      continue
    }

    // --- Whitespace ---
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++
      continue
    }

    // --- Identifier or keyword ---
    if (isIdentStart(ch)) {
      const wordStart = i
      while (i < len && isIdentPart(text[i])) i++
      const word = text.slice(wordStart, i)
      const upper = word.toUpperCase()

      if (
        depth === 0 &&
        stmtStart < wordStart &&
        STMT_START.test(upper) &&
        !CONTINUATION.test(lastToken) &&
        lastToken !== '(' &&
        lastToken !== ','
      ) {
        const linePre = text.slice(lineStart, wordStart)
        if (/^\s*$/.test(linePre)) {
          flush(wordStart)
        }
      }

      lastToken = upper
      continue
    }

    lastToken = ch
    i++
  }

  // Flush trailing statement
  const trailing = text.slice(stmtStart).trim()
  if (trailing) {
    ranges.push({ from: stmtStart, to: len, text: trailing })
  }

  return ranges.length ? ranges : [{ from: 0, to: len, text: text.trim() }]
}
