import { describe, expect, test } from 'bun:test'
import {
  buildInsert,
  buildUpdate,
  buildDelete,
  buildCreateTable,
} from '$src/db/drivers/postgres/dml'

describe('postgres/dml', () => {
  test('buildInsert with values', () => {
    const { text, params } = buildInsert('s', 't', { a: 1, b: 'x' })
    expect(text).toContain('INSERT INTO "s"."t" ("a", "b")')
    expect(text).toContain('VALUES ($1, $2)')
    expect(text).toContain('RETURNING *')
    expect(params).toEqual([1, 'x'])
  })

  test('buildInsert with no values uses DEFAULT VALUES', () => {
    expect(buildInsert('s', 't', {}).text).toContain('DEFAULT VALUES')
  })

  test('buildUpdate sets and filters by pk', () => {
    const { text, params } = buildUpdate('s', 't', { id: 7 }, { name: 'new' })
    expect(text).toBe('UPDATE "s"."t" SET "name" = $1 WHERE "id" = $2 RETURNING *')
    expect(params).toEqual(['new', 7])
  })

  test('buildUpdate refuses without a primary key', () => {
    expect(() => buildUpdate('s', 't', {}, { a: 1 })).toThrow()
  })

  test('buildDelete by pk', () => {
    const { text, params } = buildDelete('s', 't', { id: 3 })
    expect(text).toBe('DELETE FROM "s"."t" WHERE "id" = $1 RETURNING *')
    expect(params).toEqual([3])
  })

  test('buildDelete refuses without a primary key', () => {
    expect(() => buildDelete('s', 't', {})).toThrow()
  })

  test('quotes identifiers (defends injection)', () => {
    const { text } = buildInsert('s', 'weird"name', { 'a"b': 1 })
    expect(text).toContain('"weird""name"')
    expect(text).toContain('"a""b"')
  })

  test('buildCreateTable emits columns + primary key', () => {
    const ddl = buildCreateTable('s', 't', [
      { name: 'id', type: 'serial', primaryKey: true },
      { name: 'name', type: 'text', notNull: true },
    ])
    expect(ddl).toContain('CREATE TABLE "s"."t"')
    expect(ddl).toContain('"name" text NOT NULL')
    expect(ddl).toContain('PRIMARY KEY ("id")')
  })

  test('buildCreateTable rejects an invalid type', () => {
    expect(() =>
      buildCreateTable('s', 't', [{ name: 'x', type: 'text); DROP TABLE u; --' }]),
    ).toThrow()
  })
})
