<script lang="ts">
	import { useFormContext } from '../hooks/form-context.js';
	import { Button } from '$lib/components/ui/button/index.js';

	const form = useFormContext();
	const { label = 'Discard Changes' }: { label?: string } = $props();
</script>

<form.Subscribe
	selector={(state) => ({
		isDirty: state.isDirty,
		isSubmitting: state.isSubmitting
	})}
>
	{#snippet children({ isDirty, isSubmitting })}
		{#if isDirty && !isSubmitting}
			<Button type="button" variant="outline" size="sm" onclick={() => form.reset()}>
				{label}
			</Button>
		{/if}
	{/snippet}
</form.Subscribe>
