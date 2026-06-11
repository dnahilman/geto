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
    // `@geto/server` is consumed as raw TypeScript; its source uses a `$src` alias,
    // so svelte-check (which follows the package into that source for types) needs to
    // resolve it too. Declaring it here makes SvelteKit add it to the generated
    // tsconfig — the idiomatic alternative to hand-editing tsconfig `paths`.
    alias: {
      $src: '../server/src',
    },
  },
}

export default config
