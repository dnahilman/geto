<script lang="ts">
	import type { GridForm, GridFieldApi } from '../types.js';
	const {
		form,
		rowIndex,
		fieldName
	}: {
		form: GridForm;
		rowIndex: number;
		fieldName: string;
	} = $props();
</script>

<form.AppField name={`data[${rowIndex}].${fieldName}`}>
	{#snippet children(field: GridFieldApi)}
		<field.TextGridField />
	{/snippet}
</form.AppField>
