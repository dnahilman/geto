import { Elysia } from 'elysia'
import { env } from '$src/env'
import { existsSync } from 'node:fs'
import { join, normalize, resolve } from 'node:path'

/**
 * Serves the pre-built SvelteKit SPA (adapter-static, fallback `200.html`).
 *
 * In dev this is skipped when the build dir is absent — the web UI runs on its
 * own Vite dev server and talks to the API cross-origin. In prod Elysia is the
 * single origin: it serves `_app/` assets and falls back to `200.html` for any
 * client-side route so deep links work on refresh.
 */
export function staticPlugin() {
  const webDir = resolve(import.meta.dir, '..', env.GETO_WEB_DIR)
  const fallback = join(webDir, '200.html')
  const available = existsSync(fallback)

  const app = new Elysia({ name: 'static' })

  if (!available) {
    if (env.NODE_ENV === 'production') {
      console.warn(`⚠️  Web build not found at ${webDir} — UI will not be served.`)
    }
    return app
  }

  return app.get('/*', async ({ path, set }) => {
    // never let the SPA fallback swallow API routes
    if (path.startsWith('/api')) {
      set.status = 404
      return { error: 'Not found' }
    }

    // resolve the requested file safely inside webDir
    const requested = normalize(join(webDir, path))
    if (requested.startsWith(webDir)) {
      const file = Bun.file(requested)
      if (path !== '/' && (await file.exists())) {
        // Bun doesn't infer the manifest mime type; set it explicitly.
        if (path.endsWith('.webmanifest')) {
          set.headers['content-type'] = 'application/manifest+json'
        }
        return file
      }
    }

    // SPA fallback
    set.headers['cache-control'] = 'no-cache'
    return Bun.file(fallback)
  })
}
