import { parse } from 'pgsql-parser'

export interface StatementRisk {
  command: string
  dangerous: boolean
  reasons: string[]
}

export interface SafetyReport {
  statements: StatementRisk[]
  dangerous: boolean
  reasons: string[]
  parseError: string | null
}

// Map the AST statement key to a human command label.
const COMMANDS: Record<string, string> = {
  SelectStmt: 'SELECT',
  InsertStmt: 'INSERT',
  UpdateStmt: 'UPDATE',
  DeleteStmt: 'DELETE',
  TruncateStmt: 'TRUNCATE',
  DropStmt: 'DROP',
  DropdbStmt: 'DROP DATABASE',
  CreatedbStmt: 'CREATE DATABASE',
  AlterTableStmt: 'ALTER TABLE',
  CreateStmt: 'CREATE TABLE',
  CreateSchemaStmt: 'CREATE SCHEMA',
  VariableSetStmt: 'SET',
}

function analyzeNode(key: string, node: Record<string, unknown>): StatementRisk {
  const command = COMMANDS[key] ?? key.replace(/Stmt$/, '').toUpperCase()
  const reasons: string[] = []

  if (key === 'DeleteStmt' && node.whereClause == null) {
    reasons.push('DELETE without a WHERE clause — every row in the table will be deleted.')
  }
  if (key === 'UpdateStmt' && node.whereClause == null) {
    reasons.push('UPDATE without a WHERE clause — every row in the table will be modified.')
  }
  if (key === 'TruncateStmt') {
    reasons.push('TRUNCATE removes all rows from the table(s).')
  }
  if (key === 'DropdbStmt') {
    reasons.push('DROP DATABASE permanently removes an entire database.')
  }
  if (key === 'DropStmt') {
    const removeType = String(node.removeType ?? '')
    const target = removeType.replace(/^OBJECT_/, '').toLowerCase()
    if (['table', 'schema', 'view', 'matview', 'sequence', 'index'].includes(target)) {
      reasons.push(`DROP ${target.toUpperCase()} permanently removes the object and its data.`)
    }
  }
  if (key === 'AlterTableStmt') {
    const cmds = (node.cmds as { AlterTableCmd?: { subtype?: string } }[]) ?? []
    if (cmds.some((c) => c.AlterTableCmd?.subtype === 'AT_DropColumn')) {
      reasons.push('ALTER TABLE … DROP COLUMN permanently removes a column and its data.')
    }
  }

  return { command, dangerous: reasons.length > 0, reasons }
}

/**
 * Whether the SQL is a single SELECT statement and whether it already has a LIMIT.
 * Used to decide if a default LIMIT/OFFSET can be appended for pagination.
 */
export async function inspectSelect(
  sql: string,
): Promise<{ singleSelect: boolean; hasLimit: boolean }> {
  try {
    const parsed = (await parse(sql)) as { stmts?: { stmt?: Record<string, unknown> }[] }
    const stmts = parsed.stmts ?? []
    if (stmts.length !== 1) return { singleSelect: false, hasLimit: false }
    const stmt = stmts[0].stmt
    const key = stmt ? Object.keys(stmt)[0] : undefined
    if (key !== 'SelectStmt') return { singleSelect: false, hasLimit: false }
    const node = stmt![key] as Record<string, unknown>
    return { singleSelect: true, hasLimit: node.limitCount != null }
  } catch {
    return { singleSelect: false, hasLimit: false }
  }
}

/** Parse SQL with the real PostgreSQL parser and flag dangerous statements. */
export async function analyzeSql(sql: string): Promise<SafetyReport> {
  let parsed: { stmts?: { stmt?: Record<string, unknown> }[] }
  try {
    parsed = (await parse(sql)) as typeof parsed
  } catch (e) {
    // Unparseable — let PostgreSQL report the syntax error at execution time.
    return {
      statements: [],
      dangerous: false,
      reasons: [],
      parseError: e instanceof Error ? e.message : String(e),
    }
  }

  const statements: StatementRisk[] = []
  for (const s of parsed.stmts ?? []) {
    const stmt = s.stmt
    if (!stmt) continue
    const key = Object.keys(stmt)[0]
    if (!key) continue
    statements.push(analyzeNode(key, stmt[key] as Record<string, unknown>))
  }

  const reasons = statements.flatMap((s) => s.reasons)
  return { statements, dangerous: reasons.length > 0, reasons, parseError: null }
}
