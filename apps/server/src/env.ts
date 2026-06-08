import { z } from 'zod'

const schema = z.object({
  PORT: z.coerce.number().default(7020),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  GETO_AUTH_PASSWORD: z.string().min(1, 'GETO_AUTH_PASSWORD is required'),
  // Optional. Derives the at-rest encryption key (saved DB passwords) and signs
  // the session cookie. A stable baked-in default is used when unset so geto
  // works out of the box; set your own for real security (and keep it stable —
  // changing it makes previously-saved passwords undecryptable).
  GETO_MASTER_KEY: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().min(1).default('geto-default-master-key-3f9a1c7e5b2d48a0d6e1'),
  ),
  GETO_DATA_DIR: z.string().default('./data'),
  // Absolute or relative path to the built web UI. Empty in dev (web runs on its own vite server).
  GETO_WEB_DIR: z.string().default('../web/build'),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('❌ Invalid environment configuration:')
  for (const issue of parsed.error.issues) {
    console.error(`   - ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

export const env = parsed.data
export type Env = typeof env
