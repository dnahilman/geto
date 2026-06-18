// Per-connection driver registry. Replaces the old pg/pool getPool: it lazily
// constructs the right DbDriver for a saved connection (dispatched by provider),
// caches it by connection id, and sweeps idle drivers. The only place that knows
// which concrete driver a provider maps to.
import { getConnectionSecret } from '$src/store/connections'
import type { DbDriver } from '$src/db/driver'
import { getAdapter } from '$src/db/adapters'
import { openTunnel, type SshTunnel } from '$src/db/ssh/tunnel'

type Secret = NonNullable<ReturnType<typeof getConnectionSecret>>

interface Cached {
  driver: DbDriver
  tunnel?: SshTunnel
  lastUsed: number
}

const drivers = new Map<string, Cached>()
// In-flight creations, so concurrent getDriver calls share one async build.
const pending = new Map<string, Promise<Cached>>()
const MAX_IDLE_MS = 5 * 60_000

async function createCached(secret: Secret): Promise<Cached> {
  const adapter = getAdapter(secret.provider)
  // SSH off (default): construct the driver against the original host/port —
  // identical to a direct connection, no tunnel involved.
  if (!secret.sshSecret) {
    return { driver: adapter.createDriver(secret), lastUsed: Date.now() }
  }
  // SSH on: open the tunnel first, then point the driver at the local forwarder.
  const tunnel = await openTunnel({
    ...secret.sshSecret,
    target: { host: secret.host, port: secret.port },
  })
  try {
    const driver = adapter.createDriver({ ...secret, host: '127.0.0.1', port: tunnel.localPort })
    return { driver, tunnel, lastUsed: Date.now() }
  } catch (e) {
    await tunnel.close().catch(() => {})
    throw e
  }
}

/** Lazily open (or reuse) the driver for a saved connection, dispatched by provider. */
export async function getDriver(connectionId: string): Promise<DbDriver> {
  const existing = drivers.get(connectionId)
  if (existing) {
    existing.lastUsed = Date.now()
    return existing.driver
  }
  const inFlight = pending.get(connectionId)
  if (inFlight) return (await inFlight).driver

  const secret = getConnectionSecret(connectionId)
  if (!secret) throw new Error('Connection not found')

  const build = createCached(secret)
  pending.set(connectionId, build)
  try {
    const cached = await build
    drivers.set(connectionId, cached)
    return cached.driver
  } finally {
    pending.delete(connectionId)
  }
}

/** Close and drop a driver (call on connection update/delete). */
export async function closeDriver(connectionId: string): Promise<void> {
  const c = drivers.get(connectionId)
  if (!c) return
  drivers.delete(connectionId)
  await c.driver.lifecycle.close().catch(() => {})
  await c.tunnel?.close().catch(() => {})
}

/** Evict drivers idle longer than MAX_IDLE_MS. */
export function sweepIdleDrivers(): void {
  const now = Date.now()
  for (const [id, c] of drivers) {
    if (now - c.lastUsed > MAX_IDLE_MS) {
      drivers.delete(id)
      void c.driver.lifecycle.close().catch(() => {})
      void c.tunnel?.close().catch(() => {})
    }
  }
}

setInterval(sweepIdleDrivers, 60_000).unref?.()
