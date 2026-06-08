import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Pure SPA: emit a single fallback shell; Elysia serves it for every route.
    adapter: adapter({
      fallback: '200.html',
      precompress: false,
      strict: false,
    }),
    alias: {
      // type-only import of the Elysia app for Eden Treaty
      '@geto/server': '../server/src/index.ts',
    },
  },
}

export default config
