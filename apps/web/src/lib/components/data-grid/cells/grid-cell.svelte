<script lang="ts">
  import { formType } from '../hooks/create-grid-form.js'
  import { useGridTableCellContext } from '../hooks/use-data-grid.js'
  import type { GridFieldApi } from '../types.js'

  interface Props {
    form: typeof formType
  }

  let { form }: Props = $props()
  const cell = useGridTableCellContext()

  const rowIndex = $derived(cell.row.index)
  const fieldName = $derived(cell.column.id)
  const meta = $derived(cell.column.columnDef.meta)
  const type = $derived(meta?.inputType ?? 'text')
</script>

<form.AppField name={`data[${rowIndex}].${fieldName}`}>
  {#snippet children(field: GridFieldApi)}
    {#if type === 'number'}
      <field.NumberGridField />
    {:else if type === 'select'}
      <field.SelectGridField />
    {:else if type === 'datetime'}
      <field.DateTimeGridField />
    {:else if type === 'date'}
      <field.DateGridField />
    {:else if type === 'bool'}
      <field.BooleanGridField />
    {:else if type === 'json'}
      <field.JsonGridField />
    {:else}
      <field.TextGridField />
    {/if}
  {/snippet}
</form.AppField>
