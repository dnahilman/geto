/**
 * MongoDB MQL / JSON query formatter stub (scheduled for future update).
 */
export function formatMongoQuery(query: string): string {
  if (!query || !query.trim()) return query
  try {
    const parsed = JSON.parse(query)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return query
  }
}
