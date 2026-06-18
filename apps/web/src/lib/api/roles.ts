import { client, unwrap } from '$lib/api/eden'
import type {
  RoleInfo,
  RoleInput,
  RoleAttributes,
  Grant,
  ObjectKind,
  PrivilegeChange,
} from '@geto/server'

export type { RoleInfo, RoleInput, RoleAttributes, Grant, ObjectKind, PrivilegeChange }

const conn = (id: string) => client.api.connections({ id })

// ── Roles ──
export const rolesKey = (id: string) => ['roles', id] as const

export const listRoles = (id: string): Promise<RoleInfo[]> =>
  unwrap(conn(id).roles.get()) as Promise<RoleInfo[]>

export const createRole = (id: string, input: RoleInput): Promise<{ created: true }> =>
  unwrap(conn(id).roles.post(input)) as Promise<{ created: true }>

export const alterRole = (
  id: string,
  name: string,
  attributes: RoleAttributes,
): Promise<{ updated: true }> =>
  unwrap(conn(id).roles({ name }).patch({ attributes })) as Promise<{ updated: true }>

export const setRoleMembership = (
  id: string,
  member: string,
  parentRole: string,
  grant: boolean,
): Promise<{ updated: true }> =>
  unwrap(conn(id).roles({ name: member }).patch({ membership: { parentRole, grant } })) as Promise<{
    updated: true
  }>

export const dropRole = (id: string, name: string): Promise<{ deleted: true }> =>
  unwrap(conn(id).roles({ name }).delete()) as Promise<{ deleted: true }>

// ── Object privileges ──
export const privilegesKey = (id: string, schema: string, name: string, kind: ObjectKind) =>
  ['privileges', id, kind, schema, name] as const

export const getObjectGrants = (
  id: string,
  schema: string,
  name: string,
  kind: ObjectKind,
): Promise<Grant[]> =>
  unwrap(conn(id).privileges.get({ query: { schema, name, kind } })) as Promise<Grant[]>

export const setObjectPrivilege = (id: string, change: PrivilegeChange): Promise<{ ok: true }> =>
  unwrap(conn(id).privileges.post(change)) as Promise<{ ok: true }>
