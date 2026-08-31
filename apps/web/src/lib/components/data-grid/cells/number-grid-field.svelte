<script lang="ts">
  import { useFieldContext } from '../hooks/form-context.js'
  import CellContainer from './cell-container.svelte'
  import { Input } from '$lib/components/ui/input/index.js'

  const field = useFieldContext<number | string | null>()

  let inputRef = $state<HTMLInputElement | null>(null)
  let textValue = $state(
    field.state.value !== undefined && field.state.value !== null ? String(field.state.value) : '',
  )

  $effect(() => {
    if (inputRef) {
      inputRef.focus()
      inputRef.select()
    }
  })

  function getFieldDefaultValue(): unknown {
    const f = field as any
    if (f?.options?.defaultValue !== undefined) return f.options.defaultValue
    if (f?.state?.meta?.defaultValue !== undefined) return f.state.meta.defaultValue
    if (f?.form?.options?.defaultValues && f?.name) {
      const parts = String(f.name)
        .replace(/\[(\w+)\]/g, '.$1')
        .split('.')
      let curr = f.form.options.defaultValues
      for (const part of parts) {
        if (curr == null) return undefined
        curr = curr[part]
      }
      return curr
    }
    return undefined
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement
    const raw = target.value

    // Regex: allow negative sign at start, digits, and a single decimal point
    if (raw === '' || raw === '-' || /^-?\d*\.?\d*$/.test(raw)) {
      textValue = raw
      if (raw !== '' && raw !== '-' && raw !== '.') {
        const num = Number(raw)
        if (!isNaN(num)) {
          const defaultVal = getFieldDefaultValue()
          if (defaultVal !== undefined && defaultVal !== null && Number(defaultVal) === num) {
            field.handleChange(defaultVal as any)
          } else {
            field.handleChange(num)
          }
        }
      }
    } else {
      target.value = textValue
    }
  }

  function commitValue(stopEditing: () => void) {
    let finalVal: number | string | null
    if (textValue === '' || textValue === '-' || textValue === '.') {
      finalVal = null
    } else {
      const num = Number(textValue)
      finalVal = isNaN(num) ? null : num
    }

    const defaultVal = getFieldDefaultValue()
    if (
      defaultVal !== undefined &&
      defaultVal !== null &&
      finalVal !== null &&
      Number(defaultVal) === Number(finalVal)
    ) {
      finalVal = defaultVal as any
    }

    field.handleChange(finalVal)
    stopEditing()
  }
</script>

<CellContainer {field}>
  {#snippet children({ handleKeyDown, stopEditing })}
    <Input
      bind:ref={inputRef}
      type="text"
      inputmode="decimal"
      class="h-full w-full rounded-none border-0 bg-background px-2.5 py-1 text-xs text-foreground shadow-none ring-1 ring-neutral-700 focus-visible:ring-1 focus-visible:ring-neutral-500"
      value={textValue}
      oninput={handleInput}
      onblur={() => commitValue(stopEditing)}
      onkeydown={(e: KeyboardEvent) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commitValue(stopEditing)
        } else {
          handleKeyDown(e)
        }
      }}
    />
  {/snippet}
</CellContainer>
