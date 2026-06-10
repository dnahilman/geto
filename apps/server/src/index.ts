import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { env } from './env'
import { api } from './app'
import { staticPlugin } from './static'

const app = new Elysia()
  // In dev the web UI runs on a separate Vite origin; allow it. In prod the UI
  // is same-origin so CORS is effectively a no-op.
  .use(
    cors({
      origin: env.NODE_ENV === 'production' ? true : /localhost:\d+$/,
      credentials: true,
    }),
  )
  .use(api)
  .use(staticPlugin())
  .listen(env.PORT)

console.log(`🦊 geto server running at http://localhost:${env.PORT} (${env.NODE_ENV})`)

// Consumed by the web client via Eden Treaty for end-to-end type safety.
export type App = typeof app
export default app

// Shared domain types re-exported for the web client (type-only imports).
export type { Connection, ConnectionInput, SslMode } from './store/connections'
export type { ProviderId, ProviderMeta } from './providers'
export type { HistoryEntry } from './store/history'
export type {
  DatabaseInfo,
  SchemaTree,
  RelationType,
  ColumnInfo,
  IndexInfo,
  ConstraintInfo,
} from './db/drivers/postgres/introspect'
export type { ColumnMeta, QueryResult } from './db/shared/marshal'
export type { SafetyReport, StatementRisk } from './db/shared/safety'
