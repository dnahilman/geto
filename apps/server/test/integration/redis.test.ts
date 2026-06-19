import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Redis } from 'ioredis'
import { RedisDriver } from '$src/db/drivers/redis/driver'
import { testConnection } from '$src/db/drivers/redis/client'
import type { ConnectionTarget } from '$src/db/types'

// Runs only when TEST_REDIS_URL is set (e.g. redis://:diosone@host:6380/0);
// otherwise skipped so the pure unit tests still run without a server.
const URL = process.env.TEST_REDIS_URL
const suite = URL ? describe : describe.skip

function urlToTarget(raw: string): ConnectionTarget {
  const u = new globalThis.URL(raw)
  return {
    host: decodeURIComponent(u.hostname),
    port: u.port ? Number(u.port) : 6379,
    database: u.pathname.replace(/^\//, '') || '0',
    username: decodeURIComponent(u.username) || '',
    password: u.password ? decodeURIComponent(u.password) : null,
    sslMode: u.protocol === 'rediss:' ? 'require' : 'disable',
  }
}

suite('integration: real Redis', () => {
  let target: ConnectionTarget
  let driver: RedisDriver
  let raw: Redis

  beforeAll(async () => {
    target = urlToTarget(URL as string)
    driver = new RedisDriver(target)
    raw = new Redis(URL as string)
    await raw.flushdb()
  })

  afterAll(async () => {
    await raw.flushdb().catch(() => {})
    raw.disconnect()
    await driver.lifecycle.close()
  })

  test('testConnection returns a version + latency', async () => {
    const r = await testConnection(target)
    expect(r.error).toBeUndefined()
    expect(r.version).toMatch(/Redis/)
    expect(typeof r.latencyMs).toBe('number')
  })

  test('command runs raw argv (SET then GET)', async () => {
    expect(await driver.keyv.command(['SET', 'geto:s', 'hello'])).toEqual({ result: 'OK' })
    expect(await driver.keyv.command(['GET', 'geto:s'])).toEqual({ result: 'hello' })
  })

  test('command surfaces errors as a string, never throws', async () => {
    const r = await driver.keyv.command(['NOTACMD'])
    expect(r.result).toBeUndefined()
    expect(typeof r.error).toBe('string')
  })

  test('get dispatches by type (string/hash/list/set/zset)', async () => {
    await raw.hset('geto:h', 'a', '1', 'b', '2')
    await raw.rpush('geto:l', 'x', 'y')
    await raw.sadd('geto:set', 'm')
    await raw.zadd('geto:z', 1, 'one')

    expect((await driver.keyv.get('geto:s')).value).toBe('hello')
    expect((await driver.keyv.get('geto:h')).value).toEqual([
      ['a', '1'],
      ['b', '2'],
    ])
    expect((await driver.keyv.get('geto:l')).value).toEqual(['x', 'y'])
    expect((await driver.keyv.get('geto:set')).value).toEqual(['m'])
    expect((await driver.keyv.get('geto:z')).value).toEqual([['one', '1']])
  })

  test('scan returns keys with type + ttl, and delete removes a key', async () => {
    const seen = new Set<string>()
    let cursor = '0'
    do {
      const page = await driver.keyv.scan({ match: 'geto:*', cursor, count: 100 })
      page.keys.forEach((k) => seen.add(k.key))
      cursor = page.cursor
    } while (cursor !== '0')
    expect(seen.has('geto:s')).toBe(true)
    expect(seen.has('geto:h')).toBe(true)

    await driver.keyv.delete('geto:s')
    expect((await driver.keyv.get('geto:s')).type).toBe('none')
  })
})
