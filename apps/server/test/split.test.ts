import { describe, expect, test } from 'bun:test'
import { splitStatements } from '$src/db/shared/split'

describe('shared/split splitStatements', () => {
  test('single statement stays one', async () => {
    expect(await splitStatements('SELECT 1')).toEqual(['SELECT 1'])
  })

  test('strips a trailing semicolon', async () => {
    expect(await splitStatements('SELECT 1;')).toEqual(['SELECT 1'])
  })

  test('splits semicolon-separated statements', async () => {
    expect(await splitStatements('SELECT 1; SELECT 2')).toEqual(['SELECT 1', 'SELECT 2'])
  })

  test("splits the user's no-semicolon example into two", async () => {
    expect(await splitStatements('SELECT * FROM "user"\nSELECT * FROM account')).toEqual([
      'SELECT * FROM "user"',
      'SELECT * FROM account',
    ])
  })

  test('splits three newline-separated statements without semicolons', async () => {
    expect(await splitStatements('SELECT 1\nSELECT 2\nSELECT 3')).toEqual([
      'SELECT 1',
      'SELECT 2',
      'SELECT 3',
    ])
  })

  test('keeps a multi-line single SELECT intact', async () => {
    expect(await splitStatements('SELECT *\nFROM "user"')).toEqual(['SELECT *\nFROM "user"'])
  })

  test('keeps a CTE + body as one statement', async () => {
    const sql = 'WITH x AS (SELECT 1)\nSELECT * FROM x'
    expect(await splitStatements(sql)).toEqual([sql])
  })

  test('keeps INSERT ... SELECT as one statement', async () => {
    const sql = 'INSERT INTO t (a)\nSELECT a FROM src'
    expect(await splitStatements(sql)).toEqual([sql])
  })

  test('never returns an empty list for non-empty input', async () => {
    const r = await splitStatements('   SELECT 1   ')
    expect(r.length).toBeGreaterThanOrEqual(1)
    expect(r[0]).toBe('SELECT 1')
  })
})
