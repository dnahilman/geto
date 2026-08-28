<script lang="ts">
	import { useFieldContext } from '../hooks/form-context.js';
	import CellContainer from './cell-container.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Button } from '$lib/components/ui/button/index.js';

	const field = useFieldContext<boolean | string | null>();

	function toBool(val: unknown): boolean {
		if (val === true || val === 'true' || val === 1 || val === '1' || val === 't') return true;
		return false;
	}

	function handleCheckedChange(checked: boolean | 'indeterminate') {
		const isChecked = checked === true;
		if (typeof field.state.value === 'string') {
			field.handleChange(isChecked ? 'true' : 'false');
		} else {
			field.handleChange(isChecked);
		}
	}

	function setNull() {
		field.handleChange(null);
	}
</script>

<CellContainer {field}>
	{#snippet children({ stopEditing })}
		<div class="flex h-full w-full items-center gap-2 px-2.5 py-1">
			<Checkbox
				checked={toBool(field.state.value)}
				onCheckedChange={(c) => {
					handleCheckedChange(c);
				}}
			/>
			<Button
				type="button"
				variant="outline"
				size="xs"
				class="h-6 font-mono text-[10px] text-muted-foreground hover:text-foreground"
				onclick={() => {
					setNull();
					stopEditing();
				}}
			>
				Set NULL
			</Button>
		</div>
	{/snippet}
</CellContainer>
