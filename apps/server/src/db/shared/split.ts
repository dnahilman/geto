import { parse } from 'pgsql-parser'

/**
 * Convert a UTF-8 byte offset (as returned by pgsql-parser's `stmt_location`)
 * into a JS string (UTF-16 code-unit) index.  For pure-ASCII SQL the values
 * are identical; for multibyte identifiers or string literals they diverge.
 */
function byteOffsetToStringIndex(sql: string, byteOffset: number): number {
  const buf = Buffer.from(sql, 'utf8')
  // Decode the prefix up to the byte offset back to a string; its `.length`
  // is the equivalent UTF-16 code-unit index.
  return buf.slice(0, byteOffset).toString('utf8').length
}

/**
 * Split a SQL buffer into individual statement strings.
 *
 * Primary path: delegate to pgsql-parser (the real PG grammar).  When the
 * parse succeeds, use the `stmt_location` / `stmt_len` byte offsets that PG
 * returns for each statement, converting them to JS string indices so that
 * multibyte content (e.g. Unicode identifiers or string literals) stays
 * aligned.
 *
 * Fallback (no-semicolon case): the parser throws on combined input like
 *   `SELECT * FROM "user"\nSELECT * FROM account`
 * because PG grammar requires a `;` between statements.  We use a greedy
 * longest-parseable-line-prefix heuristic: accumulate lines one by one,
 * `await parse()` after each addition, and emit when adding the next line
 * would break the single-statement parse.  Any trailing chunk that never
 * parses is emitted as-is (Postgres will report the error at run time).
 */
export async function splitStatements(sql: string): Promise<string[]> {
  const trimmed = sql.trim()
  if (!trimmed) return []

  // ── Primary path ──────────────────────────────────────────────────────────
  try {
    const parsed = (await parse(trimmed)) as {
      stmts?: { stmt_location?: number; stmt_len?: number }[]
    }
    const stmts = parsed.stmts ?? []
    if (stmts.length === 0) return [trimmed]

    const results: string[] = []
    for (let i = 0; i < stmts.length; i++) {
      const loc = stmts[i].stmt_location ?? 0
      const len = stmts[i].stmt_len // undefined → last statement, runs to end

      // Convert byte offsets to JS string indices.
      const start = byteOffsetToStringIndex(trimmed, loc)
      const text =
        len !== undefined
          ? trimmed.slice(start, byteOffsetToStringIndex(trimmed, loc + len))
          : trimmed.slice(start)

      const s = text.trim()
      if (s) results.push(s)
    }
    return results.length ? results : [trimmed]
  } catch {
    // Parse failed — fall through to the no-semicolon fallback.
  }

  // ── Fallback: greedy longest-parseable-line-prefix ────────────────────────
  return splitByLines(trimmed)
}

/**
 * Line-by-line greedy splitter used when the combined buffer does not parse.
 * Works correctly for the canonical no-`;` case:
 *   SELECT * FROM "user"\nSELECT * FROM account  →  two statements
 * while keeping multi-line single statements intact:
 *   SELECT *\nFROM user  →  one statement
 */
async function splitByLines(sql: string): Promise<string[]> {
  const lines = sql.split('\n')
  const results: string[] = []

  let i = 0
  while (i < lines.length) {
    // Skip blank lines between statements.
    if (!lines[i].trim()) {
      i++
      continue
    }

    // Accumulate lines into a chunk, tracking the longest prefix that parses
    // as exactly one statement.
    let chunk = ''
    let lastGoodEnd = -1 // index (exclusive) of last good line in `lines`

    let j = i
    while (j < lines.length) {
      const next = chunk ? chunk + '\n' + lines[j] : lines[j]
      let parsedOk = false
      try {
        const r = (await parse(next)) as { stmts?: unknown[] }
        if ((r.stmts?.length ?? 0) === 1) {
          chunk = next
          lastGoodEnd = j + 1
          parsedOk = true
        }
        // If parse succeeds but yields != 1 stmt (shouldn't happen in fallback
        // since the primary path handles the multi-stmt case), stop here.
        if (!parsedOk) break
      } catch {
        // Adding this line broke the parse — emit current best chunk if we have
        // one, then restart from this line.
        break
      }
      j++
    }

    if (lastGoodEnd !== -1) {
      // We found a parseable prefix.
      results.push(chunk.trim())
      i = lastGoodEnd
    } else {
      // No single line (or group of lines) parsed as a complete statement.
      // Collect until we find a gap or exhaust the input, then emit as-is so
      // Postgres can surface the actual syntax error.
      const raw = lines[i].trim()
      if (raw) results.push(raw)
      i++
    }
  }

  return results.length ? results : [sql.trim()]
}
