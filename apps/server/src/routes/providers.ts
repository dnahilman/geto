import { Elysia } from 'elysia'
import { requireAuth } from '$src/auth/gate'
import { PROVIDER_LIST } from '$src/providers'

// Lists the database engines geto supports. The web client renders the
// provider picker from this, so adding an engine to the registry surfaces it.
export const providersRoutes = new Elysia().use(requireAuth).get('/providers', () => PROVIDER_LIST)
