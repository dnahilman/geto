import type { Snippet, Component } from 'svelte';
import type { AnyFieldApi } from '@tanstack/svelte-form';
import type { FormattedCell } from './utils/format.js';

export interface CellEditorControls {
	autoFocus: (node: HTMLElement) => void;
	handleKeyDown: (e: KeyboardEvent) => void;
	stopEditing: () => void;
}

export type CellEditorSnippet = Snippet<[CellEditorControls]>;

export interface CellContainerProps {
	field: AnyFieldApi;
	children?: CellEditorSnippet;
	actions?: Snippet<[{ isEditing: boolean }]>;
	hoverAction?: Snippet<[{ startEditing: () => void }]>;
	formatDisplay?: (val: unknown) => string | FormattedCell;
	class?: string;
}

export type GridFieldApi = AnyFieldApi & {
	TextGridField: Component<Record<string, never>>;
	NumberGridField: Component<Record<string, never>>;
	SelectGridField: Component<Record<string, never>>;
	DateTimeGridField: Component<Record<string, never>>;
	BooleanGridField: Component<Record<string, never>>;
	DateGridField: Component<Record<string, never>>;
	JsonGridField: Component<Record<string, never>>;
};

export interface GridForm {
	AppField: Component<
		{ name: string; children?: Snippet<[GridFieldApi]> } & Record<string, unknown>
	>;
}
