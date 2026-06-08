import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  resolve: {
    alias: [
      // Slim Monaco: resolve the bare `monaco-editor` import (used by us and by
      // monaco-sql-languages) to the core editor API, dropping the unused
      // TS/HTML/CSS/JSON language workers. This shrinks the bundle and, crucially,
      // keeps the build within small container memory limits. Subpath imports
      // (e.g. .../editor.worker) are left untouched.
      { find: /^monaco-editor$/, replacement: 'monaco-editor/esm/vs/editor/editor.api' },
    ],
  },
  server: {
    port: 5174,
    proxy: {
      // dev: proxy API calls to the Elysia server so the SPA stays same-origin
      '/api': {
        target: process.env.PUBLIC_API_URL || 'http://localhost:3100',
        changeOrigin: true,
      },
    },
  },
  // monaco ships large chunks; keep them out of the warning noise
  build: { chunkSizeWarningLimit: 4000 },
  worker: { format: 'es' },
})
