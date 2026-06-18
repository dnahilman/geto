import { describe, expect, test } from 'bun:test'
import {
  createConnection,
  getConnection,
  getConnectionSecret,
  updateConnection,
  deleteConnection,
  type ConnectionInput,
} from '$src/store/connections'

const base = (ssh: ConnectionInput['ssh']): ConnectionInput => ({
  name: 'ssh-test',
  provider: 'postgresql',
  host: 'db.internal',
  port: 5432,
  database: 'postgres',
  username: 'postgres',
  password: 'pw',
  sslMode: 'prefer',
  readonly: false,
  ssh,
})

describe('store/connections SSH secrets', () => {
  test('round-trips SSH key auth, never leaking secrets in the public shape', () => {
    const c = createConnection(
      base({
        enabled: true,
        host: 'bastion',
        port: 2222,
        username: 'tunnel',
        authMethod: 'key',
        privateKey: '-----BEGIN KEY-----\nABC\n-----END KEY-----',
        passphrase: 'pp',
      }),
    )
    try {
      // Public connection: flags only, no plaintext secrets.
      expect(c.ssh?.enabled).toBe(true)
      expect(c.ssh?.authMethod).toBe('key')
      expect(c.ssh?.hasPrivateKey).toBe(true)
      expect(c.ssh?.hasPassphrase).toBe(true)
      expect(JSON.stringify(c)).not.toContain('BEGIN KEY')
      expect(JSON.stringify(c)).not.toContain('pp')

      // Internal secret: decrypts back to the originals.
      const s = getConnectionSecret(c.id)
      expect(s?.sshSecret?.privateKey).toContain('BEGIN KEY')
      expect(s?.sshSecret?.passphrase).toBe('pp')
      expect(s?.sshSecret?.host).toBe('bastion')
      expect(s?.sshSecret?.port).toBe(2222)
    } finally {
      deleteConnection(c.id)
    }
  })

  test('disabled SSH yields ssh:null and no tunnel secret', () => {
    const c = createConnection(
      base({ enabled: false, host: '', port: 22, username: '', authMethod: 'key' }),
    )
    try {
      expect(c.ssh).toBeNull()
      expect(getConnectionSecret(c.id)?.sshSecret).toBeNull()
    } finally {
      deleteConnection(c.id)
    }
  })

  test('update keeps existing SSH secrets when omitted, replaces when provided', () => {
    const c = createConnection(
      base({
        enabled: true,
        host: 'bastion',
        port: 22,
        username: 'tunnel',
        authMethod: 'password',
        password: 'sshpw',
      }),
    )
    try {
      // Omit the secret (undefined) on update → keep existing.
      updateConnection(c.id, {
        ...base({
          enabled: true,
          host: 'bastion',
          port: 22,
          username: 'tunnel',
          authMethod: 'password',
          password: undefined,
        }),
      })
      expect(getConnectionSecret(c.id)?.sshSecret?.password).toBe('sshpw')

      // Provide a new secret → replace.
      updateConnection(c.id, {
        ...base({
          enabled: true,
          host: 'bastion',
          port: 22,
          username: 'tunnel',
          authMethod: 'password',
          password: 'newpw',
        }),
      })
      expect(getConnectionSecret(c.id)?.sshSecret?.password).toBe('newpw')

      // Public shape still hides it.
      expect(getConnection(c.id)?.ssh?.hasPassword).toBe(true)
    } finally {
      deleteConnection(c.id)
    }
  })
})
