import {
  autocompletion,
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import { schemaCompletionSource, type SQLDialect } from '@codemirror/lang-sql'
import type { SQLMetadata, SQLMetadataFunction } from '../core/types'
import { buildCompletionIndex, buildSqlNamespace, type CompletionIndex } from './schema'
import { needsQuoting, STANDARD_SQL_KEYWORDS } from './keywords'
import { withTrailingSpace } from './apply'
import { resolveDialect } from '../languages/sql/dialect'

interface RefTable {
  name: string
  schema?: string
  alias?: string
}

function lineBeforeCursor(ctx: CompletionContext): string {
  const line = ctx.state.doc.lineAt(ctx.pos)
  return line.text.slice(0, ctx.pos - line.from)
}

/**
 * Identifier qualifier immediately before the cursor: `u.` / `public.` -> `u`.
 */
function qualifierBefore(line: string): string | null {
  const m = line.match(/([A-Za-z_][\w$]*)\s*\.\s*[\w$]*$/)
  return m ? m[1] : null
}

const REF_STOP =
  /^(on|where|inner|left|right|full|outer|join|group|order|set|using|natural|cross|limit|having|union|as)$/i

/**
 * Scan for FROM/JOIN tables (with aliases) across the active statement.
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

/**
 * A single FK-derived `a.col = b.col` condition between two referenced tables.
 */
function fkCondition(a: RefTable, b: RefTable, idx: CompletionIndex): string | null {
  for (const fk of idx.fkByTable.get(a.name.toLowerCase()) ?? []) {
    if (fk.refTable.toLowerCase() !== b.name.toLowerCase()) continue
    const an = a.alias ?? a.name
    const bn = b.alias ?? b.name
    return fk.columns.map((c, i) => `${an}.${c} = ${bn}.${fk.refColumns[i]}`).join(' AND ')
  }
  return null
}

/**
 * Foreign key join predicates connecting the most recently referenced table to earlier ones.
 */
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

function functionCompletion(fn: SQLMetadataFunction): Completion {
  return snippetCompletion(fn.name + '(${args})', {
    label: fn.name,
    type: 'function',
    detail: `${fn.kind || 'function'}(${fn.args || ''})${fn.returns ? ' → ' + fn.returns : ''}`,
  })
}

/**
 * Context-aware completion source factory.
 */
export function createSqlCompletionSources(
  metadata: SQLMetadata = {},
  dialectInput?: SQLDialect | string,
) {
  const dialect = resolveDialect(dialectInput)
  const idx = buildCompletionIndex(metadata)
  const schema = buildSqlNamespace(idx, needsQuoting)

  const schemaSource = schemaCompletionSource({
    dialect,
    schema,
    defaultSchema: metadata.defaultSchema ?? 'public',
  })

  // Columns of the current statement's FROM/JOIN tables offered unqualified
  const columnSource = (ctx: CompletionContext): CompletionResult | null => {
    const line = lineBeforeCursor(ctx)
    // After qualifier dot: schemaSource handles `u.col`
    if (/(?:"[\w]+"|[\w$]+)\s*\.\s*[\w$]*$/.test(line)) return null
    // Don't offer columns where a table name is expected
    if (/\b(from|join|into|update|table)\s+[\w".]*$/i.test(line)) return null

    const word = ctx.matchBefore(/[\w]+/)
    if (!word && !ctx.explicit) return null

    const refs = tablesFromText(ctx.state.doc.sliceString(0, ctx.pos), idx)
    if (!refs.length) return null

    const seen = new Set<string>()
    const options: Completion[] = []
    for (const ref of refs) {
      const cols =
        idx.columnsByTable.get(`${ref.schema ?? ''}.${ref.name}`.toLowerCase()) ??
        idx.columnsByTable.get(ref.name.toLowerCase()) ??
        []
      const owner = ref.alias ?? ref.name
      for (const c of cols) {
        const key = c.name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        options.push(
          withTrailingSpace({
            label: c.name,
            type: 'property',
            detail: `${c.type} · ${owner}`,
            boost: 20,
          }),
        )
      }
    }

    if (!options.length) return null
    return { from: word ? word.from : ctx.pos, options, validFor: /^[\w]*$/ }
  }

  // Functions from metadata
  const functionSource = (ctx: CompletionContext): CompletionResult | null => {
    if (qualifierBefore(lineBeforeCursor(ctx))) return null
    const word = ctx.matchBefore(/[\w]+/)
    if (!word && !ctx.explicit) return null
    if (!metadata.functions || !metadata.functions.length) return null

    return {
      from: word ? word.from : ctx.pos,
      options: metadata.functions.map(functionCompletion),
      validFor: /^[\w]*$/,
    }
  }

  // FK Join Predicates (inside `JOIN ... ON`)
  const joinSource = (ctx: CompletionContext): CompletionResult | null => {
    const line = lineBeforeCursor(ctx)
    if (!/\bon\b[^=]*$/i.test(line)) return null

    const conds = joinConditions(tablesFromText(ctx.state.doc.sliceString(0, ctx.pos), idx), idx)
    if (!conds.length) return null

    const word = ctx.matchBefore(/[\w.]*/)
    return {
      from: word ? word.from : ctx.pos,
      options: conds.map((c) =>
        withTrailingSpace({
          label: c,
          type: 'keyword',
          detail: 'foreign key',
          boost: 50,
        }),
      ),
    }
  }

  // Completion-driven uppercase SQL keywords
  const keywordSource = (ctx: CompletionContext): CompletionResult | null => {
    const line = lineBeforeCursor(ctx)
    // Suppress bare keywords right after a qualifier dot (e.g. `u.` should show columns, not SELECT/FROM)
    if (qualifierBefore(line)) return null

    const word = ctx.matchBefore(/[\w]+/)
    if (!word && !ctx.explicit) return null

    return {
      from: word ? word.from : ctx.pos,
      options: STANDARD_SQL_KEYWORDS,
      validFor: /^[\w]*$/,
    }
  }

  return [schemaSource, columnSource, keywordSource, functionSource, joinSource]
}

/**
 * Build the complete autocompletion CodeMirror extension for SQL.
 */
export function createSqlCompletionExtension(
  metadata: SQLMetadata = {},
  dialect?: SQLDialect | string,
): Extension {
  const sources = createSqlCompletionSources(metadata, dialect)
  return autocompletion({
    override: sources,
    activateOnTyping: true,
    icons: true,
  })
}
