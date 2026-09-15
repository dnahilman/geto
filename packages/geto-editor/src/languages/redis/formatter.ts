/**
 * Redis command formatter stub.
 * Capitalizes leading Redis command verbs on each line.
 */
export function formatRedisCommands(text: string): string {
  if (!text || !text.trim()) return text

  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return line
      const firstSpace = trimmed.indexOf(' ')
      if (firstSpace === -1) return trimmed.toUpperCase()
      const verb = trimmed.slice(0, firstSpace).toUpperCase()
      const args = trimmed.slice(firstSpace)
      return verb + args
    })
    .join('\n')
}
