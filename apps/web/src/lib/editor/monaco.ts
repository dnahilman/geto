import * as monaco from 'monaco-editor'
import {
  setupLanguageFeatures,
  LanguageIdEnum,
  EntityContextType,
  type CompletionService,
  type ICompletionItem,
  type EntityContext,
} from 'monaco-sql-languages'
import 'monaco-sql-languages/esm/languages/pgsql/pgsql.contribution'
// The vite config slims `monaco-editor` to `editor.api`, which OMITS editor
// contributions — including the suggest controller (no `editor.action.triggerSuggest`
// → completion widget never appears) and the snippet controller (snippet inserts
// like `${1:alias}` would be literal). Re-add just the two we need. These are
// subpath imports, untouched by the `^monaco-editor$` alias.
import 'monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController.js'
import 'monaco-editor/esm/vs/editor/contrib/snippet/browser/snippetController2.js'
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import PgSQLWorker from './pgsql.worker?worker'
import {
  getCompletionIndex,
  type CompletionColumn,
  type CompletionFunction,
  type CompletionIndex,
  type CompletionTable,
} from './entities'

let initialized = false

const SNIPPET = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet

/** A table referenced in the active statement, resolved by the SQL parser. */
interface RefTable {
  name: string
  schema?: string
  alias?: string
}

/** Identifier qualifier immediately before the cursor: `u.` / `public.` → `u`. */
function qualifierBefore(line: string): string | null {
  const m = line.match(/([A-Za-z_][\w$]*)\s*\.\s*[\w$]*$/)
  return m ? m[1] : null
}

/** Tables (with aliases) the parser found in the current statement. */
function referencedTables(entities: EntityContext[] | null): RefTable[] {
  if (!entities) return []
  const res: RefTable[] = []
  for (const e of entities) {
    if (e.entityContextType !== EntityContextType.TABLE) continue
    const parts = e.text.split('.')
    const name = parts[parts.length - 1].replace(/"/g, '')
    const schema = parts.length > 1 ? parts[parts.length - 2].replace(/"/g, '') : undefined
    const alias = (e as { _alias?: { text?: string } })._alias?.text
    res.push({ name, schema, alias })
  }
  return res
}

const REF_STOP = /^(on|where|inner|left|right|full|outer|join|group|order|set|using|natural|cross|limit|having|union|as)$/i

/**
 * Regex fallback for FROM/JOIN tables. The ANTLR parser omits a just-typed JOIN
 * table from its entity set while the statement is still incomplete (e.g. right
 * after `... JOIN t i ON `), so we supplement parser entities with a text scan.
 * Only known tables are kept, to avoid matching noise.
 */
function tablesFromText(sql: string, idx: CompletionIndex): RefTable[] {
  const re = /\b(?:from|join)\s+(?:("?[\w]+"?)\.)?("?[\w]+"?)(?:\s+(?:as\s+)?("?[\w]+"?))?/gi
  const res: RefTable[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(sql))) {
    const name = m[2].replace(/"/g, '')
    if (!idx.tablesByName.has(name.toLowerCase())) continue
    const schema = m[1]?.replace(/"/g, '')
    const alias = m[3] && !REF_STOP.test(m[3]) ? m[3].replace(/"/g, '') : undefined
    res.push({ name, schema, alias })
  }
  return res
}

/** Union of parser + text refs, deduped by alias-or-name (parser wins). */
function mergeRefs(parser: RefTable[], text: RefTable[]): RefTable[] {
  const out = [...parser]
  const seen = new Set(parser.map((r) => (r.alias ?? r.name).toLowerCase()))
  for (const r of text) {
    const k = (r.alias ?? r.name).toLowerCase()
    if (!seen.has(k)) {
      seen.add(k)
      out.push(r)
    }
  }
  return out
}

function columnsForRef(ref: RefTable, idx: CompletionIndex): CompletionColumn[] {
  if (ref.schema) {
    const q = idx.columnsByTable.get(`${ref.schema}.${ref.name}`.toLowerCase())
    if (q) return q
  }
  return idx.columnsByTable.get(ref.name.toLowerCase()) ?? []
}

function columnItem(col: CompletionColumn, showTable: boolean): ICompletionItem {
  return {
    label: { label: col.name, description: showTable ? `${col.table} · ${col.type}` : col.type },
    kind: monaco.languages.CompletionItemKind.Field,
    insertText: col.name,
    sortText: '1_' + col.name,
  }
}

function tableItem(t: CompletionTable, qualify: boolean): ICompletionItem {
  const name = qualify ? `${t.schema}.${t.name}` : t.name
  return {
    label: { label: t.name, description: `${t.schema} · ${t.type}` },
    kind: monaco.languages.CompletionItemKind.Struct,
    insertText: name,
    sortText: '0_' + t.name,
  }
}

function functionItem(fn: CompletionFunction): ICompletionItem {
  return {
    label: { label: fn.name, description: fn.schema },
    kind:
      fn.kind === 'procedure'
        ? monaco.languages.CompletionItemKind.Method
        : monaco.languages.CompletionItemKind.Function,
    insertText: `${fn.name}($0)`,
    insertTextRules: SNIPPET,
    detail: `${fn.kind}(${fn.args})${fn.returns ? ' → ' + fn.returns : ''}`,
    sortText: '2_' + fn.name,
  }
}

/** FK-aware `a.col = b.col` conditions, offered inside a JOIN ... ON clause. */
function joinConditionItems(
  refs: RefTable[],
  idx: CompletionIndex,
  line: string,
): ICompletionItem[] {
  if (refs.length < 2 || !/\bon\b[^=]*$/i.test(line)) return []
  const last = refs[refs.length - 1]
  const out: ICompletionItem[] = []
  for (let i = 0; i < refs.length - 1; i += 1) {
    const cond = fkCondition(last, refs[i], idx) ?? fkCondition(refs[i], last, idx)
    if (cond)
      out.push({
        label: cond,
        kind: monaco.languages.CompletionItemKind.Snippet,
        insertText: cond,
        sortText: '0_join_' + cond,
        detail: 'foreign key',
      })
  }
  return out
}

function fkCondition(a: RefTable, b: RefTable, idx: CompletionIndex): string | null {
  for (const fk of idx.fkByTable.get(a.name.toLowerCase()) ?? []) {
    if (fk.refTable.toLowerCase() !== b.name.toLowerCase()) continue
    const an = a.alias ?? a.name
    const bn = b.alias ?? b.name
    return fk.columns.map((c, i) => `${an}.${c} = ${bn}.${fk.refColumns[i]}`).join(' AND ')
  }
  return null
}

export function initMonaco(): typeof monaco {
  if (initialized) return monaco
  initialized = true

  // Worker wiring for Vite: the SQL language parses/validates in its own worker.
  ;(self as unknown as { MonacoEnvironment: monaco.Environment }).MonacoEnvironment = {
    getWorker(_workerId, label) {
      if (label === LanguageIdEnum.PG) return new PgSQLWorker()
      return new EditorWorker()
    },
  }

  // The completion service receives grammar-aware keyword suggestions (so typing
  // `s` at a statement start surfaces SELECT/SET/…) and the expected entity types
  // at the cursor. We satisfy those with live, context-filtered schema entities:
  // columns scoped to the FROM/JOIN tables (resolved by the parser, incl. aliases),
  // schema-qualified table dedup, function signatures, and FK-aware JOIN ... ON.
  const completionService: CompletionService = async (
    model,
    position,
    _ctx,
    suggestions,
    entities,
  ) => {
    const items: ICompletionItem[] = []
    if (!suggestions) return items

    const idx = getCompletionIndex()
    const line = model.getValueInRange({
      startLineNumber: position.lineNumber,
      startColumn: 1,
      endLineNumber: position.lineNumber,
      endColumn: position.column,
    })
    const qualifier = qualifierBefore(line)
    const refs = mergeRefs(referencedTables(entities), tablesFromText(model.getValue(), idx))

    // order-aware keywords from the parser
    for (const kw of suggestions.keywords) {
      items.push({
        label: kw,
        kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: kw,
        sortText: '3_' + kw,
      })
    }

    const ctx = new Set(suggestions.syntax.map((s) => s.syntaxContextType))
    const wantTable = ctx.has(EntityContextType.TABLE) || ctx.has(EntityContextType.VIEW)
    const wantColumn = ctx.has(EntityContextType.COLUMN)
    const wantFunction =
      ctx.has(EntityContextType.FUNCTION) || ctx.has(EntityContextType.PROCEDURE)

    // FK-aware `a.x = b.y` conditions are offered whenever the line is inside a
    // JOIN ... ON clause — independent of the parser's context type, which at a
    // bare `ON ` is not yet COLUMN.
    items.push(...joinConditionItems(refs, idx, line))

    if (wantColumn) {
      if (qualifier) {
        // `alias.` / `table.` → only that table's columns, inserted unqualified.
        const ref =
          refs.find((r) => r.alias?.toLowerCase() === qualifier.toLowerCase()) ??
          refs.find((r) => r.name.toLowerCase() === qualifier.toLowerCase())
        const cols = ref
          ? columnsForRef(ref, idx)
          : (idx.columnsByTable.get(qualifier.toLowerCase()) ?? [])
        for (const col of cols) items.push(columnItem(col, false))
      } else {
        // Union of columns from the referenced tables; fall back to all columns
        // only when the statement has no resolved data source yet.
        let cols: CompletionColumn[] = []
        if (refs.length) {
          const seen = new Set<string>()
          for (const r of refs) {
            for (const c of columnsForRef(r, idx)) {
              const k = `${c.schema}.${c.table}.${c.name}`
              if (!seen.has(k)) {
                seen.add(k)
                cols.push(c)
              }
            }
          }
        }
        if (!cols.length) cols = idx.entities.columns
        for (const col of cols) items.push(columnItem(col, true))
      }
    }

    if (wantTable) {
      if (qualifier) {
        // `schema.` → only tables in that schema, inserted bare.
        for (const t of idx.entities.tables) {
          if (t.schema.toLowerCase() === qualifier.toLowerCase())
            items.push(tableItem(t, false))
        }
      } else {
        for (const t of idx.entities.tables) {
          const ambiguous = (idx.tablesByName.get(t.name.toLowerCase())?.length ?? 0) > 1
          items.push(tableItem(t, ambiguous))
        }
      }
    }

    if (wantFunction) {
      for (const fn of idx.entities.functions) items.push(functionItem(fn))
    }

    return items
  }

  setupLanguageFeatures(LanguageIdEnum.PG, {
    completionItems: { enable: true, completionService, triggerCharacters: [' ', '.', '\n'] },
    // Inline diagnostics are off: dangerous-query analysis is authoritative on the
    // backend (m6), and ANTLR's expected-token logging on every keystroke is noise.
    diagnostics: false,
  })

  return monaco
}

// Common PostgreSQL keywords for the "type lowercase → UPPERCASE" convenience.
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

/** Auto-uppercase a SQL keyword once a word boundary is typed after it. */
export function attachKeywordUppercase(
  editor: monaco.editor.IStandaloneCodeEditor,
  enabled: () => boolean,
): monaco.IDisposable {
  let suppress = false
  return editor.onDidChangeModelContent((e) => {
    if (suppress || !enabled()) return
    const change = e.changes[0]
    if (!change || change.text.length !== 1 || !/[\s;,()]/.test(change.text)) return
    const model = editor.getModel()
    if (!model) return
    const { startLineNumber: line, startColumn: col } = change.range
    const w = model.getWordUntilPosition({ lineNumber: line, column: col })
    const upper = w.word.toUpperCase()
    if (w.word && upper !== w.word && KEYWORDS.has(upper)) {
      suppress = true
      editor.executeEdits('uppercase-keyword', [
        {
          range: new monaco.Range(line, w.startColumn, line, w.endColumn),
          text: upper,
        },
      ])
      suppress = false
    }
  })
}
