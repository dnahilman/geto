// Cluster role administration + object-level privilege management for PostgreSQL.
//
// SAFETY: every identifier and literal is quoted by PostgreSQL's own `format()`
// (%I / %L) — we never hand-roll escaping. Attribute keywords and privilege
// tokens are fixed whitelisted constants, never user free-text. Integer values
// (connection limit) are validated and inlined.
import type { Sql } from '$src/db/drivers/postgres/pool'

export interface RoleInfo {
  name: string
  isSuperuser: boolean
  canLogin: boolean
  canCreateDb: boolean
  canCreateRole: boolean
  isReplication: boolean
  bypassRls: boolean
  connectionLimit: number
  validUntil: string | null
  memberOf: string[]
}

/** Boolean attributes (undefined = leave unchanged on ALTER). */
export interface RoleAttributes {
  canLogin?: boolean
  isSuperuser?: boolean
  canCreateDb?: boolean
  canCreateRole?: boolean
  isReplication?: boolean
  bypassRls?: boolean
  connectionLimit?: number | null
  validUntil?: string | null
  /** undefined = keep; null = remove password; string = set password. */
  password?: string | null
}

export interface RoleInput extends RoleAttributes {
  name: string
}

export type ObjectKind = 'table' | 'schema'

export interface Grant {
  grantee: string
  privilege: string
  grantable: boolean
}

export interface PrivilegeChange {
  kind: ObjectKind
  schema: string
  /** Table name for kind='table'; ignored for kind='schema' (uses `schema`). */
  name: string
  role: string
  privileges: string[]
  /** true = GRANT, false = REVOKE. */
  grant: boolean
  withGrantOption?: boolean
}

const TABLE_PRIVS = new Set([
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'REFERENCES',
  'TRIGGER',
])
const SCHEMA_PRIVS = new Set(['USAGE', 'CREATE'])

const ATTR_TOKENS: [keyof RoleAttributes, string, string][] = [
  ['canLogin', 'LOGIN', 'NOLOGIN'],
  ['isSuperuser', 'SUPERUSER', 'NOSUPERUSER'],
  ['canCreateDb', 'CREATEDB', 'NOCREATEDB'],
  ['canCreateRole', 'CREATEROLE', 'NOCREATEROLE'],
  ['isReplication', 'REPLICATION', 'NOREPLICATION'],
  ['bypassRls', 'BYPASSRLS', 'NOBYPASSRLS'],
]

function attrKeywords(a: RoleAttributes): string {
  const toks: string[] = []
  for (const [key, yes, no] of ATTR_TOKENS) {
    const v = a[key]
    if (typeof v === 'boolean') toks.push(v ? yes : no)
  }
  return toks.join(' ')
}

/** Run `format(fmt, VARIADIC args)` server-side (safe quoting), then execute it. */
async function runFormatted(sql: Sql, fmt: string, args: string[]): Promise<void> {
  const rows = await sql<{ ddl: string }[]>`
    SELECT format(${fmt}::text, VARIADIC ${args}::text[]) AS ddl`
  const ddl = rows[0]?.ddl
  if (ddl) await sql.unsafe(ddl)
}

/** Append WITH-clause options (connection limit / password / valid until) shared
 *  by CREATE and ALTER. Mutates `fmtParts`/`args`. */
function appendOptions(a: RoleAttributes, fmtParts: string[], args: string[]): void {
  if (a.connectionLimit !== undefined && a.connectionLimit !== null) {
    const n = Math.trunc(a.connectionLimit)
    if (!Number.isFinite(n) || n < -1) throw new Error('Invalid connection limit')
    fmtParts.push(`CONNECTION LIMIT ${n}`)
  }
  if (a.password !== undefined) {
    if (a.password === null || a.password === '') {
      fmtParts.push('PASSWORD NULL')
    } else {
      fmtParts.push('PASSWORD %L')
      args.push(a.password)
    }
  }
  if (a.validUntil) {
    fmtParts.push('VALID UNTIL %L')
    args.push(a.validUntil)
  }
}

export async function listRoles(sql: Sql): Promise<RoleInfo[]> {
  const rows = await sql<
    {
      name: string
      rolsuper: boolean
      rolcreatedb: boolean
      rolcreaterole: boolean
      rolcanlogin: boolean
      rolreplication: boolean
      rolbypassrls: boolean
      rolconnlimit: number
      rolvaliduntil: string | null
      member_of: string[]
    }[]
  >`
    SELECT r.rolname AS name, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolcanlogin,
           r.rolreplication, r.rolbypassrls, r.rolconnlimit,
           r.rolvaliduntil::text AS rolvaliduntil,
           COALESCE(array_agg(m.rolname) FILTER (WHERE m.rolname IS NOT NULL), '{}') AS member_of
    FROM pg_roles r
    LEFT JOIN pg_auth_members am ON am.member = r.oid
    LEFT JOIN pg_roles m ON m.oid = am.roleid
    WHERE r.rolname !~ '^pg_'
    GROUP BY r.oid, r.rolname, r.rolsuper, r.rolcreatedb, r.rolcreaterole, r.rolcanlogin,
             r.rolreplication, r.rolbypassrls, r.rolconnlimit, r.rolvaliduntil
    ORDER BY r.rolname`
  return rows.map((r) => ({
    name: r.name,
    isSuperuser: r.rolsuper,
    canLogin: r.rolcanlogin,
    canCreateDb: r.rolcreatedb,
    canCreateRole: r.rolcreaterole,
    isReplication: r.rolreplication,
    bypassRls: r.rolbypassrls,
    connectionLimit: r.rolconnlimit,
    validUntil: r.rolvaliduntil === 'infinity' ? null : r.rolvaliduntil,
    memberOf: r.member_of ?? [],
  }))
}

export async function createRole(sql: Sql, input: RoleInput): Promise<void> {
  if (!input.name.trim()) throw new Error('Role name is required')
  const fmtParts = ['CREATE ROLE %I WITH']
  const args = [input.name]
  const kw = attrKeywords(input)
  if (kw) fmtParts.push(kw)
  appendOptions(input, fmtParts, args)
  await runFormatted(sql, fmtParts.join(' '), args)
}

export async function alterRole(sql: Sql, name: string, changes: RoleAttributes): Promise<void> {
  const fmtParts = ['ALTER ROLE %I WITH']
  const args = [name]
  const kw = attrKeywords(changes)
  if (kw) fmtParts.push(kw)
  const before = args.length
  appendOptions(changes, fmtParts, args)
  // Nothing to change (only "ALTER ROLE x WITH") → no-op.
  if (!kw && args.length === before) return
  await runFormatted(sql, fmtParts.join(' '), args)
}

export async function dropRole(sql: Sql, name: string): Promise<void> {
  await runFormatted(sql, 'DROP ROLE %I', [name])
}

/** GRANT/REVOKE membership: `parent` role granted to / revoked from `member`. */
export async function setMembership(
  sql: Sql,
  parentRole: string,
  member: string,
  grant: boolean,
): Promise<void> {
  const fmt = grant ? 'GRANT %I TO %I' : 'REVOKE %I FROM %I'
  await runFormatted(sql, fmt, [parentRole, member])
}

export async function getObjectGrants(
  sql: Sql,
  schema: string,
  name: string,
  kind: ObjectKind,
): Promise<Grant[]> {
  const rows =
    kind === 'schema'
      ? await sql<{ grantee: string; privilege: string; grantable: boolean }[]>`
          SELECT g.rolname AS grantee, a.privilege_type AS privilege, a.is_grantable AS grantable
          FROM pg_namespace n
          CROSS JOIN LATERAL aclexplode(n.nspacl) a
          JOIN pg_roles g ON g.oid = a.grantee
          WHERE n.nspname = ${schema}
          ORDER BY grantee, privilege`
      : await sql<{ grantee: string; privilege: string; grantable: boolean }[]>`
          SELECT g.rolname AS grantee, a.privilege_type AS privilege, a.is_grantable AS grantable
          FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          CROSS JOIN LATERAL aclexplode(c.relacl) a
          JOIN pg_roles g ON g.oid = a.grantee
          WHERE n.nspname = ${schema} AND c.relname = ${name}
          ORDER BY grantee, privilege`
  return [...rows]
}

export async function setObjectPrivilege(sql: Sql, c: PrivilegeChange): Promise<void> {
  const allowed = c.kind === 'schema' ? SCHEMA_PRIVS : TABLE_PRIVS
  const privs = c.privileges.map((p) => p.toUpperCase().trim())
  if (privs.length === 0) throw new Error('No privileges specified')
  for (const p of privs) if (!allowed.has(p)) throw new Error(`Unsupported privilege: ${p}`)
  const privList = privs.join(', ')

  const obj = c.kind === 'schema' ? 'SCHEMA %I' : 'TABLE %I.%I'
  const idents = c.kind === 'schema' ? [c.schema] : [c.schema, c.name]
  const verb = c.grant ? 'GRANT' : 'REVOKE'
  const dir = c.grant ? 'TO' : 'FROM'
  const grantOpt = c.grant && c.withGrantOption ? ' WITH GRANT OPTION' : ''
  const fmt = `${verb} ${privList} ON ${obj} ${dir} %I${grantOpt}`
  await runFormatted(sql, fmt, [...idents, c.role])
}
