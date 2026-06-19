import { describe, expect, test } from 'bun:test'
import { buildConnectionString } from '$src/db/drivers/redis/connection-string'
import { RedisDriver } from '$src/db/drivers/redis/driver'
import type { ConnectionStringParts } from '$src/db/types'

const parts = (over: Partial<ConnectionStringParts> = {}): ConnectionStringParts => ({
  host: 'localhost',
  port: 6379,
  database: '0',
  username: '',
  sslMode: 'disable',
  ...over,
})

describe('redis/connection-string', () => {
  test('redis:// with no auth', () => {
    expect(buildConnectionString(parts(), null)).toBe('redis://localhost:6379/0')
  })
  test('rediss:// when TLS (sslMode != disable)', () => {
    expect(buildConnectionString(parts({ sslMode: 'require' }), null)).toBe(
      'rediss://localhost:6379/0',
    )
  })
  test('includes url-encoded user:password and db index', () => {
    expect(buildConnectionString(parts({ username: 'def', database: '3' }), 'p@ss')).toBe(
      'redis://def:p%40ss@localhost:6379/3',
    )
  })
  test('password-only auth omits the username colon', () => {
    expect(buildConnectionString(parts(), 'secret')).toBe('redis://:secret@localhost:6379/0')
  })
})

describe('redis driver capabilities + relational stubs', () => {
  const d = new RedisDriver(parts() as never)

  test('declares the key-value capability shape', () => {
    expect(d.capabilities.kind).toBe('keyvalue')
    expect(d.capabilities.hasSchemas).toBe(false)
    expect(d.capabilities.hasFunctions).toBe(false)
    expect(d.capabilities.connectionShape).toBe('network')
  })
  test('exposes the keyv facet, not admin', () => {
    expect(typeof d.keyv.scan).toBe('function')
    expect(typeof d.keyv.command).toBe('function')
    expect('admin' in d).toBe(false)
  })
  test('relational operations throw (not supported)', () => {
    expect(() => d.ddl.quoteIdent('x')).toThrow(/not supported/i)
    expect(() => d.dml.inlineParams('x', [])).toThrow(/not supported/i)
    expect(() => d.exec.query('SELECT 1')).toThrow(/not supported/i)
  })

  // The constructor opened a lazy client; close it so the test process exits clean.
  d.lifecycle.close()
})
