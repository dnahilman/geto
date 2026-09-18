import { describe, it, expect, mock } from 'bun:test'
import {
  EditorCache,
  EditorSession,
  resolveDialect,
  StandardSQL,
  PostgreSQL,
  MySQL,
  SQLite,
  PLSQL,
  formatSql,
  checkSqlSyntax,
  runClientSideSqlLint,
  buildCompletionIndex,
  STANDARD_SQL_KEYWORDS,
  type EditorInstance,
} from '../index'
import { EditorState } from '@codemirror/state'
import { statementRanges } from '../languages/sql/statements'

describe('@geto/editor Test Suite', () => {
  describe('EditorCache & Memory Leak Prevention', () => {
    it('should register and retrieve editor instances by ID', () => {
      const cache = new EditorCache()
      const mockEditor = {
        destroy: mock(() => {}),
        getValue: () => 'SELECT 1',
      } as unknown as EditorInstance

      cache.addEditor('tab-1', mockEditor)
      expect(cache.hasEditor('tab-1')).toBe(true)
      expect(cache.getEditor('tab-1')).toBe(mockEditor)
      expect(cache.size()).toBe(1)
    })

    it('should automatically invoke destroy() when deleteEditor is called to prevent memory leaks', () => {
      const cache = new EditorCache({ autoDestroyOnDelete: true })
      let destroyed = false
      const mockEditor = {
        destroy: () => {
          destroyed = true
        },
      } as unknown as EditorInstance

      cache.addEditor('tab-postgres', mockEditor)
      expect(cache.hasEditor('tab-postgres')).toBe(true)

      cache.deleteEditor('tab-postgres')
      expect(cache.hasEditor('tab-postgres')).toBe(false)
      expect(destroyed).toBe(true)
    })

    it('should destroy existing editor when overwritten by the same ID', () => {
      const cache = new EditorCache({ autoDestroyOnDelete: true })
      let destroyedOld = false
      const oldEditor = {
        destroy: () => {
          destroyedOld = true
        },
      } as unknown as EditorInstance
      const newEditor = {
        destroy: () => {},
      } as unknown as EditorInstance

      cache.addEditor('tab-active', oldEditor)
      cache.addEditor('tab-active', newEditor)

      expect(destroyedOld).toBe(true)
      expect(cache.getEditor('tab-active')).toBe(newEditor)
    })

    it('should cleanly destroy all editors on clearEditors()', () => {
      const cache = new EditorCache({ autoDestroyOnDelete: true })
      let destroyedCount = 0
      const makeEditor = () =>
        ({
          destroy: () => {
            destroyedCount++
          },
        }) as unknown as EditorInstance

      cache.addEditor('t1', makeEditor())
      cache.addEditor('t2', makeEditor())
      cache.addEditor('t3', makeEditor())

      expect(cache.size()).toBe(3)
      cache.clearEditors()
      expect(cache.size()).toBe(0)
      expect(destroyedCount).toBe(3)
    })
  })

  describe('Dialect Resolution (Universal StandardSQL Fallback)', () => {
    it('should default to StandardSQL when provider is not specified', () => {
      expect(resolveDialect()).toBe(StandardSQL)
      expect(resolveDialect(undefined)).toBe(StandardSQL)
      expect(resolveDialect('')).toBe(StandardSQL)
      expect(resolveDialect('unknown_db')).toBe(StandardSQL)
    })

    it('should resolve PostgreSQL correctly', () => {
      expect(resolveDialect('postgres')).toBe(PostgreSQL)
      expect(resolveDialect('postgresql')).toBe(PostgreSQL)
    })

    it('should resolve MySQL correctly', () => {
      expect(resolveDialect('mysql')).toBe(MySQL)
      expect(resolveDialect('mariadb')).toBe(MySQL)
    })

    it('should resolve SQLite correctly', () => {
      expect(resolveDialect('sqlite')).toBe(SQLite)
      expect(resolveDialect('sqlite3')).toBe(SQLite)
    })

    it('should resolve Oracle correctly', () => {
      expect(resolveDialect('oracle')).toBe(PLSQL)
      expect(resolveDialect('plsql')).toBe(PLSQL)
    })
  })

  describe('SQL Formatter', () => {
    it('should format queries and uppercase keywords', () => {
      const input = 'select id, email from users where active = 1'
      const formatted = formatSql(input, 'postgresql')
      expect(formatted).toContain('SELECT')
      expect(formatted).toContain('FROM')
      expect(formatted).toContain('WHERE')
    })

    it('should format Oracle PLSQL queries properly', () => {
      const input = 'select employee_id, salary from employees where department_id = 10'
      const formatted = formatSql(input, 'oracle')
      expect(formatted).toContain('SELECT')
      expect(formatted).toContain('FROM')
      expect(formatted).toContain('WHERE')
    })

    it('should return original text safely if input is invalid/incomplete syntax', () => {
      const incomplete = 'SELECT * FROM'
      const res = formatSql(incomplete)
      expect(typeof res).toBe('string')
    })
  })

  describe('Local Syntax Linter (checkSqlSyntax)', () => {
    it('should report zero diagnostics for valid SQL queries', () => {
      const valid =
        "SELECT id, name FROM users WHERE role = 'admin' AND (status = 'active' OR age > 18);"
      const diagnostics = checkSqlSyntax(valid)
      expect(diagnostics.length).toBe(0)
    })

    it('should detect unclosed single quotes', () => {
      const invalid = "SELECT * FROM users WHERE email = 'test@example.com"
      const diagnostics = checkSqlSyntax(invalid)
      expect(diagnostics.length).toBeGreaterThan(0)
      expect(diagnostics[0].message).toContain('Unclosed string literal')
    })

    it('should detect unclosed double quotes', () => {
      const invalid = 'SELECT "unclosed_col FROM users'
      const diagnostics = checkSqlSyntax(invalid)
      expect(diagnostics.length).toBeGreaterThan(0)
      expect(diagnostics[0].message).toContain('Unclosed quoted identifier')
    })

    it('should detect unclosed block comments', () => {
      const invalid = 'SELECT 1; /* unclosed comment'
      const diagnostics = checkSqlSyntax(invalid)
      expect(diagnostics.length).toBeGreaterThan(0)
      expect(diagnostics[0].message).toContain('Unclosed block comment')
    })

    it('should detect unbalanced parentheses', () => {
      const invalid = 'SELECT (1 + (2 * 3) FROM dual'
      const diagnostics = checkSqlSyntax(invalid)
      expect(diagnostics.length).toBeGreaterThan(0)
      expect(diagnostics[0].message).toContain('Unclosed parenthesis')
    })
  })

  describe('Schema Caching & Completion-Driven Keywords', () => {
    it('should cache derived index in WeakMap across calls with the same metadata reference', () => {
      const meta = {
        tables: [{ schema: 'public', name: 'customers', type: 'table' as const }],
        columns: [{ schema: 'public', table: 'customers', name: 'id', type: 'int4' }],
      }

      const idx1 = buildCompletionIndex(meta)
      const idx2 = buildCompletionIndex(meta)
      expect(idx1).toBe(idx2) // Identical reference from WeakMap cache
    })

    it('should contain uppercase keyword completions with apply handlers', () => {
      const selectKw = STANDARD_SQL_KEYWORDS.find((k) => k.label === 'SELECT')
      const fromKw = STANDARD_SQL_KEYWORDS.find((k) => k.label === 'FROM')
      const whereKw = STANDARD_SQL_KEYWORDS.find((k) => k.label === 'WHERE')

      expect(selectKw).toBeDefined()
      expect(selectKw?.label).toBe('SELECT')
      expect(typeof selectKw?.apply).toBe('function')

      expect(fromKw).toBeDefined()
      expect(fromKw?.label).toBe('FROM')
      expect(typeof fromKw?.apply).toBe('function')

      expect(whereKw).toBeDefined()
      expect(whereKw?.label).toBe('WHERE')
      expect(typeof whereKw?.apply).toBe('function')
    })
  })

  describe('EditorSession (Agnostic Store & Actions)', () => {
    it('should notify subscribers when attached and updated', () => {
      const session = new EditorSession({ language: 'sql' })
      let receivedVal = ''
      const unsubscribe = session.subscribe((snapshot) => {
        receivedVal = snapshot.value
      })

      expect(receivedVal).toBe('')

      const mockEditor = {
        getValue: () => 'SELECT * FROM test',
        getSelectedOrAll: () => 'SELECT * FROM test',
        getCursorPosition: () => ({ line: 1, col: 19, offset: 18 }),
        getStatementAtCursor: () => ({ from: 0, to: 18, text: 'SELECT * FROM test' }),
        view: { state: { selection: { main: { empty: true } } } },
      } as unknown as EditorInstance

      session.attach(mockEditor)
      expect(session.getSnapshot().isReady).toBe(true)
      expect(session.getSnapshot().value).toBe('SELECT * FROM test')
      expect(session.getSnapshot().cursor.line).toBe(1)
      expect(session.getSnapshot().activeStatement?.text).toBe('SELECT * FROM test')

      unsubscribe()
    })

    it('should execute run callback with mode selection or current', () => {
      let executedSql = ''
      const session = new EditorSession({
        onRun: (sql) => {
          executedSql = sql
        },
      })

      const mockEditor = {
        getValue: () => 'SELECT 1; SELECT 2;',
        getSelectedOrAll: () => 'SELECT 1',
        getCursorPosition: () => ({ line: 1, col: 5, offset: 4 }),
        getStatementAtCursor: () => ({ from: 0, to: 8, text: 'SELECT 1' }),
        view: { state: { selection: { main: { empty: false } } } },
      } as unknown as EditorInstance

      session.attach(mockEditor)
      session.run('current')
      expect(executedSql).toBe('SELECT 1')

      session.run('all')
      expect(executedSql).toBe('SELECT 1; SELECT 2;')
    })

    it('should delegate undo and redo to the attached instance', () => {
      let undoCalled = false
      let redoCalled = false
      const session = new EditorSession()
      const mockEditor = {
        getValue: () => '',
        getSelectedOrAll: () => '',
        getCursorPosition: () => ({ line: 1, col: 1, offset: 0 }),
        getStatementAtCursor: () => null,
        view: { state: { selection: { main: { empty: true } } } },
        undo: () => {
          undoCalled = true
          return true
        },
        redo: () => {
          redoCalled = true
          return true
        },
      } as unknown as EditorInstance

      session.attach(mockEditor)
      expect(session.undo()).toBe(true)
      expect(undoCalled).toBe(true)
      expect(session.redo()).toBe(true)
      expect(redoCalled).toBe(true)
    })

    it('should track diagnostics state and block run on error', () => {
      let executed = false
      const session = new EditorSession({
        onRun: () => {
          executed = true
        },
      })
      const mockEditor = {
        getValue: () => 'SELECT *',
        getSelectedOrAll: () => 'SELECT *',
        getCursorPosition: () => ({ line: 1, col: 1, offset: 0 }),
        getStatementAtCursor: () => null,
        view: { state: { selection: { main: { empty: true } } } },
      } as unknown as EditorInstance

      session.attach(mockEditor)

      // Initially no errors
      expect(session.getSnapshot().hasError).toBe(false)
      expect(session.getSnapshot().hasWarning).toBe(false)

      // Set a warning diagnostic
      session.setDiagnostics([
        {
          from: 0,
          to: 6,
          severity: 'warning',
          message: 'UPDATE statement without WHERE clause will modify all rows',
        },
      ])
      expect(session.getSnapshot().hasWarning).toBe(true)
      expect(session.getSnapshot().hasError).toBe(false)
      expect(session.getSnapshot().warningMessages.length).toBe(1)

      // Running with warning is allowed
      expect(session.run('all')).toBe(true)
      expect(executed).toBe(true)

      // Now set an error diagnostic
      executed = false
      session.setDiagnostics([
        {
          from: 0,
          to: 1,
          severity: 'error',
          message: 'Unclosed parenthesis "("',
        },
      ])
      expect(session.getSnapshot().hasError).toBe(true)
      expect(session.getSnapshot().errorMessages.length).toBe(1)

      // Running with error must be blocked!
      expect(session.run('all')).toBe(false)
      expect(executed).toBe(false)
    })
  })

  describe('Multi-Severity Client-Side Linter (runClientSideSqlLint)', () => {
    it('should detect UPDATE without WHERE as a warning', () => {
      const sql = 'UPDATE users SET status = "active";'
      const diags = runClientSideSqlLint(sql)
      const warning = diags.find((d) => d.severity === 'warning')
      expect(warning).toBeDefined()
      expect(warning?.message).toContain('UPDATE statement without WHERE clause')
    })

    it('should not warn on UPDATE with valid WHERE clause', () => {
      const sql = "UPDATE users SET status = 'active' WHERE id = 1;"
      const diags = runClientSideSqlLint(sql)
      const updateWarning = diags.find((d) => d.message.includes('UPDATE statement without WHERE'))
      expect(updateWarning).toBeUndefined()
    })

    it('should detect DELETE without WHERE as a warning', () => {
      const sql = 'DELETE FROM sessions;'
      const diags = runClientSideSqlLint(sql)
      const warning = diags.find((d) => d.severity === 'warning')
      expect(warning).toBeDefined()
      expect(warning?.message).toContain('DELETE statement without WHERE clause')
    })

    it('should detect DROP TABLE without IF EXISTS as a warning', () => {
      const sql = 'DROP TABLE old_records;'
      const diags = runClientSideSqlLint(sql)
      const warning = diags.find((d) => d.message.includes('DROP TABLE without IF EXISTS'))
      expect(warning).toBeDefined()
    })

    it('should detect TRUNCATE as a warning', () => {
      const sql = 'TRUNCATE audit_logs;'
      const diags = runClientSideSqlLint(sql)
      const warning = diags.find((d) => d.message.includes('TRUNCATE'))
      expect(warning).toBeDefined()
    })

    it('should detect SELECT * without LIMIT as info', () => {
      const sql = 'SELECT * FROM users WHERE id > 10;'
      const diags = runClientSideSqlLint(sql)
      const info = diags.find((d) => d.severity === 'info' && d.message.includes('LIMIT'))
      expect(info).toBeDefined()
    })

    it('should not suggest LIMIT if LIMIT clause is already present', () => {
      const sql = 'SELECT * FROM users LIMIT 50;'
      const diags = runClientSideSqlLint(sql)
      const info = diags.find((d) => d.message.includes('LIMIT'))
      expect(info).toBeUndefined()
    })

    it('should detect redundant INNER JOIN as hint', () => {
      const sql = 'SELECT u.id FROM users u INNER JOIN accounts a ON u.id = a.user_id;'
      const diags = runClientSideSqlLint(sql)
      const hint = diags.find((d) => d.severity === 'hint' && d.message.includes('INNER'))
      expect(hint).toBeDefined()
    })

    it('should detect redundant ASC in ORDER BY as hint', () => {
      const sql = 'SELECT id FROM users ORDER BY created_at ASC;'
      const diags = runClientSideSqlLint(sql)
      const hint = diags.find((d) => d.severity === 'hint' && d.message.includes('ASC'))
      expect(hint).toBeDefined()
    })

    it('should apply fail-fast rule: fatal syntax errors prevent spurious warnings', () => {
      // Unclosed quote on an UPDATE statement
      const sql = "UPDATE users SET status = 'active"
      const diags = runClientSideSqlLint(sql)
      // Must only report error, no warning
      expect(diags.every((d) => d.severity === 'error')).toBe(true)
    })
  })

  describe('StatementRanges & Comment Handling', () => {
    it('should not treat leading comments as statements and place range on query start', () => {
      const doc = EditorState.create({
        doc: '-- 1. Info: SELECT * tanpa LIMIT\nSELECT * FROM users;',
      })
      const ranges = statementRanges(doc)
      expect(ranges.length).toBe(1)
      expect(ranges[0].text).toBe('SELECT * FROM users;')
      // Line of statement must be line 2, NOT line 1
      expect(doc.doc.lineAt(ranges[0].from).number).toBe(2)
    })

    it('should return empty ranges when document contains only comments', () => {
      const doc = EditorState.create({
        doc: '-- Just a comment\n/* block comment */\n-- another comment',
      })
      const ranges = statementRanges(doc)
      expect(ranges.length).toBe(0)
    })

    it('should correctly position multiple statements separated by comments', () => {
      const doc = EditorState.create({
        doc: 'SELECT 1;\n\n-- Comment line\nSELECT 2;',
      })
      const ranges = statementRanges(doc)
      expect(ranges.length).toBe(2)
      expect(ranges[0].text).toBe('SELECT 1;')
      expect(doc.doc.lineAt(ranges[0].from).number).toBe(1)
      expect(ranges[1].text).toBe('SELECT 2;')
      expect(doc.doc.lineAt(ranges[1].from).number).toBe(4)
    })
  })
})
