// Shared JSON helpers: HTML-escaping + syntax highlighting (used by the JSON
// document view and the cell detail dialog), plus JSON-ish value detection.

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Wrap JSON tokens in Tailwind-colored spans. Input MUST be HTML-escaped first
 *  so values can never inject markup (only our own <span> tags are added). */
export function highlightJson(json: string): string {
  return json.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (m) => {
      let cls = 'text-amber-600 dark:text-amber-400' // number
      if (/^"/.test(m)) {
        cls = /:$/.test(m.trimEnd())
          ? 'text-sky-700 dark:text-sky-300' // key
          : 'text-emerald-700 dark:text-emerald-400' // string
      } else if (/true|false/.test(m)) {
        cls = 'text-purple-600 dark:text-purple-400' // boolean
      } else if (/null/.test(m)) {
        cls = 'text-muted-foreground' // null
      }
      return `<span class="${cls}">${m}</span>`
    },
  )
}

/** Highlighted HTML for a single value, compact (one line). */
export function valueHtml(v: unknown): string {
  return highlightJson(escapeHtml(JSON.stringify(v ?? null)))
}

/** Highlighted HTML for a value, pretty-printed (multi-line, 2-space indent). */
export function prettyHtml(v: unknown): string {
  return highlightJson(escapeHtml(JSON.stringify(v ?? null, null, 2)))
}

/**
 * Whether a cell value is worth opening in a JSON detail modal — an object/array,
 * or a string that parses to one. Returns the parsed value (so callers don't
 * re-parse), or null when it isn't JSON-ish.
 */
export function asJsonObject(v: unknown): object | null {
  if (v !== null && typeof v === 'object') return v
  if (typeof v === 'string') {
    const t = v.trim()
    if (t.startsWith('{') || t.startsWith('[')) {
      try {
        const parsed = JSON.parse(t)
        if (parsed !== null && typeof parsed === 'object') return parsed
      } catch {
        /* not JSON */
      }
    }
  }
  return null
}
