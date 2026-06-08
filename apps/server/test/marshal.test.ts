import { describe, expect, test } from 'bun:test'
import { marshalValue, typeName } from '$src/pg/marshal'

describe('pg/marshal marshalValue', () => {
  test('bigint -> string (no precision loss)', () => {
    expect(marshalValue(9223372036854775807n)).toBe('9223372036854775807')
  })

  test('Date -> ISO string', () => {
    expect(marshalValue(new Date('2024-01-02T03:04:05.000Z'))).toBe('2024-01-02T03:04:05.000Z')
  })

  test('bytea Buffer -> \\x hex', () => {
    expect(marshalValue(Buffer.from([0xde, 0xad, 0xbe, 0xef]))).toBe('\\xdeadbeef')
  })

  test('null and undefined -> null', () => {
    expect(marshalValue(null)).toBeNull()
    expect(marshalValue(undefined)).toBeNull()
  })

  test('plain scalars pass through', () => {
    expect(marshalValue('hi')).toBe('hi')
    expect(marshalValue(42)).toBe(42)
    expect(marshalValue(true)).toBe(true)
  })

  test('arrays are marshalled recursively', () => {
    expect(marshalValue([1n, new Date('2024-01-01T00:00:00.000Z')])).toEqual([
      '1',
      '2024-01-01T00:00:00.000Z',
    ])
  })

  test('jsonb objects pass through as-is', () => {
    expect(marshalValue({ a: 1, b: [2, 3] })).toEqual({ a: 1, b: [2, 3] })
  })
})

describe('pg/marshal typeName', () => {
  test('maps common oids', () => {
    expect(typeName(20)).toBe('int8')
    expect(typeName(3802)).toBe('jsonb')
    expect(typeName(1184)).toBe('timestamptz')
  })

  test('falls back to oid:N for unknown', () => {
    expect(typeName(999999)).toBe('oid:999999')
  })
})
