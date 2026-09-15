import { sql, type SQLDialect } from '@codemirror/lang-sql'
import type { Extension } from '@codemirror/state'
import { resolveDialect } from './dialect'
import { createRunGutter } from './run-gutter'

export interface SqlLanguageOptions {
  dialect?: SQLDialect | string
  runGutter?: boolean
}

/**
 * Create the CodeMirror SQL language extension bundle.
 * Configures the Lezer SQL grammar for the specified dialect,
 * and attaches statement range calculation and the run-statement gutter.
 */
export function createSqlLanguageExtension(options: SqlLanguageOptions = {}): Extension[] {
  const dialect = resolveDialect(options.dialect)
  const extensions: Extension[] = [sql({ dialect })]

  if (options.runGutter !== false) {
    extensions.push(...createRunGutter())
  }

  return extensions
}
