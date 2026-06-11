import { Elysia, t } from 'elysia'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '$src/env'

const COOKIE = 'geto_session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 days

// Single-user gate: one valid session token signed with the master key. Holding
// this value in an httpOnly cookie proves the password was entered.
const SESSION_TOKEN = createHmac('sha256', env.GETO_MASTER_KEY)
  .update('geto-session-v1')
  .digest('hex')

function validToken(token: unknown): boolean {
  if (typeof token !== 'string' || token.length !== SESSION_TOKEN.length) return false
  return timingSafeEqual(Buffer.from(token), Buffer.from(SESSION_TOKEN))
}

function validPassword(pw: string): boolean {
  const a = Buffer.from(pw)
  const b = Buffer.from(env.GETO_AUTH_PASSWORD)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Public auth endpoints: login / logout / me. */
export const authController = new Elysia({ prefix: '/auth' })
  .post(
    '/login',
    ({ body, cookie, status }) => {
      if (!validPassword(body.password)) return status(401, { error: 'Invalid password' })
      cookie[COOKIE].set({
        value: SESSION_TOKEN,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: MAX_AGE,
        // Not `Secure`: geto is commonly self-hosted over plain HTTP (LAN /
        // Tailscale). A Secure cookie would be silently dropped there. The
        // cookie stays httpOnly + SameSite=Lax. Put a TLS proxy in front for
        // public deployments.
        secure: false,
      })
      return { authenticated: true as const }
    },
    { body: t.Object({ password: t.String() }) },
  )
  .post('/logout', ({ cookie }) => {
    cookie[COOKIE].remove()
    return { authenticated: false as const }
  })
  .get('/me', ({ cookie }) => ({ authenticated: validToken(cookie[COOKIE]?.value) }))

/**
 * Guard plugin. `.use(requireAuth)` in a route group rejects requests without a
 * valid session cookie. Scoped so the hook applies to the consuming instance.
 */
export const requireAuth = new Elysia({ name: 'require-auth' }).onBeforeHandle(
  { as: 'scoped' },
  ({ cookie, status }) => {
    if (!validToken(cookie[COOKIE]?.value)) return status(401, { error: 'Unauthorized' })
  },
)
