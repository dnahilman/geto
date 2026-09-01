import { format } from 'sql-formatter'

export function formatSql(sql: string, provider?: string): string {
  const language = provider === 'mysql' ? 'mysql' : 'postgresql'
  try {
    return format(sql, { language, keywordCase: 'upper', tabWidth: 2 })
  } catch {
    return sql
  }
}
