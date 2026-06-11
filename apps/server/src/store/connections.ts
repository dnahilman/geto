import { db } from '$src/store/db'
import { decryptSecret, encryptSecret } from '$src/crypto/secret'
import { DEFAULT_PROVIDER, type ProviderId } from '$src/providers'

export type SslMode = 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full'

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
  created_at: string
  updated_at: string
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

/** Internal: full row with the decrypted password, for opening a pg pool. */
export function getConnectionSecret(id: string): (Connection & { password: string | null }) | null {
  const row = db.query('SELECT * FROM connections WHERE id = ?').get(id) as Row | null
  if (!row) return null
  return {
    ...toPublic(row),
    password: row.password_enc ? decryptSecret(row.password_enc) : null,
  }
}

export function createConnection(input: ConnectionInput): Connection {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const passwordEnc = input.password ? encryptSecret(input.password) : null
  db.query(
    `INSERT INTO connections
       (id, name, provider, host, port, database, username, password_enc, ssl_mode, color, readonly, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    now,
    now,
  )
  return getConnection(id)!
}

export function updateConnection(id: string, input: ConnectionInput): Connection | null {
  const existing = db.query('SELECT * FROM connections WHERE id = ?').get(id) as Row | null
  if (!existing) return null
  // password === undefined → keep; '' or null → clear; string → re-encrypt
  const passwordEnc =
    input.password === undefined
      ? existing.password_enc
      : input.password
        ? encryptSecret(input.password)
        : null
  db.query(
    `UPDATE connections SET
       name = ?, provider = ?, host = ?, port = ?, database = ?, username = ?, password_enc = ?,
       ssl_mode = ?, color = ?, readonly = ?, updated_at = ?
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
