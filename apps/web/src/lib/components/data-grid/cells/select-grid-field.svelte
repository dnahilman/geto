<script lang="ts">
  import { useFieldContext } from '../hooks/form-context.js'
  import { useGridTableCellContext } from '../hooks/use-data-grid.js'
  import CellContainer from './cell-container.svelte'
  import * as Select from '$lib/components/ui/select/index.js'

  const field = useFieldContext<string | null>()

  let cell: ReturnType<typeof useGridTableCellContext> | undefined
  try {
    cell = useGridTableCellContext()
  } catch {
    // Not inside cell context
  }

  const meta = cell?.column?.columnDef?.meta
  const selectOptions = $derived(
    meta?.options && meta.options.length > 0
      ? meta.options.map((opt) => ({ value: opt, label: opt }))
      : [],
  )

  let isOpen = $state(true)
</script>

<CellContainer {field}>
  {#snippet children({ stopEditing })}
    <Select.Root
      type="single"
      bind:open={isOpen}
      value={field.state.value ?? undefined}
      onValueChange={(val: string) => {
        if (val === '__NULL__') {
          field.handleChange(null)
        } else if (val) {
          field.handleChange(val)
        }
        stopEditing()
      }}
      onOpenChange={(open: boolean) => {
        if (!open) {
          stopEditing()
        }
      }}
    >
      <Select.Trigger
        class="h-full w-full rounded-none border-0 bg-background px-2.5 py-1 text-xs shadow-none ring-1 ring-neutral-700 focus-visible:ring-1 focus-visible:ring-neutral-500"
      >
        <span class="truncate">{field.state.value || 'Select...'}</span>
      </Select.Trigger>
      <Select.Content portalProps={{}}>
        <Select.Group>
          <Select.Item value="__NULL__" label="NULL" class="italic text-muted-foreground font-mono">
            NULL
          </Select.Item>
          {#each selectOptions as opt (opt.value)}
            <Select.Item value={opt.value} label={opt.label}>
              {opt.label}
            </Select.Item>
          {/each}
        </Select.Group>
      </Select.Content>
    </Select.Root>
  {/snippet}
</CellContainer>
