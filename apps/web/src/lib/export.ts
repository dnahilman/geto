// Client-side export of grid data to CSV / JSON / Markdown. Pure functions only —
// `collectRows` reads the live grid api (selection + loaded page + pending edits);
// the serializers and `downloadFile` are side-effect-free except for the actual
// browser download. Shared with the grid's TSV copy via `collectRows`.
import type { DataGridApi } from '$lib/components/ui/data-grid/data-grid-context'

/**
 * Resolve the rows to export/copy: the selected rows (ascending) if any are
 * selected, otherwise every row currently loaded in the grid (the active page).
 * Cell values prefer a pending (unsaved) edit, falling back to the loaded value.
 * Draft rows never appear here — they are not in the table's row model and are
 * excluded from selection. Rows toggled for deletion are still visible
 * (struck-through) and are intentionally included, matching the grid's TSV copy.
 */
export function collectRows<RowT>(api: DataGridApi<RowT>): { columns: string[]; rows: unknown[][] } {
  const cols = api.ctx.columns
  const columns = cols.map((c) => c.name)
  const model = api.table.getRowModel().rows
  const selected = Object.keys(api.ctx.selectedRows)
    .map(Number)
    .sort((a, b) => a - b)
  const picked = selected.length
    ? selected
        .map((idx) => model.find((r) => r.index === idx))
        .filter((r): r is NonNullable<typeof r> => !!r)
    : model
  const rows = picked.map((r) => {
    const orig = r.original as unknown[]
    return cols.map((_col, c) => api.ctx.cellPending(r.index, c) ?? orig[c])
  })
  return { columns, rows }
}

/** Stringify a raw cell value for text formats: null/undefined → '', object → JSON. */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** RFC-4180-ish CSV with a header row and a UTF-8 BOM (so Excel reads UTF-8). */
export function toCSV(columns: string[], rows: unknown[][]): string {
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const line = (cells: string[]) => cells.map(esc).join(',')
  const out = [line(columns), ...rows.map((r) => line(r.map(cellText)))]
  return '\uFEFF' + out.join('\r\n')
}

/** Array of objects keyed by column name; values keep their type (null stays null). */
export function toJSON(columns: string[], rows: unknown[][]): string {
  const objs = rows.map((r) => {
    const o: Record<string, unknown> = {}
    columns.forEach((name, i) => {
      o[name] = r[i] ?? null
    })
    return o
  })
  return JSON.stringify(objs, null, 2)
}

/** GitHub-flavored Markdown table; escapes pipes and flattens newlines. */
export function toMarkdown(columns: string[], rows: unknown[][]): string {
  const cell = (v: unknown) => cellText(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
  const head = `| ${columns.map((c) => cell(c)).join(' | ')} |`
  const sep = `| ${columns.map(() => '---').join(' | ')} |`
  const body = rows.map((r) => `| ${r.map(cell).join(' | ')} |`)
  return [head, sep, ...body].join('\n')
}

/** Trigger a browser download of `content`. Works over plain HTTP (no secure context). */
export function downloadFile(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** `YYYYMMDD-HHmmss` stamp for unique filenames. */
export function timestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  )
}
