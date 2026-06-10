// Per-connection driver registry. Replaces the old pg/pool getPool: it lazily
// constructs the right DbDriver for a saved connection (dispatched by provider),
// caches it by connection id, and sweeps idle drivers. The only place that knows
// which concrete driver a provider maps to.
import { getConnectionSecret } from '../store/connections'
import type { DbDriver } from './driver'
import { PostgresDriver } from './drivers/postgres/driver'

type Secret = NonNullable<ReturnType<typeof getConnectionSecret>>

interface Cached {
  driver: DbDriver
  lastUsed: number
}

const drivers = new Map<string, Cached>()
const MAX_IDLE_MS = 5 * 60_000

function createDriver(secret: Secret): DbDriver {
  switch (secret.provider) {
    case 'postgresql':
    default:
      return new PostgresDriver(secret)
  }
}

/** Lazily open (or reuse) the driver for a saved connection, dispatched by provider. */
export function getDriver(connectionId: string): DbDriver {
  const existing = drivers.get(connectionId)
  if (existing) {
    existing.lastUsed = Date.now()
    return existing.driver
  }
  const secret = getConnectionSecret(connectionId)
  if (!secret) throw new Error('Connection not found')
  const driver = createDriver(secret)
  drivers.set(connectionId, { driver, lastUsed: Date.now() })
  return driver
}

/** Close and drop a driver (call on connection update/delete). */
export async function closeDriver(connectionId: string): Promise<void> {
  const c = drivers.get(connectionId)
  if (!c) return
  drivers.delete(connectionId)
  await c.driver.lifecycle.close().catch(() => {})
}

/** Evict drivers idle longer than MAX_IDLE_MS. */
export function sweepIdleDrivers(): void {
  const now = Date.now()
  for (const [id, c] of drivers) {
    if (now - c.lastUsed > MAX_IDLE_MS) {
      drivers.delete(id)
      void c.driver.lifecycle.close().catch(() => {})
    }
  }
}

setInterval(sweepIdleDrivers, 60_000).unref?.()
