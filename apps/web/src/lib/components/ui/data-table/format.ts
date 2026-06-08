/** Render a raw cell value the way geto's grids always have. */
export function formatCell(v: unknown): { text: string; muted: boolean } {
  if (v === null || v === undefined) return { text: 'NULL', muted: true }
  if (typeof v === 'object') return { text: JSON.stringify(v), muted: false }
  return { text: String(v), muted: false }
}

/**
 * Column id encoding. SQL results can have duplicate column names
 * (`SELECT a.id, b.id`), so the positional index is baked into the id to keep it
 * unique and to map a sort id back to the underlying column name.
 */
export function colId(index: number, name: string): string {
  return `${index}:${name}`
}

export function parseColId(id: string): { index: number; name: string } {
  const sep = id.indexOf(':')
  return { index: Number(id.slice(0, sep)), name: id.slice(sep + 1) }
}
