import { describe, expect, test } from 'bun:test'
import { encryptSecret, decryptSecret } from '$src/crypto/secret'

describe('crypto/secret', () => {
  test('round-trips a value', () => {
    const enc = encryptSecret('hunter2')
    expect(enc.startsWith('v1:')).toBe(true)
    expect(decryptSecret(enc)).toBe('hunter2')
  })

  test('produces distinct ciphertext each time (random IV)', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'))
  })

  test('handles empty and unicode', () => {
    expect(decryptSecret(encryptSecret(''))).toBe('')
    expect(decryptSecret(encryptSecret('pä$$wörd🔐'))).toBe('pä$$wörd🔐')
  })

  test('rejects malformed ciphertext', () => {
    expect(() => decryptSecret('not-valid')).toThrow()
  })
})
