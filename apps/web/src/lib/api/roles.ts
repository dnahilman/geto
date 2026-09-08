import { client, unwrap } from '$lib/api/client'
import type {
  RoleInfo,
  RoleInput,
  RoleAttributes,
  Grant,
  ObjectKind,
  PrivilegeChange,
} from '$lib/types/server'

export type { RoleInfo, RoleInput, RoleAttributes, Grant, ObjectKind, PrivilegeChange }

// ── Roles ──
export const rolesKey = (id: string) => ['roles', id] as const

export const listRoles = (id: string): Promise<RoleInfo[]> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unwrap((client as any).GET(`/api/connections/${id}/roles`)) as Promise<RoleInfo[]>

export const createRole = (id: string, input: RoleInput): Promise<{ created: true }> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unwrap((client as any).POST(`/api/connections/${id}/roles`, { body: input })) as Promise<{
    created: true
  }>

export const alterRole = (
  id: string,
  name: string,
  attributes: RoleAttributes,
): Promise<{ updated: true }> =>
  unwrap(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).PATCH(`/api/connections/${id}/roles/${name}`, { body: { attributes } }),
  ) as Promise<{ updated: true }>

export const setRoleMembership = (
  id: string,
  member: string,
  parentRole: string,
  grant: boolean,
): Promise<{ updated: true }> =>
  unwrap(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).PATCH(`/api/connections/${id}/roles/${member}`, {
      body: { membership: { parentRole, grant } },
    }),
  ) as Promise<{
    updated: true
  }>

export const dropRole = (id: string, name: string): Promise<{ deleted: true }> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unwrap((client as any).DELETE(`/api/connections/${id}/roles/${name}`)) as Promise<{
    deleted: true
  }>

// ── Object privileges ──
export const privilegesKey = (id: string, schema: string, name: string, kind: ObjectKind) =>
  ['privileges', id, kind, schema, name] as const

export const getObjectGrants = (
  id: string,
  schema: string,
  name: string,
  kind: ObjectKind,
): Promise<Grant[]> =>
  unwrap(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).GET(`/api/connections/${id}/privileges`, {
      params: { query: { schema, name, kind } },
    }),
  ) as Promise<Grant[]>

export const setObjectPrivilege = (id: string, change: PrivilegeChange): Promise<{ ok: true }> =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  unwrap((client as any).POST(`/api/connections/${id}/privileges`, { body: change })) as Promise<{
    ok: true
  }>
