import { Elysia } from 'elysia'
import pc from 'picocolors'

export interface LoggerOptions {
  /** Skip logging requests matching this predicate (e.g. static assets). */
  skip?: (req: Request, pathname: string) => boolean
}

const startTimes = new WeakMap<Request, number>()

function getTimestamp(): string {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return pc.gray(`${hh}:${mm}:${ss}`)
}

function formatMethod(method: string): string {
  const m = method.toUpperCase().padEnd(6)
  switch (method.toUpperCase()) {
    case 'GET':
      return pc.cyan(pc.bold(m))
    case 'POST':
      return pc.green(pc.bold(m))
    case 'PUT':
    case 'PATCH':
      return pc.yellow(pc.bold(m))
    case 'DELETE':
      return pc.red(pc.bold(m))
    default:
      return pc.magenta(pc.bold(m))
  }
}

function formatStatus(status: number): string {
  const s = String(status)
  if (status >= 200 && status < 300) return pc.green(pc.bold(s))
  if (status >= 300 && status < 400) return pc.cyan(pc.bold(s))
  if (status >= 400 && status < 500) return pc.yellow(pc.bold(s))
  return pc.red(pc.bold(s))
}

function formatDuration(ms: number): string {
  const str =
    ms < 1 ? `${ms.toFixed(2)}ms` : ms < 100 ? `${ms.toFixed(1)}ms` : `${Math.round(ms)}ms`
  if (ms < 50) return pc.green(str)
  if (ms < 200) return pc.yellow(str)
  return pc.red(pc.bold(str))
}

function defaultSkip(_req: Request, pathname: string): boolean {
  return (
    pathname.startsWith('/_app/') ||
    pathname.endsWith('.js') ||
    pathname.endsWith('.css') ||
    pathname.endsWith('.svg') ||
    pathname.endsWith('.ico') ||
    pathname.endsWith('.png') ||
    pathname.endsWith('.webp') ||
    pathname.endsWith('.woff2') ||
    pathname === '/favicon.ico'
  )
}

export function loggerPlugin(opts: LoggerOptions = {}) {
  const skip = opts.skip ?? defaultSkip

  return (app: Elysia) =>
    app
      .onRequest(({ request }) => {
        startTimes.set(request, performance.now())
        const url = new URL(request.url)
        if (skip(request, url.pathname)) return

        const time = getTimestamp()
        const direction = pc.blue('→ IN ')
        const method = formatMethod(request.method)
        const path = pc.white(url.pathname)
        const query = url.search ? pc.gray(url.search) : ''

        console.log(`${time} ${direction} ${method} ${path}${query}`)
      })
      .onAfterResponse(({ request, set, response }) => {
        const start = startTimes.get(request)
        const duration = start !== undefined ? performance.now() - start : 0
        const url = new URL(request.url)
        if (skip(request, url.pathname)) return

        const status =
          typeof set.status === 'number'
            ? set.status
            : response instanceof Response
              ? response.status
              : 200

        const time = getTimestamp()
        const isError = status >= 400
        const direction = isError ? pc.red('← OUT') : pc.green('← OUT')
        const method = formatMethod(request.method)
        const path = pc.white(url.pathname)
        const statusFormatted = formatStatus(status)
        const durationFormatted = formatDuration(duration)

        console.log(
          `${time} ${direction} ${method} ${path} ${statusFormatted} ${pc.gray('·')} ${durationFormatted}`,
        )
      })
      .onError(({ error, code, request }) => {
        const url = new URL(request.url)
        if (skip(request, url.pathname)) return

        const errMessage = error instanceof Error ? error.message : String(error)
        console.error(`  ${pc.red('↳')} ${pc.red(pc.bold(code))} ${pc.red(errMessage)}`)
      })
}
