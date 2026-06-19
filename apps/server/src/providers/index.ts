// Database provider registry. Only PostgreSQL is implemented today, but the
// connection model, API, and UI are all driven by this registry so adding a new
// engine later is mostly: add an entry here + a driver, and the UI picks it up.

export type ProviderId = 'postgresql' | 'redis'

/** How a provider's data is shaped — drives which workspace the frontend renders. */
export type ProviderKind = 'relational' | 'keyvalue'

export interface ProviderMeta {
  id: ProviderId
  label: string
  kind: ProviderKind
  defaultPort: number
  /** URL schemes recognized when pasting a connection string. */
  urlSchemes: string[]
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  postgresql: {
    id: 'postgresql',
    label: 'PostgreSQL',
    kind: 'relational',
    defaultPort: 5432,
    urlSchemes: ['postgres', 'postgresql'],
  },
  redis: {
    id: 'redis',
    label: 'Redis',
    kind: 'keyvalue',
    defaultPort: 6379,
    urlSchemes: ['redis', 'rediss'],
  },
}

export const PROVIDER_LIST: ProviderMeta[] = Object.values(PROVIDERS)
export const DEFAULT_PROVIDER: ProviderId = 'postgresql'

export function isProviderId(x: unknown): x is ProviderId {
  return typeof x === 'string' && x in PROVIDERS
}
