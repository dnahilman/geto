import type { DbDriver, Capabilities } from '$src/db/driver'
import type { ProviderId } from '$src/providers'
import type { ConnectionTarget } from '$src/db/types'
import { makeRedis } from '$src/db/drivers/redis/client'
import { scan, get, del, command } from '$src/db/drivers/redis/keyv'

const REDIS_CAPABILITIES: Capabilities = {
  kind: 'keyvalue',
  hasDatabases: true, // numbered logical DBs (SELECT n)
  hasSchemas: false,
  hasFunctions: false,
  supportsDatabaseSwitch: true,
  supportsReturning: false,
  connectionShape: 'network',
}

/** Throws for every relational operation — Redis exposes `keyv` instead. The Redis
 *  frontend never calls SQL routes, so these are purely defensive. */
function unsupported(): never {
  throw new Error('Operation not supported for Redis (key-value) connections')
}

/**
 * Redis driver. Implements the key-value (`keyv`) facet of the contract and stubs
 * the relational facets. One ioredis client per connection, closed on lifecycle.
 */
export class RedisDriver implements DbDriver {
  readonly id: ProviderId = 'redis'
  readonly capabilities = REDIS_CAPABILITIES
  readonly exec: DbDriver['exec']
  readonly introspect: DbDriver['introspect']
  readonly ddl: DbDriver['ddl']
  readonly dml: DbDriver['dml']
  readonly safety: DbDriver['safety']
  readonly lifecycle: DbDriver['lifecycle']
  readonly keyv: NonNullable<DbDriver['keyv']>

  constructor(target: ConnectionTarget) {
    // Lazy: don't open a socket until the first key-value operation.
    const client = makeRedis(target, { lazyConnect: true })

    this.exec = { query: unsupported, reserve: unsupported }
    this.introspect = {
      listDatabases: unsupported,
      listSchemas: unsupported,
      getTree: unsupported,
      getColumns: unsupported,
      getIndexes: unsupported,
      getConstraints: unsupported,
      getPrimaryKey: unsupported,
      getAllColumns: unsupported,
      getFunctions: unsupported,
      getForeignKeys: unsupported,
      getTableData: unsupported,
      resolveEditableSource: unsupported,
    }
    this.ddl = { exec: unsupported, quoteIdent: unsupported, buildCreateTable: unsupported }
    this.dml = {
      buildInsert: unsupported,
      buildUpdate: unsupported,
      buildDelete: unsupported,
      inlineParams: unsupported,
    }
    this.safety = { analyze: unsupported, inspectSelect: unsupported }

    this.keyv = {
      scan: (opts) => scan(client, opts),
      get: (key) => get(client, key),
      delete: (key) => del(client, key),
      command: (argv) => command(client, argv),
    }

    this.lifecycle = {
      close: () =>
        client
          .quit()
          .then(() => {})
          .catch(() => {}),
    }
  }
}
