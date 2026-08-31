<script lang="ts">
  import { useFieldContext } from '../hooks/form-context.js'
  import CellContainer from './cell-container.svelte'
  import MultilineEditorPopover from './multiline-editor-popover.svelte'
  import { Input } from '$lib/components/ui/input/index.js'
  import AlignLeftIcon from '@lucide/svelte/icons/align-left'

  const field = useFieldContext<string>()

  let inputRef = $state<HTMLInputElement | null>(null)
  let isMultiEditorOpen = $state(false)

  $effect(() => {
    if (inputRef) {
      inputRef.focus()
      inputRef.select()
    }
  })

  function handleMultilineSave(val: string | null) {
    field.handleChange(val ?? '')
    isMultiEditorOpen = false
  }

  function handleMultilineCancel() {
    isMultiEditorOpen = false
  }
</script>

<CellContainer {field}>
  {#snippet children({ handleKeyDown, stopEditing })}
    <div class="relative flex h-full w-full items-center">
      <Input
        bind:ref={inputRef}
        class="h-full w-full rounded-none border-0 bg-background px-2.5 py-1 pr-7 text-xs text-foreground shadow-none ring-1 ring-neutral-700 focus-visible:ring-1 focus-visible:ring-neutral-500"
        value={field.state.value ?? ''}
        oninput={(e: Event) => field.handleChange((e.target as HTMLInputElement).value)}
        onblur={() => {
          if (!isMultiEditorOpen) {
            stopEditing()
          }
        }}
        onkeydown={(e: KeyboardEvent) => {
          if (e.shiftKey && e.key === 'Enter') {
            e.preventDefault()
            e.stopPropagation()
            isMultiEditorOpen = true
          } else {
            handleKeyDown(e)
          }
        }}
      />
      <div class="absolute top-1/2 right-1 -translate-y-1/2">
        <div class="group/tooltip relative flex items-center">
          <button
            type="button"
            class="flex size-5 items-center justify-center rounded border border-neutral-700/60 bg-neutral-800/80 text-neutral-300 shadow-xs transition-colors hover:border-neutral-600 hover:bg-neutral-700 hover:text-white"
            onmousedown={(e) => {
              e.preventDefault()
              e.stopPropagation()
              isMultiEditorOpen = true
            }}
            aria-label="Open multiline editor"
          >
            <AlignLeftIcon class="size-3" />
          </button>

          <div
            class="pointer-events-none absolute right-0 bottom-full z-50 mb-1.5 hidden items-center gap-1.5 rounded-md border border-neutral-800 bg-[#0d1117] px-2 py-1 text-[11px] font-medium whitespace-nowrap text-neutral-200 shadow-xl select-none group-hover/tooltip:flex"
          >
            <span>Multiline editor</span>
            <div class="flex items-center gap-1 text-neutral-400">
              <span class="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[10px]">⇧</span>
              <span class="rounded bg-neutral-800 px-1 py-0.5 font-mono text-[10px]">↵</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  {/snippet}

  {#snippet actions({ isEditing })}
    <!-- Multiline Hover Action Button with Popover Trigger -->
    <div
      class="absolute top-1/2 right-1.5 -translate-y-1/2 opacity-0 transition-opacity group-focus-within/cell:opacity-100 group-hover/cell:opacity-100 {isEditing
        ? 'pointer-events-none opacity-0'
        : ''}"
    >
      <MultilineEditorPopover
        bind:open={isMultiEditorOpen}
        value={field.state.value}
        onSave={handleMultilineSave}
        onCancel={handleMultilineCancel}
      />
    </div>
  {/snippet}
</CellContainer>
