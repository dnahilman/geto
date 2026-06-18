// Provider → adapter registry. The one composition root (besides the registry's
// driver cache) that names a concrete engine. Adding a database = implement a
// `ProviderAdapter` + `DbDriver` and add one entry here; nothing else changes.
import type { ProviderId } from '$src/providers'
import type { ProviderAdapter } from '$src/db/driver'
import { postgresAdapter } from '$src/db/drivers/postgres/adapter'

const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  postgresql: postgresAdapter,
}

export function getAdapter(provider: ProviderId): ProviderAdapter {
  const adapter = ADAPTERS[provider]
  if (!adapter) throw new Error(`Unsupported provider: ${provider}`)
  return adapter
}
