import {
	cellSelectionFeature,
	columnResizingFeature,
	columnSizingFeature,
	rowSortingFeature,
	createPaginatedRowModel,
	rowPaginationFeature,
	rowSelectionFeature,
	tableFeatures,
	metaHelper
} from '@tanstack/svelte-table';
import type { GridInputType } from './dynamic-columns.js';

export type DataGridColumnMeta = {
	inputType?: GridInputType;
	options?: string[]; // For select inputs / enums
	typeName?: string;
	colIndex?: number;
	editable?: boolean;
	isPrimaryKey?: boolean;
};

export const dataGridFeatures = tableFeatures({
	cellSelectionFeature,
	columnSizingFeature,
	columnResizingFeature,
	rowSortingFeature,
	rowPaginationFeature,
	rowSelectionFeature,
	paginatedRowModel: createPaginatedRowModel(),
	columnMeta: metaHelper<DataGridColumnMeta>()
});

export type DataGridFeatures = typeof dataGridFeatures;
