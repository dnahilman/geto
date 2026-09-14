import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Pure SPA: emit a single fallback shell; Rust server and Tauri serve index.html for routes.
    adapter: adapter({
      fallback: 'index.html',
      precompress: false,
      strict: false,
    }),
  },
}

export default config
