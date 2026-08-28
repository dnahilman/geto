import { createTableHook } from '@tanstack/svelte-table';
import ColumnHeader from '../headers/column-header.svelte';
import ColumnResizer from '../headers/column-resizer.svelte';
import RowSelectHeader from '../headers/row-select-header.svelte';
import PaginationControls from '../pagination/pagination-controls.svelte';
import GridCell from '../cells/grid-cell.svelte';
import RowSelectCell from '../cells/row-select-cell.svelte';
import { dataGridFeatures } from '../utils/table-features.js';

export const {
	appFeatures: gridFeatures,
	createAppColumnHelper: createAppGridColumnHelper,
	createAppTable: createAppGridTable,
	useHeaderContext: useGridHeaderContext,
	useTableContext: useGridTableContext,
	useCellContext: useGridTableCellContext
} = createTableHook({
	features: dataGridFeatures,
	enableColumnResizing: true,
	columnResizeMode: 'onChange',
	columnResizeDirection: 'ltr',
	tableComponents: {
		PaginationControls
	},
	headerComponents: {
		ColumnHeader,
		ColumnResizer,
		RowSelectHeader
	},
	cellComponents: {
		GridCell,
		RowSelectCell
	}
});
