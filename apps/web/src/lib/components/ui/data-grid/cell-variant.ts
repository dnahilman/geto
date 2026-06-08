import { CalendarDate, parseDate } from '@internationalized/date'

/** Which inline editor a column gets, derived from its Postgres type. */
export type CellVariant = 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'enum' | 'json'

/**
 * Map a column to an editor variant. `enumValues` (from the backend `pg_enum`
 * lookup) is the only reliable enum signal; otherwise the `format_type` string
 * is matched. `date` → calendar, `timestamp`/`timestamptz` → date+time picker,
 * `time`/`interval` stay as plain text (out of scope).
 */
export function variantFor(col: { type: string; enumValues: string[] | null }): CellVariant {
  if (col.enumValues && col.enumValues.length > 0) return 'enum'
  const t = col.type.toLowerCase()
  if (t === 'boolean') return 'boolean'
  if (t === 'date') return 'date'
  if (t.startsWith('timestamp')) return 'datetime'
  if (t.startsWith('time') || t.startsWith('interval')) return 'text'
  if (/json/.test(t)) return 'json'
  if (/int|serial|numeric|decimal|real|double|float|money/.test(t)) return 'number'
  return 'text'
}

/** Parse a marshalled cell value (ISO string or 'YYYY-MM-DD') into a CalendarDate. */
export function toCalendarDate(value: unknown): CalendarDate | undefined {
  if (value == null) return undefined
  const s = String(value).slice(0, 10)
  try {
    const d = parseDate(s)
    return new CalendarDate(d.year, d.month, d.day)
  } catch {
    return undefined
  }
}

/**
 * Split a marshalled timestamp value into a CalendarDate + 'HH:MM' time. The
 * wall-clock parts are read straight from the string (UTC for `...Z` ISO), so
 * editing is deterministic and round-trips losslessly.
 */
export function toDateTimeParts(value: unknown): { date: CalendarDate | undefined; time: string } {
  if (value == null) return { date: undefined, time: '' }
  const s = String(value)
  const date = toCalendarDate(s)
  const m = s.match(/[T ](\d{2}):(\d{2})/)
  return { date, time: m ? `${m[1]}:${m[2]}` : '' }
}

/** Serialize a CalendarDate to 'YYYY-MM-DD' for a Postgres `date` column. */
export function serializeDate(date: CalendarDate | undefined): string {
  return date ? date.toString() : ''
}

/**
 * Serialize date + 'HH:MM' to a string Postgres casts to timestamp/timestamptz.
 * `withTz` appends `+00` so a timestamptz read as UTC round-trips exactly.
 */
export function serializeDateTime(
  date: CalendarDate | undefined,
  time: string,
  withTz: boolean,
): string {
  if (!date) return ''
  const hhmm = /^\d{2}:\d{2}/.test(time) ? time.slice(0, 5) : '00:00'
  return `${date.toString()} ${hhmm}:00${withTz ? '+00' : ''}`
}

/** Coerce a marshalled value into a boolean for the checkbox editor. */
export function toBool(value: unknown): boolean {
  return value === true || value === 'true' || value === 't' || value === '1'
}

/** The string shown in a text/number/json input when editing starts. */
export function toEditText(value: unknown, variant: CellVariant): string {
  if (value == null) return ''
  if (variant === 'json') {
    return typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
  }
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/** Default wire value for a freshly added (draft) row cell of a given variant. */
export function getEmptyCellValue(variant: CellVariant): string {
  return variant === 'boolean' ? 'false' : ''
}
