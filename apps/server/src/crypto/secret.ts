import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { env } from '$src/env'

/**
 * Symmetric encryption for secrets at rest (saved DB passwords).
 *
 * AES-256-GCM with a per-value random IV. The 256-bit key is derived from
 * GETO_MASTER_KEY (which has a stable baked-in default). Changing the master key
 * makes previously-stored passwords undecryptable.
 *
 * Encoded form: `v1:<ivB64>:<tagB64>:<cipherB64>`
 */
const KEY = createHash('sha256').update(`geto-secret:${env.GETO_MASTER_KEY}`).digest()
const IV_LEN = 12

export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv('aes-256-gcm', KEY, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

export function decryptSecret(encoded: string): string {
  const [version, ivB64, tagB64, cipherB64] = encoded.split(':')
  // cipherB64 may be '' (empty plaintext) — check for missing parts, not falsy.
  if (version !== 'v1' || ivB64 === undefined || tagB64 === undefined || cipherB64 === undefined) {
    throw new Error('Malformed encrypted secret')
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(cipherB64, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    // Auth-tag mismatch — almost always because GETO_MASTER_KEY changed.
    throw new Error(
      'Saved password could not be decrypted (the encryption key changed). Edit the connection and re-enter the password.',
    )
  }
}
