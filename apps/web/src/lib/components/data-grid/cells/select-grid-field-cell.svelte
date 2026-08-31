<script lang="ts">
  import type { GridForm, GridFieldApi } from '../types.js'
  const {
    form,
    rowIndex,
  }: {
    form: GridForm
    rowIndex: number
  } = $props()
</script>

<form.AppField name={`data[${rowIndex}].status`}>
  {#snippet children(field: GridFieldApi)}
    <field.SelectGridField />
  {/snippet}
</form.AppField>
