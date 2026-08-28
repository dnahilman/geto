<script lang="ts">
	import { useFieldMeta } from '../utils/field-state.svelte.js';
	import { formatCellValue, type FormattedCell } from '../utils/format.js';
	import type { CellContainerProps } from '../types.js';

	let {
		field,
		children,
		actions,
		hoverAction,
		formatDisplay,
		class: className
	}: CellContainerProps = $props();

	const meta = useFieldMeta(() => field);

	let isEditing = $state(false);

	function autoFocus(node: HTMLElement) {
		node.focus();
		if (node instanceof HTMLInputElement) {
			node.select();
		}
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === 'Escape') {
			e.stopPropagation();
			isEditing = false;
			field.handleBlur();
		}
	}

	function stopEditing() {
		isEditing = false;
		field.handleBlur();
	}

	const rawValue = $derived(field.state.value);

	const formatted = $derived.by((): FormattedCell => {
		if (formatDisplay) {
			const res = formatDisplay(rawValue);
			if (typeof res === 'object' && res !== null && 'text' in res) {
				return res as FormattedCell;
			}
			if (rawValue === null || rawValue === undefined) {
				return {
					text: typeof res === 'string' && res ? res : 'NULL',
					isNull: true,
					isEmpty: false
				};
			}
			if (rawValue === '') {
				return {
					text: typeof res === 'string' && res ? res : 'EMPTY_STRING',
					isNull: false,
					isEmpty: true
				};
			}
			return { text: String(res), isNull: false, isEmpty: false };
		}
		return formatCellValue(rawValue);
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="group/cell relative flex h-full min-h-9 w-full items-center {className ??
		''} {meta.hasError ? 'cell-error-bg' : meta.isDirty ? 'cell-dirty-bg' : ''}"
	title={meta.hasError ? meta.errorMessage : meta.isDirty ? 'Modified field' : undefined}
	ondblclick={() => {
		if (!children) return;
		isEditing = true;
	}}
>
	{#if !isEditing}
		<div class="flex h-full w-full items-center truncate px-2.5 py-1 text-xs select-none">
			{#if formatted.isNull}
				<span class="text-muted-foreground/60 italic font-mono text-[11px]">NULL</span>
			{:else if formatted.isEmpty}
				<span class="text-muted-foreground/50 italic font-mono text-[10px]">EMPTY_STRING</span>
			{:else}
				<span>{formatted.text}</span>
			{/if}
		</div>
		{#if hoverAction}
			<div
				class="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity group-hover/cell:opacity-100"
			>
				{@render hoverAction({ startEditing: () => (isEditing = true) })}
			</div>
		{/if}
	{:else if children}
		{@render children({ autoFocus, handleKeyDown, stopEditing })}
	{:else}
		<div class="flex h-full w-full items-center px-2.5 py-1 text-xs text-destructive select-none">
			No editor snippet provided
		</div>
	{/if}

	{#if actions}
		{@render actions({ isEditing })}
	{/if}

	{#if meta.hasError}
		<span
			class="pointer-events-none absolute top-1 right-1 z-10 h-1.5 w-1.5 rounded-full bg-destructive"
		></span>
	{:else if meta.isDirty}
		<span
			class="pointer-events-none absolute top-1 right-1 z-10 h-1.5 w-1.5 rounded-full bg-amber-500"
		></span>
	{/if}
</div>
