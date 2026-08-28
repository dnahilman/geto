export interface FormattedCell {
	text: string;
	isNull: boolean;
	isEmpty: boolean;
}

/**
 * Formats a raw cell value for display in the grid:
 * - null / undefined -> isNull: true, text: 'NULL'
 * - '' (empty string) -> isEmpty: true, text: 'EMPTY_STRING'
 * - object -> JSON.stringify(val)
 * - otherwise -> String(val)
 */
export function formatCellValue(val: unknown): FormattedCell {
	if (val === null || val === undefined) {
		return { text: 'NULL', isNull: true, isEmpty: false };
	}
	if (val === '') {
		return { text: 'EMPTY_STRING', isNull: false, isEmpty: true };
	}
	if (typeof val === 'object') {
		return { text: JSON.stringify(val), isNull: false, isEmpty: false };
	}
	return { text: String(val), isNull: false, isEmpty: false };
}
