import {
  PostgreSQL,
  MySQL,
  SQLite,
  StandardSQL,
  MSSQL,
  PLSQL,
  type SQLDialect,
} from '@codemirror/lang-sql'

export { PostgreSQL, MySQL, SQLite, StandardSQL, MSSQL, PLSQL }
export type { SQLDialect }

/**
 * Resolve a database provider name or dialect instance into a CodeMirror SQLDialect.
 */
export function resolveDialect(provider?: string | SQLDialect): SQLDialect {
  if (provider && typeof provider === 'object' && 'name' in provider) {
    return provider as SQLDialect
  }

  const p = typeof provider === 'string' ? provider.trim().toLowerCase() : ''
  switch (p) {
    case 'postgres':
    case 'postgresql':
      return PostgreSQL
    case 'mysql':
    case 'mariadb':
      return MySQL
    case 'sqlite':
    case 'sqlite3':
      return SQLite
    case 'oracle':
    case 'plsql':
      return PLSQL
    case 'mssql':
    case 'sqlserver':
      return MSSQL
    case 'standard':
    case 'ansi':
    case 'sql':
    default:
      return StandardSQL
  }
}

/**
 * Return a standardized language identifier for formatters or logging.
 */
export function getDialectFormatterLanguage(
  dialect?: SQLDialect | string,
): 'postgresql' | 'mysql' | 'sqlite' | 'plsql' | 'sql' {
  if (typeof dialect === 'string') {
    const s = dialect.toLowerCase()
    if (s.includes('postgres')) return 'postgresql'
    if (s.includes('mysql') || s.includes('mariadb')) return 'mysql'
    if (s.includes('sqlite')) return 'sqlite'
    if (s.includes('oracle') || s.includes('plsql')) return 'plsql'
    return 'sql'
  }

  if (dialect === PostgreSQL) return 'postgresql'
  if (dialect === MySQL) return 'mysql'
  if (dialect === SQLite) return 'sqlite'
  if (dialect === PLSQL) return 'plsql'
  return 'sql'
}
