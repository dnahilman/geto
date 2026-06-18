import net from 'node:net'
import { Client, type ClientChannel, type ConnectConfig } from 'ssh2'
import type { SshSecret } from '$src/store/connections'

export interface SshTunnelOptions extends SshSecret {
  /** The DB endpoint as reachable *from the SSH server* (e.g. localhost:5432). */
  target: { host: string; port: number }
}

export interface SshTunnel {
  /** Loopback port on this host that forwards to target through the SSH server. */
  localPort: number
  close(): Promise<void>
}

/**
 * Open an SSH tunnel: connect to the SSH server, then run a local TCP forwarder
 * on an ephemeral 127.0.0.1 port. Each inbound connection is bridged to a
 * `forwardOut` channel to `target`.
 *
 * Bun note: the accepted socket's `data` handler is attached *synchronously* and
 * outbound bytes are buffered until the (async) forwardOut channel is ready —
 * `sock.pipe(stream)` inside the async callback loses the client's first bytes
 * under Bun, which manifests as a connect timeout.
 */
export function openTunnel(opts: SshTunnelOptions): Promise<SshTunnel> {
  return new Promise((resolve, reject) => {
    const client = new Client()
    let settled = false

    const fail = (err: Error) => {
      if (settled) return
      settled = true
      client.end()
      reject(new Error(`SSH tunnel failed: ${err.message}`))
    }

    client.on('error', fail)

    client.on('ready', () => {
      const server = net.createServer((sock) => {
        let stream: ClientChannel | null = null
        const outbuf: Buffer[] = []
        let closed = false

        sock.on('data', (d: Buffer) => (stream ? stream.write(d) : outbuf.push(d)))
        sock.on('error', () => stream?.destroy())
        sock.on('close', () => {
          closed = true
          stream?.end()
        })

        client.forwardOut('127.0.0.1', 0, opts.target.host, opts.target.port, (err, s) => {
          if (err) {
            sock.destroy()
            return
          }
          if (closed) {
            s.destroy()
            return
          }
          stream = s
          for (const d of outbuf) s.write(d)
          outbuf.length = 0
          s.on('data', (d: Buffer) => sock.write(d))
          s.on('error', () => sock.destroy())
          s.on('close', () => sock.end())
        })
      })

      server.on('error', fail)
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        const localPort = typeof addr === 'object' && addr ? addr.port : 0
        if (!localPort) return fail(new Error('could not bind local forwarder port'))
        settled = true
        resolve({
          localPort,
          close: () =>
            new Promise<void>((res) => {
              server.close(() => {
                client.end()
                res()
              })
            }),
        })
      })
    })

    const cfg: ConnectConfig = {
      host: opts.host,
      port: opts.port,
      username: opts.username,
      readyTimeout: 15_000,
    }
    if (opts.authMethod === 'key') {
      if (!opts.privateKey) return fail(new Error('SSH private key is required'))
      cfg.privateKey = opts.privateKey
      if (opts.passphrase) cfg.passphrase = opts.passphrase
    } else {
      if (!opts.password) return fail(new Error('SSH password is required'))
      cfg.password = opts.password
    }

    try {
      client.connect(cfg)
    } catch (e) {
      fail(e as Error)
    }
  })
}

/** Open a tunnel, run `fn` with the local port, and always close the tunnel. */
export async function withTunnel<T>(
  opts: SshTunnelOptions,
  fn: (localPort: number) => Promise<T>,
): Promise<T> {
  const tunnel = await openTunnel(opts)
  try {
    return await fn(tunnel.localPort)
  } finally {
    await tunnel.close()
  }
}
