import { db } from '$src/store/db'
import { decryptSecret, encryptSecret } from '$src/crypto/secret'
import { DEFAULT_PROVIDER, type ProviderId } from '$src/providers'

export type SslMode = 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full'

export type SshAuthMethod = 'password' | 'key'

/** Optional SSH tunnel config the client may send. Secrets follow the same
 *  keep/clear/replace rule as the DB password (undefined=keep, ''/null=clear). */
export interface SshInput {
  enabled: boolean
  host: string
  port: number
  username: string
  authMethod: SshAuthMethod
  password?: string | null
  privateKey?: string | null
  passphrase?: string | null
}

/** Safe SSH shape returned to the client (never includes secrets). */
export interface SshConfig {
  enabled: boolean
  host: string
  port: number
  username: string
  authMethod: SshAuthMethod
  hasPassword: boolean
  hasPrivateKey: boolean
  hasPassphrase: boolean
}

/** What the client may send when creating/updating a connection. */
export interface ConnectionInput {
  name: string
  provider: ProviderId
  host: string
  port: number
  database: string
  username: string
  /** Plaintext; encrypted before storage. Omit on update to keep existing. */
  password?: string | null
  sslMode: SslMode
  color?: string | null
  readonly: boolean
  /** Optional SSH tunnel. Omit (or enabled:false) for a direct connection. */
  ssh?: SshInput | null
}

/** Safe connection shape returned to the client (never includes the password). */
export interface Connection {
  id: string
  name: string
  provider: ProviderId
  host: string
  port: number
  database: string
  username: string
  hasPassword: boolean
  sslMode: SslMode
  color: string | null
  readonly: boolean
  ssh: SshConfig | null
  createdAt: string
  updatedAt: string
}

interface Row {
  id: string
  name: string
  provider: string
  host: string
  port: number
  database: string
  username: string
  password_enc: string | null
  ssl_mode: SslMode
  color: string | null
  readonly: number
  ssh_enabled: number | null
  ssh_host: string | null
  ssh_port: number | null
  ssh_username: string | null
  ssh_auth: string | null
  ssh_password_enc: string | null
  ssh_key_enc: string | null
  ssh_passphrase_enc: string | null
  created_at: string
  updated_at: string
}

function toPublicSsh(r: Row): SshConfig | null {
  if (r.ssh_enabled !== 1) return null
  return {
    enabled: true,
    host: r.ssh_host ?? '',
    port: r.ssh_port ?? 22,
    username: r.ssh_username ?? '',
    authMethod: r.ssh_auth === 'password' ? 'password' : 'key',
    hasPassword: r.ssh_password_enc != null,
    hasPrivateKey: r.ssh_key_enc != null,
    hasPassphrase: r.ssh_passphrase_enc != null,
  }
}

function toPublic(r: Row): Connection {
  return {
    id: r.id,
    name: r.name,
    provider: (r.provider as ProviderId) ?? DEFAULT_PROVIDER,
    host: r.host,
    port: r.port,
    database: r.database,
    username: r.username,
    hasPassword: r.password_enc != null,
    sslMode: r.ssl_mode,
    color: r.color,
    readonly: r.readonly === 1,
    ssh: toPublicSsh(r),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function listConnections(): Connection[] {
  return (db.query('SELECT * FROM connections ORDER BY name').all() as Row[]).map(toPublic)
}

export function getConnection(id: string): Connection | null {
  const row = db.query('SELECT * FROM connections WHERE id = ?').get(id) as Row | null
  return row ? toPublic(row) : null
}

/** Decrypted SSH tunnel secret, used by the registry to open a tunnel. */
export interface SshSecret {
  host: string
  port: number
  username: string
  authMethod: SshAuthMethod
  password: string | null
  privateKey: string | null
  passphrase: string | null
}

export interface ConnectionSecret extends Connection {
  password: string | null
  sshSecret: SshSecret | null
}

/** Internal: full row with decrypted DB + SSH secrets, for opening a pool/tunnel. */
export function getConnectionSecret(id: string): ConnectionSecret | null {
  const row = db.query('SELECT * FROM connections WHERE id = ?').get(id) as Row | null
  if (!row) return null
  const pub = toPublic(row)
  const sshSecret: SshSecret | null = pub.ssh
    ? {
        host: pub.ssh.host,
        port: pub.ssh.port,
        username: pub.ssh.username,
        authMethod: pub.ssh.authMethod,
        password: row.ssh_password_enc ? decryptSecret(row.ssh_password_enc) : null,
        privateKey: row.ssh_key_enc ? decryptSecret(row.ssh_key_enc) : null,
        passphrase: row.ssh_passphrase_enc ? decryptSecret(row.ssh_passphrase_enc) : null,
      }
    : null
  return {
    ...pub,
    password: row.password_enc ? decryptSecret(row.password_enc) : null,
    sshSecret,
  }
}

/** undefined → keep existing; '' or null → clear; string → re-encrypt. */
function secretCol(value: string | null | undefined, existing: string | null): string | null {
  if (value === undefined) return existing
  return value ? encryptSecret(value) : null
}

export function createConnection(input: ConnectionInput): Connection {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const passwordEnc = input.password ? encryptSecret(input.password) : null
  const ssh = input.ssh
  db.query(
    `INSERT INTO connections
       (id, name, provider, host, port, database, username, password_enc, ssl_mode, color, readonly,
        ssh_enabled, ssh_host, ssh_port, ssh_username, ssh_auth, ssh_password_enc, ssh_key_enc, ssh_passphrase_enc,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.name,
    input.provider ?? DEFAULT_PROVIDER,
    input.host,
    input.port,
    input.database,
    input.username,
    passwordEnc,
    input.sslMode,
    input.color ?? null,
    input.readonly ? 1 : 0,
    ssh?.enabled ? 1 : 0,
    ssh?.host ?? null,
    ssh?.port ?? 22,
    ssh?.username ?? null,
    ssh?.authMethod ?? 'key',
    ssh?.password ? encryptSecret(ssh.password) : null,
    ssh?.privateKey ? encryptSecret(ssh.privateKey) : null,
    ssh?.passphrase ? encryptSecret(ssh.passphrase) : null,
    now,
    now,
  )
  return getConnection(id)!
}

export function updateConnection(id: string, input: ConnectionInput): Connection | null {
  const existing = db.query('SELECT * FROM connections WHERE id = ?').get(id) as Row | null
  if (!existing) return null
  const passwordEnc = secretCol(input.password, existing.password_enc)
  const ssh = input.ssh
  db.query(
    `UPDATE connections SET
       name = ?, provider = ?, host = ?, port = ?, database = ?, username = ?, password_enc = ?,
       ssl_mode = ?, color = ?, readonly = ?,
       ssh_enabled = ?, ssh_host = ?, ssh_port = ?, ssh_username = ?, ssh_auth = ?,
       ssh_password_enc = ?, ssh_key_enc = ?, ssh_passphrase_enc = ?,
       updated_at = ?
     WHERE id = ?`,
  ).run(
    input.name,
    input.provider ?? DEFAULT_PROVIDER,
    input.host,
    input.port,
    input.database,
    input.username,
    passwordEnc,
    input.sslMode,
    input.color ?? null,
    input.readonly ? 1 : 0,
    ssh?.enabled ? 1 : 0,
    ssh?.host ?? null,
    ssh?.port ?? 22,
    ssh?.username ?? null,
    ssh?.authMethod ?? 'key',
    // When ssh omitted entirely, keep existing secrets; otherwise apply keep/clear/replace.
    ssh === undefined ? existing.ssh_password_enc : secretCol(ssh?.password, existing.ssh_password_enc),
    ssh === undefined ? existing.ssh_key_enc : secretCol(ssh?.privateKey, existing.ssh_key_enc),
    ssh === undefined
      ? existing.ssh_passphrase_enc
      : secretCol(ssh?.passphrase, existing.ssh_passphrase_enc),
    new Date().toISOString(),
    id,
  )
  return getConnection(id)
}

/** Switch which database this connection targets (keeps all other settings). */
export function setConnectionDatabase(id: string, database: string): Connection | null {
  const existing = db.query('SELECT id FROM connections WHERE id = ?').get(id)
  if (!existing) return null
  db.query('UPDATE connections SET database = ?, updated_at = ? WHERE id = ?').run(
    database,
    new Date().toISOString(),
    id,
  )
  return getConnection(id)
}

export function deleteConnection(id: string): boolean {
  return db.query('DELETE FROM connections WHERE id = ?').run(id).changes > 0
}
