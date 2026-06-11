import {
  createTable,
  type RowData,
  type TableOptions,
  type TableOptionsResolved,
  type TableState,
} from '@tanstack/table-core'

// Carry the Postgres type label + positional index on each column so headers can
// show the type and cells can map back to the raw `unknown[][]` row.
declare module '@tanstack/table-core' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    typeName?: string
    colIndex?: number
  }
}

type MaybeThunk<T extends Record<string, unknown>> = T | (() => T | null | undefined)

function unthunk<T extends Record<string, unknown>>(value: MaybeThunk<T>): T {
  return typeof value === 'function' ? ((value() ?? {}) as T) : value
}

/**
 * Lazily merge several objects (or thunks) while preserving getters, so that
 * reactive `get data()` / `get sorting()` accessors stay live when TanStack reads
 * them. Later sources win. Mirrors shadcn-svelte's `mergeObjects`.
 */
export function mergeObjects<T extends Record<string, unknown>>(...sources: MaybeThunk<T>[]): T {
  const handler: ProxyHandler<T> = {
    get(_, prop: string | symbol) {
      for (let i = sources.length - 1; i >= 0; i--) {
        const source = unthunk(sources[i]!)
        if (prop in source) return source[prop as keyof T]
      }
      return undefined
    },
    has(_, prop: string | symbol) {
      for (let i = sources.length - 1; i >= 0; i--) {
        if (prop in unthunk(sources[i]!)) return true
      }
      return false
    },
    ownKeys() {
      const keys = new Set<string | symbol>()
      for (const s of sources) {
        for (const key in unthunk(s)) keys.add(key)
      }
      return Array.from(keys)
    },
    getOwnPropertyDescriptor(_, prop: string | symbol) {
      for (let i = sources.length - 1; i >= 0; i--) {
        const source = unthunk(sources[i]!)
        if (prop in source) {
          return {
            configurable: true,
            enumerable: true,
            value: source[prop as keyof T],
            writable: true,
          }
        }
      }
      return undefined
    },
  }
  return new Proxy({} as T, handler)
}

/**
 * Reactive TanStack table for Svelte 5. Pass `options` built with getters
 * (`get data()`, `state: { get sorting() {} }`) so that the table re-reads them
 * whenever the underlying runes change. The instance is reused; only its options
 * are re-pushed, keeping TanStack's row-model memoization valid.
 */
export function createSvelteTable<TData extends RowData>(options: TableOptions<TData>) {
  const resolvedOptions: TableOptionsResolved<TData> = mergeObjects(
    {
      state: {},
      onStateChange() {},
      renderFallbackValue: null,
      mergeOptions: (defaultOptions: TableOptions<TData>, opts: Partial<TableOptions<TData>>) =>
        mergeObjects(defaultOptions, opts),
    } as unknown as Record<string, unknown>,
    options as unknown as Record<string, unknown>,
  ) as unknown as TableOptionsResolved<TData>

  const table = createTable(resolvedOptions)
  let state = $state<Partial<TableState>>(table.initialState)

  function updateOptions() {
    table.setOptions(
      (prev) =>
        mergeObjects(
          prev as unknown as Record<string, unknown>,
          options as unknown as Record<string, unknown>,
          {
            state: mergeObjects(
              state as Record<string, unknown>,
              (options.state ?? {}) as Record<string, unknown>,
            ),
            onStateChange: (updater: unknown) => {
              if (updater instanceof Function) state = updater(state)
              else
                state = mergeObjects(
                  state as Record<string, unknown>,
                  updater as Record<string, unknown>,
                )
              options.onStateChange?.(updater as never)
            },
          },
        ) as never,
    )
  }

  updateOptions()

  $effect.pre(() => {
    updateOptions()
  })

  return table
}
