// The Redis provider adapter: ties this engine's concrete pieces to the neutral
// `ProviderAdapter` contract. The registry maps `redis` → this.
import type { ProviderAdapter } from '$src/db/driver'
import { RedisDriver } from '$src/db/drivers/redis/driver'
import { testConnection } from '$src/db/drivers/redis/client'
import { buildConnectionString } from '$src/db/drivers/redis/connection-string'

export const redisAdapter: ProviderAdapter = {
  createDriver: (target) => new RedisDriver(target),
  testConnection,
  buildConnectionString,
}
