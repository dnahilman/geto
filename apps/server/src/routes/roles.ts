import { Elysia, t } from 'elysia'
import { requireAuth } from '$src/auth/gate'
import { getConnection } from '$src/store/connections'
import { getDriver } from '$src/db/registry'
import { pgErrorMessage } from '$src/db/shared/error'

const roleAttributes = {
  canLogin: t.Optional(t.Boolean()),
  isSuperuser: t.Optional(t.Boolean()),
  canCreateDb: t.Optional(t.Boolean()),
  canCreateRole: t.Optional(t.Boolean()),
  isReplication: t.Optional(t.Boolean()),
  bypassRls: t.Optional(t.Boolean()),
  connectionLimit: t.Optional(t.Nullable(t.Integer({ minimum: -1 }))),
  validUntil: t.Optional(t.Nullable(t.String())),
  password: t.Optional(t.Nullable(t.String())),
}

const objKind = t.Union([t.Literal('table'), t.Literal('schema')])

export const rolesRoutes = new Elysia({ prefix: '/connections' })
  .use(requireAuth)
  .resolve(async ({ params, status }) => {
    const id = (params as { id?: string }).id
    if (!id || !getConnection(id)) return status(404, { error: 'Connection not found' })
    const driver = await getDriver(id)
    if (!driver.admin) return status(501, { error: 'Role management not supported' })
    return { admin: driver.admin }
  })

  // ── Roles ──
  .get('/:id/roles', async ({ admin, status }) => {
    try {
      return await admin.listRoles()
    } catch (e) {
      return status(400, { error: pgErrorMessage(e) })
    }
  })
  .post(
    '/:id/roles',
    async ({ admin, body, status }) => {
      try {
        await admin.createRole(body)
        return { created: true as const }
      } catch (e) {
        return status(400, { error: pgErrorMessage(e) })
      }
    },
    { body: t.Object({ name: t.String({ minLength: 1 }), ...roleAttributes }) },
  )
  .patch(
    '/:id/roles/:name',
    async ({ admin, params, body, status }) => {
      try {
        if (body.membership) {
          await admin.setMembership(body.membership.parentRole, params.name, body.membership.grant)
        }
        if (body.attributes) {
          await admin.alterRole(params.name, body.attributes)
        }
        return { updated: true as const }
      } catch (e) {
        return status(400, { error: pgErrorMessage(e) })
      }
    },
    {
      body: t.Object({
        attributes: t.Optional(t.Object(roleAttributes)),
        membership: t.Optional(
          t.Object({ parentRole: t.String({ minLength: 1 }), grant: t.Boolean() }),
        ),
      }),
    },
  )
  .delete('/:id/roles/:name', async ({ admin, params, status }) => {
    try {
      await admin.dropRole(params.name)
      return { deleted: true as const }
    } catch (e) {
      return status(400, { error: pgErrorMessage(e) })
    }
  })

  // ── Object privileges ──
  .get(
    '/:id/privileges',
    async ({ admin, query, status }) => {
      try {
        return await admin.getObjectGrants(query.schema, query.name ?? '', query.kind)
      } catch (e) {
        return status(400, { error: pgErrorMessage(e) })
      }
    },
    { query: t.Object({ schema: t.String(), name: t.Optional(t.String()), kind: objKind }) },
  )
  .post(
    '/:id/privileges',
    async ({ admin, body, status }) => {
      try {
        await admin.setObjectPrivilege(body)
        return { ok: true as const }
      } catch (e) {
        return status(400, { error: pgErrorMessage(e) })
      }
    },
    {
      body: t.Object({
        kind: objKind,
        schema: t.String({ minLength: 1 }),
        name: t.String(),
        role: t.String({ minLength: 1 }),
        privileges: t.Array(t.String()),
        grant: t.Boolean(),
        withGrantOption: t.Optional(t.Boolean()),
      }),
    },
  )
