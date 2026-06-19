import { Redis } from 'ioredis'
import type { ConnectionTarget, TestResult } from '$src/db/types'

/** Create an ioredis client for a connection target. TLS is enabled whenever the
 *  ssl mode is anything other than 'disable' (the form uses 'disable' | 'require'). */
export function makeRedis(target: ConnectionTarget, opts?: { lazyConnect?: boolean }): Redis {
  const client = new Redis({
    host: target.host,
    port: target.port,
    username: target.username || undefined,
    password: target.password || undefined,
    db: Number(target.database) || 0,
    tls: target.sslMode !== 'disable' ? {} : undefined,
    connectTimeout: 10_000,
    maxRetriesPerRequest: 2,
    lazyConnect: opts?.lazyConnect ?? false,
  })
  // Swallow background socket errors; real failures surface as command rejections.
  client.on('error', () => {})
  return client
}

/** One-shot connectivity test for a (possibly unsaved) Redis connection. */
export async function testConnection(target: ConnectionTarget): Promise<TestResult> {
  const client = makeRedis(target, { lazyConnect: true })
  const started = Date.now()
  try {
    await client.connect()
    await client.ping()
    const info = await client.info('server')
    const version = /redis_version:(.+)/.exec(info)?.[1]?.trim()
    return { version: version ? `Redis ${version}` : 'Redis', latencyMs: Date.now() - started }
  } catch (err) {
    return { error: (err as Error).message || String(err) }
  } finally {
    client.disconnect()
  }
}
