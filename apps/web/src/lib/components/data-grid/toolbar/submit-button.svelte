<script lang="ts">
  import { useFormContext } from '../hooks/form-context.js'
  import { Button } from '$lib/components/ui/button/index.js'

  const form = useFormContext()

  const { label = 'Save Changes' }: { label?: string } = $props()
</script>

<form.Subscribe
  selector={(state) => ({
    isSubmitting: state.isSubmitting,
    canSubmit: state.canSubmit,
  })}
>
  {#snippet children({ isSubmitting, canSubmit })}
    <Button type="submit" disabled={!canSubmit || isSubmitting} size="sm">
      {isSubmitting ? 'Submitting...' : label}
    </Button>
  {/snippet}
</form.Subscribe>
