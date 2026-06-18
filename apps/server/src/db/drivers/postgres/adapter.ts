// The PostgreSQL provider adapter: the single object that ties this engine's
// concrete pieces (driver, connectivity test, connection-string builder) to the
// neutral `ProviderAdapter` contract. The registry maps `postgresql` → this.
import type { ProviderAdapter } from '$src/db/driver'
import { PostgresDriver } from '$src/db/drivers/postgres/driver'
import { testConnection } from '$src/db/drivers/postgres/pool'
import { buildConnectionString } from '$src/db/drivers/postgres/connection-string'

export const postgresAdapter: ProviderAdapter = {
  createDriver: (target) => new PostgresDriver(target),
  testConnection,
  buildConnectionString,
}
