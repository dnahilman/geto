import { format } from 'sql-formatter'
import type { FormatOptionsWithLanguage } from 'sql-formatter'
import { getDialectFormatterLanguage, type SQLDialect } from './dialect'

export interface SqlFormatterOptions {
  tabWidth?: number
  keywordCase?: 'upper' | 'lower' | 'preserve'
  linesBetweenQueries?: number
}

/**
 * Format a SQL string using dialect-aware rules and uppercase keywords.
 * If formatting fails due to incomplete syntax, returns the original SQL safely.
 */
export function formatSql(
  sql: string,
  dialect?: SQLDialect | string,
  options?: SqlFormatterOptions,
): string {
  if (!sql || !sql.trim()) return sql
  const language = getDialectFormatterLanguage(dialect)

  try {
    return format(sql, {
      language,
      keywordCase: options?.keywordCase ?? 'upper',
      tabWidth: options?.tabWidth ?? 2,
      linesBetweenQueries: options?.linesBetweenQueries ?? 1,
    } as FormatOptionsWithLanguage)
  } catch {
    return sql
  }
}
