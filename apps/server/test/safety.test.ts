import { describe, expect, test } from 'bun:test'
import { analyzeSql } from '$src/db/shared/safety'

describe('shared/safety analyzeSql', () => {
  test('flags DELETE without WHERE', async () => {
    const r = await analyzeSql('DELETE FROM users')
    expect(r.dangerous).toBe(true)
    expect(r.reasons.join(' ')).toContain('WHERE')
  })

  test('allows DELETE with WHERE', async () => {
    const r = await analyzeSql('DELETE FROM users WHERE id = 1')
    expect(r.dangerous).toBe(false)
  })

  test('flags UPDATE without WHERE', async () => {
    const r = await analyzeSql('UPDATE users SET active = false')
    expect(r.dangerous).toBe(true)
  })

  test('allows UPDATE with WHERE', async () => {
    const r = await analyzeSql('UPDATE users SET active = false WHERE id = 1')
    expect(r.dangerous).toBe(false)
  })

  test('flags TRUNCATE, DROP TABLE, DROP DATABASE', async () => {
    expect((await analyzeSql('TRUNCATE users')).dangerous).toBe(true)
    expect((await analyzeSql('DROP TABLE users')).dangerous).toBe(true)
    expect((await analyzeSql('DROP DATABASE app')).dangerous).toBe(true)
  })

  test('flags ALTER TABLE ... DROP COLUMN', async () => {
    const r = await analyzeSql('ALTER TABLE users DROP COLUMN email')
    expect(r.dangerous).toBe(true)
  })

  test('SELECT and INSERT are safe', async () => {
    expect((await analyzeSql('SELECT * FROM users')).dangerous).toBe(false)
    expect((await analyzeSql("INSERT INTO users(name) VALUES ('a')")).dangerous).toBe(false)
  })

  test('detects danger across multiple statements', async () => {
    const r = await analyzeSql('SELECT 1; DELETE FROM users;')
    expect(r.statements.length).toBe(2)
    expect(r.dangerous).toBe(true)
  })

  test('unparseable SQL does not throw and is not flagged', async () => {
    const r = await analyzeSql('this is not sql {{')
    expect(r.parseError).not.toBeNull()
    expect(r.dangerous).toBe(false)
  })
})
