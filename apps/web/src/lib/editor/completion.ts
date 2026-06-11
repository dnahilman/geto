// CodeMirror 6 SQL completion, built on @codemirror/lang-sql and the shared
// schema store in `entities.ts`. lang-sql's grammar-aware sources do the heavy
// lifting (tables, alias-resolved columns, schema/table dotting, keywords); we
// add two sources it lacks — function snippets and FK-aware `JOIN … ON a.x = b.y`
// conditions — plus a "type a keyword → UPPERCASE" convenience.
//
// `sqlExtensions(dialect)` is rebuilt by the editor whenever schema data changes
// (it bakes the schema into lang-sql's source via a Compartment). The function/FK
// sources read the live index on every keystroke, so they stay current on their own.
import { autocompletion, snippetCompletion } from '@codemirror/autocomplete'
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete'
import { EditorState, Transaction, type Extension } from '@codemirror/state'
import {
  sql,
  PostgreSQL,
  schemaCompletionSource,
  keywordCompletionSource,
  type SQLDialect,
  type SQLNamespace,
} from '@codemirror/lang-sql'
import { getCompletionIndex, type CompletionFunction, type CompletionIndex } from './entities'

// ---------------------------------------------------------------------------
// Shared text helpers (ported from the old monaco.ts — Monaco-free already).
// ---------------------------------------------------------------------------

/** A table referenced in the active statement. */
interface RefTable {
  name: string
  schema?: string
  alias?: string
}

function lineBeforeCursor(ctx: CompletionContext): string {
  const line = ctx.state.doc.lineAt(ctx.pos)
  return line.text.slice(0, ctx.pos - line.from)
}

/** Identifier qualifier immediately before the cursor: `u.` / `public.` → `u`. */
function qualifierBefore(line: string): string | null {
  const m = line.match(/([A-Za-z_][\w$]*)\s*\.\s*[\w$]*$/)
  return m ? m[1] : null
}

const REF_STOP =
  /^(on|where|inner|left|right|full|outer|join|group|order|set|using|natural|cross|limit|having|union|as)$/i

/**
 * Regex scan for FROM/JOIN tables (with aliases) across the whole statement.
 * Only known tables are kept, to avoid matching noise.
 */
function tablesFromText(sqlText: string, idx: CompletionIndex): RefTable[] {
  const re = /\b(?:from|join)\s+(?:("?[\w]+"?)\.)?("?[\w]+"?)(?:\s+(?:as\s+)?("?[\w]+"?))?/gi
  const res: RefTable[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(sqlText))) {
    const name = m[2].replace(/"/g, '')
    if (!idx.tablesByName.has(name.toLowerCase())) continue
    const schema = m[1]?.replace(/"/g, '')
    const alias = m[3] && !REF_STOP.test(m[3]) ? m[3].replace(/"/g, '') : undefined
    res.push({ name, schema, alias })
  }
  return res
}

/** A single FK-derived `a.col = b.col` condition between two referenced tables. */
function fkCondition(a: RefTable, b: RefTable, idx: CompletionIndex): string | null {
  for (const fk of idx.fkByTable.get(a.name.toLowerCase()) ?? []) {
    if (fk.refTable.toLowerCase() !== b.name.toLowerCase()) continue
    const an = a.alias ?? a.name
    const bn = b.alias ?? b.name
    return fk.columns.map((c, i) => `${an}.${c} = ${bn}.${fk.refColumns[i]}`).join(' AND ')
  }
  return null
}

/** FK conditions joining the most-recently-referenced table to the earlier ones. */
function joinConditions(refs: RefTable[], idx: CompletionIndex): string[] {
  if (refs.length < 2) return []
  const last = refs[refs.length - 1]
  const out: string[] = []
  for (let i = 0; i < refs.length - 1; i += 1) {
    const cond = fkCondition(last, refs[i], idx) ?? fkCondition(refs[i], last, idx)
    if (cond) out.push(cond)
  }
  return out
}

// ---------------------------------------------------------------------------
// Completion sources
// ---------------------------------------------------------------------------

// PostgreSQL reserved keywords that cannot be used as unquoted identifiers.
// When a table/column has one of these names, completions must insert it quoted.
const PG_RESERVED = new Set(
  (
    'user order group table column schema index view role session name value type cast ' +
    'only default end case when then else null true false between and or not as from ' +
    'where join on into set returning create drop alter add constraint primary key ' +
    'foreign references unique check cascade with recursive having distinct union all ' +
    'limit offset select insert update delete begin commit rollback using natural cross'
  )
    .split(' ')
    .map((s) => s.toUpperCase()),
)

function needsQuoting(name: string): boolean {
  return PG_RESERVED.has(name.toUpperCase()) || /[^a-z0-9_]/.test(name) || /^\d/.test(name)
}

/** Build lang-sql's nested namespace (schema → table → columns) from the index.
 *  Reserved-word tables (e.g. `user`, `order`) are excluded here so schemaCompletionSource
 *  does not insert them unquoted. reservedTableSource handles those exclusively. */
function buildSchema(idx: CompletionIndex): SQLNamespace {
  const root: Record<string, Record<string, Completion[]>> = {}
  for (const tbl of idx.entities.tables) {
    if (needsQuoting(tbl.name)) continue
    const cols = idx.columnsByTable.get(`${tbl.schema}.${tbl.name}`.toLowerCase()) ?? []
    ;(root[tbl.schema] ??= {})[tbl.name] = cols.map((c) => ({
      label: c.name,
      type: 'property',
      detail: c.type,
    }))
  }
  return root as SQLNamespace
}

/**
 * Offers tables whose names are PostgreSQL reserved keywords (e.g. `user`, `order`)
 * with double-quote wrapping so the inserted SQL is valid: `"user"` not `user`.
 * This runs alongside schemaCompletionSource and takes priority via boost.
 */
function reservedTableSource(ctx: CompletionContext): CompletionResult | null {
  const line = lineBeforeCursor(ctx)
  if (!/\b(from|join)\s+[\w"]*$/i.test(line)) return null
  const word = ctx.matchBefore(/[\w"]*/)
  const idx = getCompletionIndex()
  const reserved = idx.entities.tables.filter((t) => needsQuoting(t.name))
  if (!reserved.length) return null
  return {
    from: word ? word.from : ctx.pos,
    options: reserved.map((t) => ({
      label: `"${t.name}"`,
      type: 'type',
      detail: t.type,
      boost: 10,
    })),
    validFor: /^"?[\w]*"?$/,
  }
}

function functionCompletion(fn: CompletionFunction): Completion {
  return snippetCompletion(fn.name + '(${})', {
    label: fn.name,
    type: 'function',
    detail: `${fn.kind}(${fn.args})${fn.returns ? ' → ' + fn.returns : ''}`,
  })
}

/** Functions are offered while typing an identifier, but not right after `x.`. */
function functionSource(ctx: CompletionContext): CompletionResult | null {
  if (qualifierBefore(lineBeforeCursor(ctx))) return null
  const word = ctx.matchBefore(/[\w]+/)
  if (!word && !ctx.explicit) return null
  const idx = getCompletionIndex()
  if (!idx.entities.functions.length) return null
  return {
    from: word ? word.from : ctx.pos,
    options: idx.entities.functions.map(functionCompletion),
    validFor: /^[\w]*$/,
  }
}

/** Inside a `JOIN … ON` clause with ≥2 known tables, offer FK join predicates. */
function joinSource(ctx: CompletionContext): CompletionResult | null {
  const line = lineBeforeCursor(ctx)
  if (!/\bon\b[^=]*$/i.test(line)) return null
  const idx = getCompletionIndex()
  // Slice only up to the cursor so multi-statement buffers don't bleed aliases
  // from later (or earlier unrelated) statements into the FK suggestions.
  const conds = joinConditions(tablesFromText(ctx.state.doc.sliceString(0, ctx.pos), idx), idx)
  if (!conds.length) return null
  const word = ctx.matchBefore(/[\w.]*/)
  return {
    from: word ? word.from : ctx.pos,
    options: conds.map((c) => ({ label: c, type: 'keyword', detail: 'foreign key', boost: 50 })),
  }
}

/**
 * The full SQL language + completion bundle for a dialect. Rebuilt by the editor
 * (via a Compartment) whenever schema entities change so the schema source picks
 * up new tables/columns.
 */
export function sqlExtensions(dialect: SQLDialect = PostgreSQL): Extension {
  const schema = buildSchema(getCompletionIndex())
  const schemaSource = schemaCompletionSource({ dialect, schema, defaultSchema: 'public' })
  const kw = keywordCompletionSource(dialect, true)
  // Suppress bare keyword suggestions right after a qualifier (so `users.` shows
  // only columns, not the keyword list).
  const keywordSource = (ctx: CompletionContext) =>
    qualifierBefore(lineBeforeCursor(ctx)) ? null : kw(ctx)
  return [
    sql({ dialect }),
    autocompletion({
      override: [reservedTableSource, schemaSource, keywordSource, functionSource, joinSource],
      activateOnTyping: true,
      icons: true,
    }),
  ]
}

// ---------------------------------------------------------------------------
// Auto-uppercase keywords (toggled by the editor via a Compartment)
// ---------------------------------------------------------------------------

const KEYWORDS = new Set(
  (
    'select insert update delete from where group by having order limit offset join inner left ' +
    'right full outer on as and or not null is in like ilike between exists union all distinct ' +
    'into values set returning create table view index drop alter add column constraint primary ' +
    'key foreign references default unique check cascade with recursive case when then else end ' +
    'asc desc using natural cross database schema if begin commit rollback grant revoke truncate'
  )
    .toUpperCase()
    .split(' '),
)

/**
 * When a word-boundary char (`[\s;,()]`) is typed right after a known SQL keyword,
 * rewrite that keyword to uppercase — appended to the same transaction, so undo
 * treats it as one step and the filter never loops (the rewrite isn't a 1-char
 * boundary insertion).
 */
export const uppercaseKeywords = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || tr.isUserEvent('undo') || tr.isUserEvent('redo')) return tr
  const extra: { from: number; to: number; insert: string }[] = []
  tr.changes.iterChanges((_fromA, _toA, fromB, _toB, inserted) => {
    const text = inserted.toString()
    if (text.length !== 1 || !/[\s;,()]/.test(text)) return
    const doc = tr.newDoc
    const end = fromB // the boundary char sits at [fromB, _toB); the word ends here
    let start = end
    while (start > 0 && /[\w$]/.test(doc.sliceString(start - 1, start))) start -= 1
    if (start === end) return
    const word = doc.sliceString(start, end)
    const upper = word.toUpperCase()
    if (upper !== word && KEYWORDS.has(upper)) extra.push({ from: start, to: end, insert: upper })
  })
  if (!extra.length) return tr
  return [tr, { changes: extra, sequential: true }]
})

// Re-export so the editor and console can pass schema data through one module.
export { PostgreSQL }
export type { SQLDialect }
