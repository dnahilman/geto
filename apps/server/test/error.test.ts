import { describe, expect, test } from 'bun:test'
import { pgErrorMessage } from '$src/db/shared/error'

describe('pg/error pgErrorMessage', () => {
  test('uses a non-empty Error message', () => {
    expect(pgErrorMessage(new Error('boom'))).toBe('boom')
  })

  test('maps an empty-message ECONNREFUSED AggregateError to a friendly message', () => {
    const e = new AggregateError([], '')
    ;(e as unknown as { code: string }).code = 'ECONNREFUSED'
    expect(pgErrorMessage(e).toLowerCase()).toContain('refused')
  })

  test('digs an inner error message out of an AggregateError', () => {
    const e = new AggregateError([new Error('inner detail')], '')
    expect(pgErrorMessage(e)).toBe('inner detail')
  })

  test('falls back to the code when there is no message', () => {
    expect(pgErrorMessage({ code: 'ETIMEDOUT' }).toLowerCase()).toContain('timed out')
  })

  test('never returns "[object Object]" or an empty string', () => {
    expect(pgErrorMessage({})).not.toBe('[object Object]')
    expect(pgErrorMessage({})).not.toBe('')
    expect(pgErrorMessage(undefined)).toBeTruthy()
  })
})
