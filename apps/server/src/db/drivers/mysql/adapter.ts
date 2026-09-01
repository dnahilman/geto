import type { ProviderAdapter } from '$src/db/driver'
import { MysqlDriver } from '$src/db/drivers/mysql/driver'
import { testConnection } from '$src/db/drivers/mysql/pool'
import { buildConnectionString } from '$src/db/drivers/mysql/connection-string'

export const mysqlAdapter: ProviderAdapter = {
  createDriver: (target) => new MysqlDriver(target),
  testConnection,
  buildConnectionString,
}
