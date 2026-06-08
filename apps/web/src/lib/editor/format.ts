import { format } from 'sql-formatter'

export function formatSql(sql: string): string {
  try {
    return format(sql, { language: 'postgresql', keywordCase: 'upper', tabWidth: 2 })
  } catch {
    return sql
  }
}
