import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
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
