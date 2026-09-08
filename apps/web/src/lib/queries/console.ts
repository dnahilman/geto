import { queryOptions } from '@tanstack/svelte-query'
import { getCompletion, getHistory, completionKey, historyKey } from '$lib/api/query'

export const consoleQueries = {
  completion: (connId: string) =>
    queryOptions({
      queryKey: completionKey(connId),
      queryFn: () => getCompletion(connId),
      staleTime: 15 * 60_000,
      gcTime: 30 * 60_000,
    }),
  history: (connId: string) =>
    queryOptions({
      queryKey: historyKey(connId),
      queryFn: () => getHistory(connId),
    }),
}
