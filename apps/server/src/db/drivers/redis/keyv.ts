import type { Redis } from 'ioredis'
import type { ScanOptions, ScanResult, KeyValue, CommandResult, KeyEntry } from '$src/db/types'

/** One page of keys via SCAN, each enriched with its type + TTL. */
export async function scan(redis: Redis, opts: ScanOptions): Promise<ScanResult> {
  const match = opts.match?.trim() || '*'
  const count = opts.count && opts.count > 0 ? opts.count : 100
  const [cursor, keys] = await redis.scan(opts.cursor ?? '0', 'MATCH', match, 'COUNT', count)
  const entries: KeyEntry[] = await Promise.all(
    keys.map(async (key): Promise<KeyEntry> => {
      const [type, ttl] = await Promise.all([redis.type(key), redis.ttl(key)])
      return { key, type, ttl }
    }),
  )
  return { cursor, keys: entries }
}

/** Fetch a key's value, shaped per its Redis type. */
export async function get(redis: Redis, key: string): Promise<KeyValue> {
  const [type, ttl] = await Promise.all([redis.type(key), redis.ttl(key)])
  let value: unknown = null
  switch (type) {
    case 'string':
      value = await redis.get(key)
      break
    case 'list':
      value = await redis.lrange(key, 0, -1)
      break
    case 'set':
      value = await redis.smembers(key)
      break
    case 'hash':
      value = Object.entries(await redis.hgetall(key)) // [field, value][]
      break
    case 'zset': {
      const flat = await redis.zrange(key, 0, -1, 'WITHSCORES') // [member, score, …]
      const pairs: [string, string][] = []
      for (let i = 0; i < flat.length; i += 2) pairs.push([flat[i], flat[i + 1]])
      value = pairs
      break
    }
    case 'none':
      value = null
      break
    default:
      value = `(unsupported type: ${type})`
  }
  return { key, type, ttl, value }
}

export async function del(redis: Redis, key: string): Promise<void> {
  await redis.del(key)
}

/** Run a raw command (redis-cli style). Never throws — errors come back as a string. */
export async function command(redis: Redis, argv: string[]): Promise<CommandResult> {
  const cleaned = argv.filter((a) => a.length > 0)
  if (cleaned.length === 0) return { error: 'Empty command' }
  try {
    const [cmd, ...args] = cleaned
    const result = await redis.call(cmd, ...args)
    return { result }
  } catch (err) {
    return { error: (err as Error).message || String(err) }
  }
}
