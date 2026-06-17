import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const { version } = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8'))

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [tailwindcss(), sveltekit()],
  server: {
    port: 5174,
    proxy: {
      // dev: proxy API calls to the Elysia server so the SPA stays same-origin
      '/api': {
        target: process.env.PUBLIC_API_URL || 'http://localhost:7020',
        changeOrigin: true,
      },
    },
  },
})
