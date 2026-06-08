import { describe, expect, test } from 'bun:test'
import { buildConnectionString } from '$src/pg/connection-string'

const base = {
  host: 'localhost',
  port: 5432,
  database: 'app',
  username: 'postgres',
  sslMode: 'disable' as const,
}

describe('pg/connection-string', () => {
  test('includes the password when given', () => {
    expect(buildConnectionString(base, 'secret')).toBe(
      'postgresql://postgres:secret@localhost:5432/app?sslmode=disable',
    )
  })

  test('omits auth password when null', () => {
    expect(buildConnectionString(base, null)).toBe(
      'postgresql://postgres@localhost:5432/app?sslmode=disable',
    )
  })

  test('url-encodes special characters', () => {
    expect(buildConnectionString({ ...base, username: 'a@b' }, 'p:w/@d')).toBe(
      'postgresql://a%40b:p%3Aw%2F%40d@localhost:5432/app?sslmode=disable',
    )
  })

  test('brackets IPv6 hosts', () => {
    expect(buildConnectionString({ ...base, host: '::1' }, null)).toBe(
      'postgresql://postgres@[::1]:5432/app?sslmode=disable',
    )
  })

  test('carries the ssl mode', () => {
    expect(buildConnectionString({ ...base, sslMode: 'require' }, null)).toContain(
      'sslmode=require',
    )
  })
})
