import { QueryClient } from '@tanstack/svelte-query'

declare global {
  interface Window {
    __TANSTACK_QUERY_CLIENT__: import('@tanstack/query-core').QueryClient
  }
}

export function createQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  })

  if (typeof window !== 'undefined') {
    window.__TANSTACK_QUERY_CLIENT__ = queryClient
  }

  return queryClient
}
