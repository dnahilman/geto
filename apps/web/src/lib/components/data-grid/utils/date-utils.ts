import { CalendarDate } from '@internationalized/date';

export interface ParsedDateTime {
	date: CalendarDate | undefined;
	hour: number;
	minute: number;
	second: number;
}

export type DateShortcut = 'null' | 'now' | 'today' | 'tomorrow' | 'yesterday';

export interface MonthInfo {
	month: number; // 1-12
	name: string;
	shortName: string;
}

export interface DecadeInfo {
	startYear: number;
	endYear: number;
	years: number[];
}

export interface CalendarDay {
	year: number;
	month: number; // 1-12
	day: number;
	isCurrentMonth: boolean;
	dateValue: CalendarDate;
}

/**
 * Safely parses any date string (ISO, SQL format, Date-only, JS Date, timestamp)
 * into a CalendarDate and hour/minute/second integers.
 */
export function parseStandardDateTime(val?: string | null | number | Date): ParsedDateTime {
	if (val === undefined || val === null || val === '') {
		return { date: undefined, hour: 0, minute: 0, second: 0 };
	}

	if (val instanceof Date) {
		if (isNaN(val.getTime())) return { date: undefined, hour: 0, minute: 0, second: 0 };
		return {
			date: new CalendarDate(val.getFullYear(), val.getMonth() + 1, val.getDate()),
			hour: val.getHours(),
			minute: val.getMinutes(),
			second: val.getSeconds()
		};
	}

	if (typeof val === 'number') {
		const d = new Date(val);
		if (isNaN(d.getTime())) return { date: undefined, hour: 0, minute: 0, second: 0 };
		return {
			date: new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate()),
			hour: d.getHours(),
			minute: d.getMinutes(),
			second: d.getSeconds()
		};
	}

	const str = String(val).trim();
	if (!str) {
		return { date: undefined, hour: 0, minute: 0, second: 0 };
	}

	// Handle numeric timestamp strings (e.g. "1723277561000")
	if (/^\d+$/.test(str)) {
		const d = new Date(Number(str));
		if (!isNaN(d.getTime())) {
			return {
				date: new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate()),
				hour: d.getHours(),
				minute: d.getMinutes(),
				second: d.getSeconds()
			};
		}
	}

	// Match strict naive YYYY-MM-DD or YYYY-MM-DD[ T]HH:mm(:ss)? without timezone
	const match = str.match(
		/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
	);
	if (match) {
		const year = parseInt(match[1], 10);
		const month = parseInt(match[2], 10);
		const day = parseInt(match[3], 10);
		const hour = match[4] ? parseInt(match[4], 10) : 0;
		const minute = match[5] ? parseInt(match[5], 10) : 0;
		const second = match[6] ? parseInt(match[6], 10) : 0;
		try {
			return {
				date: new CalendarDate(year, month, day),
				hour: Math.min(23, Math.max(0, hour)),
				minute: Math.min(59, Math.max(0, minute)),
				second: Math.min(59, Math.max(0, second))
			};
		} catch {
			// fallback
		}
	}

	// Clean timezone descriptions in parentheses (e.g. "Mon Aug 10 2026 15:12:41 GMT+0700 (Western Indonesia Time)")
	const cleaned = str.replace(/\s*\([^)]*\)$/, '');

	// Fallback to native JS Date parsing
	const d = new Date(cleaned);
	if (!isNaN(d.getTime())) {
		return {
			date: new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate()),
			hour: d.getHours(),
			minute: d.getMinutes(),
			second: d.getSeconds()
		};
	}

	return { date: undefined, hour: 0, minute: 0, second: 0 };
}

/**
 * Formats a CalendarDate and time numbers into canonical "YYYY-MM-DD HH:mm:ss".
 * Returns empty string if date is null or undefined.
 */
export function formatStandardDateTime(
	date?: CalendarDate | null,
	hour = 0,
	minute = 0,
	second = 0
): string {
	if (!date) return '';
	const y = String(date.year).padStart(4, '0');
	const m = String(date.month).padStart(2, '0');
	const d = String(date.day).padStart(2, '0');
	const hh = String(Math.min(23, Math.max(0, hour))).padStart(2, '0');
	const mm = String(Math.min(59, Math.max(0, minute))).padStart(2, '0');
	const ss = String(Math.min(59, Math.max(0, second))).padStart(2, '0');
	return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

/**
 * Helper to compute preset shortcuts: 'null' | 'now' | 'today' | 'tomorrow' | 'yesterday'.
 */
export function getShortcutDateTime(shortcut: DateShortcut): ParsedDateTime {
	if (shortcut === 'null') {
		return { date: undefined, hour: 0, minute: 0, second: 0 };
	}
	const d = new Date();
	if (shortcut === 'now') {
		return {
			date: new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate()),
			hour: d.getHours(),
			minute: d.getMinutes(),
			second: d.getSeconds()
		};
	}
	if (shortcut === 'today') {
		return {
			date: new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate()),
			hour: 0,
			minute: 0,
			second: 0
		};
	}
	if (shortcut === 'tomorrow') {
		d.setDate(d.getDate() + 1);
		return {
			date: new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate()),
			hour: 0,
			minute: 0,
			second: 0
		};
	}
	if (shortcut === 'yesterday') {
		d.setDate(d.getDate() - 1);
		return {
			date: new CalendarDate(d.getFullYear(), d.getMonth() + 1, d.getDate()),
			hour: 0,
			minute: 0,
			second: 0
		};
	}
	return { date: undefined, hour: 0, minute: 0, second: 0 };
}

/**
 * Returns month names list (1 to 12).
 */
export function getMonthNames(): MonthInfo[] {
	return [
		{ month: 1, name: 'January', shortName: 'Jan' },
		{ month: 2, name: 'February', shortName: 'Feb' },
		{ month: 3, name: 'March', shortName: 'Mar' },
		{ month: 4, name: 'April', shortName: 'Apr' },
		{ month: 5, name: 'May', shortName: 'May' },
		{ month: 6, name: 'June', shortName: 'Jun' },
		{ month: 7, name: 'July', shortName: 'Jul' },
		{ month: 8, name: 'August', shortName: 'Aug' },
		{ month: 9, name: 'September', shortName: 'Sep' },
		{ month: 10, name: 'October', shortName: 'Oct' },
		{ month: 11, name: 'November', shortName: 'Nov' },
		{ month: 12, name: 'December', shortName: 'Dec' }
	];
}

/**
 * Returns decade bounds and 12-year window (startYear - 1 to startYear + 10).
 */
export function getDecadeYears(year: number): DecadeInfo {
	const startYear = Math.floor(year / 10) * 10;
	const endYear = startYear + 9;
	const years: number[] = [];
	for (let y = startYear - 1; y <= startYear + 10; y++) {
		years.push(y);
	}
	return { startYear, endYear, years };
}

/**
 * Returns a 6x7 CalendarDay matrix for the given year and 1-indexed month.
 */
export function getCalendarGrid(year: number, month: number): CalendarDay[][] {
	const firstDayOfWeek = new Date(year, month - 1, 1).getDay(); // 0 = Sun, 1 = Mon ...
	const daysInCurrentMonth = new Date(year, month, 0).getDate();
	const daysInPrevMonth = new Date(year, month - 1, 0).getDate();

	const prevMonth = month === 1 ? 12 : month - 1;
	const prevYear = month === 1 ? year - 1 : year;
	const nextMonth = month === 12 ? 1 : month + 1;
	const nextYear = month === 12 ? year + 1 : year;

	const flatDays: CalendarDay[] = [];

	// Trailing days from previous month
	for (let i = firstDayOfWeek - 1; i >= 0; i--) {
		const day = daysInPrevMonth - i;
		flatDays.push({
			year: prevYear,
			month: prevMonth,
			day,
			isCurrentMonth: false,
			dateValue: new CalendarDate(prevYear, prevMonth, day)
		});
	}

	// Days in current month
	for (let day = 1; day <= daysInCurrentMonth; day++) {
		flatDays.push({
			year,
			month,
			day,
			isCurrentMonth: true,
			dateValue: new CalendarDate(year, month, day)
		});
	}

	// Leading days from next month up to 42 (6 rows x 7 days)
	const remaining = 42 - flatDays.length;
	for (let day = 1; day <= remaining; day++) {
		flatDays.push({
			year: nextYear,
			month: nextMonth,
			day,
			isCurrentMonth: false,
			dateValue: new CalendarDate(nextYear, nextMonth, day)
		});
	}

	// Group into 6 rows of 7
	const rows: CalendarDay[][] = [];
	for (let r = 0; r < 6; r++) {
		rows.push(flatDays.slice(r * 7, (r + 1) * 7));
	}

	return rows;
}
